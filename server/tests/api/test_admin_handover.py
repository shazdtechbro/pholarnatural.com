import hashlib, re
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytest
from sqlalchemy.orm import sessionmaker
from app.models.admin import AdminUser, AdminInvitation, AdminAudit
from app.models.notification import EmailDelivery, WhatsAppDelivery
from app.core import security
from app.core.config import settings
from app.services.email import queue_admin, admin_recipients
from app.services import whatsapp
from tests.api.test_bachs_payments import db_session

PASSWORD = "a-long-audit-password-2026"

@pytest.fixture
def owner(client, db_session, monkeypatch):
    monkeypatch.setattr('app.db.database.SessionLocal', sessionmaker(bind=db_session.get_bind()))
    admin = AdminUser(email="owner@example.com", hashed_password=security.get_password_hash(PASSWORD))
    db_session.add(admin); db_session.commit()
    response=client.post('/api/v1/admin/login',data={'username':admin.email,'password':PASSWORD})
    return admin, {'Authorization':'Bearer '+response.json()['access_token']}


def test_invitation_is_email_bound_expiring_and_single_use(client, db_session, owner):
    _, headers = owner
    assert client.post('/api/v1/admin/invitations',json={'email':'new@example.com','current_password':'wrong'},headers=headers).status_code == 403
    response=client.post('/api/v1/admin/invitations',json={'email':'new@example.com','current_password':PASSWORD},headers=headers)
    assert response.status_code == 202
    row=db_session.query(EmailDelivery).filter(EmailDelivery.event_key.like('admin-invite:%')).one()
    token=re.search(r'invite=([^&]+)',row.html).group(1)
    invitation=db_session.query(AdminInvitation).one()
    assert token != invitation.token_hash and hashlib.sha256(token.encode()).hexdigest() == invitation.token_hash
    payload={'email':'other@example.com','password':PASSWORD,'secret_key':token}
    assert client.post('/api/v1/admin/register',json=payload).status_code == 403
    payload['email']='new@example.com'
    assert client.post('/api/v1/admin/register',json=payload).status_code == 201
    assert client.post('/api/v1/admin/register',json=payload).status_code == 403
    assert len(admin_recipients(db_session)) == 2
    assert db_session.query(AdminAudit).count() >= 2


def test_expired_and_forged_invites_do_not_create_admins(client, db_session, owner):
    db_session.add(AdminInvitation(email='expired@example.com',token_hash=hashlib.sha256(b'expired').hexdigest(),expires_at=datetime.now(timezone.utc)-timedelta(seconds=1)))
    db_session.commit()
    for token in ['expired','forged-token']:
        assert client.post('/api/v1/admin/register',json={'email':'expired@example.com','password':PASSWORD,'secret_key':token}).status_code == 403
    assert db_session.query(AdminUser).count() == 1


def test_admin_fanout_is_deduplicated_and_disabled_users_are_excluded(db_session, monkeypatch):
    monkeypatch.setattr(settings,'ADMIN_EMAIL','legacy@example.com')
    for address,active in [('one@example.com',True),('two@example.com',True),('disabled@example.com',False)]:
        db_session.add(AdminUser(email=address,is_active=active,hashed_password='unused'))
    db_session.commit()
    queue_admin(db_session,'event-one',('New paid order','<p>Paid</p>'))
    queue_admin(db_session,'event-one',('New paid order','<p>Paid</p>'))
    db_session.flush()
    assert {r.recipient for r in db_session.query(EmailDelivery)} == {'one@example.com','two@example.com'}
    assert db_session.query(EmailDelivery).count() == 2


def test_cannot_disable_last_admin_and_revokes_disabled_sessions(client, db_session, owner):
    admin,headers=owner
    path=f'/api/v1/admin/team/{admin.id}/access'
    assert client.post(path,json={'is_active':False,'current_password':PASSWORD},headers=headers).status_code == 409
    second=AdminUser(email='second@example.com',hashed_password=security.get_password_hash(PASSWORD))
    db_session.add(second);db_session.commit()
    assert client.post(path,json={'is_active':False,'current_password':PASSWORD},headers=headers).status_code == 200
    assert client.get('/api/v1/admin/team',headers=headers).status_code == 401
    assert admin.email not in admin_recipients(db_session)


def test_whatsapp_timeout_is_persisted_and_retried(db_session):
    row=WhatsAppDelivery(event_key='queue-test',recipient='15555550100',message='Test order reference')
    db_session.add(row);db_session.commit()
    def timeout(*args):raise TimeoutError()
    whatsapp.process_one(db_session,timeout)
    db_session.refresh(row)
    assert row.status == 'queued' and row.attempts == 1
    row.next_attempt_at=datetime.now(timezone.utc)-timedelta(seconds=1);db_session.commit()
    whatsapp.process_one(db_session,lambda *args: None)
    db_session.refresh(row)
    assert row.status == 'sent' and row.attempts == 2


def test_admin_operations_require_auth(client):
    assert client.get('/api/v1/admin/team').status_code in (401,403)
    assert client.post('/api/v1/admin/invitations',json={'email':'new@example.com','current_password':PASSWORD}).status_code in (401,403)


def test_admin_recovery_is_private_single_use_and_revokes_sessions(client, db_session, owner):
    admin,headers=owner
    actual=client.post('/api/v1/admin/forgot-password',json={'email':admin.email})
    unknown=client.post('/api/v1/admin/forgot-password',json={'email':'unknown@example.com'})
    assert actual.status_code == unknown.status_code == 202 and actual.json() == unknown.json()
    row=db_session.query(EmailDelivery).filter(EmailDelivery.event_key.like('admin-reset:%')).one()
    token=re.search(r'token=([^"&]+)',row.html).group(1)
    # A reset token cannot create an administrator.
    assert client.post('/api/v1/admin/register',json={'email':admin.email,'password':PASSWORD,'secret_key':token}).status_code == 403
    assert client.post('/api/v1/admin/reset-password',json={'token':token,'password':'short'}).status_code == 422
    assert client.post('/api/v1/admin/reset-password',json={'token':token,'password':'another-long-password-2026'}).status_code == 200
    assert client.get('/api/v1/admin/team',headers=headers).status_code == 401
    assert client.post('/api/v1/admin/reset-password',json={'token':token,'password':PASSWORD}).status_code == 400


def test_whatsapp_payment_alert_is_atomic_with_business_transaction(db_session, monkeypatch):
    from app.models.system import AdminSetting
    monkeypatch.setattr(settings,'PAYMENT_SANDBOX_INSTANCE',False)
    db_session.add(AdminSetting(key='notifier_whatsapp_number',value='15555550100'));db_session.commit()
    whatsapp.notify(whatsapp.NotificationEvent.NEW_ORDER,'Order PN-ATOMIC',db_session,transactional=True)
    db_session.rollback()
    assert db_session.query(WhatsAppDelivery).count() == 0
    whatsapp.notify(whatsapp.NotificationEvent.NEW_ORDER,'Order PN-ATOMIC',db_session,transactional=True)
    whatsapp.notify(whatsapp.NotificationEvent.NEW_ORDER,'Order PN-ATOMIC',db_session,transactional=True)
    db_session.commit()
    assert db_session.query(WhatsAppDelivery).count() == 1

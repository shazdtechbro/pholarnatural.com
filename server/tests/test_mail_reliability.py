from datetime import timedelta
import urllib.error
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from app.models.notification import EmailDelivery as EmailJob
from app.services import mail_delivery as q
from app.services.email import queue_email
def enqueue(db, to, subject, html, event_key=None):
    queue_email(db, event_key or str(uuid4()), to, subject, html)

from app.models.subscriber import Subscriber
from types import SimpleNamespace
from datetime import date, time
from uuid import uuid4

@pytest.fixture
def db_session():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    EmailJob.__table__.create(engine)
    Subscriber.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()

def test_enqueue_is_transactional_and_deduplicated(db_session):
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>', 'event/1')
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>', 'event/1')
    assert db_session.query(EmailJob).count() == 1
    db_session.rollback()
    assert db_session.query(EmailJob).count() == 0

def test_acceptance_then_delivery(db_session, monkeypatch):
    monkeypatch.setattr(q.settings, 'RESEND_API_KEY', 'test')
    calls = []
    def request(method, *args, **kwargs):
        calls.append((method, kwargs))
        return {'id': 'provider-123'} if method == 'POST' else {'last_event': 'delivered'}
    monkeypatch.setattr(q, 'request', request)
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>')
    q.process_one(db_session)
    job = db_session.query(EmailJob).one()
    assert job.status == 'accepted'
    assert calls[0][1]['key'] == str(job.id)
    job.next_attempt_at = q.utcnow() - timedelta(seconds=1)
    db_session.flush()
    q.process_one(db_session)
    assert job.status == 'delivered'

def test_network_failure_retries_without_losing_payload(db_session, monkeypatch):
    monkeypatch.setattr(q.settings, 'RESEND_API_KEY', 'test')
    def fail(*args, **kwargs):
        raise TimeoutError('temporary')
    monkeypatch.setattr(q, 'request', fail)
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>')
    q.process_one(db_session)
    job = db_session.query(EmailJob).one()
    assert job.status == 'queued'
    assert job.attempts == 1
    assert job.payload['subject'] == 'Subject'

def test_ambiguous_old_send_requires_review(db_session):
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>')
    job = db_session.query(EmailJob).one()
    job.first_attempt_at = q.utcnow() - timedelta(hours=24)
    db_session.flush()
    q.process_one(db_session)
    assert job.status == 'needs_review'

def test_bad_credentials_are_visible(db_session, monkeypatch):
    monkeypatch.setattr(q.settings, 'RESEND_API_KEY', 'test')
    def fail(*args, **kwargs):
        raise urllib.error.HTTPError(q.URL, 403, 'Forbidden', {}, None)
    monkeypatch.setattr(q, 'request', fail)
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>')
    q.process_one(db_session)
    assert db_session.query(EmailJob).one().status == 'needs_review'

def test_complaints_suppress_future_messages(db_session):
    enqueue(db_session, 'person@example.com', 'First', '<p>Hello</p>', 'first')
    db_session.flush()
    db_session.query(EmailJob).one().status = 'complained'
    db_session.flush()
    enqueue(db_session, 'person@example.com', 'Second', '<p>Hello</p>', 'second')
    db_session.flush()
    assert db_session.query(EmailJob).filter_by(event_key='second').one().status == 'suppressed'

def test_crashed_worker_resumes_with_frozen_payload(db_session, monkeypatch):
    monkeypatch.setattr(q.settings, 'RESEND_API_KEY', 'test')
    enqueue(db_session, 'person@example.com', 'Subject', '<p>Hello</p>')
    db_session.flush()
    job = db_session.query(EmailJob).one()
    job.status = 'sending'
    job.first_attempt_at = q.utcnow()-timedelta(minutes=2)
    job.next_attempt_at = q.utcnow()-timedelta(seconds=1)
    job.payload = {'from': 'original@example.com', 'to': ['person@example.com'], 'subject': 'Subject', 'html': '<p>Hello</p>'}
    calls = []
    def request(*args, **kwargs):
        calls.append(kwargs)
        return {'id': 'recovered'}
    monkeypatch.setattr(q, 'request', request)
    monkeypatch.setattr(q.settings, 'DEFAULT_FROM_EMAIL', 'changed@example.com')
    q.process_one(db_session)
    assert job.status == 'accepted'
    assert calls[0]['payload']['from'] == 'original@example.com'
    assert calls[0]['key'] == str(job.id)

def test_newsletter_confirmation_and_unsubscribe(client, db_session):
    from app.api.routes.newsletter import token_for
    response = client.post('/api/v1/newsletter/subscribe', json={'email': 'reader@example.com'})
    assert response.status_code == 202
    sub = db_session.query(Subscriber).one()
    assert sub.status == 'pending'
    assert db_session.query(EmailJob).count() == 1
    token = token_for(sub, 'confirm')
    assert client.get('/api/v1/newsletter/confirm', params={'token': token}).status_code == 200
    assert sub.status == 'pending'  # scanners cannot subscribe people
    assert client.post('/api/v1/newsletter/confirm', data={'token': token}).status_code == 200
    assert sub.status == 'subscribed'
    assert db_session.query(EmailJob).count() == 2
    client.post('/api/v1/newsletter/confirm', data={'token': token})
    assert db_session.query(EmailJob).count() == 2
    token = token_for(sub, 'unsubscribe', days=3650)
    assert client.post('/api/v1/newsletter/unsubscribe', data={'token': token}).status_code == 200
    assert sub.status == 'unsubscribed'

def test_newsletter_rejects_invalid_link_and_duplicate_signup(client, db_session):
    client.post('/api/v1/newsletter/subscribe', json={'email': 'reader@example.com'})
    client.post('/api/v1/newsletter/subscribe', json={'email': 'reader@example.com'})
    assert db_session.query(EmailJob).count() == 1
    assert client.post('/api/v1/newsletter/confirm', data={'token': 'invalid'}).status_code == 400

def test_newsletter_does_not_send_after_consent_changes(client, db_session):
    client.post('/api/v1/newsletter/subscribe', json={'email': 'reader@example.com'})
    sub = db_session.query(Subscriber).one()
    sub.status = 'unsubscribed'
    db_session.commit()
    q.process_one(db_session)
    assert db_session.query(EmailJob).one().status == 'cancelled'

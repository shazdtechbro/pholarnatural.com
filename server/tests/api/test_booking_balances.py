from datetime import timedelta
from uuid import UUID, uuid4
import json
import pytest
from fastapi import HTTPException
from app.core.config import settings
from app.core.security import customer_token
from app.models.booking import Booking, BookingBalancePayment
from app.models.notification import EmailDelivery
from app.models.payment import PaymentEvent
from app.services import booking_balance as balance
from app.services.bachs_gateway import BachsGateway, BachsError
from app.services.bachs_events import process_one
from app.services.mail_delivery import utcnow
from tests.api.test_bachs_payments import db_session, bachs, success, signed
from tests.api.test_journeys_security import catalogue, book_payload, admin


def deposited(client, db, service, records, price=9999):
    service.price_cents = price
    db.commit()
    response = client.post('/api/v1/bookings/', json=book_payload(service))
    assert response.status_code == 201, response.text
    booking = db.get(Booking, UUID(response.json()['booking_id']))
    signed(client, success(booking, records)); process_one(db, BachsGateway())
    db.refresh(booking)
    booking.booking_date = utcnow().date() - timedelta(days=1)
    db.commit()
    return booking, {'X-Confirmation-Token': response.json()['confirmation_token']}


def release(client, booking, **kwargs):
    return client.post(f'/api/v1/admin/bookings/{booking.id}/request-balance', json=kwargs)


@pytest.mark.parametrize('price,deposit,remainder', [(9999,1000,8999),(10005,1001,9004),(10004,1000,9004),(12000,1200,10800),(555,56,499)])
def test_exact_rounding_price_snapshot_and_idempotent_request(client, db_session, catalogue, bachs, admin, price, deposit, remainder):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records, price)
    assert booking.deposit_cents == deposit
    service.price_cents = 999999
    service.name = 'Changed later'
    db_session.commit()
    response = release(client, booking)
    assert response.status_code == 200, response.text
    assert response.json()['total_price_cents'] == price
    assert response.json()['balance_due_cents'] == remainder
    assert response.json()['service_name'] == 'Braids'
    count = db_session.query(EmailDelivery).count()
    assert release(client, booking).status_code == 200
    assert db_session.query(EmailDelivery).count() == count
    view = client.get(f'/api/v1/bookings/{booking.id}', headers=token).json()
    assert view['deposit_paid_cents'] + view['balance_due_cents'] == price
    assert release(client, booking, original_total_cents=price+1).status_code == 409


def test_balance_verified_once_receipts_and_no_deposit_overwrite(client, db_session, catalogue, bachs, admin):
    _, _, service = catalogue
    requests, records = bachs
    booking, token = deposited(client, db_session, service, records)
    deposit_charge = booking.payment_charge_id
    assert release(client, booking).status_code == 200
    response = client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token)
    assert response.status_code == 200, response.text
    attempt = db_session.query(BookingBalancePayment).one()
    assert attempt.amount_cents == 8999 and attempt.currency == 'USD'
    assert attempt.payment_request_payload['pricing']['amount'] == '89.99'
    assert attempt.payment_request_payload['metadata']['type'] == 'booking_balance'
    assert client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token).json() == response.json()
    assert len([r for r in requests if r[0] == 'POST' and r[1] == '/v1/checkout-sessions']) == 2  # Deposit plus balance.
    event = success(attempt, records)
    # A browser return or checkout.completed never marks the balance paid.
    signed(client, {'id':'evt_balance_return', 'type':'checkout.completed', 'data': {'checkout_id': attempt.payment_checkout_id}})
    process_one(db_session, BachsGateway())
    assert balance.summary(booking)['balance_due_cents'] == 8999
    assert client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token).status_code == 409
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(booking)
    assert balance.summary(booking)['balance_status'] == 'paid'
    assert balance.summary(booking)['balance_due_cents'] == 0
    assert booking.payment_charge_id == deposit_charge
    assert db_session.query(EmailDelivery).filter(EmailDelivery.event_key == f'booking:{booking.id}:balance_paid').count() == 1
    event['id'] = 'evt_' + uuid4().hex
    signed(client, event); process_one(db_session, BachsGateway())
    assert db_session.query(EmailDelivery).filter(EmailDelivery.event_key == f'booking:{booking.id}:balance_paid').count() == 1
    assert client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token).json()['fully_paid'] is True
    assert client.post(f'/api/v1/bookings/{booking.id}/cancel', headers=token, json={}).status_code == 409


@pytest.mark.parametrize('fault', ['amount','currency','booking','underpaid'])
def test_balance_mismatch_never_marks_paid(client, db_session, catalogue, bachs, admin, fault):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records)
    release(client, booking)
    client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token)
    attempt = db_session.query(BookingBalancePayment).one()
    event = success(attempt, records)
    checkout = records[attempt.payment_checkout_id]
    if fault == 'amount': checkout['amount'] = '1.00'
    if fault == 'currency': checkout['currency'] = 'CAD'
    if fault == 'booking': checkout['metadata']['booking_id'] = str(uuid4())
    if fault == 'underpaid': records[event['data']['charge_id']]['amount_paid'] = '0.01'
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(attempt)
    assert not attempt.paid_at
    assert db_session.get(PaymentEvent, event['id']).status == 'queued'


def test_legacy_requires_original_price_and_authorization(client, db_session, catalogue, bachs):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records)
    assert release(client, booking).status_code == 401
    assert client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers={'X-Confirmation-Token': customer_token('booking', uuid4())}).status_code == 403
    assert client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token).status_code == 409


def test_legacy_confirmation_future_and_unsupported_currency(client, db_session, catalogue, bachs, admin):
    _, _, service = catalogue
    _, records = bachs
    booking, _ = deposited(client, db_session, service, records)
    booking.total_price_cents = None
    db_session.commit()
    assert release(client, booking).status_code == 409
    assert release(client, booking, original_total_cents=9000).status_code == 422
    assert release(client, booking, original_total_cents=True).status_code == 422
    booking.currency = 'CAD'; db_session.commit()
    assert release(client, booking, original_total_cents=9999).status_code == 409
    booking.currency = 'USD'; booking.booking_date = utcnow().date() + timedelta(days=2); db_session.commit()
    assert release(client, booking, original_total_cents=9999).status_code == 409
    booking.booking_date = utcnow().date() - timedelta(days=1); db_session.commit()
    assert release(client, booking, original_total_cents=9999).status_code == 200


def test_ambiguous_checkout_reuses_frozen_body_and_expiry_allows_new_attempt(client, db_session, catalogue, bachs, admin, monkeypatch):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records)
    release(client, booking)
    original = BachsGateway.request
    bodies = []
    def uncertain(self, method, path, body=None, key=None):
        if method == 'POST' and path == '/v1/checkout-sessions':
            bodies.append(json.dumps(body, sort_keys=True))
            if len(bodies) == 1:
                raise BachsError()
        return original(self, method, path, body, key)
    monkeypatch.setattr(BachsGateway, 'request', uncertain)
    url = f'/api/v1/bookings/{booking.id}/balance-checkout'
    assert client.post(url, headers=token).status_code == 502
    monkeypatch.setattr(balance, 'customer_token', lambda *args: 'new-token-after-clock-change')
    assert client.post(url, headers=token).status_code == 200
    assert bodies[0] == bodies[1]
    first = db_session.query(BookingBalancePayment).one()
    records[first.payment_checkout_id]['status'] = 'expired'
    assert client.post(url, headers=token).status_code == 200
    assert db_session.query(BookingBalancePayment).count() == 2
    db_session.refresh(first)
    assert first.status == 'expired'
    assert all(row.amount_cents == 8999 for row in db_session.query(BookingBalancePayment))


def test_decline_underpayment_and_out_of_order_failure_keep_deposit(client, db_session, catalogue, bachs, admin):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records)
    release(client, booking)
    url = f'/api/v1/bookings/{booking.id}/balance-checkout'
    first = client.post(url, headers=token).json()
    attempt = db_session.query(BookingBalancePayment).one()
    for kind in ('collection.failed', 'collection.underpaid'):
        signed(client, {'id':'evt_'+uuid4().hex, 'type':kind, 'data':{'checkout_id':attempt.payment_checkout_id}})
        process_one(db_session, BachsGateway())
        db_session.refresh(booking)
        assert balance.summary(booking)['balance_due_cents'] == 8999
        assert balance.summary(booking)['deposit_paid_cents'] == 1000
        assert client.post(url, headers=token).json() == first
    event = success(attempt, records)
    signed(client, event); process_one(db_session, BachsGateway())
    signed(client, {'id':'evt_'+uuid4().hex, 'type':'collection.failed', 'data':{'checkout_id':attempt.payment_checkout_id}})
    process_one(db_session, BachsGateway())
    db_session.refresh(booking)
    assert balance.summary(booking)['balance_status'] == 'paid'


def test_success_before_checkout_id_persisted_recovers_from_metadata(client, db_session, catalogue, bachs, admin):
    _, _, service = catalogue
    _, records = bachs
    booking, token = deposited(client, db_session, service, records)
    release(client, booking)
    client.post(f'/api/v1/bookings/{booking.id}/balance-checkout', headers=token)
    attempt = db_session.query(BookingBalancePayment).one()
    event = success(attempt, records)
    attempt.payment_checkout_id = None
    db_session.commit()
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(booking)
    assert balance.summary(booking)['balance_status'] == 'paid'

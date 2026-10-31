import hashlib
import hmac
import json
import time
from uuid import UUID, uuid4
import pytest
from app.core.config import settings
from app.models.order import Order
from app.models.booking import Booking
from app.models.payment import PaymentEvent
from app.models.notification import EmailDelivery
from app.services.bachs_gateway import BachsGateway, BachsError, cents
from app.services.bachs_events import process_one
from tests.api.test_journeys_security import catalogue, payload, book_payload


@pytest.fixture
def db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import StaticPool
    from app.db.database import Base
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def bachs(monkeypatch):
    for key, value in {"PAYMENT_PROVIDER": "bachs", "BACHS_ENVIRONMENT": "sandbox", "BACHS_API_KEY": "sk_sandbox_test-fixture", "BACHS_WEBHOOK_SECRET": "sandbox-secret-fixture", "PAYMENT_SANDBOX_INSTANCE": True, "PAYMENT_NOTIFICATIONS_ENABLED": False, "PRICING_CURRENCY": "USD"}.items():
        monkeypatch.setattr(settings, key, value)
    requests = []
    records = {}
    def request(self, method, path, body=None, key=None):
        requests.append((method, path, body, key))
        if method == "POST" and path == "/v1/checkout-sessions":
            checkout = "chk_"+key
            records[checkout] = {"checkout_id": checkout, "status": "open", "payment_status": "requires_payment_method", "amount": body["pricing"]["amount"], "currency": "USD", "metadata": body["metadata"], "reference": body["reference"], "charge": None, "checkout_url": "https://sandbox-checkout.bachs.io/c/"+key}
            return records[checkout]
        if method == "POST" and path == "/v1/refunds":
            row = {"refund_id": "rfnd_"+body["charge_id"], "charge_id": body["charge_id"], "status": "processing", "requested_amount": records[body["charge_id"]]["amount"], "refunded_amount": None}
            records[row["refund_id"]] = row
            return row
        return records[path.split('/')[-1]]
    monkeypatch.setattr(BachsGateway, "request", request)
    return requests, records


def signed(client, event, timestamp=None, extra=False):
    raw = json.dumps(event).encode()
    stamp = str(timestamp or int(time.time()))
    signature = hmac.new(settings.BACHS_WEBHOOK_SECRET.encode(), stamp.encode()+b"."+raw, hashlib.sha256).hexdigest()
    return client.post("/api/v1/webhooks/bachs/sandbox", content=raw, headers={"X-Bachs-Signature-V2": "t="+stamp+(",v1=wrong" if extra else "")+",v1="+signature, "Content-Type": "application/json"})


def success(record, records):
    checkout = records[record.payment_checkout_id]
    charge = "ch_"+str(record.id)
    checkout.update(status="completed", payment_status="succeeded", charge={"payment_id": charge, "status": "succeeded"})
    records[charge] = {"payment_id": charge, "checkout_id": record.payment_checkout_id, "status": "succeeded", "is_refundable": True, "amount": checkout["amount"], "currency": "USD", "amount_paid": checkout["amount"], "amount_remaining": "0.00"}
    return {"id": "evt_"+uuid4().hex, "type": "collection.succeeded", "data": {"checkout_id": record.payment_checkout_id, "charge_id": charge, "amount": checkout["amount"], "currency": "USD", "status": "SUCCEEDED"}}


def test_hosted_order_server_totals_request_reuse_and_sandbox_receipts(client, db_session, catalogue, bachs):
    _, variant, _ = catalogue
    requests, records = bachs
    headers = {"Idempotency-Key": str(uuid4())}
    first = client.post('/api/v1/orders/', json=payload(variant), headers=headers)
    assert first.status_code == 201, first.text
    second = client.post('/api/v1/orders/', json=payload(variant), headers=headers)
    assert second.json() == first.json()
    assert len(requests) == 1
    order = db_session.get(Order, UUID(first.json()['order_id']))
    assert order.stripe_session_id is None and order.payment_provider == 'bachs' and order.currency == 'USD'
    assert requests[0][2]['pricing']['amount'] == f'{order.total_cents/100:.2f}'
    event = success(order, records)
    assert signed(client, event, extra=True).status_code == 200
    assert signed(client, event).status_code == 200
    assert db_session.query(PaymentEvent).count() == 1
    assert order.status == 'pending'  # durable delivery precedes fulfilment
    assert process_one(db_session, BachsGateway())
    db_session.refresh(order); db_session.refresh(variant)
    assert order.status == 'paid' and variant.stock_count == 1
    assert db_session.query(EmailDelivery).filter_by(status='sandbox').count() >= 1
    assert not db_session.query(EmailDelivery).filter_by(status='queued').count()
    # A second event for the same payment cannot fulfil or restock twice.
    event['id'] = 'evt_'+uuid4().hex
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(variant)
    assert variant.stock_count == 1


def test_booking_uses_refundable_hosted_methods_and_confirms_only_after_verified_payment(client, db_session, catalogue, bachs):
    _, _, service = catalogue
    requests, records = bachs
    result = client.post('/api/v1/bookings/', json=book_payload(service), headers={'Idempotency-Key': str(uuid4())})
    assert result.status_code == 201, result.text
    assert result.json()['client_secret'] is None
    assert result.json()['checkout_url'].startswith('https://sandbox-checkout.bachs.io/')
    methods = requests[0][2]['payment_method_types']
    assert 'USD_CARD' in methods and 'MOMO_GHS' in methods and 'NGN_BANK_TRANSFER' not in methods and 'CRYPTO' not in methods
    booking = db_session.get(Booking, UUID(result.json()['booking_id']))
    event = success(booking, records)
    signed(client, event); process_one(db_session, BachsGateway()); db_session.refresh(booking)
    assert booking.status == 'confirmed' and booking.stripe_payment_intent_id is None
    assert booking.payment_charge_id == event['data']['charge_id']


@pytest.mark.parametrize('fault', ['amount', 'currency', 'reference', 'charge', 'payment-status'])
def test_mismatched_or_underpaid_provider_records_never_fulfil(client, db_session, catalogue, bachs, fault):
    _, variant, _ = catalogue
    _, records = bachs
    result = client.post('/api/v1/orders/', json=payload(variant))
    order = db_session.get(Order, UUID(result.json()['order_id']))
    event = success(order, records)
    checkout = records[order.payment_checkout_id]
    if fault == 'amount': checkout['amount'] = '0.01'
    if fault == 'currency': checkout['currency'] = 'CAD'
    if fault == 'reference': checkout['reference'] = 'someone-else'
    if fault == 'charge': checkout['charge']['payment_id'] = 'ch_wrong'
    if fault == 'payment-status': records[event['data']['charge_id']]['status'] = 'underpaid'
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(order); db_session.refresh(variant)
    assert order.status == 'pending' and variant.stock_count == 2
    assert db_session.query(PaymentEvent).one().status == 'queued'


def test_checkout_completed_is_not_payment_and_invalid_signatures_do_not_enter_inbox(client, db_session, bachs):
    event = {'id': 'evt_completed', 'type': 'checkout.completed', 'data': {}}
    assert client.post('/api/v1/webhooks/bachs/sandbox', json=event).status_code == 400
    assert signed(client, event, timestamp=int(time.time())-600).status_code == 400
    assert db_session.query(PaymentEvent).count() == 0
    assert signed(client, event).status_code == 200
    process_one(db_session, BachsGateway())
    assert db_session.query(PaymentEvent).one().status == 'processed'


def test_refund_is_pending_until_verified_and_duplicate_delivery_does_not_restock(client, db_session, catalogue, bachs):
    _, variant, _ = catalogue
    _, records = bachs
    result = client.post('/api/v1/orders/', json=payload(variant)).json()
    order = db_session.get(Order, UUID(result['order_id']))
    event = success(order, records); signed(client, event); process_one(db_session, BachsGateway())
    refund = client.post('/api/v1/payments/sandbox/order/'+result['order_id']+'/refund', headers={'X-Confirmation-Token': result['confirmation_token']})
    assert refund.status_code == 200, refund.text
    assert refund.json()['status'] == 'refund_pending'
    db_session.refresh(order); refund_id = order.payment_refund_id
    records[refund_id].update(status='success', refunded_amount=records[refund_id]['requested_amount'])
    records[order.payment_charge_id]['status'] = 'refunded'
    event = {'id': 'evt_refund', 'type': 'refund.paid', 'data': {'refund_id': refund_id, 'charge_id': order.payment_charge_id}}
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(order); db_session.refresh(variant)
    assert order.status == 'refunded' and variant.stock_count == 2
    event['id'] = 'evt_refund_again'; signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(variant)
    assert variant.stock_count == 2


def test_failed_creation_preserves_operation_for_safe_retry(client, db_session, catalogue, bachs, monkeypatch):
    _, variant, _ = catalogue
    original = BachsGateway.request
    def fail(*args, **kwargs): raise BachsError()
    monkeypatch.setattr(BachsGateway, 'request', fail)
    headers = {'Idempotency-Key': str(uuid4())}
    first = client.post('/api/v1/orders/', json=payload(variant), headers=headers)
    assert first.status_code == 502 and db_session.query(Order).count() == 1
    identity = db_session.query(Order).one().id
    monkeypatch.setattr(BachsGateway, 'request', original)
    retry = client.post('/api/v1/orders/', json=payload(variant), headers=headers)
    assert retry.status_code == 201 and retry.json()['order_id'] == str(identity)
    assert db_session.query(Order).count() == 1
    changed = payload(variant); changed['customer_email'] = 'another@example.com'
    assert client.post('/api/v1/orders/', json=changed, headers=headers).status_code == 409


def test_sandbox_refund_tool_is_never_available_on_live_app(client, monkeypatch):
    monkeypatch.setattr(settings, 'PAYMENT_SANDBOX_INSTANCE', False)
    result = client.post('/api/v1/payments/sandbox/order/'+str(uuid4())+'/refund', headers={'X-Confirmation-Token': 'invalid'})
    assert result.status_code == 404


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-1.00', '0.001', 1.0])
def test_money_rejects_non_decimal_or_fractional_cents(value):
    with pytest.raises(BachsError): cents(value)


def test_retry_preserves_identical_payload_including_confirmation_link(client, db_session, catalogue, bachs, monkeypatch):
    _, variant, _ = catalogue
    original = BachsGateway.request
    bodies = []
    def request(self, method, path, body=None, key=None):
        if method == "POST" and path == "/v1/checkout-sessions":
            bodies.append(json.dumps(body, sort_keys=True))
            if len(bodies) == 1:
                raise BachsError()
        return original(self, method, path, body, key)
    monkeypatch.setattr(BachsGateway, 'request', request)
    headers = {'Idempotency-Key': str(uuid4())}
    assert client.post('/api/v1/orders/', json=payload(variant), headers=headers).status_code == 502
    # A different clock changes freshly minted confirmation tokens; the stored request must win.
    monkeypatch.setattr('app.core.security.customer_token', lambda *args: 'a-different-confirmation-token')
    assert client.post('/api/v1/orders/', json=payload(variant), headers=headers).status_code == 201
    assert bodies[0] == bodies[1]


def test_unfulfillable_late_payment_refund_never_increases_stock(client, db_session, catalogue, bachs):
    _, variant, _ = catalogue
    _, records = bachs
    result = client.post('/api/v1/orders/', json=payload(variant)).json()
    order = db_session.get(Order, UUID(result['order_id']))
    variant.stock_count = 0
    db_session.commit()
    event = success(order, records)
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(order)
    assert order.status == 'refund_pending' and not order.payment_fulfilled
    refund_id = order.payment_refund_id
    records[refund_id].update(status='success', refunded_amount=records[refund_id]['requested_amount'])
    records[order.payment_charge_id]['status'] = 'refunded'
    event = {'id': 'evt_late_refund', 'type': 'refund.paid', 'data': {'refund_id': refund_id, 'charge_id': order.payment_charge_id}}
    signed(client, event); process_one(db_session, BachsGateway())
    db_session.refresh(variant); db_session.refresh(order)
    assert variant.stock_count == 0 and order.status == 'refunded'

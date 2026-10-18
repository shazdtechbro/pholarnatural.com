import hashlib
import hmac
import json
import time as clock
import uuid
from datetime import datetime, timedelta, time, timezone
import pytest
from fastapi import HTTPException
from app.main import app
from app.api.dependencies import get_current_admin, get_payment_gateway
from app.core.config import settings
from app.core.security import customer_token
from app.models.admin import AdminUser
from app.models.product import Product, ProductVariant
from app.models.service import Service
from app.models.order import Order, OrderItem
from app.models.booking import Booking
from app.models.notification import EmailDelivery
from app.services import email as mail
from app.services.booking_service import studio_now
from app.services.stripe_gateway import StripeGateway


class Gateway:
    def __init__(self):
        self.refunds = []
        self.calls = []

    def create_checkout_session(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "session_id": "cs_" + uuid.uuid4().hex,
            "url": "https://checkout.stripe.com/test",
        }

    def create_payment_intent(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "payment_intent_id": "pi_" + uuid.uuid4().hex,
            "client_secret": "test_secret",
        }

    def create_refund(self, pi, amount_cents=None):
        self.refunds.append(pi)
        return {"refund_id": "re_test", "status": "succeeded"}

    def verify_webhook_signature(self, payload, signature):
        return StripeGateway().verify_webhook_signature(payload, signature)


@pytest.fixture
def gateway():
    gateway = Gateway()
    app.dependency_overrides[get_payment_gateway] = lambda: gateway
    yield gateway
    app.dependency_overrides.pop(get_payment_gateway, None)


@pytest.fixture
def catalogue(db_session):
    product = Product(
        name="Test Oil", slug="test-oil", category="Hair Oil", is_active=True
    )
    service = Service(
        name="Braids",
        slug="braids",
        duration_minutes=180,
        price_cents=12000,
        is_active=True,
    )
    db_session.add_all([product, service])
    db_session.flush()
    variant = ProductVariant(
        product_id=product.id,
        weight_label="100ml",
        price_cents=6000,
        stock_count=2,
        is_active=True,
    )
    db_session.add(variant)
    db_session.commit()
    return product, variant, service


@pytest.fixture
def admin():
    app.dependency_overrides[get_current_admin] = lambda: AdminUser(
        email="admin@example.com"
    )
    yield
    app.dependency_overrides.pop(get_current_admin, None)


def payload(variant, quantity=1):
    return {
        "customer_name": "Test Buyer",
        "customer_email": "buyer@example.com",
        "shipping_address": {
            "full_name": "Test Buyer",
            "address_line1": "1 Example St",
            "city": "Toronto",
            "province": "ON",
            "postal_code": "M5V1A1",
            "country": "Canada",
        },
        "items": [{"variant_id": str(variant.id), "quantity": quantity}],
    }


def book_payload(service, hour=10):
    day = studio_now().date() + timedelta(days=1)
    while day.weekday() == 6:
        day += timedelta(days=1)
    return {
        "service_id": str(service.id),
        "customer_name": "Test Buyer",
        "customer_email": "buyer@example.com",
        "booking_date": day.isoformat(),
        "start_time": f"{hour:02}:00:00",
    }


def signed(client, event):
    event = {"object": "event", "id": "evt_test", **event}
    raw = json.dumps(event).encode()
    timestamp = int(clock.time())
    digest = hmac.new(
        settings.STRIPE_WEBHOOK_SECRET.encode(),
        str(timestamp).encode() + b"." + raw,
        hashlib.sha256,
    ).hexdigest()
    return client.post(
        "/api/v1/webhooks/payments/",
        content=raw,
        headers={
            "stripe-signature": f"t={timestamp},v1={digest}",
            "content-type": "application/json",
        },
    )


def paid_order(client, db, gateway, variant):
    result = client.post("/api/v1/orders/", json=payload(variant))
    assert result.status_code == 201, result.text
    order = db.get(Order, uuid.UUID(result.json()["order_id"]))
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": order.stripe_session_id,
                "currency": "cad",
                "amount_total": order.total_cents,
                "payment_status": "paid",
                "payment_intent": "pi_order_" + str(order.id),
                "metadata": {"type": "product_order", "order_id": str(order.id)},
            }
        },
    }
    assert signed(client, event).status_code == 200
    return order, event, result.json()


@pytest.mark.parametrize("quantity", [0, -1, 1.2, True, "2", 101])
def test_reject_invalid_quantity(client, gateway, catalogue, quantity):
    assert (
        client.post("/api/v1/orders/", json=payload(catalogue[1], quantity)).status_code
        == 422
    )
    assert not gateway.calls


@pytest.mark.parametrize("kind", ["empty", "duplicate", "missing_variant"])
def test_reject_invalid_cart(client, gateway, catalogue, kind):
    data = payload(catalogue[1])
    if kind == "empty":
        data["items"] = []
    if kind == "duplicate":
        data["items"] *= 2
    if kind == "missing_variant":
        data["items"][0]["variant_id"] = str(uuid.uuid4())
    assert client.post("/api/v1/orders/", json=data).status_code in (400, 422)
    assert not gateway.calls


def test_inventory_reservation_and_shipping(client, gateway, catalogue, db_session):
    variant = catalogue[1]
    first = client.post("/api/v1/orders/", json=payload(variant, 2))
    assert first.status_code == 201
    assert client.post("/api/v1/orders/", json=payload(variant)).status_code == 409
    order = db_session.get(Order, uuid.UUID(first.json()["order_id"]))
    assert order.shipping_cents == 0
    assert gateway.calls[0]["line_items"][0]["price_data"]["currency"] == "cad"
    assert "token=" in gateway.calls[0]["success_url"]


def test_payment_webhook_validation_and_idempotency(
    client, gateway, catalogue, db_session
):
    order, event, result = paid_order(client, db_session, gateway, catalogue[1])
    assert catalogue[1].stock_count == 1
    emails = db_session.query(EmailDelivery).count()
    assert signed(client, event).status_code == 200
    assert catalogue[1].stock_count == 1
    assert db_session.query(EmailDelivery).count() == emails == 2
    event["data"]["object"]["amount_total"] += 1
    assert signed(client, event).status_code == 400
    assert (
        client.post(
            "/api/v1/webhooks/payments/",
            json=event,
            headers={"stripe-signature": "invalid"},
        ).status_code
        == 400
    )
    assert client.get(f"/api/v1/orders/{order.id}").status_code == 422
    assert (
        client.get(
            f"/api/v1/orders/{order.id}", headers={"X-Confirmation-Token": "invalid"}
        ).status_code
        == 403
    )
    response = client.get(
        f"/api/v1/orders/{order.id}",
        headers={"X-Confirmation-Token": result["confirmation_token"]},
    )
    assert response.json()["status"] == "paid"
    assert response.json()["tax_cents"] == order.tax_cents


@pytest.mark.parametrize("hour", [7, 16, 17])
def test_booking_reject_outside_hours(client, gateway, catalogue, hour):
    data = book_payload(catalogue[2], hour)
    assert client.post("/api/v1/bookings/", json=data).status_code == 400
    assert not gateway.calls
    slots = client.get(
        "/api/v1/bookings/slots",
        params={"date": data["booking_date"], "service_id": str(catalogue[2].id)},
    ).json()["slots"]
    if hour == 16:
        assert not next(s["available"] for s in slots if s["time"] == "16:00")


def test_booking_overlap_and_cancellation_ownership(
    client, gateway, catalogue, db_session
):
    data = book_payload(catalogue[2], 14)
    first = client.post("/api/v1/bookings/", json=data)
    assert first.status_code == 201, first.text
    assert first.json()["end_time"] == "17:00:00"
    assert client.post("/api/v1/bookings/", json=data).status_code == 409
    record = db_session.get(Booking, uuid.UUID(first.json()["booking_id"]))
    assert (
        client.post(f"/api/v1/bookings/{record.id}/cancel", json={}).status_code == 422
    )
    wrong = customer_token("order", record.id)
    assert (
        client.post(
            f"/api/v1/bookings/{record.id}/cancel",
            json={},
            headers={"X-Confirmation-Token": wrong},
        ).status_code
        == 403
    )
    event = {
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": record.stripe_payment_intent_id,
                "amount": record.deposit_cents,
                "amount_received": record.deposit_cents,
                "currency": "cad",
                "metadata": {"type": "booking_deposit", "booking_id": str(record.id)},
            }
        },
    }
    assert signed(client, event).status_code == 200
    assert record.status == "confirmed"
    response = client.post(
        f"/api/v1/bookings/{record.id}/cancel",
        json={},
        headers={"X-Confirmation-Token": first.json()["confirmation_token"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["refunded"]
    assert len(gateway.refunds) == 1
    assert signed(client, event).status_code == 200
    assert len(gateway.refunds) == 1
    assert record.status == "refunded"


def test_admin_refund_and_status_transitions(
    client, gateway, catalogue, db_session, admin
):
    order, event, result = paid_order(client, db_session, gateway, catalogue[1])
    assert (
        client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "invented"}
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "delivered"}
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "processing"}
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "cancelled"}
        ).status_code
        == 200
    )
    assert order.status == "refunded"
    assert catalogue[1].stock_count == 2
    assert len(gateway.refunds) == 1


def test_settings_and_catalogue_delete(client, gateway, catalogue, db_session, admin):
    assert (
        client.put(
            "/api/v1/admin/settings",
            json={
                "tax_rate_percent": "0",
                "shipping_rate_domestic_cents": "0",
                "email_notifications_enabled": "false",
                "hero_image_url": "https://res.cloudinary.com/demo/image/upload/test.webp",
            },
        ).status_code
        == 200
    )
    data = client.get("/api/v1/admin/settings/public").json()
    assert (
        data["tax_rate_percent"] == "0" and data["shipping_rate_domestic_cents"] == "0"
    )
    assert (
        client.put(
            "/api/v1/admin/settings", json={"database_password": "bad"}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/admin/settings", json={"hero_image_url": "javascript:alert(1)"}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/admin/settings", json={"shipping_rate_domestic_cents": "-1"}
        ).status_code
        == 422
    )
    product = catalogue[0]
    assert client.delete(f"/api/v1/admin/products/{product.id}").status_code == 204
    assert client.get("/api/v1/products/").json() == []
    assert client.get("/api/v1/admin/products/").json() == []
    assert client.post("/api/v1/orders/", json=payload(catalogue[1])).status_code == 400


def test_contact_email_persisted_and_escaped(client, db_session):
    response = client.post(
        "/api/v1/contact/",
        json={
            "name": "<img src=x onerror=alert(1)>",
            "email": "visitor@example.com",
            "subject": "Question",
            "message": "<script>bad</script>",
        },
    )
    assert response.status_code == 201, response.text
    messages = db_session.query(EmailDelivery).all()
    assert len(messages) == 2
    assert all(
        "<script>" not in row.html and "<img src=x" not in row.html for row in messages
    )
    assert any("&lt;script&gt;" in row.html for row in messages)


def test_email_retry_and_idempotency(db_session):
    content = mail.message("Receipt", ["Example"])
    mail.queue_email(db_session, "unique-test", "buyer@example.com", *content)
    mail.queue_email(db_session, "unique-test", "buyer@example.com", *content)
    db_session.commit()
    assert db_session.query(EmailDelivery).count() == 1

    def fail(row):
        raise RuntimeError("test failure")

    assert mail.deliver_one(db_session, sender=fail)
    row = db_session.query(EmailDelivery).one()
    assert row.status == "queued" and row.attempts == 1
    assert row.last_error == "RuntimeError"
    row.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert mail.deliver_one(db_session, sender=lambda row: None)
    assert row.status == "sent" and row.attempts == 2
    assert not mail.deliver_one(db_session, sender=lambda row: None)


def test_admin_auth_required_and_login_throttled(client):
    assert client.get("/api/v1/admin/dashboard").status_code == 401
    for _ in range(10):
        assert (
            client.post(
                "/api/v1/admin/login",
                data={"username": "nobody@example.com", "password": "wrong"},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/v1/admin/login",
            data={"username": "nobody@example.com", "password": "wrong"},
        ).status_code
        == 429
    )


def test_protected_upload_rejects_svg():
    from app.services.storage_service import CloudinaryStorageService

    with pytest.raises(HTTPException) as error:
        CloudinaryStorageService().upload_image(b'<svg onload="alert(1)"/>')
    assert error.value.status_code == 422


@pytest.mark.parametrize("case", ["past", "sunday", "too_far", "seconds"])
def test_booking_date_and_slot_validation(client, gateway, catalogue, case):
    data = book_payload(catalogue[2])
    if case == "past":
        data["booking_date"] = (studio_now().date() - timedelta(days=1)).isoformat()
    elif case == "sunday":
        day = studio_now().date() + timedelta(days=1)
        while day.weekday() != 6:
            day += timedelta(days=1)
        data["booking_date"] = day.isoformat()
    elif case == "too_far":
        data["booking_date"] = (studio_now().date() + timedelta(days=91)).isoformat()
    else:
        data["start_time"] = "10:00:01"
    assert client.post("/api/v1/bookings/", json=data).status_code == 400
    assert not gateway.calls


def test_admin_booking_refund(client, gateway, catalogue, db_session, admin):
    data = book_payload(catalogue[2])
    booking = Booking(
        service_id=catalogue[2].id,
        customer_name="Buyer",
        customer_email="buyer@example.com",
        booking_date=datetime.fromisoformat(data["booking_date"]).date(),
        start_time=time(10),
        end_time=time(13),
        status="confirmed",
        deposit_cents=1200,
        stripe_payment_intent_id="pi_admin_cancel",
        created_at=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    db_session.add(booking)
    db_session.commit()
    assert (
        client.put(
            f"/api/v1/admin/bookings/{booking.id}/cancel",
            json={"cancellation_reason": "Studio closure"},
        ).status_code
        == 200
    )
    assert booking.status == "refunded" and gateway.refunds == ["pi_admin_cancel"]
    assert db_session.query(EmailDelivery).count() == 2


def test_logout_revokes_tokens(client, db_session):
    from app.core.security import get_password_hash, create_access_token

    user = AdminUser(
        email="owner@example.com",
        hashed_password=get_password_hash("long-test-password"),
        token_version=0,
    )
    db_session.add(user)
    db_session.commit()
    headers = {
        "Authorization": "Bearer " + create_access_token({"sub": user.email, "ver": 0})
    }
    assert client.get("/api/v1/admin/me", headers=headers).status_code == 200
    assert client.post("/api/v1/admin/logout", headers=headers).status_code == 200
    assert client.get("/api/v1/admin/me", headers=headers).status_code == 401


def test_registration_does_not_log_input(client, db_session, capsys):
    db_session.add(AdminUser(email="existing@example.com", hashed_password="unused"))
    db_session.commit()
    response = client.post(
        "/api/v1/admin/register",
        json={
            "email": "other@example.com",
            "password": "long-test-password",
            "secret_key": settings.ADMIN_REGISTRATION_KEY,
        },
    )
    assert response.status_code == 409
    assert "long-test-password" not in capsys.readouterr().out


def test_email_toggle_keeps_customer_receipt(
    client, gateway, catalogue, db_session, admin
):
    assert (
        client.put(
            "/api/v1/admin/settings", json={"email_notifications_enabled": "false"}
        ).status_code
        == 200
    )
    paid_order(client, db_session, gateway, catalogue[1])
    assert db_session.query(EmailDelivery).count() == 1
    assert db_session.query(EmailDelivery).one().recipient == "buyer@example.com"


def test_product_metadata_and_image_ordering(client, admin, db_session, catalogue):
    from app.models.product import ProductImage

    p = catalogue[0]
    images = [
        ProductImage(product_id=p.id, url="/images/hero/hero-1.webp", sort_order=0),
        ProductImage(product_id=p.id, url="/images/hero/hero-2.webp", sort_order=1),
    ]
    db_session.add_all(images)
    db_session.commit()
    response = client.put(
        f"/api/v1/admin/products/{p.id}",
        json={"seo_title": "Custom title", "is_bestseller": True},
    )
    assert (
        response.status_code == 200 and response.json()["seo_title"] == "Custom title"
    )
    assert response.json()["is_bestseller"]
    assert (
        client.put(
            f"/api/v1/admin/products/{p.id}/images/order",
            json=[str(images[1].id), str(images[0].id)],
        ).status_code
        == 200
    )
    assert (
        client.put(
            f"/api/v1/admin/products/{p.id}/images/order", json=[str(uuid.uuid4())]
        ).status_code
        == 422
    )
    result = client.get("/api/v1/products/" + p.slug).json()
    assert result["images"][0]["id"] == str(images[1].id)


def test_service_details_reach_public_api(client, admin, catalogue):
    service = catalogue[2]
    updated = client.put(
        f"/api/v1/admin/services/{service.id}",
        json={
            "long_description": "Full service detail",
            "what_to_expect": ["Consultation", "Styling"],
            "image_url": "https://res.cloudinary.com/demo/image/upload/service.webp",
        },
    )
    assert updated.status_code == 200, updated.text
    public = client.get("/api/v1/services/" + service.slug).json()
    assert public["long_description"] == "Full service detail"
    assert public["what_to_expect"] == ["Consultation", "Styling"]


def test_cors_allows_local_alias_but_not_arbitrary_sites(client):
    path = "/api/v1/admin/login"
    trusted = client.options(
        path,
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert trusted.status_code == 200
    assert trusted.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"
    denied = client.options(
        path,
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_registration_password_constraints(client):
    response = client.post(
        "/api/v1/admin/register",
        json={
            "email": "new@example.com",
            "password": "short",
            "secret_key": settings.ADMIN_REGISTRATION_KEY,
        },
    )
    assert response.status_code == 422
    response = client.post(
        "/api/v1/admin/register",
        json={
            "email": "new@example.com",
            "password": "é" * 40,
            "secret_key": settings.ADMIN_REGISTRATION_KEY,
        },
    )
    assert response.status_code == 422


def test_pending_refund_waits_for_provider_success(
    client, gateway, catalogue, db_session, admin
):
    order, event, result = paid_order(client, db_session, gateway, catalogue[1])
    gateway.create_refund = lambda *args, **kwargs: {
        "refund_id": "re_pending",
        "status": "pending",
    }
    assert (
        client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": "cancelled"}
        ).status_code
        == 200
    )
    assert order.status == "refund_pending" and catalogue[1].stock_count == 1
    update = {
        "type": "refund.updated",
        "data": {
            "object": {
                "id": "re_pending",
                "status": "succeeded",
                "amount": order.total_cents,
                "payment_intent": order.stripe_payment_intent_id,
            }
        },
    }
    assert signed(client, update).status_code == 200
    assert order.status == "refunded" and catalogue[1].stock_count == 2
    assert signed(client, update).status_code == 200
    assert catalogue[1].stock_count == 2


def test_all_order_status_emails_and_unpaid_revenue(
    client, gateway, catalogue, db_session, admin
):
    order, event, result = paid_order(client, db_session, gateway, catalogue[1])
    assert client.post("/api/v1/orders/", json=payload(catalogue[1])).status_code == 201
    for state in ["confirmed", "processing", "shipped", "delivered"]:
        response = client.put(
            f"/api/v1/admin/orders/{order.id}/status", json={"status": state}
        )
        assert response.status_code == 200, response.text
    assert db_session.query(EmailDelivery).count() == 10
    stats = client.get("/api/v1/admin/dashboard").json()
    assert stats["revenue_total_cents"] == order.total_cents


def test_late_booking_payment_refunds_conflict(client, gateway, catalogue, db_session):
    data = book_payload(catalogue[2])
    first = client.post("/api/v1/bookings/", json=data).json()
    old = db_session.get(Booking, uuid.UUID(first["booking_id"]))
    old.created_at = datetime.now(timezone.utc) - timedelta(minutes=31)
    db_session.commit()
    second = client.post("/api/v1/bookings/", json=data)
    assert second.status_code == 201, second.text
    event = {
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": old.stripe_payment_intent_id,
                "amount": old.deposit_cents,
                "amount_received": old.deposit_cents,
                "currency": "cad",
                "metadata": {"type": "booking_deposit", "booking_id": str(old.id)},
            }
        },
    }
    assert signed(client, event).status_code == 200
    assert old.status == "refunded" and len(gateway.refunds) == 1
    assert signed(client, event).status_code == 200 and len(gateway.refunds) == 1


def test_account_setup_and_password_change_notify_and_revoke(client, db_session):
    setup = client.post(
        "/api/v1/admin/register",
        json={
            "email": "owner@example.com",
            "password": "initial-long-password",
            "secret_key": settings.ADMIN_REGISTRATION_KEY,
        },
    )
    assert setup.status_code == 201, setup.text
    logged_in = client.post(
        "/api/v1/admin/login",
        data={"username": "owner@example.com", "password": "initial-long-password"},
    )
    assert logged_in.status_code == 200
    headers = {"Authorization": "Bearer " + logged_in.json()["access_token"]}
    changed = client.post(
        "/api/v1/admin/password",
        headers=headers,
        json={
            "current_password": "initial-long-password",
            "new_password": "replacement-long-password",
        },
    )
    assert changed.status_code == 200, changed.text
    assert client.get("/api/v1/admin/me", headers=headers).status_code == 401
    assert (
        client.post(
            "/api/v1/admin/login",
            data={"username": "owner@example.com", "password": "initial-long-password"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/admin/login",
            data={
                "username": "owner@example.com",
                "password": "replacement-long-password",
            },
        ).status_code
        == 200
    )
    assert db_session.query(EmailDelivery).count() == 2


def test_payment_setup_failure_rolls_back_and_hides_provider_details(
    client, gateway, catalogue, db_session
):
    def fail(**kwargs):
        raise RuntimeError("sensitive provider information")

    gateway.create_checkout_session = fail
    result = client.post("/api/v1/orders/", json=payload(catalogue[1]))
    assert result.status_code == 502
    assert "sensitive provider information" not in result.text
    assert db_session.query(Order).count() == 0


def test_webhook_fails_closed_without_secret(client, gateway, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", "")
    response = client.post(
        "/api/v1/webhooks/payments/",
        json={"object": "event", "type": "anything", "data": {"object": {}}},
        headers={"stripe-signature": "anything"},
    )
    assert response.status_code == 503


def test_configuration_errors_do_not_dump_secrets():
    from app.core.config import Settings
    from pydantic import ValidationError

    with pytest.raises(ValidationError) as error:
        Settings(
            DATABASE_URL="sqlite:///:memory:",
            SECRET_KEY="short",
            STRIPE_SECRET_KEY="sensitive-config-value",
            STRIPE_PUBLISHABLE_KEY="",
            STRIPE_WEBHOOK_SECRET="",
        )
    assert "sensitive-config-value" not in str(error.value)
    assert "input_value" not in str(error.value)


def test_unconfigured_booking_payment_does_not_reserve_slot(
    client, gateway, catalogue, db_session, monkeypatch
):
    monkeypatch.setattr(settings, "STRIPE_PUBLISHABLE_KEY", "")
    result = client.post("/api/v1/bookings/", json=book_payload(catalogue[2]))
    assert result.status_code == 503
    assert db_session.query(Booking).count() == 0
    assert not gateway.calls


def test_contact_delivery_is_not_disabled_with_optional_admin_alerts(
    client, admin, db_session
):
    assert (
        client.put(
            "/api/v1/admin/settings", json={"email_notifications_enabled": "false"}
        ).status_code
        == 200
    )
    response = client.post(
        "/api/v1/contact/",
        json={
            "name": "Visitor",
            "email": "visitor@example.com",
            "message": "I need help with my order.",
        },
    )
    assert response.status_code == 201, response.text
    assert db_session.query(EmailDelivery).count() == 2


def test_inactive_product_stays_in_admin_but_disappears_from_store(client,admin,gateway,catalogue):
    product,variant,service=catalogue
    result=client.put(f'/api/v1/admin/products/{product.id}',json={'is_active':False})
    assert result.status_code==200
    assert client.get('/api/v1/products/').json()==[]
    assert client.get('/api/v1/products/'+product.slug).status_code==404
    admin_products=client.get('/api/v1/admin/products/').json()
    assert len(admin_products)==1 and not admin_products[0]['is_active']
    assert client.post('/api/v1/orders/',json=payload(variant)).status_code==400
    assert not gateway.calls

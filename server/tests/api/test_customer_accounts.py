import re
from datetime import timedelta, timezone
from uuid import uuid4
from app.api.routes import customer as auth
from app.core.config import settings
from app.models.customer import Customer, CustomerSession, CustomerAction
from app.models.notification import EmailDelivery
from app.models.order import Order
from app.models.product import Product, ProductVariant

HEADERS = {"origin": settings.DOMAIN}
PASSWORD = "a long and memorable password"


def register(client, email="shopper@example.com"):
    return client.post("/api/v1/account/register", headers=HEADERS, json={"name": "Test Shopper", "email": email, "password": PASSWORD})


def token(db, purpose):
    mail = db.query(EmailDelivery).filter(EmailDelivery.event_key.like(f"account/%/{purpose}")).order_by(EmailDelivery.created_at.desc()).first()
    return re.search(r"#token=([^\"]+)", mail.html).group(1)


def test_sessions_password_hash_and_admin_separation(client, db_session):
    response = register(client)
    assert response.status_code == 201
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "password" not in response.json()
    customer = db_session.query(Customer).one()
    assert customer.password_hash.startswith("$argon2id$")
    assert PASSWORD not in customer.password_hash
    assert client.get("/api/v1/account/me").json()["email"] == "shopper@example.com"
    assert client.get("/api/v1/admin/orders").status_code == 401
    assert client.post("/api/v1/account/logout", headers=HEADERS, json={}).status_code == 200
    assert client.get("/api/v1/account/me").status_code == 401
    assert client.post("/api/v1/account/login", headers=HEADERS, json={"email": customer.email, "password": "wrong"}).status_code == 401
    assert client.post("/api/v1/account/login", headers=HEADERS, json={"email": customer.email.upper(), "password": PASSWORD}).status_code == 200


def test_csrf_password_validation_and_duplicate_signup(client, db_session):
    body = {"name": "Test", "email": "shopper@example.com", "password": PASSWORD}
    assert client.post("/api/v1/account/register", json=body).status_code == 403
    assert client.post("/api/v1/account/register", headers={"origin": "https://evil.example"}, json=body).status_code == 403
    assert client.post("/api/v1/account/register", headers=HEADERS, json={**body, "password": "short"}).status_code == 422
    assert register(client).status_code == 201
    assert register(client).status_code == 409
    assert db_session.query(Customer).count() == 1


def test_email_ownership_required_and_history_is_scoped(client, db_session):
    for email in ("shopper@example.com", "someoneelse@example.com"):
        db_session.add(Order(customer_name="Shopper", customer_email=email, shipping_address={}, subtotal_cents=1000, total_cents=1000, status="paid"))
    db_session.commit()
    register(client)
    old_cookie = client.cookies.get(auth.COOKIE)
    assert client.get("/api/v1/account/history").status_code == 403
    verification = token(db_session, "verify")
    assert client.post("/api/v1/account/verify", headers=HEADERS, json={"token": verification, "password": "wrong"}).status_code == 400
    response = client.post("/api/v1/account/verify", headers=HEADERS, json={"token": verification, "password": PASSWORD})
    assert response.status_code == 200 and response.json()["verified"]
    assert client.cookies.get(auth.COOKIE) != old_cookie
    history = client.get("/api/v1/account/history").json()
    assert len(history["orders"]) == 1
    assert "/checkout/success?id=" in history["orders"][0]["url"]
    assert db_session.get(CustomerSession, auth.digest(old_cookie)) is None
    assert client.post("/api/v1/account/verify", headers=HEADERS, json={"token": verification, "password": PASSWORD}).status_code == 400


def test_reset_is_single_use_revokes_sessions_and_does_not_enumerate(client, db_session):
    register(client)
    known = client.post("/api/v1/account/forgot-password", headers=HEADERS, json={"email": "shopper@example.com"})
    unknown = client.post("/api/v1/account/forgot-password", headers=HEADERS, json={"email": "unknown@example.com"})
    assert known.json() == unknown.json() and known.status_code == unknown.status_code == 202
    reset = token(db_session, "reset")
    assert db_session.get(CustomerAction, auth.digest(reset)) is not None
    new_password = "a different strong password"
    response = client.post("/api/v1/account/reset-password", headers=HEADERS, json={"token": reset, "password": new_password})
    assert response.status_code == 200
    assert client.get("/api/v1/account/me").status_code == 401
    assert client.post("/api/v1/account/reset-password", headers=HEADERS, json={"token": reset, "password": new_password}).status_code == 400
    assert client.post("/api/v1/account/login", headers=HEADERS, json={"email": "shopper@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/api/v1/account/login", headers=HEADERS, json={"email": "shopper@example.com", "password": new_password}).status_code == 200
    assert client.get("/api/v1/account/me").json()["verified"]


def test_expired_links_and_verification_cooldown(client, db_session):
    register(client)
    first = token(db_session, "verify")
    client.post("/api/v1/account/resend-verification", headers=HEADERS, json={})
    assert db_session.query(CustomerAction).count() == 1
    row = db_session.query(CustomerAction).one()
    row.expires_at = auth.utcnow()-timedelta(seconds=1)
    db_session.commit()
    assert client.post("/api/v1/account/verify", headers=HEADERS, json={"token": first, "password": PASSWORD}).status_code == 400


def test_cart_merge_retry_conflict_stock_and_account_isolation(client, db_session):
    product = Product(name="Oil", slug="test-account-oil", is_active=True)
    variant = ProductVariant(product=product, weight_label="100ml", price_cents=2000, stock_count=8, is_active=True)
    db_session.add(product); db_session.commit()
    register(client)
    payload = {"operation_id": str(uuid4()), "items": [{"variant_id": str(variant.id), "quantity": 2}]}
    first = client.post("/api/v1/account/cart/merge", headers=HEADERS, json=payload)
    second = client.post("/api/v1/account/cart/merge", headers=HEADERS, json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert first.json()["items"][0]["quantity"] == 2
    version = first.json()["version"]
    saved = client.put("/api/v1/account/cart", headers=HEADERS, json={"version": version, "items": [{"variant_id": str(variant.id), "quantity": 99}]})
    assert saved.json()["items"][0]["quantity"] == 8
    assert saved.json()["items"][0]["unit_price_cents"] == 2000
    assert client.put("/api/v1/account/cart", headers=HEADERS, json={"version": version, "items": []}).status_code == 409
    client.post("/api/v1/account/logout", headers=HEADERS, json={})
    register(client, "other@example.com")
    assert client.get("/api/v1/account/cart").json()["items"] == []
    assert client.get("/api/v1/account/history").status_code == 403


def test_expired_account_mail_is_cancelled_before_provider_request(client, db_session, monkeypatch):
    from app.services import mail_delivery
    register(client)
    row = db_session.query(CustomerAction).one()
    row.expires_at = auth.utcnow()-timedelta(seconds=1)
    db_session.commit()
    monkeypatch.setattr(mail_delivery, "request", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("expired link must not send")))
    assert mail_delivery.process_one(db_session)
    assert db_session.query(EmailDelivery).one().status == "cancelled"

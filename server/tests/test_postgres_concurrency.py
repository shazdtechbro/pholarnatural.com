"""Real PostgreSQL migration, database constraint and cross-worker reservation tests."""

import os, subprocess, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine import make_url
from app.models.product import Product, ProductVariant
from app.models.service import Service
from app.models.order import Order
from app.models.booking import Booking
from app.schemas.order import OrderCreate
from app.schemas.booking import BookingCreate
from app.services.order_service import create_order_checkout
from app.services.booking_service import create_booking_with_payment_intent
from tests.api.test_journeys_security import Gateway, payload, book_payload


@pytest.fixture(scope="module")
def postgres():
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Set TEST_POSTGRES_URL for local PostgreSQL regression checks.")
    parsed = make_url(url)
    if parsed.host not in ("127.0.0.1", "localhost"):
        pytest.fail("Only local PostgreSQL is permitted for temporary-schema tests.")
    root = create_engine(url)
    schema = "regression_" + uuid.uuid4().hex
    with root.begin() as c:
        c.execute(text("CREATE SCHEMA " + schema))
    isolated = parsed.update_query_dict({"options": "-csearch_path=" + schema})
    engine = create_engine(isolated)
    try:
        env = {
            **os.environ,
            "DATABASE_URL": isolated.render_as_string(hide_password=False),
            "EMAIL_WORKER_ENABLED": "false",
        }
        run = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            env=env,
            capture_output=True,
            text=True,
        )
        assert run.returncode == 0, run.stderr
        yield sessionmaker(bind=engine)
    finally:
        engine.dispose()
        with root.begin() as c:
            c.execute(text("DROP SCHEMA " + schema + " CASCADE"))
        root.dispose()


def test_concurrent_reservations(postgres):
    with postgres() as db:
        p = Product(name="Concurrent Oil", slug="concurrent-oil", is_active=True)
        s = Service(
            name="Concurrent Braids",
            slug="concurrent-braids",
            duration_minutes=180,
            price_cents=12000,
            is_active=True,
        )
        db.add_all([p, s])
        db.flush()
        v = ProductVariant(
            product_id=p.id, price_cents=6000, stock_count=1, is_active=True
        )
        db.add(v)
        db.commit()
        order_data = OrderCreate(**payload(v))
        booking_data = BookingCreate(**book_payload(s, 14))
    gateway = Gateway()

    def checkout(_):
        with postgres() as db:
            try:
                create_order_checkout(db, order_data, gateway)
                return 201
            except HTTPException as exc:
                return exc.status_code

    def book(_):
        with postgres() as db:
            try:
                create_booking_with_payment_intent(db, booking_data, gateway)
                return 201
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(checkout, range(2))) == [201, 409]
        assert sorted(pool.map(book, range(2))) == [201, 409]
    with postgres() as db:
        assert db.query(Order).count() == db.query(Booking).count() == 1


def test_database_constraints(postgres):
    from sqlalchemy.exc import IntegrityError

    with postgres() as db:
        product = db.query(Product).first()
        db.add(
            ProductVariant(
                product_id=product.id, price_cents=100, stock_count=-1, is_active=True
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_customer_cart_merge_is_idempotent_across_workers(postgres):
    from app.api.routes.customer import merge_cart, MergeInput
    from app.models.customer import Customer
    customer_id = uuid.uuid4()
    with postgres() as db:
        db.add(Customer(id=customer_id, name="Customer", email=str(customer_id)+"@example.com", password_hash="unused-test-hash"))
        db.commit()
    operation = MergeInput(operation_id=uuid.uuid4(), items=[{"variant_id": uuid.uuid4(), "quantity": 2}])
    def merge(_):
        with postgres() as db:
            customer = db.get(Customer, customer_id)
            return merge_cart(operation, customer, db)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(merge, range(2)))
    with postgres() as db:
        customer = db.get(Customer, customer_id)
        assert customer.cart[0]["quantity"] == 2
        assert customer.cart_version == 1


def test_customer_reset_link_can_only_be_used_by_one_worker(postgres):
    from app.api.routes.customer import reset, ResetInput, digest
    from app.models.customer import Customer, CustomerAction
    from app.services.mail_delivery import utcnow
    from datetime import timedelta
    customer_id = uuid.uuid4()
    raw = uuid.uuid4().hex + uuid.uuid4().hex
    with postgres() as db:
        db.add(Customer(id=customer_id, name="Customer", email=str(customer_id)+"@example.com", password_hash="unused-test-hash"))
        db.flush()
        db.add(CustomerAction(token_hash=digest(raw), customer_id=customer_id, purpose="reset", created_at=utcnow(), expires_at=utcnow()+timedelta(minutes=30)))
        db.commit()
    def use(_):
        with postgres() as db:
            try:
                reset(ResetInput(token=raw, password="long test only password"), db)
                return 200
            except HTTPException as error:
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(use, range(2)))
    assert sorted(results) == [200, 400]

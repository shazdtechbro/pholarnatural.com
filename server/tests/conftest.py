import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "local-tests-only-signing-secret-32-bytes-minimum")
os.environ.setdefault("ADMIN_REGISTRATION_KEY", "local-tests-only-registration-key")
os.environ.setdefault("STRIPE_SECRET_KEY", "")
os.environ["STRIPE_PUBLISHABLE_KEY"] = "pk_test_local-fixture-not-a-real-provider-key"
os.environ["STRIPE_WEBHOOK_SECRET"] = (
    "whsec_local-testing-secret-not-a-provider-credential"
)
os.environ["EMAIL_WORKER_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.database import Base
from app.api.dependencies import get_db

# Use an in-memory SQLite database for testing (fast and isolated)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,  # Keeps the database in memory across the test session
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session")
def db_engine():
    # Setup: Create tables in the test database
    Base.metadata.create_all(bind=engine)
    yield engine
    # Teardown: Drop tables
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Creates a new database session for a test."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session):
    """
    Creates a TestClient that uses the dependency override
    to inject the test database session instead of the real one.
    """

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    from app.core.http_security import SecurityMiddleware

    SecurityMiddleware._events.clear()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

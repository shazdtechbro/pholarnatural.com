from sqlalchemy import text


def transaction_lock(db, resource: int):
    """Serialize checkout/booking decisions across API workers on PostgreSQL."""
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL lock_timeout = '10s'"))
        db.execute(
            text("SELECT pg_advisory_xact_lock(:resource)"), {"resource": resource}
        )

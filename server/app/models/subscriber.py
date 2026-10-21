import uuid
from sqlalchemy import Column, String, DateTime
from app.db.database import Base
from datetime import datetime, timezone
def now():
    return datetime.now(timezone.utc)

class Subscriber(Base):
    __tablename__ = "newsletter_subscribers"
    email = Column(String(255), primary_key=True)
    nonce = Column(String(36), nullable=False, default=lambda: str(uuid.uuid4()))
    status = Column(String(24), nullable=False, default="pending", index=True)
    source_hash = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now)
    requested_at = Column(DateTime(timezone=True), nullable=False, default=now)
    confirmed_at = Column(DateTime(timezone=True))

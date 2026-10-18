import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db.database import Base


class EmailDelivery(Base):
    __tablename__ = "email_deliveries"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_key = Column(String(255), unique=True, nullable=False)
    recipient = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    html = Column(Text, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="queued", index=True)
    last_error = Column(String(255), nullable=True)
    next_attempt_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sent_at = Column(DateTime(timezone=True), nullable=True)

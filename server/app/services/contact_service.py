from sqlalchemy.orm import Session

from app.models.system import ContactMessage
from app.schemas.system import ContactCreate


def create_contact_message(db: Session, contact_in: ContactCreate):
    db_message = ContactMessage(
        name=contact_in.name,
        email=contact_in.email,
        subject=contact_in.subject,
        message=contact_in.message,
    )
    db.add(db_message)
    db.flush()
    from app.services.email import queue_email, queue_admin, message

    queue_admin(
        db,
        f"contact:{db_message.id}",
        message(
            "New contact message",
            [
                contact_in.name,
                str(contact_in.email),
                contact_in.subject or "Enquiry",
                contact_in.message,
            ],
        ),
        force=True,
    )
    queue_email(
        db,
        f"contact:{db_message.id}:ack",
        str(contact_in.email),
        *message(
            "We received your message",
            [
                "Thank you for contacting Pholar Natural. Our team will reply as soon as possible.",
                contact_in.subject or "Your enquiry",
            ],
        ),
    )
    db.commit()
    db.refresh(db_message)
    return db_message

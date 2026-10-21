"""Unify recovered queue, provider tracking, and newsletter consent."""
from alembic import op
import sqlalchemy as sa
from app.models.subscriber import Subscriber
revision = "a7b9c1d3e5f7"
down_revision = ("f6a7b8c9d0e1", "d4e6f8a0b2c4")
branch_labels = None
depends_on = None
def upgrade():
    for column in [sa.Column("provider_id",sa.String(255)),sa.Column("provider_key",sa.String(255)),sa.Column("payload",sa.JSON()),sa.Column("first_attempt_at",sa.DateTime(timezone=True)),sa.Column("reply_to",sa.String(255))]:
        op.add_column("email_deliveries",column)
    Subscriber.__table__.create(op.get_bind())
    # Preserve pending mail and provider idempotency across the queue transition.
    op.execute("""INSERT INTO email_deliveries (id,event_key,recipient,subject,html,attempts,status,last_error,next_attempt_at,created_at,sent_at,provider_id,provider_key,payload,first_attempt_at)
    SELECT id::uuid,event_key,payload->'to'->>0,payload->>'subject',payload->>'html',attempts,
    CASE WHEN status IN ('pending','retry') THEN 'queued' ELSE status END,
    LEFT(last_error,255),available_at,created_at,CASE WHEN provider_id IS NOT NULL THEN created_at ELSE NULL END,
    provider_id,'pholar-mail/'||id,payload,first_attempt_at FROM email_jobs
    ON CONFLICT (event_key) DO NOTHING""")
def downgrade():
    Subscriber.__table__.drop(op.get_bind())
    for name in ["provider_id","provider_key","payload","first_attempt_at","reply_to"]:
        op.drop_column("email_deliveries",name)

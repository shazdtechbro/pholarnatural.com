"""Email-bound expiring invitations for additional administrators."""
from alembic import op
import sqlalchemy as sa
revision = "d0e2f4a6b8c0"
down_revision = "c9d1e3f5a7b9"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("admin_invitations", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("email", sa.String(255), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_admin_invitations_email", "admin_invitations", ["email"])

    op.create_table("whatsapp_deliveries", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("event_key", sa.String(64), unique=True, nullable=False), sa.Column("recipient", sa.String(20), nullable=False), sa.Column("message", sa.Text(), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="queued"), sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"), sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("last_error", sa.String(255)))
    op.create_index("ix_whatsapp_deliveries_status", "whatsapp_deliveries", ["status"])
    op.create_table("admin_audit", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("admin_id", sa.String(36), nullable=False), sa.Column("method", sa.String(10), nullable=False), sa.Column("path", sa.String(255), nullable=False), sa.Column("request_id", sa.String(36), nullable=False), sa.Column("status_code", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))

def downgrade():
    op.drop_table("admin_audit")
    op.drop_table("whatsapp_deliveries")
    op.drop_table("admin_invitations")

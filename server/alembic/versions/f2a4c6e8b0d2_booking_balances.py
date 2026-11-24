"""Snapshot service prices and track independent balance payment attempts."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f2a4c6e8b0d2"
down_revision = "e1f3a5b7c9d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bookings", sa.Column("total_price_cents", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("service_name_snapshot", sa.String(255), nullable=True))
    op.add_column("bookings", sa.Column("service_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("balance_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("booking_total_covers_deposit", "bookings", "total_price_cents IS NULL OR total_price_cents >= deposit_cents")
    # Do not infer historical prices from rounded deposits or today's catalogue.
    op.create_table("booking_balance_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("payment_provider", sa.String(20), nullable=False, server_default="stripe"),
        sa.Column("payment_environment", sa.String(20), nullable=False, server_default="legacy"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="CAD"),
        sa.Column("payment_checkout_id", sa.String(255), unique=True),
        sa.Column("payment_checkout_url", sa.String(1000)),
        sa.Column("payment_charge_id", sa.String(255), unique=True),
        sa.Column("payment_refund_id", sa.String(255), index=True),
        sa.Column("payment_request_key", sa.String(36), unique=True),
        sa.Column("payment_request_hash", sa.String(64)),
        sa.Column("payment_request_payload", sa.JSON()),
        sa.Column("refunded_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("amount_cents > 0", name="balance_amount_positive"),
        sa.CheckConstraint("refunded_cents >= 0 AND refunded_cents <= amount_cents", name="balance_refund_bounds"),
    )
    op.create_index("ix_booking_balance_payments_booking_id", "booking_balance_payments", ["booking_id"])
    op.create_index("uq_booking_balance_pending", "booking_balance_payments", ["booking_id"], unique=True, postgresql_where=sa.text("status = 'pending'"))


def downgrade():
    op.drop_table("booking_balance_payments")
    op.drop_constraint("booking_total_covers_deposit", "bookings", type_="check")
    for name in ("balance_requested_at", "service_completed_at", "service_name_snapshot", "total_price_cents"):
        op.drop_column("bookings", name)

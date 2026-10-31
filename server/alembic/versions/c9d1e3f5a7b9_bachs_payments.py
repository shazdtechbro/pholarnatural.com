"""Keep Bachs references separate from historical Stripe payments."""
from alembic import op
import sqlalchemy as sa
from app.models.payment import PaymentEvent

revision = "c9d1e3f5a7b9"
down_revision = "b8c0d2e4f6a8"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("orders", "bookings"):
        for column in (
            sa.Column("payment_provider", sa.String(20), nullable=False, server_default="stripe"),
            sa.Column("payment_environment", sa.String(20), nullable=False, server_default="legacy"),
            sa.Column("currency", sa.String(3), nullable=False, server_default="CAD"),
            sa.Column("payment_checkout_id", sa.String(255)),
            sa.Column("payment_checkout_url", sa.String(1000)),
            sa.Column("payment_charge_id", sa.String(255)),
            sa.Column("payment_refund_id", sa.String(255)),
            sa.Column("payment_request_key", sa.String(36)),
            sa.Column("payment_request_hash", sa.String(64)),
            sa.Column("payment_request_payload", sa.JSON()),
            sa.Column("refunded_cents", sa.Integer(), nullable=False, server_default="0"),
        ):
            op.add_column(table, column)
        for name in ("payment_checkout_id", "payment_charge_id", "payment_request_key"):
            op.create_unique_constraint(f"uq_{table}_{name}", table, [name])
        op.create_index(f"ix_{table}_payment_refund_id", table, ["payment_refund_id"])
    op.add_column("orders", sa.Column("payment_fulfilled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE orders SET payment_fulfilled = true WHERE status IN ('paid','confirmed','processing','shipped','delivered','refund_pending')")
    PaymentEvent.__table__.create(op.get_bind())


def downgrade():
    PaymentEvent.__table__.drop(op.get_bind())
    op.drop_column("orders", "payment_fulfilled")
    for table in ("orders", "bookings"):
        op.drop_index(f"ix_{table}_payment_refund_id", table_name=table)
        for name in ("payment_checkout_id", "payment_charge_id", "payment_request_key"):
            op.drop_constraint(f"uq_{table}_{name}", table, type_="unique")
        for name in ("payment_provider", "payment_environment", "currency", "payment_checkout_id", "payment_checkout_url", "payment_charge_id", "payment_refund_id", "payment_request_key", "payment_request_hash", "payment_request_payload", "refunded_cents"):
            op.drop_column(table, name)

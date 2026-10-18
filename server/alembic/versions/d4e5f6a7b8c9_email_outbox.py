"""Durable transactional email outbox and settings capacity."""

from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d5e7f9a0b2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "products",
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "services",
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    # NOT VALID preserves legacy data for review while rejecting new invalid writes.
    checks = {
        "product_variants": {
            "variant_nonnegative": "price_cents >= 0 AND stock_count >= 0"
        },
        "order_items": {
            "order_item_positive": "quantity > 0 AND unit_price_cents >= 0"
        },
        "orders": {
            "order_totals_valid": "subtotal_cents >= 0 AND shipping_cents >= 0 AND tax_cents >= 0 AND discount_cents >= 0 AND total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents"
        },
        "bookings": {
            "booking_hours_valid": "start_time >= TIME '10:00' AND end_time <= TIME '17:00' AND end_time > start_time AND deposit_cents >= 0"
        },
        "services": {
            "service_values_valid": "price_cents >= 0 AND duration_minutes > 0 AND duration_minutes <= 420"
        },
    }
    for table, entries in checks.items():
        for name, expression in entries.items():
            op.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression}) NOT VALID"
            )
    op.add_column(
        "orders", sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True)
    )
    op.create_unique_constraint(
        "uq_orders_payment_intent", "orders", ["stripe_payment_intent_id"]
    )
    op.create_table(
        "email_deliveries",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("event_key", sa.String(255), nullable=False, unique=True),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="queued", index=True
        ),
        sa.Column("last_error", sa.String(255)),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
    )
    op.alter_column(
        "admin_settings", "value", type_=sa.Text(), existing_type=sa.String(255)
    )


def downgrade():
    for table, name in [
        ("product_variants", "variant_nonnegative"),
        ("order_items", "order_item_positive"),
        ("orders", "order_totals_valid"),
        ("bookings", "booking_hours_valid"),
        ("services", "service_values_valid"),
    ]:
        op.drop_constraint(name, table, type_="check")
    op.drop_column("products", "is_deleted")
    op.drop_column("services", "is_deleted")
    op.drop_constraint("uq_orders_payment_intent", "orders", type_="unique")
    op.drop_column("orders", "stripe_payment_intent_id")
    op.drop_table("email_deliveries")
    # Keep expanded settings capacity to avoid truncating saved image URLs/IDs.

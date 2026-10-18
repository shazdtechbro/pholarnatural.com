"""Editable product SEO and service details."""

from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("seo_title", sa.String(255)))
    op.add_column("products", sa.Column("seo_description", sa.String(500)))
    op.add_column(
        "products",
        sa.Column(
            "is_bestseller", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "services",
        sa.Column("long_description", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "services",
        sa.Column(
            "what_to_expect",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )


def downgrade():
    for field in ("seo_title", "seo_description", "is_bestseller"):
        op.drop_column("products", field)
    for field in ("long_description", "what_to_expect"):
        op.drop_column("services", field)

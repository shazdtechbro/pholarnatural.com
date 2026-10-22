"""Optional customer accounts and saved carts; guest purchases remain supported."""
from alembic import op
from app.models.customer import Customer, CustomerSession, CustomerAction, CustomerCartMerge

revision = "b8c0d2e4f6a8"
down_revision = "a7b9c1d3e5f7"
branch_labels = None
depends_on = None


def upgrade():
    for model in (Customer, CustomerSession, CustomerAction, CustomerCartMerge):
        model.__table__.create(op.get_bind())


def downgrade():
    for model in (CustomerCartMerge, CustomerAction, CustomerSession, Customer):
        model.__table__.drop(op.get_bind())

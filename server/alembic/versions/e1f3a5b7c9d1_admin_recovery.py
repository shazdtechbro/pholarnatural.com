"""Separate invitation and password-recovery token purposes."""
from alembic import op
import sqlalchemy as sa
revision="e1f3a5b7c9d1"
down_revision="d0e2f4a6b8c0"
branch_labels=None
depends_on=None

def upgrade():
    op.add_column("admin_invitations",sa.Column("purpose",sa.String(20),nullable=False,server_default="invite"))

def downgrade():
    op.drop_column("admin_invitations","purpose")

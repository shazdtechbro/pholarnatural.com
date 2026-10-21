"""Historical queue deployed during VPS mail recovery."""
from alembic import op
import sqlalchemy as sa
revision = "d4e6f8a0b2c4"
down_revision = "c3d5e7f9a0b2"
branch_labels = None
depends_on = None
def upgrade():
    op.create_table("email_jobs", sa.Column("id",sa.String(36),primary_key=True),sa.Column("event_key",sa.String(255),unique=True,nullable=False),sa.Column("payload",sa.JSON(),nullable=False),sa.Column("status",sa.String(32),nullable=False),sa.Column("attempts",sa.Integer(),nullable=False),sa.Column("available_at",sa.DateTime(timezone=True),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False),sa.Column("first_attempt_at",sa.DateTime(timezone=True)),sa.Column("provider_id",sa.String(255)),sa.Column("last_error",sa.Text()))
def downgrade():
    op.drop_table("email_jobs")

"""WhatsApp message log.

Revision ID: 0005_messaging
Revises: 0004_online_booking
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0005_messaging"
down_revision = "0004_online_booking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # checkfirst: fresh installs already have it from the baseline.
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables["message_logs"]])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables["message_logs"]])

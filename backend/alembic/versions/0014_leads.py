"""Leads (enquiries) and their activity, plus the clinic's lead-capture key.

Revision ID: 0014_leads
Revises: 0013_family_checkin
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0014_leads"
down_revision = "0013_family_checkin"
branch_labels = None
depends_on = None

TABLES = ["leads", "lead_activities"]


def _has(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])
    if not _has("clinics", "lead_token"):
        op.add_column("clinics", sa.Column("lead_token", sa.String(64), nullable=True))


def downgrade() -> None:
    if _has("clinics", "lead_token"):
        op.drop_column("clinics", "lead_token")
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

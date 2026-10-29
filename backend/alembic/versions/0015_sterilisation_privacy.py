"""Sterilisers, cycles, instrument packs, data requests, and patients.anonymised_at.

Revision ID: 0015_sterilisation_privacy
Revises: 0014_leads
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0015_sterilisation_privacy"
down_revision = "0014_leads"
branch_labels = None
depends_on = None

TABLES = ["sterilisers", "sterilisation_cycles", "instrument_packs", "data_requests"]


def _has(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])
    if not _has("patients", "anonymised_at"):
        op.add_column("patients", sa.Column("anonymised_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if _has("patients", "anonymised_at"):
        op.drop_column("patients", "anonymised_at")
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

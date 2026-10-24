"""Recalls and the clinic's Google review link.

Revision ID: 0006_recalls
Revises: 0005_messaging
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0006_recalls"
down_revision = "0005_messaging"
branch_labels = None
depends_on = None


def _has_review_column() -> bool:
    return any(c["name"] == "google_review_url" for c in sa.inspect(op.get_bind()).get_columns("clinics"))


def upgrade() -> None:
    if not _has_review_column():
        op.add_column("clinics", sa.Column("google_review_url", sa.String(500), nullable=True))
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables["recalls"]])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables["recalls"]])
    if _has_review_column():
        op.drop_column("clinics", "google_review_url")

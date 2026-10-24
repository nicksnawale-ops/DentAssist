"""Families, appointment arrival time and the clinic check-in key.

Revision ID: 0013_family_checkin
Revises: 0012_payouts_attendance
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0013_family_checkin"
down_revision = "0012_payouts_attendance"
branch_labels = None
depends_on = None

COLUMNS = [
    ("appointments", sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True)),
    ("clinics", sa.Column("checkin_token", sa.String(64), nullable=True)),
    ("patients", sa.Column("family_relation", sa.String(20), nullable=True)),
]


def _has(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables["families"]])
    for table, col in COLUMNS:
        if not _has(table, col.name):
            op.add_column(table, col)
    if not _has("patients", "family_id"):
        with op.batch_alter_table("patients") as batch:
            batch.add_column(sa.Column("family_id", sa.String(64), nullable=True))
            batch.create_foreign_key("fk_patients_family", "families", ["family_id"], ["id"], ondelete="SET NULL")
            batch.create_index("ix_patients_family_id", ["family_id"])


def downgrade() -> None:
    if _has("patients", "family_id"):
        with op.batch_alter_table("patients") as batch:
            batch.drop_index("ix_patients_family_id")
            batch.drop_constraint("fk_patients_family", type_="foreignkey")
            batch.drop_column("family_id")
    for table, col in reversed(COLUMNS):
        if _has(table, col.name):
            op.drop_column(table, col.name)
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables["families"]])

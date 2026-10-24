"""Clinics: online booking switch.

Revision ID: 0004_online_booking
Revises: 0003_clinical
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_online_booking"
down_revision = "0003_clinical"
branch_labels = None
depends_on = None


def _has_column() -> bool:
    return any(c["name"] == "online_booking_enabled" for c in sa.inspect(op.get_bind()).get_columns("clinics"))


def upgrade() -> None:
    # Fresh installs already get the column from the baseline (which builds tables from the models).
    if not _has_column():
        op.add_column("clinics", sa.Column("online_booking_enabled", sa.Boolean(), nullable=False,
                                           server_default=sa.true()))


def downgrade() -> None:
    if _has_column():
        op.drop_column("clinics", "online_booking_enabled")

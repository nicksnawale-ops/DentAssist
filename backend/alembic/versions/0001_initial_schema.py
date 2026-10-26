"""Initial schema: clinics, users/staff, patients, appointments, waitlist,
notifications, audit log, settings.

Baseline migration that builds the tables from the current models. Later
schema changes should be generated with `alembic revision --autogenerate`.

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

TABLES = ["clinics", "patients", "users", "staff_profiles", "appointments", "waitlist_entries",
          "notifications", "audit_logs", "app_settings"]


def upgrade() -> None:
    # Build every table from the current models in one go, in dependency order. Later tables
    # reference each other (e.g. patients.family_id -> families), so creating only this
    # migration's tables fails on an empty database. The later migrations skip tables and
    # columns that already exist, so they are no-ops on a fresh install.
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

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
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, tables=[Base.metadata.tables[t] for t in TABLES])


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind, tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

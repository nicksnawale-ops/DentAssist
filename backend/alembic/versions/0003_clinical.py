"""Clinical records: tooth records and history, periodontal readings, treatment plans, clinical notes.

Revision ID: 0003_clinical
Revises: 0002_billing
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0003_clinical"
down_revision = "0002_billing"
branch_labels = None
depends_on = None

TABLES = ["tooth_records", "tooth_events", "periodontal_readings", "treatment_plans", "treatment_plan_items",
          "clinical_notes"]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

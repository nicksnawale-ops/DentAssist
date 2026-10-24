"""Dentist pay rules, payout statements, staff attendance.

Revision ID: 0012_payouts_attendance
Revises: 0011_plan_explanation
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0012_payouts_attendance"
down_revision = "0011_plan_explanation"
branch_labels = None
depends_on = None

TABLES = ["compensation_plans", "payouts", "attendance_records"]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

"""Patient-facing explanation on treatment plans.

Revision ID: 0011_plan_explanation
Revises: 0010_documents
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

from app.core.database import JSONType

revision = "0011_plan_explanation"
down_revision = "0010_documents"
branch_labels = None
depends_on = None


def _has() -> bool:
    return any(c["name"] == "patient_explanation" for c in sa.inspect(op.get_bind()).get_columns("treatment_plans"))


def upgrade() -> None:
    if not _has():
        op.add_column("treatment_plans", sa.Column("patient_explanation", JSONType, nullable=True))


def downgrade() -> None:
    if _has():
        op.drop_column("treatment_plans", "patient_explanation")

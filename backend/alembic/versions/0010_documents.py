"""Patient documents (X-rays, photos, reports).

Revision ID: 0010_documents
Revises: 0009_invoice_dentist
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0010_documents"
down_revision = "0009_invoice_dentist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables["patient_documents"]])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables["patient_documents"]])

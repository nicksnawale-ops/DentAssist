"""Medicines, prescriptions, consent templates and signed consent forms.

Revision ID: 0007_prescriptions_consents
Revises: 0006_recalls
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0007_prescriptions_consents"
down_revision = "0006_recalls"
branch_labels = None
depends_on = None

TABLES = ["medicines", "prescriptions", "consent_templates", "consent_forms"]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])
    # Starter medicine list and consent wording, for databases created before this release.
    from sqlalchemy.orm import Session

    from app.services.consents import seed_templates
    from app.services.prescriptions import seed_medicines

    session = Session(bind=op.get_bind())
    seed_medicines(session)
    seed_templates(session)
    session.flush()


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

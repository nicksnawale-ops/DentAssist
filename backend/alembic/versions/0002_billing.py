"""Billing: procedures, invoices, payments, installments, insurance claims, online payment orders.

Revision ID: 0002_billing
Revises: 0001_initial
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0002_billing"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

TABLES = ["procedures", "invoice_counters", "invoices", "payments", "installments", "insurance_claims",
          "payment_orders"]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

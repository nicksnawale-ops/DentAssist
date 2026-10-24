"""Suppliers and labs, stock items and movements, purchase orders, lab cases.

Revision ID: 0008_inventory_lab
Revises: 0007_prescriptions_consents
Create Date: 2026-10-24
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0008_inventory_lab"
down_revision = "0007_prescriptions_consents"
branch_labels = None
depends_on = None

TABLES = ["suppliers", "inventory_items", "purchase_orders", "stock_movements", "lab_orders", "lab_order_updates"]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in TABLES])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), tables=[Base.metadata.tables[t] for t in reversed(TABLES)])

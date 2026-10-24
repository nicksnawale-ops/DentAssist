"""Credit invoices to a dentist (revenue per dentist).

Revision ID: 0009_invoice_dentist
Revises: 0008_inventory_lab
Create Date: 2026-10-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_invoice_dentist"
down_revision = "0008_inventory_lab"
branch_labels = None
depends_on = None


def _has_column() -> bool:
    return any(c["name"] == "dentist_id" for c in sa.inspect(op.get_bind()).get_columns("invoices"))


def upgrade() -> None:
    if not _has_column():
        with op.batch_alter_table("invoices") as batch:
            batch.add_column(sa.Column("dentist_id", sa.String(64), nullable=True))
            batch.create_foreign_key("fk_invoices_dentist", "users", ["dentist_id"], ["id"], ondelete="SET NULL")
            batch.create_index("ix_invoices_dentist_id", ["dentist_id"])
    # Credit existing invoices to the patient's most recent dentist at that clinic.
    op.execute("""
        UPDATE invoices SET dentist_id = (
            SELECT a.dentist_id FROM appointments a
            WHERE a.patient_id = invoices.patient_id AND a.clinic_id = invoices.clinic_id
              AND a.start_time <= invoices.created_at + INTERVAL '1 day'
            ORDER BY a.start_time DESC LIMIT 1)
        WHERE dentist_id IS NULL
    """) if op.get_bind().dialect.name == "postgresql" else None


def downgrade() -> None:
    if _has_column():
        with op.batch_alter_table("invoices") as batch:
            batch.drop_index("ix_invoices_dentist_id")
            batch.drop_constraint("fk_invoices_dentist", type_="foreignkey")
            batch.drop_column("dentist_id")

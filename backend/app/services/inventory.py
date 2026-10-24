"""Stock levels, purchase orders and lab cases."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import InventoryItem, LabOrder, Notification, PurchaseOrder, StockMovement, Supplier, User

LAB_FLOW = ["Ordered", "In Progress", "Quality Check", "Ready for Pickup", "Delivered to Clinic", "Fitted/Completed"]
LAB_OPEN = LAB_FLOW[:4]  # still at the lab
LAB_STATUSES = LAB_FLOW + ["Cancelled"]
EXPIRY_WARNING_DAYS = 30


def stock_status(item: InventoryItem) -> str:
    if item.current_stock <= 0:
        return "out"
    if item.current_stock <= item.reorder_threshold:
        return "low"
    return "ok"


def expiry_status(item: InventoryItem, today: date | None = None) -> str | None:
    if not item.expiry_date:
        return None
    today = today or datetime.now(timezone.utc).date()
    if item.expiry_date < today:
        return "expired"
    if item.expiry_date <= today + timedelta(days=EXPIRY_WARNING_DAYS):
        return "soon"
    return None


def _staff_for(db: Session, clinic_id: str, roles=("admin", "receptionist")) -> list[User]:
    return [
        u for u in db.scalars(select(User).where(User.role.in_(roles), User.is_active.is_(True))).unique()
        if clinic_id in ({u.clinic_id} | set((u.staff_profile.clinic_ids if u.staff_profile else None) or []))
    ]


def move_stock(db: Session, item: InventoryItem, change: int, type_: str, reason: str, actor: User | None,
               appointment_id: str | None = None, purchase_order_id: str | None = None) -> StockMovement:
    """Change stock and record why. Stock never goes below zero; a low-stock alert goes out once per dip."""
    if change == 0:
        raise AppError(400, "Enter a quantity", "ZERO_CHANGE", {"change": "Must not be zero"})
    if item.current_stock + change < 0:
        raise AppError(400, f"Only {item.current_stock} {item.unit} in stock", "NOT_ENOUGH_STOCK",
                       {"change": f"Only {item.current_stock} in stock"})
    item.current_stock += change
    now = datetime.now(timezone.utc)
    if change > 0 and type_ == "received":
        item.last_restocked_at = now
    status = stock_status(item)
    if status == "ok":
        item.low_stock_alerted_at = None  # re-arm the alert
    elif item.low_stock_alerted_at is None:
        item.low_stock_alerted_at = now
        title = "Out of stock" if status == "out" else "Low stock"
        for u in _staff_for(db, item.clinic_id):
            db.add(Notification(user_id=u.id, title=title,
                                message=f"{item.name}: {item.current_stock} {item.unit} left (reorder at {item.reorder_threshold})."))
    m = StockMovement(item_id=item.id, clinic_id=item.clinic_id, change=change, balance_after=item.current_stock,
                      type=type_, reason=reason.strip(), appointment_id=appointment_id, purchase_order_id=purchase_order_id,
                      recorded_by_id=actor.id if actor else None, recorded_at=now)
    db.add(m)
    return m


def _next_number(db: Session, model, column, prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    head = f"{prefix}-{year}-"
    last = db.scalar(select(func.max(column)).where(column.like(f"{head}%")))
    n = int(last.rsplit("-", 1)[1]) + 1 if last else 1
    return f"{head}{n:04d}"


def next_po_number(db: Session) -> str:
    return _next_number(db, PurchaseOrder, PurchaseOrder.po_number, "PO")


def next_lab_number(db: Session) -> str:
    return _next_number(db, LabOrder, LabOrder.order_number, "LAB")


def po_total(lines: list[dict]) -> Decimal:
    return sum((Decimal(str(l.get("unitPrice") or 0)) * int(l["quantity"]) for l in lines), Decimal("0")).quantize(Decimal("0.01"))


def reorder_suggestions(db: Session, clinic_ids: set[str] | None) -> list[dict]:
    """Low and out-of-stock items not already on an open purchase order, grouped by supplier."""
    query = select(InventoryItem).where(InventoryItem.is_active.is_(True), InventoryItem.current_stock <= InventoryItem.reorder_threshold)
    if clinic_ids is not None:
        query = query.where(InventoryItem.clinic_id.in_(clinic_ids))
    on_order: set[str] = set()
    for po in db.scalars(select(PurchaseOrder).where(PurchaseOrder.status.in_(("Draft", "Sent", "Partially Received")))):
        on_order |= {l["itemId"] for l in po.items or [] if int(l.get("receivedQuantity") or 0) < int(l["quantity"])}
    groups: dict[tuple[str, str | None], dict] = {}
    for item in db.scalars(query.order_by(InventoryItem.name)):
        if item.id in on_order:
            continue
        key = (item.clinic_id, item.supplier_id)
        g = groups.setdefault(key, {"clinicId": item.clinic_id, "supplierId": item.supplier_id, "items": []})
        qty = item.reorder_quantity or max(item.reorder_threshold * 2 - item.current_stock, 1)
        g["items"].append({"itemId": item.id, "name": item.name, "unit": item.unit, "currentStock": item.current_stock,
                           "reorderThreshold": item.reorder_threshold, "suggestedQuantity": qty,
                           "unitPrice": float(item.unit_cost or 0)})
    suppliers = {s.id: s.name for s in db.scalars(select(Supplier))}
    out = list(groups.values())
    for g in out:
        g["supplierName"] = suppliers.get(g["supplierId"]) if g["supplierId"] else None
    return out


def lab_performance(db: Session, clinic_ids: set[str] | None, since: date | None = None) -> dict[str, dict]:
    since = since or (datetime.now(timezone.utc).date() - timedelta(days=365))
    query = select(LabOrder).where(LabOrder.order_date >= since)
    if clinic_ids is not None:
        query = query.where(LabOrder.clinic_id.in_(clinic_ids))
    stats: dict[str, dict] = {}
    today = datetime.now(timezone.utc).date()
    for o in db.scalars(query):
        s = stats.setdefault(o.lab_id, {"orders": 0, "delivered": 0, "onTime": 0, "remakes": 0, "openOverdue": 0,
                                        "turnaroundDays": [], "spend": Decimal("0")})
        if o.status == "Cancelled":
            continue
        s["orders"] += 1
        s["spend"] += o.cost or 0
        if o.remake_of_id:
            s["remakes"] += 1
        if o.delivered_at:
            delivered = o.delivered_at.date() if isinstance(o.delivered_at, datetime) else o.delivered_at
            s["delivered"] += 1
            s["turnaroundDays"].append((delivered - o.order_date).days)
            if delivered <= o.expected_date:
                s["onTime"] += 1
        elif o.status in LAB_OPEN and o.expected_date < today:
            s["openOverdue"] += 1
    out = {}
    for lab_id, s in stats.items():
        days = s.pop("turnaroundDays")
        out[lab_id] = {
            **s, "spend": float(s["spend"]),
            "averageTurnaroundDays": round(sum(days) / len(days), 1) if days else None,
            "onTimeRate": round(s["onTime"] / s["delivered"], 3) if s["delivered"] else None,
            "remakeRate": round(s["remakes"] / s["orders"], 3) if s["orders"] else None,
        }
    return out

"""Suppliers and labs, stock items, purchase orders and lab cases."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import Field, model_validator
from sqlalchemy import select

from app.api.patients import get_patient_for
from app.core.deps import DbSession, StaffUser, accessible_clinic_ids, ensure_clinic_access, require_roles
from app.core.errors import AppError, bad_request, not_found
from app.models import (
    Clinic, InventoryItem, LabOrder, LabOrderUpdate, Notification, Patient, PurchaseOrder, StockMovement, Supplier, User,
)
from app.schemas import CamelModel
from app.services import audit
from app.services import inventory as svc
from app.services import messaging as msg
from app.services.recalls import booking_link

router = APIRouter(tags=["inventory"])
Managers = Depends(require_roles("super_admin", "admin", "receptionist"))
CATEGORIES = "^(Consumables|Instruments|PPE|Medications|Equipment)$"
LAB_ITEMS = "^(Crown|Bridge|Denture|Aligner|Night Guard|Veneer|Implant Component|Inlay/Onlay|Retainer|Other)$"


def _clinic_for(user: User, clinic_id: str | None) -> str:
    cid = clinic_id if clinic_id and clinic_id != "all" else user.clinic_id
    if not cid:
        raise bad_request("Choose a clinic", "CLINIC_REQUIRED")
    ensure_clinic_access(user, cid)
    return cid


def _scope(user: User, query, column, clinic_id: str | None):
    allowed = accessible_clinic_ids(user)
    if allowed is not None:
        query = query.where(column.in_(allowed))
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
        query = query.where(column == clinic_id)
    return query


def _name(u: User | None) -> str | None:
    return f"{u.first_name} {u.last_name}".strip() if u else None


# ---------------------------------------------------------------------------
# Suppliers and labs
# ---------------------------------------------------------------------------

class SupplierIn(CamelModel):
    name: str = Field(min_length=2, max_length=150)
    contact_person: str = Field(default="", max_length=150)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=255)
    address: str = Field(default="", max_length=500)
    notes: str | None = Field(default=None, max_length=2000)
    items_supplied: list[str] = Field(default_factory=list, max_length=30)
    is_lab: bool = False
    turnaround_days: int | None = Field(default=None, ge=1, le=90)
    is_active: bool = True


class SupplierOut(SupplierIn):
    id: str
    performance: dict | None = None


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: DbSession, user: StaffUser, labs: bool | None = None, include_inactive: bool = Query(False, alias="includeInactive")):
    query = select(Supplier).order_by(Supplier.name)
    if labs is not None:
        query = query.where(Supplier.is_lab.is_(labs))
    if not include_inactive:
        query = query.where(Supplier.is_active.is_(True))
    rows = db.scalars(query).all()
    perf = svc.lab_performance(db, accessible_clinic_ids(user)) if labs is not False else {}
    out = []
    for s in rows:
        o = SupplierOut.model_validate(s)
        o.performance = perf.get(s.id) if s.is_lab else None
        out.append(o)
    return out


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(body: SupplierIn, db: DbSession, user: User = Managers):
    s = Supplier(**body.model_dump())
    db.add(s)
    db.flush()
    audit.record(db, user, "create", "supplier", s.id, after=body.model_dump())
    db.commit()
    return s


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: str, body: SupplierIn, db: DbSession, user: User = Managers):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise not_found("Supplier")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    audit.record(db, user, "update", "supplier", s.id, after=body.model_dump())
    db.commit()
    return s


# ---------------------------------------------------------------------------
# Stock items
# ---------------------------------------------------------------------------

class ItemIn(CamelModel):
    clinic_id: str | None = None
    name: str = Field(min_length=2, max_length=150)
    sku: str | None = Field(default=None, max_length=60)
    category: str = Field(default="Consumables", pattern=CATEGORIES)
    unit: str = Field(default="pieces", min_length=1, max_length=40)
    reorder_threshold: int = Field(default=0, ge=0, le=100000)
    reorder_quantity: int = Field(default=0, ge=0, le=100000)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("10000000"))
    supplier_id: str | None = None
    expiry_date: date | None = None
    batch_number: str | None = Field(default=None, max_length=60)
    location: str | None = Field(default=None, max_length=100)
    is_active: bool = True
    # Only used when creating: the stock you have now.
    opening_stock: int = Field(default=0, ge=0, le=1000000)


class MovementOut(CamelModel):
    id: str
    change: int
    balance_after: int
    type: str
    reason: str
    appointment_id: str | None
    purchase_order_id: str | None
    recorded_by_name: str | None = None
    recorded_at: datetime


class ItemOut(CamelModel):
    id: str
    clinic_id: str
    name: str
    sku: str | None
    category: str
    unit: str
    current_stock: int
    reorder_threshold: int
    reorder_quantity: int
    unit_cost: float
    supplier_id: str | None
    supplier_name: str | None = None
    expiry_date: date | None
    batch_number: str | None
    location: str | None
    last_restocked_at: datetime | None
    is_active: bool
    stock_status: str
    expiry_status: str | None
    stock_value: float
    movements: list[MovementOut] | None = None


class MovementIn(CamelModel):
    change: int = Field(ge=-1000000, le=1000000)
    type: str = Field(pattern="^(received|usage|adjustment|expired|returned)$")
    reason: str = Field(default="", max_length=300)
    appointment_id: str | None = None
    # For "received": record the new batch's expiry date
    expiry_date: date | None = None

    @model_validator(mode="after")
    def _sign(self):
        if self.type == "received" and self.change <= 0:
            raise ValueError("Received stock must be a positive number")
        if self.type in ("usage", "expired", "returned") and self.change >= 0:
            raise ValueError("Use a negative number for stock going out")
        if self.type == "adjustment" and not self.reason.strip():
            raise ValueError("Say why the count changed")
        return self


class InventorySummary(CamelModel):
    total_items: int
    low_stock: int
    out_of_stock: int
    expiring_soon: int
    expired: int
    stock_value: float
    open_purchase_orders: int
    lab_cases_at_lab: int
    lab_cases_overdue: int
    lab_cases_ready_to_fit: int


def _item_out(db, item: InventoryItem, suppliers: dict[str, str] | None = None, with_movements: bool = False) -> ItemOut:
    suppliers = suppliers if suppliers is not None else {s.id: s.name for s in db.scalars(select(Supplier))}
    out = ItemOut(
        id=item.id, clinic_id=item.clinic_id, name=item.name, sku=item.sku, category=item.category, unit=item.unit,
        current_stock=item.current_stock, reorder_threshold=item.reorder_threshold, reorder_quantity=item.reorder_quantity,
        unit_cost=float(item.unit_cost or 0), supplier_id=item.supplier_id, supplier_name=suppliers.get(item.supplier_id),
        expiry_date=item.expiry_date, batch_number=item.batch_number, location=item.location,
        last_restocked_at=item.last_restocked_at, is_active=item.is_active, stock_status=svc.stock_status(item),
        expiry_status=svc.expiry_status(item), stock_value=float((item.unit_cost or 0) * item.current_stock),
    )
    if with_movements:
        moves = db.scalars(select(StockMovement).where(StockMovement.item_id == item.id)
                           .order_by(StockMovement.recorded_at.desc()).limit(100)).all()
        users = {u.id: _name(u) for u in db.scalars(select(User).where(User.id.in_({m.recorded_by_id for m in moves if m.recorded_by_id})))}
        out.movements = [MovementOut(id=m.id, change=m.change, balance_after=m.balance_after, type=m.type, reason=m.reason,
                                     appointment_id=m.appointment_id, purchase_order_id=m.purchase_order_id,
                                     recorded_by_name=users.get(m.recorded_by_id), recorded_at=m.recorded_at) for m in moves]
    return out


def _get_item(db, user: User, item_id: str) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    allowed = accessible_clinic_ids(user)
    if not item or (allowed is not None and item.clinic_id not in allowed):
        raise not_found("Item")
    return item


@router.get("/inventory/summary", response_model=InventorySummary)
def summary(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId")):
    items = db.scalars(_scope(user, select(InventoryItem).where(InventoryItem.is_active.is_(True)), InventoryItem.clinic_id, clinic_id)).all()
    pos = db.scalars(_scope(user, select(PurchaseOrder).where(PurchaseOrder.status.in_(("Draft", "Sent", "Partially Received"))),
                            PurchaseOrder.clinic_id, clinic_id)).all()
    labs = db.scalars(_scope(user, select(LabOrder).where(LabOrder.status.in_(svc.LAB_OPEN + ["Delivered to Clinic"])),
                             LabOrder.clinic_id, clinic_id)).all()
    today = datetime.now(timezone.utc).date()
    return InventorySummary(
        total_items=len(items),
        low_stock=sum(1 for i in items if svc.stock_status(i) == "low"),
        out_of_stock=sum(1 for i in items if svc.stock_status(i) == "out"),
        expiring_soon=sum(1 for i in items if svc.expiry_status(i, today) == "soon"),
        expired=sum(1 for i in items if svc.expiry_status(i, today) == "expired"),
        stock_value=float(sum((i.unit_cost or 0) * i.current_stock for i in items)),
        open_purchase_orders=len(pos),
        lab_cases_at_lab=sum(1 for o in labs if o.status in svc.LAB_OPEN),
        lab_cases_overdue=sum(1 for o in labs if o.status in svc.LAB_OPEN and o.expected_date < today),
        lab_cases_ready_to_fit=sum(1 for o in labs if o.status == "Delivered to Clinic"),
    )


@router.get("/inventory/items", response_model=list[ItemOut])
def list_items(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
               q: str | None = None, category: str | None = None, status: str | None = None,
               include_inactive: bool = Query(False, alias="includeInactive")):
    query = _scope(user, select(InventoryItem), InventoryItem.clinic_id, clinic_id).order_by(InventoryItem.name)
    if not include_inactive:
        query = query.where(InventoryItem.is_active.is_(True))
    if q:
        query = query.where(InventoryItem.name.ilike(f"%{q.strip()}%"))
    if category and category != "All":
        query = query.where(InventoryItem.category == category)
    suppliers = {s.id: s.name for s in db.scalars(select(Supplier))}
    rows = [_item_out(db, i, suppliers) for i in db.scalars(query)]
    if status == "low":
        rows = [r for r in rows if r.stock_status in ("low", "out")]
    elif status == "out":
        rows = [r for r in rows if r.stock_status == "out"]
    elif status == "expiring":
        rows = [r for r in rows if r.expiry_status in ("soon", "expired")]
    return rows


@router.post("/inventory/items", response_model=ItemOut, status_code=201)
def create_item(body: ItemIn, db: DbSession, user: User = Managers):
    cid = _clinic_for(user, body.clinic_id)
    if body.supplier_id and not db.get(Supplier, body.supplier_id):
        raise not_found("Supplier")
    item = InventoryItem(clinic_id=cid, **body.model_dump(exclude={"clinic_id", "opening_stock"}))
    db.add(item)
    db.flush()
    if body.opening_stock:
        svc.move_stock(db, item, body.opening_stock, "received", "Opening stock", user)
    audit.record(db, user, "create", "inventory_item", item.id, after=body.model_dump(mode="json"))
    db.commit()
    return _item_out(db, item, with_movements=True)


@router.get("/inventory/items/{item_id}", response_model=ItemOut)
def get_item(item_id: str, db: DbSession, user: StaffUser):
    return _item_out(db, _get_item(db, user, item_id), with_movements=True)


@router.patch("/inventory/items/{item_id}", response_model=ItemOut)
def update_item(item_id: str, body: ItemIn, db: DbSession, user: User = Managers):
    item = _get_item(db, user, item_id)
    for k, v in body.model_dump(exclude={"clinic_id", "opening_stock"}).items():
        setattr(item, k, v)
    if svc.stock_status(item) == "ok":
        item.low_stock_alerted_at = None
    audit.record(db, user, "update", "inventory_item", item.id, after=body.model_dump(mode="json", exclude={"opening_stock"}))
    db.commit()
    return _item_out(db, item, with_movements=True)


@router.post("/inventory/items/{item_id}/movements", response_model=ItemOut)
def record_movement(item_id: str, body: MovementIn, db: DbSession, user: StaffUser):
    """Record stock used, received, counted or thrown away. Dentists can record usage."""
    item = _get_item(db, user, item_id)
    if user.role == "dentist" and body.type != "usage":
        raise AppError(403, "Dentists can record usage; ask the front desk to receive or adjust stock", "FORBIDDEN")
    svc.move_stock(db, item, body.change, body.type, body.reason or body.type.title(), user, appointment_id=body.appointment_id)
    if body.type == "received" and body.expiry_date:
        item.expiry_date = body.expiry_date
    db.commit()
    return _item_out(db, item, with_movements=True)


@router.get("/inventory/reorder-suggestions")
def suggestions(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId")):
    allowed = accessible_clinic_ids(user)
    scope = {clinic_id} if clinic_id and clinic_id != "all" else allowed
    if clinic_id and clinic_id != "all":
        ensure_clinic_access(user, clinic_id)
    return svc.reorder_suggestions(db, scope)


# ---------------------------------------------------------------------------
# Purchase orders
# ---------------------------------------------------------------------------

class POLineIn(CamelModel):
    item_id: str
    quantity: int = Field(ge=1, le=100000)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("10000000"))


class POIn(CamelModel):
    clinic_id: str | None = None
    supplier_id: str
    items: list[POLineIn] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=2000)
    expected_date: date | None = None


class POLineOut(CamelModel):
    item_id: str
    name: str
    unit: str
    quantity: int
    unit_price: float
    received_quantity: int


class POOut(CamelModel):
    id: str
    po_number: str
    clinic_id: str
    supplier_id: str
    supplier_name: str | None = None
    supplier_email: str | None = None
    supplier_phone: str | None = None
    status: str
    items: list[POLineOut]
    total_amount: float
    notes: str | None
    expected_date: date | None
    created_by_name: str | None = None
    sent_at: datetime | None
    received_at: datetime | None
    created_at: datetime


class ReceiveLine(CamelModel):
    item_id: str
    quantity: int = Field(ge=0, le=100000)
    expiry_date: date | None = None
    batch_number: str | None = Field(default=None, max_length=60)


class ReceiveIn(CamelModel):
    lines: list[ReceiveLine] = Field(min_length=1, max_length=100)


class FromSuggestionsIn(CamelModel):
    clinic_id: str
    supplier_id: str


def _po_out(db, po: PurchaseOrder) -> POOut:
    s = db.get(Supplier, po.supplier_id)
    creator = db.get(User, po.created_by_id) if po.created_by_id else None
    return POOut(
        id=po.id, po_number=po.po_number, clinic_id=po.clinic_id, supplier_id=po.supplier_id,
        supplier_name=s.name if s else None, supplier_email=s.email if s else None, supplier_phone=s.phone if s else None,
        status=po.status, items=[POLineOut(**l) for l in po.items or []], total_amount=float(po.total_amount or 0),
        notes=po.notes, expected_date=po.expected_date, created_by_name=_name(creator), sent_at=po.sent_at,
        received_at=po.received_at, created_at=po.created_at,
    )


def _get_po(db, user: User, po_id: str) -> PurchaseOrder:
    po = db.get(PurchaseOrder, po_id)
    allowed = accessible_clinic_ids(user)
    if not po or (allowed is not None and po.clinic_id not in allowed):
        raise not_found("Purchase order")
    return po


def _lines(db, cid: str, lines: list[POLineIn], keep: dict[str, int] | None = None) -> list[dict]:
    out = []
    for l in lines:
        item = db.get(InventoryItem, l.item_id)
        if not item or item.clinic_id != cid:
            raise bad_request("An item on this order isn't in this clinic's stock list", "INVALID_ITEM")
        out.append({"itemId": item.id, "name": item.name, "unit": item.unit, "quantity": l.quantity,
                    "unitPrice": float(l.unit_price), "receivedQuantity": (keep or {}).get(item.id, 0)})
    return out


@router.get("/purchase-orders", response_model=list[POOut])
def list_pos(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"), status: str | None = None):
    query = _scope(user, select(PurchaseOrder), PurchaseOrder.clinic_id, clinic_id).order_by(PurchaseOrder.created_at.desc())
    if status:
        query = query.where(PurchaseOrder.status.in_(status.split(",")))
    return [_po_out(db, po) for po in db.scalars(query.limit(300))]


@router.post("/purchase-orders", response_model=POOut, status_code=201)
def create_po(body: POIn, db: DbSession, user: User = Managers):
    cid = _clinic_for(user, body.clinic_id)
    if not db.get(Supplier, body.supplier_id):
        raise not_found("Supplier")
    lines = _lines(db, cid, body.items)
    po = PurchaseOrder(po_number=svc.next_po_number(db), clinic_id=cid, supplier_id=body.supplier_id, items=lines,
                       total_amount=svc.po_total(lines), notes=body.notes, expected_date=body.expected_date, created_by_id=user.id)
    db.add(po)
    db.flush()
    audit.record(db, user, "create", "purchase_order", po.id, after={"number": po.po_number, "total": str(po.total_amount)})
    db.commit()
    return _po_out(db, po)


@router.post("/purchase-orders/from-suggestions", response_model=POOut, status_code=201)
def create_from_suggestions(body: FromSuggestionsIn, db: DbSession, user: User = Managers):
    ensure_clinic_access(user, body.clinic_id)
    group = next((g for g in svc.reorder_suggestions(db, {body.clinic_id}) if g["supplierId"] == body.supplier_id), None)
    if not group:
        raise bad_request("Nothing to reorder from this supplier", "NOTHING_TO_REORDER")
    return create_po(POIn(clinic_id=body.clinic_id, supplier_id=body.supplier_id,
                          items=[POLineIn(item_id=i["itemId"], quantity=i["suggestedQuantity"], unit_price=Decimal(str(i["unitPrice"])))
                                 for i in group["items"]],
                          notes="Created from reorder suggestions"), db, user)


@router.put("/purchase-orders/{po_id}", response_model=POOut)
def update_po(po_id: str, body: POIn, db: DbSession, user: User = Managers):
    po = _get_po(db, user, po_id)
    if po.status != "Draft":
        raise bad_request("Only draft orders can be changed", "PO_NOT_DRAFT")
    if not db.get(Supplier, body.supplier_id):
        raise not_found("Supplier")
    po.supplier_id = body.supplier_id
    po.items = _lines(db, po.clinic_id, body.items)
    po.total_amount = svc.po_total(po.items)
    po.notes, po.expected_date = body.notes, body.expected_date
    audit.record(db, user, "update", "purchase_order", po.id, after={"total": str(po.total_amount)})
    db.commit()
    return _po_out(db, po)


@router.post("/purchase-orders/{po_id}/send", response_model=POOut)
def send_po(po_id: str, db: DbSession, user: User = Managers):
    po = _get_po(db, user, po_id)
    if po.status != "Draft":
        raise bad_request("This order was already sent", "PO_NOT_DRAFT")
    po.status, po.sent_at = "Sent", datetime.now(timezone.utc)
    audit.record(db, user, "send", "purchase_order", po.id)
    db.commit()
    return _po_out(db, po)


@router.post("/purchase-orders/{po_id}/receive", response_model=POOut)
def receive_po(po_id: str, body: ReceiveIn, db: DbSession, user: User = Managers):
    """Book in what arrived. Stock goes up straight away; the order closes when everything is in."""
    po = _get_po(db, user, po_id)
    if po.status not in ("Sent", "Partially Received", "Draft"):
        raise bad_request("This order is closed", "PO_CLOSED")
    lines = [dict(l) for l in po.items]
    by_item = {l["itemId"]: l for l in lines}
    for r in body.lines:
        line = by_item.get(r.item_id)
        if not line:
            raise bad_request("That item isn't on this order", "NOT_ON_ORDER")
        if r.quantity == 0:
            continue
        item = db.get(InventoryItem, r.item_id)
        svc.move_stock(db, item, r.quantity, "received", f"Received on {po.po_number}", user, purchase_order_id=po.id)
        if r.expiry_date:
            item.expiry_date = r.expiry_date
        if r.batch_number:
            item.batch_number = r.batch_number
        line["receivedQuantity"] = int(line.get("receivedQuantity") or 0) + r.quantity
    po.items = lines
    complete = all(int(l.get("receivedQuantity") or 0) >= int(l["quantity"]) for l in lines)
    po.status = "Received" if complete else "Partially Received"
    if po.sent_at is None:
        po.sent_at = datetime.now(timezone.utc)
    if complete:
        po.received_at = datetime.now(timezone.utc)
    audit.record(db, user, "receive", "purchase_order", po.id, after={"status": po.status})
    db.commit()
    return _po_out(db, po)


@router.post("/purchase-orders/{po_id}/cancel", response_model=POOut)
def cancel_po(po_id: str, db: DbSession, user: User = Managers):
    po = _get_po(db, user, po_id)
    if po.status in ("Received", "Cancelled"):
        raise bad_request("This order is closed", "PO_CLOSED")
    po.status = "Cancelled"
    audit.record(db, user, "cancel", "purchase_order", po.id)
    db.commit()
    return _po_out(db, po)


# ---------------------------------------------------------------------------
# Lab orders
# ---------------------------------------------------------------------------

class LabOrderIn(CamelModel):
    clinic_id: str | None = None
    patient_id: str
    lab_id: str
    dentist_id: str | None = None
    item_type: str = Field(pattern=LAB_ITEMS)
    tooth_numbers: list[str] = Field(default_factory=list, max_length=32)
    shade: str = Field(default="", max_length=40)
    material: str = Field(default="", max_length=80)
    instructions: str | None = Field(default=None, max_length=2000)
    expected_date: date | None = None
    cost: Decimal = Field(default=Decimal("0"), ge=0, le=Decimal("10000000"))
    treatment_plan_item_id: str | None = None


class StatusIn(CamelModel):
    status: str
    note: str = Field(default="", max_length=500)
    # When the work arrives, tell the patient on WhatsApp so they book the fitting
    notify_patient: bool = True


class RemakeIn(CamelModel):
    reason: str = Field(min_length=3, max_length=300)
    expected_date: date | None = None


class LabUpdateOut(CamelModel):
    id: str
    status: str
    note: str
    updated_by_name: str | None
    created_at: datetime


class LabOrderOut(CamelModel):
    id: str
    order_number: str
    clinic_id: str
    patient_id: str
    patient_name: str
    lab_id: str
    lab_name: str | None
    dentist_id: str | None
    dentist_name: str | None
    item_type: str
    tooth_numbers: list[str]
    shade: str
    material: str
    instructions: str | None
    status: str
    order_date: date
    expected_date: date
    delivered_at: datetime | None
    fitted_at: datetime | None
    cost: float
    treatment_plan_item_id: str | None
    remake_of_id: str | None
    remake_reason: str | None
    is_overdue: bool
    days_late: int
    updates: list[LabUpdateOut] = []
    created_at: datetime


def _lab_out(db, o: LabOrder, with_updates: bool = False) -> LabOrderOut:
    patient = db.get(Patient, o.patient_id)
    lab = db.get(Supplier, o.lab_id)
    dentist = db.get(User, o.dentist_id) if o.dentist_id else None
    today = datetime.now(timezone.utc).date()
    late = (today - o.expected_date).days if o.status in svc.LAB_OPEN else 0
    out = LabOrderOut(
        id=o.id, order_number=o.order_number, clinic_id=o.clinic_id, patient_id=o.patient_id,
        patient_name=f"{patient.first_name} {patient.last_name}".strip() if patient else "", lab_id=o.lab_id,
        lab_name=lab.name if lab else None, dentist_id=o.dentist_id, dentist_name=f"Dr. {_name(dentist)}" if dentist else None,
        item_type=o.item_type, tooth_numbers=o.tooth_numbers or [], shade=o.shade, material=o.material,
        instructions=o.instructions, status=o.status, order_date=o.order_date, expected_date=o.expected_date,
        delivered_at=o.delivered_at, fitted_at=o.fitted_at, cost=float(o.cost or 0), treatment_plan_item_id=o.treatment_plan_item_id,
        remake_of_id=o.remake_of_id, remake_reason=o.remake_reason, is_overdue=late > 0, days_late=max(late, 0),
        created_at=o.created_at,
    )
    if with_updates:
        ups = db.scalars(select(LabOrderUpdate).where(LabOrderUpdate.lab_order_id == o.id).order_by(LabOrderUpdate.created_at)).all()
        users = {u.id: _name(u) for u in db.scalars(select(User).where(User.id.in_({u.updated_by_id for u in ups if u.updated_by_id})))}
        out.updates = [LabUpdateOut(id=u.id, status=u.status, note=u.note, updated_by_name=users.get(u.updated_by_id),
                                    created_at=u.created_at) for u in ups]
    return out


def _get_lab(db, user: User, order_id: str) -> LabOrder:
    o = db.get(LabOrder, order_id)
    allowed = accessible_clinic_ids(user)
    if not o or (allowed is not None and o.clinic_id not in allowed):
        raise not_found("Lab order")
    return o


@router.get("/lab-orders", response_model=list[LabOrderOut])
def list_lab_orders(db: DbSession, user: StaffUser, clinic_id: str | None = Query(default=None, alias="clinicId"),
                    status: str | None = None, patient_id: str | None = Query(default=None, alias="patientId"),
                    lab_id: str | None = Query(default=None, alias="labId"), view: str | None = None):
    """view: open (at the lab) | overdue | ready (delivered, waiting to fit) | done"""
    query = _scope(user, select(LabOrder), LabOrder.clinic_id, clinic_id).order_by(LabOrder.expected_date)
    if status:
        query = query.where(LabOrder.status.in_(status.split(",")))
    if patient_id:
        query = query.where(LabOrder.patient_id == patient_id)
    if lab_id:
        query = query.where(LabOrder.lab_id == lab_id)
    today = datetime.now(timezone.utc).date()
    if view == "open":
        query = query.where(LabOrder.status.in_(svc.LAB_OPEN))
    elif view == "overdue":
        query = query.where(LabOrder.status.in_(svc.LAB_OPEN), LabOrder.expected_date < today)
    elif view == "ready":
        query = query.where(LabOrder.status == "Delivered to Clinic")
    elif view == "done":
        query = query.where(LabOrder.status.in_(("Fitted/Completed", "Cancelled")))
    return [_lab_out(db, o) for o in db.scalars(query.limit(500))]


@router.post("/lab-orders", response_model=LabOrderOut, status_code=201)
def create_lab_order(body: LabOrderIn, db: DbSession, user: StaffUser):
    patient = get_patient_for(db, user, body.patient_id)
    cid = _clinic_for(user, body.clinic_id or patient.clinic_id)
    lab = db.get(Supplier, body.lab_id)
    if not lab or not lab.is_lab:
        raise bad_request("Choose a lab", "INVALID_LAB")
    dentist_id = body.dentist_id or (user.id if user.role == "dentist" else None)
    today = datetime.now(timezone.utc).date()
    expected = body.expected_date or (today + timedelta(days=lab.turnaround_days or 7))
    if expected < today:
        raise AppError(400, "The due date can't be in the past", "INVALID_DATE", {"expectedDate": "In the past"})
    o = LabOrder(order_number=svc.next_lab_number(db), clinic_id=cid, patient_id=patient.id, lab_id=lab.id,
                 dentist_id=dentist_id, item_type=body.item_type, tooth_numbers=[t.strip() for t in body.tooth_numbers if t.strip()],
                 shade=body.shade.strip(), material=body.material.strip(), instructions=body.instructions,
                 order_date=today, expected_date=expected, cost=body.cost, treatment_plan_item_id=body.treatment_plan_item_id,
                 created_by_id=user.id)
    db.add(o)
    db.flush()
    db.add(LabOrderUpdate(lab_order_id=o.id, status="Ordered", note="Sent to lab", updated_by_id=user.id))
    audit.record(db, user, "create", "lab_order", o.id, after={"number": o.order_number, "lab": lab.name})
    db.commit()
    return _lab_out(db, o, with_updates=True)


@router.get("/lab-orders/{order_id}", response_model=LabOrderOut)
def get_lab_order(order_id: str, db: DbSession, user: StaffUser):
    return _lab_out(db, _get_lab(db, user, order_id), with_updates=True)


@router.post("/lab-orders/{order_id}/status", response_model=LabOrderOut)
def update_lab_status(order_id: str, body: StatusIn, db: DbSession, user: StaffUser):
    o = _get_lab(db, user, order_id)
    if body.status not in svc.LAB_STATUSES:
        raise bad_request("Unknown status", "INVALID_STATUS")
    if o.status in ("Fitted/Completed", "Cancelled"):
        raise bad_request("This case is closed", "LAB_ORDER_CLOSED")
    if body.status != "Cancelled" and svc.LAB_FLOW.index(body.status) < svc.LAB_FLOW.index(o.status):
        raise bad_request("A case can't move backwards. Use Remake if the work came back wrong.", "STATUS_BACKWARDS")
    now = datetime.now(timezone.utc)
    o.status = body.status
    if body.status == "Delivered to Clinic" and not o.delivered_at:
        o.delivered_at = now
    if body.status == "Fitted/Completed":
        o.fitted_at = now
        o.delivered_at = o.delivered_at or now
    db.add(LabOrderUpdate(lab_order_id=o.id, status=body.status, note=body.note.strip(), updated_by_id=user.id))

    if body.status == "Delivered to Clinic":
        patient = db.get(Patient, o.patient_id)
        clinic = db.get(Clinic, o.clinic_id)
        if o.dentist_id:
            db.add(Notification(user_id=o.dentist_id, title="Lab work arrived",
                                message=f"{o.item_type} for {patient.first_name} {patient.last_name} is in. Book the fitting."))
        if body.notify_patient and patient and clinic:
            item = f"{o.item_type.lower()}" + (f" (tooth {', '.join(o.tooth_numbers)})" if o.tooth_numbers else "")
            msg.quietly(msg.send_template, db, patient, "lab_ready",
                        [msg._first_name(patient), item, clinic.name, booking_link(clinic)],
                        actor=user, payload={"labOrderId": o.id, "clinicId": clinic.id},
                        dedupe_key=f"{o.id}:lab_ready")
    audit.record(db, user, "status", "lab_order", o.id, after={"status": body.status})
    db.commit()
    return _lab_out(db, o, with_updates=True)


@router.post("/lab-orders/{order_id}/remake", response_model=LabOrderOut, status_code=201)
def remake(order_id: str, body: RemakeIn, db: DbSession, user: StaffUser):
    """The work didn't fit or was wrong: close this case and send a new one to the same lab."""
    o = _get_lab(db, user, order_id)
    if o.status in ("Ordered", "Cancelled"):
        raise bad_request("Nothing to remake yet", "NOTHING_TO_REMAKE")
    lab = db.get(Supplier, o.lab_id)
    today = datetime.now(timezone.utc).date()
    new = LabOrder(order_number=svc.next_lab_number(db), clinic_id=o.clinic_id, patient_id=o.patient_id, lab_id=o.lab_id,
                   dentist_id=o.dentist_id, item_type=o.item_type, tooth_numbers=list(o.tooth_numbers or []), shade=o.shade,
                   material=o.material, instructions=f"REMAKE of {o.order_number}: {body.reason.strip()}\n{o.instructions or ''}".strip(),
                   order_date=today, expected_date=body.expected_date or today + timedelta(days=(lab.turnaround_days if lab else None) or 7),
                   cost=Decimal("0"), treatment_plan_item_id=o.treatment_plan_item_id, remake_of_id=o.id,
                   remake_reason=body.reason.strip(), created_by_id=user.id)
    db.add(new)
    db.flush()
    if o.status not in ("Fitted/Completed",):
        o.status = "Cancelled"
    db.add(LabOrderUpdate(lab_order_id=o.id, status=o.status, note=f"Sent for remake ({new.order_number}): {body.reason.strip()}",
                          updated_by_id=user.id))
    db.add(LabOrderUpdate(lab_order_id=new.id, status="Ordered", note=f"Remake of {o.order_number}", updated_by_id=user.id))
    audit.record(db, user, "remake", "lab_order", o.id, after={"new": new.order_number, "reason": body.reason})
    db.commit()
    return _lab_out(db, new, with_updates=True)

/**
 * Stock, purchase orders, suppliers/labs and lab cases.
 * Mock mode adapts the demo data in src/data so the screens work without the backend.
 */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';
import { mockInventory } from '../data/mockInventory';
import { mockSuppliers } from '../data/mockSuppliers';
import { mockLabOrders } from '../data/mockLabOrders';

export type StockStatus = 'ok' | 'low' | 'out';
export const CATEGORIES = ['Consumables', 'Instruments', 'PPE', 'Medications', 'Equipment'] as const;
export const LAB_ITEMS = ['Crown', 'Bridge', 'Denture', 'Aligner', 'Night Guard', 'Veneer', 'Implant Component', 'Inlay/Onlay', 'Retainer', 'Other'] as const;
export const LAB_FLOW = ['Ordered', 'In Progress', 'Quality Check', 'Ready for Pickup', 'Delivered to Clinic', 'Fitted/Completed'] as const;
export type LabStatus = typeof LAB_FLOW[number] | 'Cancelled';

export interface LabPerformance {
  orders: number; delivered: number; onTime: number; remakes: number; openOverdue: number; spend: number;
  averageTurnaroundDays: number | null; onTimeRate: number | null; remakeRate: number | null;
}

export interface Supplier {
  id: string; name: string; contactPerson: string; phone: string; email: string; address: string; notes?: string | null;
  itemsSupplied: string[]; isLab: boolean; turnaroundDays?: number | null; isActive: boolean; performance?: LabPerformance | null;
}

export interface StockMovement {
  id: string; change: number; balanceAfter: number; type: 'received' | 'usage' | 'adjustment' | 'expired' | 'returned';
  reason: string; appointmentId?: string | null; purchaseOrderId?: string | null; recordedByName?: string | null; recordedAt: string;
}

export interface StockItem {
  id: string; clinicId: string; name: string; sku?: string | null; category: string; unit: string; currentStock: number;
  reorderThreshold: number; reorderQuantity: number; unitCost: number; supplierId?: string | null; supplierName?: string | null;
  expiryDate?: string | null; batchNumber?: string | null; location?: string | null; lastRestockedAt?: string | null;
  isActive: boolean; stockStatus: StockStatus; expiryStatus: 'soon' | 'expired' | null; stockValue: number;
  movements?: StockMovement[] | null;
}

export type StockItemInput = Partial<Pick<StockItem, 'name' | 'sku' | 'category' | 'unit' | 'reorderThreshold' | 'reorderQuantity' |
  'unitCost' | 'supplierId' | 'expiryDate' | 'batchNumber' | 'location' | 'isActive'>> & { clinicId?: string; openingStock?: number };

export interface InventorySummary {
  totalItems: number; lowStock: number; outOfStock: number; expiringSoon: number; expired: number; stockValue: number;
  openPurchaseOrders: number; labCasesAtLab: number; labCasesOverdue: number; labCasesReadyToFit: number;
}

export interface ReorderGroup {
  clinicId: string; supplierId: string | null; supplierName: string | null;
  items: { itemId: string; name: string; unit: string; currentStock: number; reorderThreshold: number; suggestedQuantity: number; unitPrice: number }[];
}

export type POStatus = 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Cancelled';
export interface POLine { itemId: string; name: string; unit: string; quantity: number; unitPrice: number; receivedQuantity: number }
export interface PurchaseOrder {
  id: string; poNumber: string; clinicId: string; supplierId: string; supplierName?: string | null; supplierEmail?: string | null;
  supplierPhone?: string | null; status: POStatus; items: POLine[]; totalAmount: number; notes?: string | null;
  expectedDate?: string | null; createdByName?: string | null; sentAt?: string | null; receivedAt?: string | null; createdAt: string;
}

export interface LabUpdate { id: string; status: LabStatus; note: string; updatedByName?: string | null; createdAt: string }
export interface LabOrder {
  id: string; orderNumber: string; clinicId: string; patientId: string; patientName: string; labId: string; labName?: string | null;
  dentistId?: string | null; dentistName?: string | null; itemType: string; toothNumbers: string[]; shade: string; material: string;
  instructions?: string | null; status: LabStatus; orderDate: string; expectedDate: string; deliveredAt?: string | null;
  fittedAt?: string | null; cost: number; treatmentPlanItemId?: string | null; remakeOfId?: string | null; remakeReason?: string | null;
  isOverdue: boolean; daysLate: number; updates: LabUpdate[]; createdAt: string;
}

export interface NewLabOrder {
  patientId: string; labId: string; dentistId?: string; itemType: string; toothNumbers: string[]; shade?: string; material?: string;
  instructions?: string; expectedDate?: string; cost?: number; clinicId?: string;
}

// ---------- Mock adapters ----------

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const mSuppliers: Supplier[] = mockSuppliers.map(s => ({
  id: s.id, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address, notes: s.notes,
  itemsSupplied: s.itemsSupplied, isLab: !!s.isLab, turnaroundDays: s.averageTurnaroundDays ?? null, isActive: true,
  performance: s.isLab ? { orders: 4, delivered: 3, onTime: 2, remakes: 0, openOverdue: s.id === 'lab_2' ? 1 : 0, spend: 34000,
    averageTurnaroundDays: s.averageTurnaroundDays ?? null, onTimeRate: 0.67, remakeRate: 0 } : null,
}));

const statusOf = (stock: number, threshold: number): StockStatus => (stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'ok');
const expiryOf = (d?: string | null) => {
  if (!d) return null;
  const days = daysBetween(d.slice(0, 10), today());
  return days < 0 ? 'expired' : days <= 30 ? 'soon' : null;
};

const mItems: StockItem[] = mockInventory.map(i => ({
  id: i.id, clinicId: i.clinicId, name: i.name, category: i.category, unit: i.unit, currentStock: i.currentStock,
  reorderThreshold: i.reorderThreshold, reorderQuantity: i.reorderThreshold * 2, unitCost: 100, supplierId: i.supplierId,
  supplierName: mockSuppliers.find(s => s.id === i.supplierId)?.name, expiryDate: i.expiryDate?.slice(0, 10) ?? null,
  lastRestockedAt: i.lastRestockedDate ?? null, isActive: true, stockStatus: statusOf(i.currentStock, i.reorderThreshold),
  expiryStatus: expiryOf(i.expiryDate), stockValue: 100 * i.currentStock,
  movements: (i.movements || []).map(m => ({ id: m.id, change: m.changeAmount, balanceAfter: i.currentStock, type: m.type === 'addition' ? 'received' : m.type,
    reason: m.reason, recordedByName: 'John Doe', recordedAt: m.recordedAt } as StockMovement)),
}));

const refresh = (i: StockItem) => Object.assign(i, {
  stockStatus: statusOf(i.currentStock, i.reorderThreshold), expiryStatus: expiryOf(i.expiryDate), stockValue: i.unitCost * i.currentStock,
});

const mPOs: PurchaseOrder[] = [];

const mLab: LabOrder[] = mockLabOrders.map((o, n) => {
  const exp = o.expectedDeliveryDate.slice(0, 10);
  const open = ['Ordered', 'In Progress', 'Quality Check', 'Ready for Pickup'].includes(o.status);
  const late = open ? Math.max(daysBetween(today(), exp), 0) : 0;
  return {
    id: o.id, orderNumber: `LAB-${new Date().getFullYear()}-${String(n + 1).padStart(4, '0')}`, clinicId: o.clinicId,
    patientId: o.patientId, patientName: ({ pat_1: 'Alice Green', pat_2: 'Bob Martin', pat_3: 'Charlie Brown' } as Record<string, string>)[o.patientId] || 'Patient',
    labId: o.labId, labName: mockSuppliers.find(s => s.id === o.labId)?.name, dentistName: 'Dr. Sarah Smith',
    itemType: o.itemType, toothNumbers: o.toothNumbers, shade: (o.shadeMaterialSpec || '').split(',')[0]?.trim() || '',
    material: (o.shadeMaterialSpec || '').split(',')[1]?.trim() || '', instructions: o.specialInstructions, status: o.status,
    orderDate: o.orderDate.slice(0, 10), expectedDate: exp, deliveredAt: o.deliveredDate ?? null, cost: 6500, isOverdue: late > 0, daysLate: late,
    updates: o.updates.map(u => ({ id: u.id, status: u.status, note: u.note, updatedByName: 'John Doe', createdAt: u.updatedAt })),
    createdAt: o.orderDate,
  };
});

// ---------- Suppliers ----------

export async function getSuppliers(opts: { labs?: boolean } = {}): Promise<ApiResponse<Supplier[]>> {
  if (!USE_MOCK_API) return http.get('/suppliers', opts.labs === undefined ? undefined : { labs: opts.labs });
  return apiClient(() => mSuppliers.filter(s => opts.labs === undefined || s.isLab === opts.labs));
}

export async function saveSupplier(s: Omit<Supplier, 'id' | 'performance'> & { id?: string }): Promise<ApiResponse<Supplier>> {
  const { id, ...body } = s;
  if (!USE_MOCK_API) return id ? http.patch(`/suppliers/${encodeURIComponent(id)}`, body) : http.post('/suppliers', body);
  return apiClient(() => {
    if (id) { const x = mSuppliers.find(v => v.id === id)!; Object.assign(x, body); return { ...x }; }
    const created = { ...body, id: `sup_${Date.now()}`, performance: null };
    mSuppliers.push(created);
    return created;
  });
}

// ---------- Stock ----------

export async function getInventorySummary(clinicId?: string): Promise<ApiResponse<InventorySummary>> {
  if (!USE_MOCK_API) return http.get('/inventory/summary', { clinicId });
  return apiClient(() => ({
    totalItems: mItems.length, lowStock: mItems.filter(i => i.stockStatus === 'low').length,
    outOfStock: mItems.filter(i => i.stockStatus === 'out').length, expiringSoon: mItems.filter(i => i.expiryStatus === 'soon').length,
    expired: mItems.filter(i => i.expiryStatus === 'expired').length, stockValue: mItems.reduce((s, i) => s + i.stockValue, 0),
    openPurchaseOrders: mPOs.filter(p => ['Draft', 'Sent', 'Partially Received'].includes(p.status)).length,
    labCasesAtLab: mLab.filter(o => LAB_FLOW.indexOf(o.status as typeof LAB_FLOW[number]) < 4 && o.status !== 'Cancelled').length,
    labCasesOverdue: mLab.filter(o => o.isOverdue).length, labCasesReadyToFit: mLab.filter(o => o.status === 'Delivered to Clinic').length,
  }));
}

export async function getStockItems(filters: { clinicId?: string; q?: string; category?: string; status?: string } = {}): Promise<ApiResponse<StockItem[]>> {
  if (!USE_MOCK_API) return http.get('/inventory/items', filters);
  return apiClient(() => mItems.filter(i =>
    (!filters.q || i.name.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.category || filters.category === 'All' || i.category === filters.category) &&
    (!filters.status || (filters.status === 'low' ? i.stockStatus !== 'ok' : filters.status === 'out' ? i.stockStatus === 'out' :
      filters.status === 'expiring' ? !!i.expiryStatus : true))).map(i => ({ ...i })));
}

export async function getStockItem(id: string): Promise<ApiResponse<StockItem>> {
  if (!USE_MOCK_API) return http.get(`/inventory/items/${encodeURIComponent(id)}`);
  return apiClient(() => ({ ...mItems.find(i => i.id === id)! }));
}

export async function saveStockItem(body: StockItemInput, id?: string): Promise<ApiResponse<StockItem>> {
  if (!USE_MOCK_API) return id ? http.patch(`/inventory/items/${encodeURIComponent(id)}`, body) : http.post('/inventory/items', body);
  return apiClient(() => {
    if (id) { const x = mItems.find(i => i.id === id)!; Object.assign(x, body); return { ...refresh(x) }; }
    const created = refresh({
      id: `inv_${Date.now()}`, clinicId: body.clinicId || 'c1b48b94-132d-41a4-8f77-e2307fbadd2f', name: body.name || 'Item',
      category: body.category || 'Consumables', unit: body.unit || 'pieces', currentStock: body.openingStock || 0,
      reorderThreshold: body.reorderThreshold || 0, reorderQuantity: body.reorderQuantity || 0, unitCost: body.unitCost || 0,
      supplierId: body.supplierId, supplierName: mSuppliers.find(s => s.id === body.supplierId)?.name, expiryDate: body.expiryDate,
      isActive: true, stockStatus: 'ok', expiryStatus: null, stockValue: 0, movements: [],
    } as StockItem);
    mItems.unshift(created);
    return { ...created };
  });
}

export async function recordStockMovement(id: string, m: { change: number; type: StockMovement['type']; reason?: string; expiryDate?: string }): Promise<ApiResponse<StockItem>> {
  if (!USE_MOCK_API) return http.post(`/inventory/items/${encodeURIComponent(id)}/movements`, m);
  return apiClient(() => {
    const x = mItems.find(i => i.id === id)!;
    if (x.currentStock + m.change < 0) throw new Error(`Only ${x.currentStock} ${x.unit} in stock`);
    x.currentStock += m.change;
    if (m.expiryDate) x.expiryDate = m.expiryDate;
    x.movements = [{ id: `mv_${Date.now()}`, change: m.change, balanceAfter: x.currentStock, type: m.type, reason: m.reason || m.type,
      recordedByName: 'You', recordedAt: new Date().toISOString() }, ...(x.movements || [])];
    return { ...refresh(x) };
  });
}

export async function getReorderSuggestions(clinicId?: string): Promise<ApiResponse<ReorderGroup[]>> {
  if (!USE_MOCK_API) return http.get('/inventory/reorder-suggestions', { clinicId });
  return apiClient(() => {
    const groups: Record<string, ReorderGroup> = {};
    mItems.filter(i => i.stockStatus !== 'ok').forEach(i => {
      const k = i.supplierId || 'none';
      groups[k] = groups[k] || { clinicId: i.clinicId, supplierId: i.supplierId || null, supplierName: i.supplierName || null, items: [] };
      groups[k].items.push({ itemId: i.id, name: i.name, unit: i.unit, currentStock: i.currentStock, reorderThreshold: i.reorderThreshold,
        suggestedQuantity: i.reorderQuantity || i.reorderThreshold * 2, unitPrice: i.unitCost });
    });
    return Object.values(groups);
  });
}

// ---------- Purchase orders ----------

export async function getPurchaseOrders(filters: { clinicId?: string; status?: string } = {}): Promise<ApiResponse<PurchaseOrder[]>> {
  if (!USE_MOCK_API) return http.get('/purchase-orders', filters);
  return apiClient(() => mPOs.map(p => ({ ...p })));
}

export async function createPurchaseOrder(body: { clinicId?: string; supplierId: string; items: { itemId: string; quantity: number; unitPrice?: number }[]; notes?: string; expectedDate?: string }): Promise<ApiResponse<PurchaseOrder>> {
  if (!USE_MOCK_API) return http.post('/purchase-orders', body);
  return apiClient(() => {
    const items = body.items.map(l => { const it = mItems.find(i => i.id === l.itemId)!; return { itemId: it.id, name: it.name, unit: it.unit, quantity: l.quantity, unitPrice: l.unitPrice || 0, receivedQuantity: 0 }; });
    const po: PurchaseOrder = { id: `po_${Date.now()}`, poNumber: `PO-${new Date().getFullYear()}-${String(mPOs.length + 1).padStart(4, '0')}`,
      clinicId: body.clinicId || 'c1', supplierId: body.supplierId, supplierName: mSuppliers.find(s => s.id === body.supplierId)?.name,
      status: 'Draft', items, totalAmount: items.reduce((s, l) => s + l.quantity * l.unitPrice, 0), notes: body.notes,
      expectedDate: body.expectedDate, createdByName: 'You', createdAt: new Date().toISOString() };
    mPOs.unshift(po);
    return { ...po };
  });
}

export async function createPOFromSuggestions(clinicId: string, supplierId: string): Promise<ApiResponse<PurchaseOrder>> {
  if (!USE_MOCK_API) return http.post('/purchase-orders/from-suggestions', { clinicId, supplierId });
  const groups = (await getReorderSuggestions(clinicId)).data || [];
  const g = groups.find(x => x.supplierId === supplierId);
  return createPurchaseOrder({ clinicId, supplierId, items: (g?.items || []).map(i => ({ itemId: i.itemId, quantity: i.suggestedQuantity, unitPrice: i.unitPrice })) });
}

const poAction = (id: string, fn: (p: PurchaseOrder) => void) => apiClient(() => { const p = mPOs.find(x => x.id === id)!; fn(p); return { ...p }; });

export async function sendPurchaseOrder(id: string): Promise<ApiResponse<PurchaseOrder>> {
  if (!USE_MOCK_API) return http.post(`/purchase-orders/${encodeURIComponent(id)}/send`);
  return poAction(id, p => { p.status = 'Sent'; p.sentAt = new Date().toISOString(); });
}

export async function cancelPurchaseOrder(id: string): Promise<ApiResponse<PurchaseOrder>> {
  if (!USE_MOCK_API) return http.post(`/purchase-orders/${encodeURIComponent(id)}/cancel`);
  return poAction(id, p => { p.status = 'Cancelled'; });
}

export async function receivePurchaseOrder(id: string, lines: { itemId: string; quantity: number; expiryDate?: string }[]): Promise<ApiResponse<PurchaseOrder>> {
  if (!USE_MOCK_API) return http.post(`/purchase-orders/${encodeURIComponent(id)}/receive`, { lines });
  return poAction(id, p => {
    lines.forEach(l => {
      const line = p.items.find(x => x.itemId === l.itemId);
      const it = mItems.find(i => i.id === l.itemId);
      if (line && it && l.quantity > 0) { line.receivedQuantity += l.quantity; it.currentStock += l.quantity; refresh(it); }
    });
    p.status = p.items.every(l => l.receivedQuantity >= l.quantity) ? 'Received' : 'Partially Received';
  });
}

// ---------- Lab orders ----------

export async function getLabOrders(filters: { clinicId?: string; view?: string; patientId?: string; labId?: string } = {}): Promise<ApiResponse<LabOrder[]>> {
  if (!USE_MOCK_API) return http.get('/lab-orders', filters);
  return apiClient(() => mLab.filter(o =>
    (!filters.patientId || o.patientId === filters.patientId) && (!filters.labId || o.labId === filters.labId) &&
    (!filters.view || (filters.view === 'open' ? LAB_FLOW.indexOf(o.status as typeof LAB_FLOW[number]) < 4 && o.status !== 'Cancelled'
      : filters.view === 'overdue' ? o.isOverdue : filters.view === 'ready' ? o.status === 'Delivered to Clinic'
      : ['Fitted/Completed', 'Cancelled'].includes(o.status)))).map(o => ({ ...o })));
}

export async function getLabOrder(id: string): Promise<ApiResponse<LabOrder>> {
  if (!USE_MOCK_API) return http.get(`/lab-orders/${encodeURIComponent(id)}`);
  return apiClient(() => ({ ...mLab.find(o => o.id === id)! }));
}

export async function createLabOrder(body: NewLabOrder): Promise<ApiResponse<LabOrder>> {
  if (!USE_MOCK_API) return http.post('/lab-orders', body);
  return apiClient(() => {
    const lab = mSuppliers.find(s => s.id === body.labId);
    const exp = body.expectedDate || new Date(Date.now() + (lab?.turnaroundDays || 7) * 86400000).toISOString().slice(0, 10);
    const o: LabOrder = { id: `lo_${Date.now()}`, orderNumber: `LAB-${new Date().getFullYear()}-${String(mLab.length + 1).padStart(4, '0')}`,
      clinicId: body.clinicId || 'c1', patientId: body.patientId, patientName: 'Patient', labId: body.labId, labName: lab?.name,
      dentistName: 'Dr. Sarah Smith', itemType: body.itemType, toothNumbers: body.toothNumbers, shade: body.shade || '', material: body.material || '',
      instructions: body.instructions, status: 'Ordered', orderDate: today(), expectedDate: exp, cost: body.cost || 0, isOverdue: false, daysLate: 0,
      updates: [{ id: `u${Date.now()}`, status: 'Ordered', note: 'Sent to lab', updatedByName: 'You', createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString() };
    mLab.unshift(o);
    return { ...o };
  });
}

export async function updateLabStatus(id: string, status: LabStatus, note = '', notifyPatient = true): Promise<ApiResponse<LabOrder>> {
  if (!USE_MOCK_API) return http.post(`/lab-orders/${encodeURIComponent(id)}/status`, { status, note, notifyPatient });
  return apiClient(() => {
    const o = mLab.find(x => x.id === id)!;
    o.status = status;
    if (status === 'Delivered to Clinic') o.deliveredAt = new Date().toISOString();
    if (status === 'Fitted/Completed') o.fittedAt = new Date().toISOString();
    o.isOverdue = false; o.daysLate = 0;
    o.updates = [...o.updates, { id: `u${Date.now()}`, status, note, updatedByName: 'You', createdAt: new Date().toISOString() }];
    return { ...o };
  });
}

export async function remakeLabOrder(id: string, reason: string): Promise<ApiResponse<LabOrder>> {
  if (!USE_MOCK_API) return http.post(`/lab-orders/${encodeURIComponent(id)}/remake`, { reason });
  const o = mLab.find(x => x.id === id)!;
  o.status = 'Cancelled';
  return createLabOrder({ patientId: o.patientId, labId: o.labId, itemType: o.itemType, toothNumbers: o.toothNumbers, shade: o.shade,
    material: o.material, instructions: `REMAKE of ${o.orderNumber}: ${reason}` });
}

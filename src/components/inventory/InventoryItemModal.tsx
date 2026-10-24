import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, History, Pencil, Save } from 'lucide-react';
import { Modal, Field, selectClass } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import {
  CATEGORIES, getStockItem, getSuppliers, recordStockMovement, saveStockItem, StockItem, StockItemInput, StockMovement, Supplier,
} from '../../api/inventoryService';
import { StockBadge } from '../../pages/inventory/InventoryList';

type Action = 'usage' | 'received' | 'adjustment' | 'expired';
const ACTIONS: { key: Action; label: string; sign: 1 | -1 }[] = [
  { key: 'usage', label: 'Used', sign: -1 },
  { key: 'received', label: 'Received', sign: 1 },
  { key: 'adjustment', label: 'Stock count', sign: 1 },
  { key: 'expired', label: 'Thrown away', sign: -1 },
];
const TYPE_LABEL: Record<StockMovement['type'], string> = { received: 'Received', usage: 'Used', adjustment: 'Count corrected', expired: 'Thrown away', returned: 'Returned' };

/** Item details: record usage, deliveries and counts, edit settings, see history. `item` null = new item. */
export function InventoryItemModal({ item, clinicId, onClose, onSaved }: { item: StockItem | null; clinicId?: string; onClose: () => void; onSaved: (i: StockItem) => void }) {
  const { user } = useAuth();
  const canManage = user?.role !== 'dentist';
  const { formatCurrency } = useCurrency();
  const [full, setFull] = useState<StockItem | null>(item);
  const [editing, setEditing] = useState(!item);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<StockItemInput>(item ? { ...item } : { category: 'Consumables', unit: 'pieces', reorderThreshold: 5, reorderQuantity: 10, unitCost: 0, openingStock: 0 });
  const [action, setAction] = useState<Action>('usage');
  const [qty, setQty] = useState(1);
  const [countTo, setCountTo] = useState(item?.currentStock ?? 0);
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) getStockItem(item.id).then(r => { if (r.data) { setFull(r.data); setCountTo(r.data.currentStock); } });
    if (canManage) getSuppliers({ labs: false }).then(r => setSuppliers(r.data || []));
  }, [item, canManage]);

  const actions = canManage ? ACTIONS : ACTIONS.filter(a => a.key === 'usage');

  const record = async () => {
    if (!full) return;
    const change = action === 'adjustment' ? countTo - full.currentStock : (ACTIONS.find(a => a.key === action)!.sign * Math.abs(qty));
    if (change === 0) { setError('Nothing to change'); return; }
    setBusy(true);
    setError(null);
    const res = await recordStockMovement(full.id, {
      change, type: action, reason: reason.trim() || (action === 'adjustment' ? 'Stock count' : ''), expiryDate: action === 'received' && expiry ? expiry : undefined,
    });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not record'); return; }
    setFull(res.data);
    setCountTo(res.data.currentStock);
    setReason(''); setQty(1); setExpiry('');
    onSaved(res.data);
    toast({ title: `${full.name}: ${res.data.currentStock} ${res.data.unit} now`, variant: 'success' });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const { openingStock, ...rest } = form;
    const body: StockItemInput = { ...rest, clinicId: full?.clinicId || clinicId, ...(full ? {} : { openingStock }) };
    const res = await saveStockItem(body, full?.id);
    setBusy(false);
    if (res.error || !res.data) {
      const fields = res.error?.fieldErrors ? Object.values(res.error.fieldErrors).join(' ') : '';
      setError(fields || res.error?.message || 'Could not save');
      return;
    }
    setFull(res.data);
    setEditing(false);
    onSaved(res.data);
    toast({ title: full ? 'Item updated' : 'Item added', variant: 'success' });
  };

  const set = (k: keyof StockItemInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value || null }));

  return (
    <Modal title={full ? full.name : 'Add stock item'} subtitle={full ? `${full.category}${full.supplierName ? ` · ${full.supplierName}` : ''}` : undefined}
      onClose={onClose} size="lg"
      footer={editing ? <>
        {full && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
        <Button onClick={save} loading={busy} disabled={!form.name || form.name.length < 2}><Save className="w-4 h-4" /> Save</Button>
      </> : <Button onClick={onClose}>Done</Button>}>
      <div className="p-5 space-y-5">
        {full && !editing && (
          <>
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <div className="text-[12px] text-text-muted">In stock</div>
                <div className="text-3xl font-semibold tabular-nums">{full.currentStock} <span className="text-base font-normal text-text-muted">{full.unit}</span></div>
              </div>
              <div className="text-[13px] space-y-0.5">
                <StockBadge item={full} />
                <div className="text-text-muted">Reorder at {full.reorderThreshold}, order {full.reorderQuantity || '—'} · {formatCurrency(full.unitCost)} each</div>
                {full.expiryDate && <div className="text-text-muted">Expires {format(parseISO(full.expiryDate), 'd MMM yyyy')}{full.batchNumber ? ` · batch ${full.batchNumber}` : ''}</div>}
                {full.location && <div className="text-text-muted">Kept in {full.location}</div>}
              </div>
              {canManage && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setForm({ ...full }); setEditing(true); }}><Pencil className="w-4 h-4" /> Edit</Button>}
            </div>

            <section className="rounded-control border border-line p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What happened">
                {actions.map(a => (
                  <button key={a.key} role="radio" aria-checked={action === a.key} onClick={() => { setAction(a.key); setError(null); }}
                    className={`h-8 px-3 rounded-full text-[13px] font-medium border ${action === a.key ? 'bg-primary text-white border-primary' : 'border-line hover:bg-surface-hover'}`}>
                    {a.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-end">
                {action === 'adjustment' ? (
                  <Field label="Counted"><Input type="number" min={0} value={countTo} onChange={e => setCountTo(Number(e.target.value))} /></Field>
                ) : (
                  <Field label="Quantity"><Input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} /></Field>
                )}
                <Field label={action === 'adjustment' ? 'Why the count changed' : 'Note (optional)'}>
                  <Input value={reason} onChange={e => setReason(e.target.value)} placeholder={action === 'usage' ? 'e.g. RCT 36, Alice' : action === 'received' ? 'Invoice or batch' : ''} />
                </Field>
                <Button onClick={record} loading={busy}>Record</Button>
              </div>
              {action === 'received' && (
                <Field label="Expiry date of this delivery (optional)"><Input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} className="sm:w-48" /></Field>
              )}
            </section>
            {error && <p className="text-[13px] text-error">{error}</p>}

            <section>
              <h3 className="text-[13px] font-semibold flex items-center gap-1.5 mb-2"><History className="w-4 h-4" /> History</h3>
              {!full.movements?.length ? <p className="text-[13px] text-text-muted">No movements yet.</p> : (
                <ul className="divide-y divide-line rounded-control border border-line text-[13px]">
                  {full.movements.map(m => (
                    <li key={m.id} className="px-3 py-2 flex items-center gap-3">
                      {m.change > 0 ? <ArrowDownLeft className="w-4 h-4 text-success flex-none" /> : <ArrowUpRight className="w-4 h-4 text-text-muted flex-none" />}
                      <div className="flex-1 min-w-0">
                        <div><strong className="tabular-nums">{m.change > 0 ? '+' : ''}{m.change}</strong> {TYPE_LABEL[m.type]}{m.reason && m.reason !== TYPE_LABEL[m.type] ? `: ${m.reason}` : ''}</div>
                        <div className="text-[12px] text-text-muted">{format(parseISO(m.recordedAt), 'd MMM yyyy, h:mm a')}{m.recordedByName ? ` · ${m.recordedByName}` : ''}</div>
                      </div>
                      <span className="text-[12px] text-text-muted tabular-nums">→ {m.balanceAfter}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {editing && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Field label="Name"><Input value={form.name || ''} onChange={set('name')} autoFocus /></Field></div>
            <Field label="Category">
              <select value={form.category} onChange={set('category')} className={selectClass}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Counted in"><Input value={form.unit || ''} onChange={set('unit')} placeholder="boxes, syringes, packs…" /></Field>
            <Field label="Reorder when stock reaches"><Input type="number" min={0} value={form.reorderThreshold ?? 0} onChange={set('reorderThreshold')} /></Field>
            <Field label="Usual order quantity"><Input type="number" min={0} value={form.reorderQuantity ?? 0} onChange={set('reorderQuantity')} /></Field>
            <Field label="Cost per unit"><Input type="number" min={0} step="0.01" value={form.unitCost ?? 0} onChange={set('unitCost')} /></Field>
            <Field label="Supplier">
              <select value={form.supplierId || ''} onChange={set('supplierId')} className={selectClass}>
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Expiry date"><Input type="date" value={form.expiryDate || ''} onChange={set('expiryDate')} /></Field>
            <Field label="Where it's kept"><Input value={form.location || ''} onChange={set('location')} placeholder="e.g. Store room, shelf B" /></Field>
            {!full && <Field label="Stock you have now"><Input type="number" min={0} value={form.openingStock ?? 0} onChange={set('openingStock')} /></Field>}
            {error && <p className="sm:col-span-2 text-[13px] text-error">{error}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}

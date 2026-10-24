import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Ban, PackageCheck, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { Modal, Field, selectClass, textareaClass } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import {
  cancelPurchaseOrder, createPurchaseOrder, getStockItems, getSuppliers, PurchaseOrder, receivePurchaseOrder,
  sendPurchaseOrder, StockItem, Supplier,
} from '../../api/inventoryService';
import { POStatusBadge } from '../../pages/inventory/PurchaseOrders';

interface Line { itemId: string; quantity: number; unitPrice: number }

export function PurchaseOrderModal({ order, clinicId, onClose, onChanged }: { order: PurchaseOrder | null; clinicId?: string; onClose: () => void; onChanged: (po: PurchaseOrder) => void }) {
  const { user } = useAuth();
  const canManage = user?.role !== 'dentist';
  const { formatCurrency } = useCurrency();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [expected, setExpected] = useState('');
  const [receiving, setReceiving] = useState<Record<string, { quantity: number; expiryDate: string }> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order) return;
    getSuppliers({ labs: false }).then(r => setSuppliers(r.data || []));
    getStockItems({ clinicId }).then(r => setStock(r.data || []));
  }, [order, clinicId]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [lines]);
  const forSupplier = stock.filter(i => !supplierId || i.supplierId === supplierId || !i.supplierId);

  const addLine = (itemId: string) => {
    const it = stock.find(i => i.id === itemId);
    if (!it || lines.some(l => l.itemId === itemId)) return;
    setLines(l => [...l, { itemId, quantity: it.reorderQuantity || Math.max(it.reorderThreshold * 2 - it.currentStock, 1), unitPrice: it.unitCost }]);
  };

  const create = async () => {
    setBusy('create');
    setError(null);
    const res = await createPurchaseOrder({ clinicId, supplierId, items: lines, notes: notes.trim() || undefined, expectedDate: expected || undefined });
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not create the order'); return; }
    toast({ title: `${res.data.poNumber} saved as draft`, variant: 'success' });
    onChanged(res.data);
  };

  const act = async (key: string, fn: () => Promise<{ data: PurchaseOrder | null; error: { message: string } | null }>, message: string) => {
    setBusy(key);
    setError(null);
    const res = await fn();
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Something went wrong'); return; }
    toast({ title: message, variant: 'success' });
    setReceiving(null);
    onChanged(res.data);
  };

  const startReceiving = () => {
    if (!order) return;
    setReceiving(Object.fromEntries(order.items.map(l => [l.itemId, { quantity: Math.max(l.quantity - l.receivedQuantity, 0), expiryDate: '' }])));
  };

  if (!order) {
    return (
      <Modal title="New purchase order" onClose={onClose} size="lg"
        footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy === 'create'} disabled={!supplierId || !lines.length}>Save draft</Button></>}>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Supplier">
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={selectClass}>
                <option value="">Choose…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Expected delivery"><Input type="date" value={expected} onChange={e => setExpected(e.target.value)} /></Field>
          </div>
          <div className="space-y-2">
            <span className="text-[13px] font-medium">Items</span>
            {lines.map((l, i) => {
              const it = stock.find(s => s.id === l.itemId);
              return (
                <div key={l.itemId} className="grid grid-cols-[1fr_90px_110px_auto] gap-2 items-center">
                  <div className="text-sm truncate">{it?.name} <span className="text-[12px] text-text-muted">({it?.currentStock} {it?.unit} now)</span></div>
                  <Input type="number" min={1} value={l.quantity} aria-label="Quantity" onChange={e => setLines(ls => ls.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
                  <Input type="number" min={0} step="0.01" value={l.unitPrice} aria-label="Price each" onChange={e => setLines(ls => ls.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} />
                  <button className="p-2 text-text-muted hover:text-error" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
            <select value="" onChange={e => addLine(e.target.value)} className={selectClass} aria-label="Add an item">
              <option value="">+ Add an item…</option>
              {forSupplier.filter(i => !lines.some(l => l.itemId === i.id)).map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.currentStock} {i.unit}{i.stockStatus !== 'ok' ? ', low' : ''})</option>
              ))}
            </select>
            <div className="text-right text-sm font-semibold">Total {formatCurrency(total)}</div>
          </div>
          <Field label="Notes for the supplier"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={textareaClass} /></Field>
          {error && <p className="text-[13px] text-error">{error}</p>}
        </div>
      </Modal>
    );
  }

  const openOrder = ['Draft', 'Sent', 'Partially Received'].includes(order.status);
  return (
    <Modal title={<span className="flex items-center gap-2">{order.poNumber} <POStatusBadge status={order.status} /></span>}
      subtitle={`${order.supplierName}${order.createdByName ? ` · by ${order.createdByName}` : ''}`} onClose={onClose} size="lg"
      footer={receiving ? <>
        <Button variant="ghost" onClick={() => setReceiving(null)}>Cancel</Button>
        <Button onClick={() => act('receive', () => receivePurchaseOrder(order.id, Object.entries(receiving).map(([itemId, r]: [string, { quantity: number; expiryDate: string }]) => ({ itemId, quantity: r.quantity, expiryDate: r.expiryDate || undefined }))), 'Stock updated')}
          loading={busy === 'receive'}><PackageCheck className="w-4 h-4" /> Add to stock</Button>
      </> : <>
        {canManage && openOrder && <Button variant="ghost" className="text-error mr-auto" onClick={() => act('cancel', () => cancelPurchaseOrder(order.id), 'Order cancelled')} loading={busy === 'cancel'}><Ban className="w-4 h-4" /> Cancel order</Button>}
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
        {canManage && order.status === 'Draft' && <Button onClick={() => act('send', () => sendPurchaseOrder(order.id), 'Marked as sent')} loading={busy === 'send'}><Send className="w-4 h-4" /> Mark as sent</Button>}
        {canManage && (order.status === 'Sent' || order.status === 'Partially Received') && <Button onClick={startReceiving}><PackageCheck className="w-4 h-4" /> Receive delivery</Button>}
      </>}>
      <article className="print-area p-5 sm:p-6 space-y-4">
        <div className="hidden print:block">
          <h2 className="text-lg font-semibold">Purchase order {order.poNumber}</h2>
          <p className="text-sm">{order.supplierName} {order.supplierEmail && `· ${order.supplierEmail}`} {order.supplierPhone && `· ${order.supplierPhone}`}</p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
          <div><dt className="text-text-muted">Created</dt><dd>{format(parseISO(order.createdAt), 'd MMM yyyy')}</dd></div>
          <div><dt className="text-text-muted">Sent</dt><dd>{order.sentAt ? format(parseISO(order.sentAt), 'd MMM yyyy') : '—'}</dd></div>
          <div><dt className="text-text-muted">Expected</dt><dd>{order.expectedDate ? format(parseISO(order.expectedDate), 'd MMM yyyy') : '—'}</dd></div>
          <div><dt className="text-text-muted">Received</dt><dd>{order.receivedAt ? format(parseISO(order.receivedAt), 'd MMM yyyy') : '—'}</dd></div>
        </dl>
        <table className="w-full text-sm">
          <thead className="text-[12px] text-text-muted text-left">
            <tr><th className="py-2 font-medium">Item</th><th className="font-medium text-right">Ordered</th><th className="font-medium text-right">Received</th><th className="font-medium text-right">Price</th><th className="font-medium text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.items.map(l => (
              <tr key={l.itemId}>
                <td className="py-2">{l.name}<div className="text-[12px] text-text-muted">{l.unit}</div></td>
                <td className="text-right tabular-nums">{l.quantity}</td>
                <td className="text-right tabular-nums">
                  {receiving ? (
                    <div className="flex flex-col items-end gap-1">
                      <Input type="number" min={0} className="w-20 text-right" value={receiving[l.itemId]?.quantity ?? 0} aria-label={`Received ${l.name}`}
                        onChange={e => setReceiving(r => ({ ...r!, [l.itemId]: { ...r![l.itemId], quantity: Number(e.target.value) } }))} />
                      <Input type="date" className="w-36" value={receiving[l.itemId]?.expiryDate ?? ''} aria-label={`Expiry for ${l.name}`}
                        onChange={e => setReceiving(r => ({ ...r!, [l.itemId]: { ...r![l.itemId], expiryDate: e.target.value } }))} />
                    </div>
                  ) : <span className={l.receivedQuantity >= l.quantity ? 'text-success' : ''}>{l.receivedQuantity}</span>}
                </td>
                <td className="text-right tabular-nums">{formatCurrency(l.unitPrice)}</td>
                <td className="text-right tabular-nums">{formatCurrency(l.unitPrice * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4} className="pt-3 text-right font-semibold">Total</td><td className="pt-3 text-right font-semibold tabular-nums">{formatCurrency(order.totalAmount)}</td></tr></tfoot>
        </table>
        {receiving && <p className="text-[12px] text-text-muted">Enter what actually arrived. Anything short stays on the order. Add an expiry date for medicines and materials.</p>}
        {order.notes && <p className="text-[13px]"><strong>Notes:</strong> {order.notes}</p>}
        {error && <p className="text-[13px] text-error">{error}</p>}
        {order.status === 'Draft' && canManage && (
          <p className="text-[12px] text-text-muted flex items-center gap-1"><Plus className="w-3 h-3" /> Send this to {order.supplierName}{order.supplierEmail ? ` (${order.supplierEmail})` : ''} by email or WhatsApp, then mark it as sent.</p>
        )}
      </article>
    </Modal>
  );
}

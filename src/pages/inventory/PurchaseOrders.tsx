import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { PackageCheck, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import { PurchaseOrderModal } from '../../components/inventory/PurchaseOrderModal';
import {
  createPOFromSuggestions, getPurchaseOrders, getReorderSuggestions, POStatus, PurchaseOrder, ReorderGroup,
} from '../../api/inventoryService';

const STATUS_VARIANT: Record<POStatus, 'outline' | 'secondary' | 'warning' | 'success' | 'error'> = {
  Draft: 'outline', Sent: 'secondary', 'Partially Received': 'warning', Received: 'success', Cancelled: 'outline',
};

export function POStatusBadge({ status }: { status: POStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
}

export function PurchaseOrders({ clinicId, onChanged }: { clinicId?: string; onChanged?: () => void }) {
  const { user, selectedClinicId } = useAuth();
  const canManage = user?.role !== 'dentist';
  const { formatCurrency } = useCurrency();
  const [suggestions, setSuggestions] = useState<ReorderGroup[] | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [open, setOpen] = useState<PurchaseOrder | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([getReorderSuggestions(clinicId), getPurchaseOrders({ clinicId })]);
    setSuggestions(s.data || []);
    setOrders(o.data || []);
  }, [clinicId]);
  useEffect(() => { load(); }, [load]);

  const fromSuggestion = async (g: ReorderGroup) => {
    if (!g.supplierId) return toast({ title: 'Set a supplier on these items first', variant: 'error' });
    setBusy(g.supplierId);
    const res = await createPOFromSuggestions(g.clinicId, g.supplierId);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not create the order', variant: 'error' });
    toast({ title: `Draft ${res.data.poNumber} created`, variant: 'success' });
    load();
    onChanged?.();
    setOpen(res.data);
  };

  const changed = () => { load(); onChanged?.(); };
  const open_ = orders?.filter(o => ['Draft', 'Sent', 'Partially Received'].includes(o.status)) || [];
  const closed = orders?.filter(o => !['Draft', 'Sent', 'Partially Received'].includes(o.status)) || [];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-[15px] font-semibold mr-auto">Needs reordering</h3>
        </div>
        {suggestions === null ? <Skeleton className="h-24 w-full" /> : suggestions.length === 0 ? (
          <p className="text-[13px] text-text-muted rounded-control border border-dashed border-line p-4">Everything is above its reorder level, or already on order.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {suggestions.map(g => (
              <div key={`${g.clinicId}-${g.supplierId}`} className="rounded-control border border-line p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold mr-auto">{g.supplierName || 'No supplier set'}</div>
                  {canManage && g.supplierId && (
                    <Button size="sm" onClick={() => fromSuggestion(g)} loading={busy === g.supplierId}><ShoppingCart className="w-4 h-4" /> Create order</Button>
                  )}
                </div>
                <ul className="text-[13px] space-y-1">
                  {g.items.map(i => (
                    <li key={i.itemId} className="flex justify-between gap-2">
                      <span className="truncate">{i.name} <span className="text-text-muted">({i.currentStock} left)</span></span>
                      <span className="text-text-muted whitespace-nowrap">order {i.suggestedQuantity} {i.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center">
          <h3 className="text-[15px] font-semibold mr-auto">Purchase orders</h3>
          {canManage && <Button size="sm" variant="outline" onClick={() => setOpen('new')} disabled={!clinicId && selectedClinicId === 'all' && user?.role === 'super_admin'}
            title={!clinicId && user?.role === 'super_admin' ? 'Pick a clinic at the top first' : undefined}><Plus className="w-4 h-4" /> New order</Button>}
        </div>
        {orders === null ? <Skeleton className="h-32 w-full" /> : orders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No purchase orders yet" description="Create one from the reorder list above, or start a new order." />
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {[...open_, ...closed].map(po => (
              <li key={po.id}>
                <button onClick={() => setOpen(po)} className="w-full text-left px-4 py-3 hover:bg-surface-hover flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="font-mono text-[13px] w-28">{po.poNumber}</span>
                  <span className="text-sm font-medium flex-1 min-w-[10rem]">{po.supplierName}</span>
                  <POStatusBadge status={po.status} />
                  <span className="text-[13px] text-text-muted w-40">
                    {po.items.length} {po.items.length === 1 ? 'item' : 'items'} · {formatCurrency(po.totalAmount)}
                  </span>
                  <span className="text-[12px] text-text-muted w-32">
                    {po.status === 'Received' && po.receivedAt ? <><PackageCheck className="w-3.5 h-3.5 inline" /> {format(parseISO(po.receivedAt), 'd MMM')}</> :
                      po.expectedDate ? `due ${format(parseISO(po.expectedDate), 'd MMM')}` : format(parseISO(po.createdAt), 'd MMM yyyy')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <PurchaseOrderModal order={open === 'new' ? null : open} clinicId={clinicId} onClose={() => setOpen(null)}
          onChanged={po => { changed(); setOpen(po); }} />
      )}
    </div>
  );
}

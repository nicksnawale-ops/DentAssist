import React, { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlertTriangle, Minus, Package, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { InventoryItemModal } from '../../components/inventory/InventoryItemModal';
import { CATEGORIES, getStockItems, recordStockMovement, StockItem } from '../../api/inventoryService';

export function StockBadge({ item }: { item: Pick<StockItem, 'stockStatus' | 'expiryStatus'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.stockStatus === 'out' ? <Badge variant="error">Out of stock</Badge> :
        item.stockStatus === 'low' ? <Badge variant="warning">Low</Badge> : <Badge variant="success">In stock</Badge>}
      {item.expiryStatus === 'expired' && <Badge variant="error">Expired</Badge>}
      {item.expiryStatus === 'soon' && <Badge variant="warning">Expiring soon</Badge>}
    </span>
  );
}

export function InventoryList({ clinicId, onChanged }: { clinicId?: string; onChanged?: () => void }) {
  const { user } = useAuth();
  const canManage = user?.role !== 'dentist';
  const [rows, setRows] = useState<StockItem[] | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<StockItem | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getStockItems({ clinicId, q: q || undefined, category, status: status || undefined });
    setRows(res.data || []);
  }, [clinicId, q, category, status]);

  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);

  const takeOne = async (item: StockItem) => {
    setBusy(item.id);
    const res = await recordStockMovement(item.id, { change: -1, type: 'usage', reason: 'Used' });
    setBusy(null);
    if (res.data) { setRows(r => (r || []).map(x => (x.id === item.id ? res.data! : x))); onChanged?.(); }
    else toast({ title: res.error?.message || 'Could not record', variant: 'error' });
  };

  const changed = (item: StockItem) => {
    setRows(r => {
      const list = r || [];
      return list.some(x => x.id === item.id) ? list.map(x => (x.id === item.id ? item : x)) : [item, ...list];
    });
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items" className="pl-9" aria-label="Search items" />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} className="h-10 px-3 rounded-control border border-line bg-surface text-sm" aria-label="Category">
          <option value="All">All categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="h-10 px-3 rounded-control border border-line bg-surface text-sm" aria-label="Stock level">
          <option value="">All stock levels</option>
          <option value="low">Low or out</option>
          <option value="out">Out of stock</option>
          <option value="expiring">Expired or expiring</option>
        </select>
        {canManage && <Button onClick={() => setOpen('new')}><Plus className="w-4 h-4" /> Add item</Button>}
      </div>

      {rows === null ? <div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div> :
        rows.length === 0 ? (
          <EmptyState icon={Package} title="No items match" description="Add the materials and medicines you stock to track usage and reorders."
            actionLabel={canManage ? 'Add item' : undefined} onAction={canManage ? () => setOpen('new') : undefined} />
        ) : (
          <div className="rounded-control border border-line overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_140px_150px_160px_120px] gap-3 px-4 py-2.5 bg-surface-hover text-[12px] font-medium text-text-muted">
              <span>Item</span><span>In stock</span><span>Status</span><span>Supplier</span><span className="text-right">Quick use</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map(item => (
                <li key={item.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_140px_150px_160px_120px] gap-x-3 gap-y-1 px-4 py-3 items-center hover:bg-surface-hover/60">
                  <button className="text-left min-w-0" onClick={() => setOpen(item)}>
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {item.name}
                      {item.expiryStatus && <AlertTriangle className={`w-3.5 h-3.5 ${item.expiryStatus === 'expired' ? 'text-error' : 'text-warning'}`} aria-label="Expiry warning" />}
                    </div>
                    <div className="text-[12px] text-text-muted">
                      {item.category}{item.expiryDate ? ` · expires ${format(parseISO(item.expiryDate), 'd MMM yyyy')}` : ''}
                      {item.lastRestockedAt ? ` · restocked ${formatDistanceToNowStrict(parseISO(item.lastRestockedAt))} ago` : ''}
                    </div>
                  </button>
                  <div className="text-right md:text-left">
                    <span className={`text-lg font-semibold tabular-nums ${item.stockStatus !== 'ok' ? 'text-error' : ''}`}>{item.currentStock}</span>
                    <span className="text-[12px] text-text-muted ml-1">{item.unit}</span>
                    <div className="text-[11px] text-text-muted">reorder at {item.reorderThreshold}</div>
                  </div>
                  <div className="col-span-2 md:col-span-1"><StockBadge item={item} /></div>
                  <div className="hidden md:block text-[13px] text-text-muted truncate">{item.supplierName || '—'}</div>
                  <div className="hidden md:flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => takeOne(item)} disabled={item.currentStock <= 0} loading={busy === item.id} aria-label={`Use one ${item.name}`}>
                      <Minus className="w-3.5 h-3.5" /> Use 1
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

      {open && (
        <InventoryItemModal item={open === 'new' ? null : open} clinicId={clinicId} onClose={() => setOpen(null)}
          onSaved={item => { changed(item); if (open === 'new') setOpen(item); }} />
      )}
    </div>
  );
}

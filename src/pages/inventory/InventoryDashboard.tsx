import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, FlaskConical, Package, ShoppingCart, Truck, PackageCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatTile } from '../../components/ui/StatTile';
import { useAuth } from '../../context/AuthContext';
import { getInventorySummary, InventorySummary } from '../../api/inventoryService';
import { InventoryList } from './InventoryList';
import { PurchaseOrders } from './PurchaseOrders';
import { SuppliersList } from './SuppliersList';
import { LabOrdersList } from '../lab/LabOrdersList';
import { useCurrency } from '../../utils/currencyConfig';

type Tab = 'stock' | 'orders' | 'lab' | 'suppliers';
const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'stock', label: 'Stock', icon: Package },
  { key: 'orders', label: 'Reorder & purchase orders', icon: ShoppingCart },
  { key: 'lab', label: 'Lab cases', icon: FlaskConical },
  { key: 'suppliers', label: 'Suppliers & labs', icon: Truck },
];

export function InventoryDashboard() {
  const { selectedClinicId, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'stock';
  const setTab = (t: Tab) => { params.set('tab', t); setParams(params, { replace: true }); };
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const { formatCurrency } = useCurrency();
  const clinicId = selectedClinicId === 'all' ? undefined : selectedClinicId;

  const refresh = useCallback(() => { getInventorySummary(clinicId).then(r => r.data && setSummary(r.data)); }, [clinicId]);
  useEffect(() => { refresh(); }, [refresh]);

  const s = summary;
  return (
    <div className="space-y-5">
      <PageHeader title="Inventory & lab" description="Stock levels, reorders, deliveries and lab cases in one place." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button className="text-left" onClick={() => setTab('stock')}>
          <StatTile label="Low or out of stock" value={s ? s.lowStock + s.outOfStock : '–'} icon={AlertTriangle} tone={s && s.lowStock + s.outOfStock ? 'error' : undefined} />
        </button>
        <button className="text-left" onClick={() => setTab('stock')}>
          <StatTile label="Expired or expiring in 30 days" value={s ? s.expired + s.expiringSoon : '–'} icon={CalendarClock} tone={s && s.expired ? 'error' : s?.expiringSoon ? 'warning' : undefined} />
        </button>
        <button className="text-left" onClick={() => setTab('lab')}>
          <StatTile label="Lab cases overdue" value={s ? s.labCasesOverdue : '–'} icon={FlaskConical} tone={s?.labCasesOverdue ? 'warning' : undefined} />
        </button>
        <button className="text-left" onClick={() => setTab('lab')}>
          <StatTile label="Lab work ready to fit" value={s ? s.labCasesReadyToFit : '–'} icon={PackageCheck} tone={s?.labCasesReadyToFit ? 'accent' : undefined} />
        </button>
      </div>
      {s && (
        <p className="text-[12px] text-text-muted -mt-2">
          {s.totalItems} items · stock value {formatCurrency(s.stockValue)} · {s.openPurchaseOrders} open purchase {s.openPurchaseOrders === 1 ? 'order' : 'orders'} · {s.labCasesAtLab} cases at the lab
        </p>
      )}

      <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
        <div className="border-b border-line px-2 sm:px-4 flex gap-1 overflow-x-auto scrollbar-hide" role="tablist">
          {TABS.filter(t => t.key !== 'suppliers' || user?.role !== 'dentist').map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`h-12 px-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px flex items-center gap-2 ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          {tab === 'stock' && <InventoryList clinicId={clinicId} onChanged={refresh} />}
          {tab === 'orders' && <PurchaseOrders clinicId={clinicId} onChanged={refresh} />}
          {tab === 'lab' && <LabOrdersList clinicId={clinicId} onChanged={refresh} />}
          {tab === 'suppliers' && <SuppliersList />}
        </div>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';
import { Search, Plus, FileText, ChevronRight } from 'lucide-react';
import { Invoice, InvoiceStatus } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { CreateInvoiceModal } from '../../components/billing/CreateInvoiceModal';
import { InvoicePreviewModal } from '../../components/billing/InvoicePreviewModal';
import { InvoiceStatusBadge } from '../../components/billing/InvoiceStatusBadge';
import { getInvoices } from '../../api/billingService';
import { formatCurrency } from '../../utils/currencyConfig';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'Sent,Partially Paid,Overdue', label: 'Unpaid' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Draft', label: 'Drafts' },
  { value: 'Paid', label: 'Paid' },
];

export function InvoicesList() {
  const { selectedClinicId, user } = useAuth();
  const canBill = user?.role !== 'dentist';

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState<'all' | 'this_month' | 'last_month'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const range = period === 'this_month'
      ? { from: startOfMonth(now).toISOString() }
      : period === 'last_month'
        ? { from: startOfMonth(subMonths(now, 1)).toISOString(), to: startOfMonth(now).toISOString() }
        : {};
    const res = await getInvoices({ clinicId: selectedClinicId, status: status || undefined, search: debounced || undefined, ...range });
    setInvoices(res.data || []);
    setError(res.error?.message || null);
    setLoading(false);
  }, [selectedClinicId, status, debounced, period]);

  useEffect(() => { load(); }, [load]);

  const outstanding = invoices
    .filter(i => ['Sent', 'Partially Paid', 'Overdue'].includes(i.status))
    .reduce((s, i) => s + (i.balanceDue ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            placeholder="Invoice number, patient name or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-3 bg-surface border border-line rounded-control text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
            aria-label="Search invoices"
          />
        </div>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value as typeof period)}
          className="h-10 px-3 bg-surface border border-line rounded-control text-sm focus:outline-none focus:border-accent"
          aria-label="Period"
        >
          <option value="all">Any date</option>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
        </select>
        {canBill && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> New invoice
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.label}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={`shrink-0 h-8 px-3 rounded-full text-[13px] font-medium border transition-colors ${
                status === f.value ? 'bg-primary text-white border-primary' : 'bg-surface text-text-main border-line hover:border-text-muted/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {outstanding > 0 && (
          <div className="hidden sm:block text-[13px] text-text-muted shrink-0">
            Unpaid in view: <span className="font-semibold text-text-main tabular">{formatCurrency(outstanding)}</span>
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading && invoices.length === 0 ? (
          <div className="divide-y divide-line">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="px-5 py-4 flex gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-20" /></div>
            ))}
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-error">{error}</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={debounced || status || period !== 'all' ? 'No invoices match' : 'No invoices yet'}
            description={debounced || status || period !== 'all' ? 'Try another search or filter.' : 'Invoices you create will appear here.'}
            actionLabel={canBill ? 'New invoice' : undefined}
            onAction={canBill ? () => setShowCreate(true) : undefined}
          />
        ) : (
          <>
            {/* Desktop */}
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
                <tr>
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Patient</th>
                  <th className="px-5 py-3 font-medium">Issued</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Balance</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map(inv => (
                  <tr
                    key={inv.id}
                    tabIndex={0}
                    onClick={() => setOpenId(inv.id)}
                    onKeyDown={e => { if (e.key === 'Enter') setOpenId(inv.id); }}
                    className="cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                  >
                    <td className="px-5 py-3.5 font-medium text-text-main whitespace-nowrap">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5">
                      <div className="text-text-main">{inv.patientName || '—'}</div>
                      <div className="text-xs text-text-muted">{inv.patientPhone}</div>
                    </td>
                    <td className="px-5 py-3.5 text-text-muted whitespace-nowrap">{format(parseISO(inv.createdAt), 'd MMM yyyy')}</td>
                    <td className="px-5 py-3.5 text-text-muted whitespace-nowrap">{format(parseISO(inv.dueDate), 'd MMM yyyy')}</td>
                    <td className="px-5 py-3.5 text-right text-text-main whitespace-nowrap">{formatCurrency(inv.total)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-text-main whitespace-nowrap">
                      {inv.status === 'Void' ? '—' : formatCurrency(inv.balanceDue ?? 0)}
                    </td>
                    <td className="px-5 py-3.5"><InvoiceStatusBadge status={inv.status as InvoiceStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phones */}
            <ul className="md:hidden divide-y divide-line">
              {invoices.map(inv => (
                <li key={inv.id}>
                  <button onClick={() => setOpenId(inv.id)} className="w-full text-left px-4 py-3.5 flex items-center gap-3 active:bg-surface-hover">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-medium text-text-main truncate">{inv.patientName || inv.invoiceNumber}</span>
                        <span className="text-[15px] font-semibold text-text-main tabular shrink-0">
                          {formatCurrency(inv.status === 'Paid' || inv.status === 'Void' ? inv.total : inv.balanceDue ?? inv.total)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[13px] text-text-muted truncate">{inv.invoiceNumber}, due {format(parseISO(inv.dueDate), 'd MMM')}</span>
                        <InvoiceStatusBadge status={inv.status as InvoiceStatus} />
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {showCreate && (
        <CreateInvoiceModal
          onClose={() => setShowCreate(false)}
          onCreated={inv => {
            setShowCreate(false);
            load();
            setOpenId(inv.id);
          }}
        />
      )}

      {openId && <InvoicePreviewModal invoiceId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

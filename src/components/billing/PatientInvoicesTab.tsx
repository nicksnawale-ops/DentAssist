import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, FileText, ChevronRight } from 'lucide-react';
import { Invoice } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { getInvoices } from '../../api/billingService';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/currencyConfig';

/** Invoices for one patient, shown on their profile. */
export function PatientInvoicesTab({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const canBill = user?.role !== 'dentist';
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getInvoices({ patientId });
    setInvoices(res.data || []);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const balance = invoices.reduce((s, i) => s + (['Sent', 'Partially Paid', 'Overdue'].includes(i.status) ? i.balanceDue ?? 0 : 0), 0);
  const paid = invoices.reduce((s, i) => s + (i.amountPaid ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-6 text-sm">
          <div><div className="text-text-muted text-[13px]">Balance due</div><div className={`text-lg font-semibold tabular ${balance > 0 ? 'text-error' : 'text-text-main'}`}>{formatCurrency(balance)}</div></div>
          <div><div className="text-text-muted text-[13px]">Paid to date</div><div className="text-lg font-semibold tabular text-text-main">{formatCurrency(paid)}</div></div>
        </div>
        {canBill && (
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> New invoice</Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-text-muted">Loading invoices…</p>
        ) : invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices yet" description="Invoices for this patient will appear here."
            actionLabel={canBill ? 'New invoice' : undefined} onAction={canBill ? () => setShowCreate(true) : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map(inv => (
              <li key={inv.id}>
                <button onClick={() => setOpenId(inv.id)} className="w-full text-left px-4 sm:px-5 py-3.5 flex items-center gap-4 hover:bg-surface-hover">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-text-main">{inv.invoiceNumber}</div>
                    <div className="text-[13px] text-text-muted truncate">
                      {format(parseISO(inv.createdAt), 'd MMM yyyy')}, {inv.lineItems.map(l => l.procedureName).join(', ')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-semibold tabular text-text-main">{formatCurrency(inv.total)}</div>
                    <InvoiceStatusBadge status={inv.status} />
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateInvoiceModal
          initialPatientId={patientId}
          onClose={() => setShowCreate(false)}
          onCreated={inv => { setShowCreate(false); load(); setOpenId(inv.id); }}
        />
      )}
      {openId && <InvoicePreviewModal invoiceId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

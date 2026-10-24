import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronRight, Receipt, Smartphone } from 'lucide-react';
import { Invoice } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../components/ui/useToast';
import { InvoicePreviewModal } from '../../components/billing/InvoicePreviewModal';
import { InvoiceStatusBadge } from '../../components/billing/InvoiceStatusBadge';
import { getMyInvoices, getPaymentConfig } from '../../api/billingService';
import { payInvoiceOnline } from '../../lib/razorpay';
import { formatCurrency } from '../../utils/currencyConfig';

/** Patient portal: my bills, with online payment when the clinic has it switched on. */
export function PatientBills() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getMyInvoices();
    setInvoices(res.data || []);
    setError(res.error?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    getPaymentConfig().then(r => setOnlineEnabled(!!r.data?.onlinePaymentsEnabled));
  }, [load]);

  const unpaid = invoices.filter(i => ['Sent', 'Partially Paid', 'Overdue'].includes(i.status) && (i.balanceDue ?? 0) > 0);
  const others = invoices.filter(i => !unpaid.includes(i));
  const totalDue = unpaid.reduce((s, i) => s + (i.balanceDue ?? 0), 0);

  const pay = async (inv: Invoice) => {
    setPaying(inv.id);
    const result = await payInvoiceOnline(inv.id);
    setPaying(null);
    if (result.status === 'paid') {
      toast({ title: 'Payment received. Thank you!', variant: 'success' });
      load();
    } else if (result.status === 'failed') {
      toast({ title: 'Payment not completed', description: result.error.message, variant: 'error' });
    }
  };

  const row = (inv: Invoice, showPay: boolean) => (
    <li key={inv.id} className="px-4 sm:px-5 py-4 flex items-center gap-3">
      <button onClick={() => setOpenId(inv.id)} className="flex-1 min-w-0 text-left">
        <div className="text-[15px] font-medium text-text-main truncate">{inv.lineItems.map(l => l.procedureName).join(', ')}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-text-muted">
          <span>{format(parseISO(inv.sentAt || inv.createdAt), 'd MMM yyyy')}</span>
          <InvoiceStatusBadge status={inv.status} />
        </div>
      </button>
      <div className="text-right shrink-0">
        <div className="text-[15px] font-semibold tabular">{formatCurrency(showPay ? inv.balanceDue ?? 0 : inv.total)}</div>
        {showPay && <div className="text-xs text-text-muted">due {format(parseISO(inv.dueDate), 'd MMM')}</div>}
      </div>
      {showPay && onlineEnabled ? (
        <Button size="sm" onClick={() => pay(inv)} loading={paying === inv.id}>Pay</Button>
      ) : (
        <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
      )}
    </li>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Bills" description="Your invoices and payments." />

      {loading ? <Card className="p-6 text-sm text-text-muted">Loading your bills…</Card> : error ? (
        <Card className="p-6 text-sm text-error">{error}</Card>
      ) : invoices.length === 0 ? (
        <Card><EmptyState icon={Receipt} title="No bills yet" description="Invoices from your clinic will appear here." /></Card>
      ) : (
        <div className="space-y-6">
          {unpaid.length > 0 && (
            <section>
              <Card className="p-5 mb-3 bg-ink text-white border-none">
                <div className="text-sm text-white/65">Total to pay</div>
                <div className="text-[30px] font-semibold tabular leading-tight">{formatCurrency(totalDue)}</div>
                {onlineEnabled ? (
                  <p className="mt-1 text-sm text-white/70 flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Pay securely by UPI, card or net banking.</p>
                ) : (
                  <p className="mt-1 text-sm text-white/70">Please pay at the clinic reception.</p>
                )}
              </Card>
              <Card className="overflow-hidden"><ul className="divide-y divide-line">{unpaid.map(i => row(i, true))}</ul></Card>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="text-[15px] font-semibold text-text-main mb-2">Paid and past bills</h2>
              <Card className="overflow-hidden"><ul className="divide-y divide-line">{others.map(i => row(i, false))}</ul></Card>
            </section>
          )}
        </div>
      )}

      {openId && <InvoicePreviewModal invoiceId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

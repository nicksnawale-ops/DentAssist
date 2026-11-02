import React, { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { addMonths, format, parseISO } from 'date-fns';
import { X, Printer, Send, IndianRupee, Smartphone, CalendarClock, ShieldCheck, Ban, CheckCircle2, MessageCircle } from 'lucide-react';
import { Clinic, InvoiceDetail, PaymentMethod } from '../../types';
import { Button } from '../ui/Button';
import { sendInvoiceOnWhatsApp } from '../../api/messagingService';
import { Skeleton } from '../ui/Skeleton';
import { useToast } from '../ui/useToast';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { getClinicById } from '../../api/apiService';
import {
  createClaim, getInvoice, getPaymentConfig, recordPayment, sendInvoice, setInstallments, voidInvoice,
} from '../../api/billingService';
import { payInvoiceOnline } from '../../lib/razorpay';
import { formatCurrency } from '../../utils/currencyConfig';

interface InvoicePreviewModalProps {
  invoiceId: string;
  onClose: () => void;
  /** Called after anything that changes the invoice (payment, issue, void...). */
  onChanged?: () => void;
}

type Panel = 'payment' | 'plan' | 'claim' | 'void' | null;

const METHODS: PaymentMethod[] = ['UPI', 'Cash', 'Card', 'Bank Transfer', 'Cheque'];

export function InvoicePreviewModal({ invoiceId, onClose, onChanged }: InvoicePreviewModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isPatient = user?.role === 'patient';
  const canBill = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'receptionist';
  const canVoid = user?.role === 'super_admin' || user?.role === 'admin';

  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineEnabled, setOnlineEnabled] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  // Panel form state
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [reference, setReference] = useState('');
  const [planCount, setPlanCount] = useState(3);
  const [planStart, setPlanStart] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [insurer, setInsurer] = useState('');
  const [policy, setPolicy] = useState('');
  const [claimAmount, setClaimAmount] = useState(0);
  const [voidReason, setVoidReason] = useState('');

  const load = useCallback(async () => {
    const res = await getInvoice(invoiceId);
    if (res.data) {
      setInv(res.data);
      setAmount(res.data.balanceDue ?? 0);
      setClaimAmount(res.data.balanceDue ?? res.data.total);
      if (!isPatient && !clinic) getClinicById(res.data.clinicId).then(r => r.data && setClinic(r.data));
    } else {
      setError(res.error?.message || 'This invoice could not be loaded.');
    }
  }, [invoiceId, isPatient, clinic]);

  useEffect(() => {
    load();
    getPaymentConfig().then(r => setOnlineEnabled(!!r.data?.onlinePaymentsEnabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const applied = (updated: InvoiceDetail | null, message?: string) => {
    if (updated) {
      setInv(updated);
      setAmount(updated.balanceDue ?? 0);
      setPanel(null);
      setPanelError(null);
      onChanged?.();
      if (message) toast({ title: message, variant: 'success' });
    }
  };

  const run = async (key: string, fn: () => Promise<{ data: InvoiceDetail | null; error: { message: string } | null }>, message: string) => {
    setBusy(key);
    setPanelError(null);
    const res = await fn();
    setBusy(null);
    if (res.data) applied(res.data, message);
    else setPanelError(res.error?.message || 'Something went wrong. Try again.');
  };

  const whatsapp = async () => {
    if (!inv) return;
    setBusy('whatsapp');
    const res = await sendInvoiceOnWhatsApp(inv.id);
    setBusy(null);
    if (res.error || !res.data) toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    else toast({ title: res.data.detail, variant: res.data.status === 'sent' ? 'success' : 'error' });
  };

  const payOnline = async () => {
    if (!inv) return;
    setBusy('online');
    setPanelError(null);
    const result = await payInvoiceOnline(inv.id);
    setBusy(null);
    if (result.status === 'paid') applied(result.invoice, 'Payment received. Thank you!');
    else if (result.status === 'failed') setPanelError(result.error.message);
  };

  const balance = inv?.balanceDue ?? 0;
  const issued = inv && !['Draft', 'Void'].includes(inv.status);

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 print:hidden" />
        <Dialog.Content className="fixed z-50 inset-x-0 bottom-0 top-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-3xl sm:max-h-[92vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col print:static print:translate-x-0 print:translate-y-0 print:max-h-none print:shadow-none print:rounded-none">
          <div className="flex items-center gap-3 px-5 sm:px-6 h-14 border-b border-line shrink-0 print:hidden">
            <Dialog.Title className="text-[17px] font-semibold text-text-main flex-1 truncate">
              {inv ? `Invoice ${inv.invoiceNumber}` : 'Invoice'}
            </Dialog.Title>
            {inv && <InvoiceStatusBadge status={inv.status} />}
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-base" aria-label="Close">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          {!inv ? (
            <div className="p-6 space-y-3">
              {error ? <p className="text-sm text-error">{error}</p> : (<><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></>)}
            </div>
          ) : (
            <>
              {/* Actions */}
              <div className="px-5 sm:px-6 py-3 border-b border-line flex flex-wrap gap-2 shrink-0 print:hidden">
                {canBill && inv.status === 'Draft' && (
                  <Button size="sm" onClick={() => run('send', () => sendInvoice(inv.id), 'Invoice issued')} loading={busy === 'send'}>
                    <Send className="w-4 h-4" /> Issue to patient
                  </Button>
                )}
                {canBill && issued && inv.status !== 'Void' && (
                  <Button size="sm" variant="outline" onClick={whatsapp} loading={busy === 'whatsapp'}>
                    <MessageCircle className="w-4 h-4" /> Send on WhatsApp
                  </Button>
                )}
                {issued && balance > 0 && onlineEnabled && (
                  <Button size="sm" variant={isPatient ? 'default' : 'outline'} onClick={payOnline} loading={busy === 'online'}>
                    <Smartphone className="w-4 h-4" /> {isPatient ? `Pay ${formatCurrency(balance)}` : 'Collect by UPI / card'}
                  </Button>
                )}
                {canBill && issued && balance > 0 && (
                  <Button size="sm" variant={panel === 'payment' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'payment' ? null : 'payment')}>
                    <IndianRupee className="w-4 h-4" /> Record payment
                  </Button>
                )}
                {canBill && issued && balance > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'plan' ? null : 'plan')}>
                    <CalendarClock className="w-4 h-4" /> Payment plan
                  </Button>
                )}
                {canBill && issued && (
                  <Button size="sm" variant="outline" onClick={() => setPanel(panel === 'claim' ? null : 'claim')}>
                    <ShieldCheck className="w-4 h-4" /> Insurance claim
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                {canVoid && inv.status !== 'Void' && (inv.amountPaid ?? 0) === 0 && (
                  <Button size="sm" variant="ghost" className="text-error hover:bg-error/5" onClick={() => setPanel(panel === 'void' ? null : 'void')}>
                    <Ban className="w-4 h-4" /> Void
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Action panels */}
                {panel && (
                  <div className="mx-5 sm:mx-6 mt-4 rounded-control border border-line bg-surface-hover p-4 print:hidden">
                    {panel === 'payment' && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                        <Field label="Amount">
                          <input type="number" min={1} max={balance} value={amount} onChange={e => setAmount(Number(e.target.value) || 0)} className={inputCls} />
                        </Field>
                        <Field label="Method">
                          <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                            {METHODS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </Field>
                        <Field label="Reference (optional)">
                          <input value={reference} onChange={e => setReference(e.target.value)} placeholder="UPI / card ref" className={inputCls} />
                        </Field>
                        <Button onClick={() => run('pay', () => recordPayment(inv.id, { amount, method, referenceNumber: reference || undefined }), `${formatCurrency(amount)} recorded`)} loading={busy === 'pay'} disabled={amount <= 0}>
                          Save payment
                        </Button>
                      </div>
                    )}
                    {panel === 'plan' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <Field label="Number of payments">
                          <select value={planCount} onChange={e => setPlanCount(Number(e.target.value))} className={inputCls}>
                            {[2, 3, 4, 6, 9, 12].map(n => <option key={n} value={n}>{n} monthly payments</option>)}
                          </select>
                        </Field>
                        <Field label="First payment due">
                          <input type="date" value={planStart} onChange={e => setPlanStart(e.target.value)} className={inputCls} />
                        </Field>
                        <Button onClick={() => run('plan', () => setInstallments(inv.id, { count: planCount, firstDueDate: new Date(`${planStart}T23:59:00`).toISOString() }), 'Payment plan saved')} loading={busy === 'plan'}>
                          Save plan
                        </Button>
                        <p className="sm:col-span-3 text-[13px] text-text-muted">About {formatCurrency(Math.round(inv.total / planCount))} each. Payments are applied to the plan in order.</p>
                      </div>
                    )}
                    {panel === 'claim' && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                        <Field label="Insurer">
                          <input value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="e.g. Star Health" className={inputCls} />
                        </Field>
                        <Field label="Policy number">
                          <input value={policy} onChange={e => setPolicy(e.target.value)} className={inputCls} />
                        </Field>
                        <Field label="Claim amount">
                          <input type="number" min={1} value={claimAmount} onChange={e => setClaimAmount(Number(e.target.value) || 0)} className={inputCls} />
                        </Field>
                        <Button
                          onClick={async () => {
                            setBusy('claim');
                            setPanelError(null);
                            const res = await createClaim({ invoiceId: inv.id, providerName: insurer, policyNumber: policy || undefined, claimAmount });
                            setBusy(null);
                            if (res.data) { setPanel(null); load(); onChanged?.(); toast({ title: 'Claim filed', variant: 'success' }); }
                            else setPanelError(res.error?.message || 'The claim could not be filed.');
                          }}
                          loading={busy === 'claim'}
                          disabled={!insurer.trim() || claimAmount <= 0}
                        >
                          File claim
                        </Button>
                      </div>
                    )}
                    {panel === 'void' && (
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                        <div className="sm:col-span-3">
                          <Field label="Why is this invoice being voided?">
                            <input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="e.g. Raised for the wrong patient" className={inputCls} />
                          </Field>
                        </div>
                        <Button variant="danger" onClick={() => run('void', () => voidInvoice(inv.id, voidReason), 'Invoice voided')} loading={busy === 'void'} disabled={voidReason.trim().length < 3}>
                          Void invoice
                        </Button>
                      </div>
                    )}
                    {panelError && <p role="alert" className="mt-3 text-sm text-error">{panelError}</p>}
                  </div>
                )}
                {!panel && panelError && <p role="alert" className="mx-5 sm:mx-6 mt-4 text-sm text-error print:hidden">{panelError}</p>}

                {/* Printable invoice */}
                <article className="print-area px-5 sm:px-8 py-6 text-text-main">
                  <header className="flex flex-col sm:flex-row sm:justify-between gap-4 pb-5 border-b border-line">
                    <div>
                      <div className="text-lg font-semibold">{clinic?.name || 'DentAssist clinic'}</div>
                      {clinic?.address && (
                        <div className="text-[13px] text-text-muted">
                          {[clinic.address.street, clinic.address.city, clinic.address.state, clinic.address.pincode].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {clinic?.phone && <div className="text-[13px] text-text-muted">{clinic.phone}</div>}
                    </div>
                    <div className="sm:text-right">
                      <div className="text-lg font-semibold">Invoice {inv.invoiceNumber}</div>
                      <div className="text-[13px] text-text-muted">Issued {format(parseISO(inv.sentAt || inv.createdAt), 'd MMM yyyy')}</div>
                      <div className="text-[13px] text-text-muted">Due {format(parseISO(inv.dueDate), 'd MMM yyyy')}</div>
                    </div>
                  </header>

                  <div className="py-4 text-sm">
                    <div className="text-text-muted text-[13px]">Billed to</div>
                    <div className="font-medium">{inv.patientName}</div>
                    {inv.patientPhone && <div className="text-text-muted">{inv.patientPhone}</div>}
                  </div>

                  <table className="w-full text-sm">
                    <thead className="text-[13px] text-text-muted border-b border-line">
                      <tr>
                        <th className="py-2 text-left font-medium">Treatment</th>
                        <th className="py-2 text-right font-medium w-14">Qty</th>
                        <th className="py-2 text-right font-medium w-28">Price</th>
                        <th className="py-2 text-right font-medium w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {inv.lineItems.map(li => (
                        <tr key={li.id}>
                          <td className="py-2.5 pr-2">
                            {li.procedureName}
                            {li.toothNumber && <span className="text-text-muted">, tooth {li.toothNumber}</span>}
                            {li.taxable && <span className="ml-1.5 text-[11px] text-text-muted">(GST)</span>}
                          </td>
                          <td className="py-2.5 text-right">{li.quantity}</td>
                          <td className="py-2.5 text-right">{formatCurrency(li.unitCost)}</td>
                          <td className="py-2.5 text-right">{formatCurrency(li.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <dl className="mt-4 ml-auto max-w-xs grid grid-cols-2 gap-y-1 text-sm">
                    <dt className="text-text-muted">Subtotal</dt><dd className="text-right tabular">{formatCurrency(inv.subtotal)}</dd>
                    {(inv.discountAmount ?? 0) > 0 && (<><dt className="text-text-muted">Discount</dt><dd className="text-right tabular">−{formatCurrency(inv.discountAmount!)}</dd></>)}
                    {inv.taxBreakdown.cgst > 0 && (<><dt className="text-text-muted">CGST</dt><dd className="text-right tabular">{formatCurrency(inv.taxBreakdown.cgst)}</dd></>)}
                    {inv.taxBreakdown.sgst > 0 && (<><dt className="text-text-muted">SGST</dt><dd className="text-right tabular">{formatCurrency(inv.taxBreakdown.sgst)}</dd></>)}
                    {inv.taxBreakdown.igst > 0 && (<><dt className="text-text-muted">IGST</dt><dd className="text-right tabular">{formatCurrency(inv.taxBreakdown.igst)}</dd></>)}
                    <dt className="font-semibold pt-1 border-t border-line">Total</dt>
                    <dd className="text-right font-semibold pt-1 border-t border-line tabular">{formatCurrency(inv.total)}</dd>
                    {(inv.amountPaid ?? 0) > 0 && (<><dt className="text-text-muted">Paid</dt><dd className="text-right tabular">{formatCurrency(inv.amountPaid!)}</dd></>)}
                    {inv.status !== 'Void' && (<><dt className="font-semibold">Balance due</dt><dd className="text-right font-semibold tabular">{formatCurrency(balance)}</dd></>)}
                  </dl>

                  {inv.notes && <p className="mt-5 text-sm text-text-muted">{inv.notes}</p>}
                  {inv.status === 'Void' && <p className="mt-5 text-sm text-error">Voided{inv.voidReason ? `: ${inv.voidReason}` : ''}</p>}

                  {inv.installments.length > 0 && (
                    <section className="mt-6">
                      <h3 className="text-sm font-semibold mb-2">Payment plan</h3>
                      <ul className="divide-y divide-line border border-line rounded-control">
                        {inv.installments.map(i => (
                          <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span>Payment {i.installmentNumber}, due {format(parseISO(i.dueDate), 'd MMM yyyy')}</span>
                            <span className="flex items-center gap-3">
                              <span className="tabular">{formatCurrency(i.amount)}</span>
                              <span className={`text-xs font-medium ${i.status === 'Paid' ? 'text-success' : i.status === 'Overdue' ? 'text-error' : 'text-text-muted'}`}>{i.status}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {inv.payments.length > 0 && (
                    <section className="mt-6">
                      <h3 className="text-sm font-semibold mb-2">Payments received</h3>
                      <ul className="divide-y divide-line border border-line rounded-control">
                        {inv.payments.map(p => (
                          <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
                              {format(parseISO(p.paidAt), 'd MMM yyyy')}, {p.method}
                              {p.referenceNumber && <span className="text-text-muted">({p.referenceNumber})</span>}
                            </span>
                            <span className="tabular">{formatCurrency(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {inv.claims.length > 0 && !isPatient && (
                    <section className="mt-6 print:hidden">
                      <h3 className="text-sm font-semibold mb-2">Insurance</h3>
                      <ul className="divide-y divide-line border border-line rounded-control">
                        {inv.claims.map(c => (
                          <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span>{c.providerName}{c.policyNumber ? `, policy ${c.policyNumber}` : ''}</span>
                            <span className="flex items-center gap-3">
                              <span className="tabular">{formatCurrency(c.approvedAmount ?? c.claimAmount)}</span>
                              <span className="text-xs font-medium text-text-muted">{c.status}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </article>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputCls = 'w-full h-10 px-3 bg-surface border border-line rounded-control text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

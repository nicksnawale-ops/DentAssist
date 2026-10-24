import React, { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { addDays, format } from 'date-fns';
import { Plus, Trash2, X, Search } from 'lucide-react';
import { InvoiceDetail, InvoiceLineItem, Patient, Procedure } from '../../types';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { getPatientById, getPatients } from '../../api/apiService';
import { computeTotals, createInvoice, getPaymentConfig, getProcedures } from '../../api/billingService';
import { formatCurrency } from '../../utils/currencyConfig';

type Line = Pick<InvoiceLineItem, 'procedureId' | 'procedureName' | 'toothNumber' | 'quantity' | 'unitCost' | 'taxable'> & { key: string };

interface CreateInvoiceModalProps {
  onClose: () => void;
  onCreated: (invoice: InvoiceDetail) => void;
  initialPatientId?: string;
  initialTreatmentPlanId?: string;
  /** Pre-filled lines, e.g. from an approved treatment plan. */
  initialLines?: Omit<Line, 'key'>[];
}

const blankLine = (): Line => ({ key: Math.random().toString(36).slice(2), procedureName: '', quantity: 1, unitCost: 0, taxable: false });

export function CreateInvoiceModal({ onClose, onCreated, initialPatientId, initialTreatmentPlanId, initialLines }: CreateInvoiceModalProps) {
  const { selectedClinicId } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [taxRate, setTaxRate] = useState(18);
  const [lines, setLines] = useState<Line[]>(
    initialLines?.length ? initialLines.map(l => ({ ...l, key: Math.random().toString(36).slice(2) })) : [blankLine()],
  );
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [interState, setInterState] = useState(false);
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState<'draft' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProcedures().then(r => setProcedures(r.data || []));
    getPaymentConfig().then(r => r.data && setTaxRate(r.data.defaultGstRate));
    if (initialPatientId) getPatientById(initialPatientId).then(r => r.data && setPatient(r.data));
  }, [initialPatientId]);

  // Patient search
  useEffect(() => {
    if (patient || patientQuery.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(() => {
      getPatients({ search: patientQuery.trim() }).then(r => setPatientResults((r.data || []).slice(0, 8)));
    }, 250);
    return () => clearTimeout(t);
  }, [patientQuery, patient]);

  const byName = useMemo(() => new Map(procedures.map(p => [p.name.toLowerCase(), p])), [procedures]);
  const valid = lines.filter(l => l.procedureName.trim());
  const totals = computeTotals(valid, discount, discountType, taxRate, interState);

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const onProcedureName = (key: string, name: string) => {
    const match = byName.get(name.trim().toLowerCase());
    updateLine(key, match
      ? { procedureName: match.name, procedureId: match.id, unitCost: match.defaultCost, taxable: !!match.gstApplicable }
      : { procedureName: name, procedureId: undefined });
  };

  const save = async (send: boolean) => {
    setError(null);
    if (!patient) return setError('Choose the patient this invoice is for.');
    if (valid.length === 0) return setError('Add at least one treatment or item.');
    setSaving(send ? 'send' : 'draft');
    const res = await createInvoice({
      patientId: patient.id,
      clinicId: selectedClinicId !== 'all' ? selectedClinicId : undefined,
      treatmentPlanId: initialTreatmentPlanId,
      lineItems: valid.map(({ key, ...l }) => ({ ...l, toothNumber: l.toothNumber || undefined })),
      discount,
      discountType,
      taxRate,
      interState,
      dueDate: new Date(`${dueDate}T23:59:00`).toISOString(),
      notes: notes || undefined,
      sendNow: send,
    });
    setSaving(null);
    if (!res.data) return setError(res.error?.message || 'The invoice could not be saved.');
    onCreated(res.data);
  };

  const hasTaxableLines = valid.some(l => l.taxable);

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="fixed z-50 inset-x-0 bottom-0 top-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-3xl sm:max-h-[90vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col">
          <div className="flex items-center justify-between px-5 sm:px-6 h-14 border-b border-line shrink-0">
            <Dialog.Title className="text-[17px] font-semibold text-text-main">New invoice</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-base" aria-label="Close">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
            {/* Patient */}
            <section>
              <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="inv-patient">Patient</label>
              {patient ? (
                <div className="flex items-center justify-between rounded-control border border-line px-3 py-2.5">
                  <div>
                    <div className="text-[15px] font-medium text-text-main">{patient.firstName} {patient.lastName}</div>
                    <div className="text-[13px] text-text-muted">{patient.phone}</div>
                  </div>
                  {!initialPatientId && (
                    <button className="text-sm font-medium text-primary" onClick={() => { setPatient(null); setPatientQuery(''); }}>Change</button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  <input
                    id="inv-patient"
                    autoFocus
                    value={patientQuery}
                    onChange={e => setPatientQuery(e.target.value)}
                    placeholder="Search by name or phone"
                    className="w-full h-10 pl-9 pr-3 border border-line rounded-control text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15"
                  />
                  {patientResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-control shadow-float max-h-64 overflow-y-auto">
                      {patientResults.map(p => (
                        <li key={p.id}>
                          <button className="w-full text-left px-3 py-2.5 hover:bg-surface-hover" onClick={() => setPatient(p)}>
                            <span className="text-sm font-medium text-text-main">{p.firstName} {p.lastName}</span>
                            <span className="ml-2 text-[13px] text-text-muted">{p.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            {/* Lines */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-text-main">Treatments and items</h3>
                <span className="text-xs text-text-muted">GST is added only to taxable items</span>
              </div>
              <datalist id="procedure-options">
                {procedures.map(p => <option key={p.id} value={p.name} />)}
              </datalist>
              <div className="space-y-3">
                {lines.map(line => (
                  <div key={line.key} className="rounded-control border border-line p-3 grid grid-cols-6 sm:grid-cols-12 gap-2 sm:gap-3 items-end">
                    <div className="col-span-6 sm:col-span-5">
                      <label className="block text-xs text-text-muted mb-1">Treatment</label>
                      <input
                        list="procedure-options"
                        value={line.procedureName}
                        onChange={e => onProcedureName(line.key, e.target.value)}
                        placeholder="Start typing, e.g. Scaling"
                        className="w-full h-10 px-3 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <label className="block text-xs text-text-muted mb-1">Tooth</label>
                      <input
                        value={line.toothNumber || ''}
                        onChange={e => updateLine(line.key, { toothNumber: e.target.value })}
                        placeholder="—"
                        inputMode="numeric"
                        className="w-full h-10 px-3 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-1">
                      <label className="block text-xs text-text-muted mb-1">Qty</label>
                      <input
                        type="number" min={1}
                        value={line.quantity}
                        onChange={e => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full h-10 px-2 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2">
                      <label className="block text-xs text-text-muted mb-1">Price</label>
                      <input
                        type="number" min={0} step="1"
                        value={line.unitCost}
                        onChange={e => updateLine(line.key, { unitCost: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full h-10 px-3 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 h-10">
                      <label className="flex items-center gap-1.5 text-[13px] text-text-muted cursor-pointer">
                        <input type="checkbox" checked={!!line.taxable} onChange={e => updateLine(line.key, { taxable: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                        GST
                      </label>
                      <button
                        onClick={() => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== line.key) : [blankLine()]))}
                        className="p-2 rounded-control text-text-muted hover:text-error hover:bg-error/5"
                        aria-label="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLines(ls => [...ls, blankLine()])}>
                <Plus className="w-4 h-4" /> Add line
              </Button>
            </section>

            {/* Terms */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">Discount</label>
                <div className="flex">
                  <input
                    type="number" min={0}
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    className="flex-1 min-w-0 h-10 px-3 border border-line rounded-l-control text-sm focus:outline-none focus:border-accent"
                  />
                  <select
                    value={discountType}
                    onChange={e => setDiscountType(e.target.value as 'flat' | 'percentage')}
                    className="h-10 px-2 border border-l-0 border-line rounded-r-control text-sm bg-base"
                    aria-label="Discount type"
                  >
                    <option value="flat">₹</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="inv-due">Due date</label>
                <input
                  id="inv-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-main mb-1.5">GST type</label>
                <select
                  value={interState ? 'igst' : 'cgst'}
                  onChange={e => setInterState(e.target.value === 'igst')}
                  className="w-full h-10 px-3 border border-line rounded-control text-sm bg-surface"
                >
                  <option value="cgst">Same state (CGST + SGST)</option>
                  <option value="igst">Other state (IGST)</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-text-main mb-1.5" htmlFor="inv-notes">Note on invoice</label>
                <textarea
                  id="inv-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Optional, shown to the patient"
                  className="w-full px-3 py-2 border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </section>
          </div>

          {/* Summary + actions */}
          <div className="border-t border-line px-5 sm:px-6 py-4 shrink-0 bg-surface-hover rounded-b-panel">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-w-sm ml-auto">
              <dt className="text-text-muted">Subtotal</dt><dd className="text-right tabular">{formatCurrency(totals.subtotal)}</dd>
              {totals.discountAmount > 0 && (<><dt className="text-text-muted">Discount</dt><dd className="text-right tabular">−{formatCurrency(totals.discountAmount)}</dd></>)}
              {hasTaxableLines && (interState
                ? (<><dt className="text-text-muted">IGST {taxRate}%</dt><dd className="text-right tabular">{formatCurrency(totals.taxBreakdown.igst)}</dd></>)
                : (<><dt className="text-text-muted">CGST + SGST {taxRate}%</dt><dd className="text-right tabular">{formatCurrency(totals.totalTax)}</dd></>))}
              <dt className="font-semibold text-text-main pt-1">Total</dt><dd className="text-right font-semibold text-text-main pt-1 tabular text-base">{formatCurrency(totals.total)}</dd>
            </dl>
            {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
            <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => save(false)} loading={saving === 'draft'} disabled={!!saving}>Save as draft</Button>
              <Button onClick={() => save(true)} loading={saving === 'send'} disabled={!!saving}>Save and issue</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

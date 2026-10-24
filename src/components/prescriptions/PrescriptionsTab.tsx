import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Ban, MessageCircle, Pill, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  cancelPrescription, checkPrescription, createPrescription, FREQUENCIES, frequencyLabel, getMedicines, getMyPrescriptions,
  getPrescriptions, Medicine, Prescription, RxItem, RxWarning, sendPrescriptionWhatsApp, TIMINGS,
} from '../../api/prescriptionsService';

export function PrescriptionsTab({ patientId, allergies = [] }: { patientId: string; allergies?: string[] }) {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const canPrescribe = user?.role === 'dentist';
  const [list, setList] = useState<Prescription[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [viewing, setViewing] = useState<Prescription | null>(null);

  const load = useCallback(async () => {
    const res = isPatient ? await getMyPrescriptions() : await getPrescriptions(patientId);
    setList(res.data || []);
  }, [patientId, isPatient]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Prescriptions</h3>
          <p className="text-[13px] text-text-muted">{isPatient ? 'Medicines your dentist has prescribed.' : 'Written by the dentist; checked against the patient\'s allergies and conditions.'}</p>
        </div>
        {canPrescribe && <Button size="sm" onClick={() => setWriting(true)}><Plus className="w-4 h-4" /> New prescription</Button>}
      </div>

      {list === null ? <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div> :
        list.length === 0 ? (
          <EmptyState icon={Pill} title="No prescriptions yet" description={canPrescribe ? 'Write one in under a minute from the medicine list.' : 'Prescriptions appear here once the dentist writes them.'}
            actionLabel={canPrescribe ? 'New prescription' : undefined} onAction={canPrescribe ? () => setWriting(true) : undefined} />
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {list.map(rx => (
              <li key={rx.id}>
                <button className="w-full text-left p-3 sm:p-4 hover:bg-surface-hover flex items-start gap-3" onClick={() => setViewing(rx)}>
                  <div className="w-9 h-9 rounded-full bg-primary/[0.07] text-primary flex items-center justify-center flex-none"><Pill className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{rx.diagnosis || 'Prescription'}</span>
                      <span className="text-[12px] text-text-muted font-mono">{rx.number}</span>
                      {rx.status === 'cancelled' && <Badge variant="outline">Cancelled</Badge>}
                    </div>
                    <div className="text-[13px] text-text-muted truncate">{rx.items.map(i => `${i.name} ${i.strength}`.trim()).join(', ')}</div>
                    <div className="text-[12px] text-text-muted">{format(parseISO(rx.createdAt), 'd MMM yyyy')} · {rx.dentist.name}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

      {writing && (
        <PrescriptionBuilder patientId={patientId} allergies={allergies} onClose={() => setWriting(false)}
          onIssued={rx => { setWriting(false); load(); setViewing(rx); }} />
      )}
      {viewing && <PrescriptionView rx={viewing} onClose={() => setViewing(null)} onChanged={rx => { setViewing(rx); load(); }} />}
    </div>
  );
}

const emptyItem = (m?: Medicine, name = ''): RxItem => ({
  medicineId: m?.id || null, name: m?.name || name, genericName: m?.genericName || '', form: m?.form || '',
  strength: m?.strength || '', dosage: m?.defaultDosage || '1 tablet', frequency: m?.defaultFrequency || '1-0-1',
  durationDays: m?.defaultDurationDays ?? 3, timing: m?.defaultTiming || 'After food', instructions: m?.defaultInstructions || '',
});

function PrescriptionBuilder({ patientId, allergies, onClose, onIssued }: { patientId: string; allergies: string[]; onClose: () => void; onIssued: (rx: Prescription) => void }) {
  const [diagnosis, setDiagnosis] = useState('');
  const [items, setItems] = useState<RxItem[]>([]);
  const [advice, setAdvice] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [warnings, setWarnings] = useState<RxWarning[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check allergies and conditions whenever the medicines change.
  useEffect(() => {
    setAcknowledged(false);
    if (!items.length) { setWarnings([]); return; }
    const t = setTimeout(() => checkPrescription(patientId, items).then(r => setWarnings(r.data || [])), 350);
    return () => clearTimeout(t);
  }, [patientId, items.map(i => `${i.medicineId}|${i.name}|${i.genericName}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (i: number, patch: Partial<RxItem>) => setItems(list => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const issue = async () => {
    setBusy(true);
    setError(null);
    const res = await createPrescription(patientId, {
      diagnosis: diagnosis.trim(), items, advice: advice.trim() || undefined, followUpDate: followUp || undefined,
      acknowledgeWarnings: acknowledged, sendWhatsapp,
    });
    setBusy(false);
    if (res.error || !res.data) {
      setError(res.error?.code === 'PRESCRIPTION_WARNINGS' ? 'Please review and accept the warnings first.' : res.error?.message || 'Could not issue');
      if (res.error?.code === 'PRESCRIPTION_WARNINGS') checkPrescription(patientId, items).then(r => setWarnings(r.data || []));
      return;
    }
    toast({ title: `Prescription ${res.data.number} issued`, variant: 'success' });
    onIssued(res.data);
  };

  const blocked = warnings.length > 0 && !acknowledged;

  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50" />
        <Dialog.Content className="fixed z-50 inset-x-0 bottom-0 top-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-3xl sm:max-h-[92vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line flex-none">
            <Dialog.Title className="text-[17px] font-semibold">New prescription</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-surface-hover" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {allergies.length > 0 && (
              <div className="flex items-center gap-2 text-[13px] rounded-control bg-error/[0.06] border border-error/15 px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-error flex-none" /> <span><strong>Allergies:</strong> {allergies.join(', ')}</span>
              </div>
            )}
            <label className="block">
              <span className="text-[13px] font-medium">Diagnosis</span>
              <Input className="mt-1" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="e.g. Irreversible pulpitis 36" maxLength={500} />
            </label>

            <div className="space-y-3">
              <span className="text-[13px] font-medium">Medicines</span>
              {items.map((it, i) => (
                <div key={i} className="rounded-control border border-line p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{it.name} {it.strength && <span className="font-normal text-text-muted">{it.strength}</span>}</div>
                      {it.genericName && it.genericName !== it.name && <div className="text-[12px] text-text-muted">{it.genericName} · {it.form}</div>}
                    </div>
                    <button className="p-1.5 rounded-control text-text-muted hover:text-error hover:bg-error/5" onClick={() => setItems(l => l.filter((_, j) => j !== i))} aria-label={`Remove ${it.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How often">
                    {FREQUENCIES.map(f => (
                      <button key={f} type="button" role="radio" aria-checked={it.frequency === f} onClick={() => update(i, { frequency: f })}
                        title={frequencyLabel(f)}
                        className={`h-8 px-2.5 rounded-full text-[12px] font-mono border ${it.frequency === f ? 'bg-primary text-white border-primary' : 'border-line hover:bg-surface-hover'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input value={it.dosage} onChange={e => update(i, { dosage: e.target.value })} aria-label="Dose" placeholder="Dose" />
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={0} max={365} value={it.durationDays} onChange={e => update(i, { durationDays: Number(e.target.value) })} aria-label="Days" />
                      <span className="text-[12px] text-text-muted">days</span>
                    </div>
                    <select value={it.timing} onChange={e => update(i, { timing: e.target.value })} className="h-10 px-2 rounded-control border border-line bg-surface text-sm" aria-label="When">
                      {TIMINGS.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <Input value={it.instructions} onChange={e => update(i, { instructions: e.target.value })} placeholder="Notes" aria-label="Instructions" className="col-span-2 sm:col-span-1" />
                  </div>
                </div>
              ))}
              <MedicinePicker onPick={(m, name) => setItems(l => [...l, emptyItem(m, name)])} />
            </div>

            {warnings.length > 0 && (
              <div className="rounded-control border border-error/20 bg-error/[0.05] p-3 space-y-2" role="alert">
                <div className="text-sm font-semibold flex items-center gap-1.5 text-error"><AlertTriangle className="w-4 h-4" /> Check before issuing</div>
                <ul className="list-disc pl-5 text-[13px] space-y-0.5">{warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
                <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                  I've reviewed these and want to prescribe anyway
                </label>
              </div>
            )}

            <div className="grid sm:grid-cols-[1fr_180px] gap-3">
              <label className="block">
                <span className="text-[13px] font-medium">Advice</span>
                <textarea value={advice} onChange={e => setAdvice(e.target.value)} rows={3} maxLength={2000}
                  placeholder="e.g. Warm salt-water rinses, soft diet for 2 days"
                  className="mt-1 w-full p-3 rounded-control border border-line bg-surface text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium">Follow-up</span>
                <Input className="mt-1" type="date" value={followUp} min={format(new Date(), 'yyyy-MM-dd')} onChange={e => setFollowUp(e.target.value)} />
              </label>
            </div>
            {error && <p className="text-[13px] text-error">{error}</p>}
          </div>
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-3 flex-none">
            <label className="inline-flex items-center gap-2 text-[13px] mr-auto cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={sendWhatsapp} onChange={e => setSendWhatsapp(e.target.checked)} />
              Send to patient on WhatsApp
            </label>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={issue} loading={busy} disabled={!items.length || blocked}>Issue prescription</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MedicinePicker({ onPick }: { onPick: (m: Medicine | undefined, name: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => getMedicines(q || undefined).then(r => setResults((r.data || []).slice(0, 8))), 200);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (m?: Medicine) => {
    onPick(m, q.trim());
    setQ('');
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div className="relative">
      <Search className="w-4 h-4 absolute left-3 top-3 text-text-muted" />
      <Input ref={input} value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Add a medicine: type a name" className="pl-9"
        aria-label="Search medicines" role="combobox" aria-expanded={open} />
      {open && (results.length > 0 || q.trim()) && (
        <ul className="absolute z-10 mt-1 w-full rounded-control border border-line bg-surface shadow-float max-h-72 overflow-y-auto py-1" role="listbox">
          {results.map(m => (
            <li key={m.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(m)} className="w-full text-left px-3 py-2 hover:bg-surface-hover">
                <div className="text-sm font-medium">{m.name} <span className="text-text-muted font-normal">{m.strength}</span></div>
                <div className="text-[12px] text-text-muted">{m.genericName} · {m.form} · {m.defaultFrequency} for {m.defaultDurationDays} days</div>
              </button>
            </li>
          ))}
          {q.trim() && !results.some(m => m.name.toLowerCase() === q.trim().toLowerCase()) && (
            <li>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(undefined)} className="w-full text-left px-3 py-2 hover:bg-surface-hover text-sm text-primary">
                <Plus className="w-3.5 h-3.5 inline mr-1" /> Add “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function PrescriptionView({ rx, onClose, onChanged }: { rx: Prescription; onClose: () => void; onChanged: (rx: Prescription) => void }) {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const canCancel = rx.status === 'issued' && ((user?.role === 'dentist' && user.id === rx.dentistId) || user?.role === 'admin' || user?.role === 'super_admin');
  const [busy, setBusy] = useState<string | null>(null);
  const address = useMemo(() => {
    const a = rx.clinic.address;
    if (!a) return '';
    return typeof a === 'string' ? a : [a.street, a.city, a.state, a.zipCode].filter(Boolean).join(', ');
  }, [rx.clinic.address]);

  const whatsapp = async () => {
    setBusy('wa');
    const res = await sendPrescriptionWhatsApp(rx.id);
    setBusy(null);
    toast(res.data?.status === 'sent' ? { title: 'Sent on WhatsApp', variant: 'success' } : { title: res.data?.detail || res.error?.message || 'Not sent', variant: 'error' });
  };

  const cancel = async () => {
    const reason = window.prompt('Why are you cancelling this prescription?');
    if (!reason || reason.trim().length < 3) return;
    setBusy('cancel');
    const res = await cancelPrescription(rx.id, reason.trim());
    setBusy(null);
    if (res.data) { onChanged(res.data); toast({ title: 'Prescription cancelled', variant: 'success' }); }
    else toast({ title: res.error?.message || 'Could not cancel', variant: 'error' });
  };

  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50 print:hidden" />
        <Dialog.Content className="fixed z-50 inset-x-0 bottom-0 top-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-2xl sm:max-h-[92vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col print:static print:translate-x-0 print:translate-y-0 print:max-h-none print:shadow-none">
          <div className="flex items-center gap-2 px-5 h-14 border-b border-line flex-none print:hidden">
            <Dialog.Title className="text-[17px] font-semibold mr-auto">Prescription {rx.number}</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-surface-hover" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="px-5 py-3 border-b border-line flex flex-wrap gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
            {!isPatient && rx.status === 'issued' && <Button size="sm" variant="outline" onClick={whatsapp} loading={busy === 'wa'}><MessageCircle className="w-4 h-4" /> Send on WhatsApp</Button>}
            {canCancel && <Button size="sm" variant="ghost" className="text-error" onClick={cancel} loading={busy === 'cancel'}><Ban className="w-4 h-4" /> Cancel</Button>}
          </div>
          <div className="flex-1 overflow-y-auto">
            <article className="print-area p-6 sm:p-8 text-text-main space-y-5">
              <header className="flex items-start justify-between gap-4 border-b-2 border-primary pb-4">
                <div>
                  <div className="text-lg font-semibold">{rx.clinic.name}</div>
                  {address && <div className="text-[12px] text-text-muted">{address}</div>}
                  {rx.clinic.phone && <div className="text-[12px] text-text-muted">{rx.clinic.phone}</div>}
                </div>
                <div className="text-right">
                  <div className="font-semibold">{rx.dentist.name}</div>
                  {rx.dentist.specializations && rx.dentist.specializations.length > 0 && <div className="text-[12px] text-text-muted">{rx.dentist.specializations.join(', ')}</div>}
                  {rx.dentist.registrationNumber && <div className="text-[12px] text-text-muted">Reg. no. {rx.dentist.registrationNumber}</div>}
                </div>
              </header>
              <div className="flex flex-wrap justify-between gap-2 text-[13px]">
                <div><strong>{rx.patient.name}</strong>{rx.patient.age != null && `, ${rx.patient.age} y`}{rx.patient.gender && `, ${rx.patient.gender}`}</div>
                <div className="text-text-muted">{format(parseISO(rx.createdAt), 'd MMM yyyy')} · {rx.number}</div>
              </div>
              {rx.patient.allergies && rx.patient.allergies.length > 0 && <div className="text-[12px]"><strong>Allergies:</strong> {rx.patient.allergies.join(', ')}</div>}
              {rx.diagnosis && <div className="text-[13px]"><strong>Diagnosis:</strong> {rx.diagnosis}</div>}
              <div>
                <div className="text-2xl font-serif italic text-primary mb-2" aria-hidden="true">℞</div>
                <ol className="space-y-3">
                  {rx.items.map((it, i) => (
                    <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-1">
                      <span className="text-text-muted">{i + 1}.</span>
                      <div>
                        <div className="font-semibold">{it.form && `${it.form}. `}{it.name} {it.strength}</div>
                        {it.genericName && it.genericName !== it.name && <div className="text-[12px] text-text-muted">({it.genericName})</div>}
                        <div className="text-[14px]">
                          {it.dosage} · <span className="font-mono">{it.frequency}</span> ({frequencyLabel(it.frequency)}) · {it.timing}{it.durationDays ? ` · ${it.durationDays} days` : ''}
                        </div>
                        {it.instructions && <div className="text-[13px] text-text-muted">{it.instructions}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              {rx.advice && <div className="text-[14px]"><strong>Advice:</strong> <span className="whitespace-pre-wrap">{rx.advice}</span></div>}
              {rx.followUpDate && <div className="text-[14px]"><strong>Review on:</strong> {format(parseISO(rx.followUpDate), 'EEEE d MMM yyyy')}</div>}
              <footer className="pt-10 flex justify-end">
                <div className="text-center text-[12px] text-text-muted border-t border-text-muted/40 pt-1 w-48">{rx.dentist.name}</div>
              </footer>
              {rx.status === 'cancelled' && <p className="text-[13px] text-error font-medium">Cancelled{rx.cancelReason ? `: ${rx.cancelReason}` : ''}. Do not dispense.</p>}
            </article>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ArrowRight, Ban, Check, Printer, RotateCcw } from 'lucide-react';
import { Modal, Field, textareaClass } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/useToast';
import { useCurrency } from '../../utils/currencyConfig';
import { getLabOrder, LAB_FLOW, LabOrder, LabStatus, remakeLabOrder, updateLabStatus } from '../../api/inventoryService';
import { LabProgress, LabStatusBadge } from './LabOrdersList';

const NEXT_LABEL: Partial<Record<LabStatus, string>> = {
  'In Progress': 'Lab started work', 'Quality Check': 'In quality check', 'Ready for Pickup': 'Ready for pickup',
  'Delivered to Clinic': 'Arrived at clinic', 'Fitted/Completed': 'Fitted',
};

export function LabOrderModal({ order, onClose, onChanged }: { order: LabOrder; onClose: () => void; onChanged: (o: LabOrder) => void }) {
  const { formatCurrency } = useCurrency();
  const [o, setO] = useState(order);
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [remaking, setRemaking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getLabOrder(order.id).then(r => r.data && setO(r.data)); }, [order.id]);

  const idx = LAB_FLOW.indexOf(o.status as typeof LAB_FLOW[number]);
  const closed = o.status === 'Fitted/Completed' || o.status === 'Cancelled';
  const next = !closed && idx >= 0 && idx < LAB_FLOW.length - 1 ? LAB_FLOW[idx + 1] : null;

  const move = async (status: LabStatus, key: string) => {
    setBusy(key);
    setError(null);
    const res = await updateLabStatus(o.id, status, note.trim(), notify);
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not update'); return; }
    setO(res.data);
    setNote('');
    onChanged(res.data);
    toast({ title: status === 'Delivered to Clinic' && notify ? 'Marked as arrived. Patient told on WhatsApp.' : `Marked: ${NEXT_LABEL[status] || status}`, variant: 'success' });
  };

  const remake = async () => {
    setBusy('remake');
    const res = await remakeLabOrder(o.id, reason.trim());
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not send for remake'); return; }
    toast({ title: `Remake ${res.data.orderNumber} sent`, variant: 'success' });
    onChanged(res.data);
  };

  return (
    <Modal title={<span className="flex flex-wrap items-center gap-2">{o.itemType}{o.toothNumbers.length ? ` · ${o.toothNumbers.join(', ')}` : ''} <LabStatusBadge status={o.status} /></span>}
      subtitle={`${o.orderNumber} · ${o.labName}`} onClose={onClose} size="lg"
      footer={remaking ? <>
        <Button variant="ghost" onClick={() => setRemaking(false)}>Back</Button>
        <Button onClick={remake} loading={busy === 'remake'} disabled={reason.trim().length < 3}><RotateCcw className="w-4 h-4" /> Send remake</Button>
      </> : <>
        {!closed && <Button variant="ghost" className="text-error mr-auto" onClick={() => move('Cancelled', 'cancel')} loading={busy === 'cancel'}><Ban className="w-4 h-4" /> Cancel case</Button>}
        {idx >= 4 && o.status !== 'Cancelled' && <Button variant="outline" onClick={() => setRemaking(true)}><RotateCcw className="w-4 h-4" /> Remake</Button>}
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
        {next && <Button onClick={() => move(next, 'next')} loading={busy === 'next'}>{NEXT_LABEL[next]} <ArrowRight className="w-4 h-4" /></Button>}
      </>}>
      <article className="print-area p-5 sm:p-6 space-y-5">
        <div className="hidden print:block">
          <h2 className="text-lg font-semibold">Lab prescription {o.orderNumber}</h2>
          <p className="text-sm">{o.labName}</p>
        </div>
        <LabProgress status={o.status} />
        {o.isOverdue && (
          <p className="flex items-center gap-2 text-[13px] text-error"><AlertTriangle className="w-4 h-4" /> {o.daysLate} {o.daysLate === 1 ? 'day' : 'days'} late. Call {o.labName} to chase it.</p>
        )}
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[13px]">
          <div><dt className="text-text-muted">Patient</dt><dd><Link to={`/patients/${o.patientId}`} className="text-primary">{o.patientName}</Link></dd></div>
          <div><dt className="text-text-muted">Dentist</dt><dd>{o.dentistName || '—'}</dd></div>
          <div><dt className="text-text-muted">Shade / material</dt><dd>{[o.shade, o.material].filter(Boolean).join(', ') || '—'}</dd></div>
          <div><dt className="text-text-muted">Sent</dt><dd>{format(parseISO(o.orderDate), 'd MMM yyyy')}</dd></div>
          <div><dt className="text-text-muted">Due back</dt><dd className={o.isOverdue ? 'text-error' : ''}>{format(parseISO(o.expectedDate), 'EEE d MMM yyyy')}</dd></div>
          <div><dt className="text-text-muted">Lab charge</dt><dd>{formatCurrency(o.cost)}</dd></div>
        </dl>
        {o.instructions && <div className="text-[13px] rounded-control bg-surface-hover p-3 whitespace-pre-wrap">{o.instructions}</div>}

        {remaking ? (
          <div className="space-y-3 print:hidden">
            <p className="text-[13px] text-text-muted">This closes the current case and sends a new one to {o.labName} with the same details.</p>
            <Field label="What was wrong"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Shade too light, open contact on mesial" autoFocus /></Field>
          </div>
        ) : !closed && (
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end print:hidden">
            <Field label="Note with the next update (optional)"><textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={textareaClass} /></Field>
            {next === 'Delivered to Clinic' && (
              <label className="inline-flex items-center gap-2 text-[13px] pb-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={notify} onChange={e => setNotify(e.target.checked)} />
                Tell the patient on WhatsApp
              </label>
            )}
          </div>
        )}
        {error && <p className="text-[13px] text-error">{error}</p>}

        <section>
          <h3 className="text-[13px] font-semibold mb-2">Timeline</h3>
          <ol className="relative border-l border-line ml-2 space-y-3">
            {o.updates.map(u => (
              <li key={u.id} className="ml-4">
                <span className="absolute -left-[7px] mt-1 w-3 h-3 rounded-full bg-primary/80 ring-2 ring-surface flex items-center justify-center"><Check className="w-2 h-2 text-white" /></span>
                <div className="text-[13px] font-medium">{u.status}</div>
                <div className="text-[12px] text-text-muted">{format(parseISO(u.createdAt), 'd MMM yyyy, h:mm a')}{u.updatedByName ? ` · ${u.updatedByName}` : ''}</div>
                {u.note && <div className="text-[13px]">{u.note}</div>}
              </li>
            ))}
          </ol>
        </section>
      </article>
    </Modal>
  );
}

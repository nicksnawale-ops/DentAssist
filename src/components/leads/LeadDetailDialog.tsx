import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, formatDistanceToNowStrict, parseISO, setHours, setMinutes } from 'date-fns';
import { CalendarPlus, Check, MessageCircle, Phone, StickyNote, Trash2, Trophy, UserPlus, XCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass, textareaClass } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import {
  CallOutcome, convertLead, deleteLead, getLead, Lead, LeadDetail, LeadMeta, LeadStatus, logLeadActivity, LOST_LABEL,
  OPEN_STATUSES, OUTCOME_LABEL, sendLeadWhatsApp, SOURCE_LABEL, STATUS_LABEL, updateLead,
} from '../../api/leadsService';

const STEPS: LeadStatus[] = ['new', 'contacted', 'consult_booked', 'visited', 'won'];

/** Next follow-up shortcuts, at 11 am so calls land in clinic hours. */
const at11 = (d: Date) => setMinutes(setHours(d, 11), 0);
const QUICK: { label: string; at: () => Date }[] = [
  { label: 'In 2 hours', at: () => new Date(Date.now() + 2 * 3600_000) },
  { label: 'Tomorrow', at: () => at11(addDays(new Date(), 1)) },
  { label: 'In 3 days', at: () => at11(addDays(new Date(), 3)) },
  { label: 'Next week', at: () => at11(addDays(new Date(), 7)) },
];

export const statusVariant = (s: LeadStatus) =>
  s === 'won' ? 'success' : s === 'lost' ? 'outline' : s === 'new' ? 'warning' : 'secondary';

export function LeadDetailDialog({ leadId, meta, onClose, onChanged, onBook }: {
  leadId: string; meta: LeadMeta | null; onClose: () => void; onChanged: (lead: Lead | null) => void;
  onBook: (lead: Lead, patientId: string) => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const { formatCurrency } = useCurrency();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>('answered');
  const [next, setNext] = useState<string>('');
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [editValue, setEditValue] = useState<string | null>(null);

  const reload = () => getLead(leadId).then(r => r.data && setLead(r.data));
  useEffect(() => { reload(); }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applied = (res: { data: Lead | null; error: { message: string } | null }, message?: string) => {
    if (res.error || !res.data) { toast({ title: res.error?.message || 'Could not save', variant: 'error' }); return false; }
    onChanged(res.data);
    reload();
    if (message) toast({ title: message, variant: 'success' });
    return true;
  };

  if (!lead) {
    return <Modal title="Enquiry" onClose={onClose} size="lg"><div className="p-5 space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div></Modal>;
  }
  const open = OPEN_STATUSES.includes(lead.status);
  const tel = `tel:+${lead.phone}`;
  const wa = `https://wa.me/${lead.phone}`;

  const logCall = async () => {
    setBusy('call');
    const res = await logLeadActivity(lead.id, { kind: 'call', body: note.trim(), outcome, nextFollowUpAt: next ? new Date(next).toISOString() : undefined });
    setBusy(null);
    if (applied(res, outcome === 'wrong_number' ? 'Marked as lost: wrong number' : 'Call logged')) { setNote(''); setNext(''); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    setBusy('note');
    const res = await logLeadActivity(lead.id, { kind: 'note', body: note.trim(), nextFollowUpAt: next ? new Date(next).toISOString() : undefined });
    setBusy(null);
    if (applied(res, 'Note added')) { setNote(''); setNext(''); }
  };
  const whatsapp = async () => {
    setBusy('wa');
    const res = await sendLeadWhatsApp(lead.id);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    toast(res.data.status === 'sent' ? { title: 'Follow-up sent on WhatsApp', variant: 'success' } : { title: res.data.detail, variant: 'error' });
    onChanged(res.data.lead);
    reload();
  };
  const setStatus = async (status: LeadStatus, reason?: string) => {
    setBusy(status);
    const res = await updateLead(lead.id, { status, lostReason: reason });
    setBusy(null);
    if (applied(res, status === 'won' ? 'Marked as won' : status === 'lost' ? 'Marked as lost' : `Moved to ${STATUS_LABEL[status]}`)) setLosing(false);
  };
  const book = async () => {
    setBusy('book');
    const res = await convertLead(lead.id);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not register', variant: 'error' });
    onChanged(res.data.lead);
    onBook(res.data.lead, res.data.patientId);
  };
  const remove = async () => {
    if (!window.confirm('Delete this enquiry? Use this only for spam or test entries.')) return;
    const res = await deleteLead(lead.id);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    onChanged(null);
    onClose();
  };

  const stepIndex = STEPS.indexOf(lead.status);

  return (
    <Modal size="lg" onClose={onClose}
      title={<span className="flex items-center gap-2">{lead.name}<Badge variant={statusVariant(lead.status)}>{STATUS_LABEL[lead.status]}</Badge></span>}
      subtitle={`${SOURCE_LABEL[lead.source]} · ${formatDistanceToNowStrict(parseISO(lead.createdAt), { addSuffix: true })}${lead.interest ? ` · ${lead.interest}` : ''}`}>
      <div className="p-5 space-y-5">
        {/* Contact */}
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm"><a href={tel}><Phone className="w-4 h-4" /> Call +{lead.phone}</a></Button>
          <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="w-4 h-4" /> Open WhatsApp</a></Button>
          {open && <Button size="sm" variant="outline" onClick={whatsapp} loading={busy === 'wa'} disabled={!lead.whatsappConsent}
            title={lead.whatsappConsent ? 'Send the approved follow-up message' : 'They have not agreed to WhatsApp messages'}>Send follow-up template</Button>}
          <span className="ml-auto" />
          {lead.patientId ? (
            <Link to={`/patients/${lead.patientId}`} className="text-[13px] font-medium text-primary hover:underline">Patient: {lead.patientName || 'open record'}</Link>
          ) : null}
        </div>

        {/* Pipeline */}
        {lead.status !== 'lost' ? (
          <ol className="grid grid-cols-5 gap-1" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className="text-center">
                <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-line'}`} />
                <div className={`mt-1 text-[11px] ${i === stepIndex ? 'font-semibold text-text-main' : 'text-text-muted'}`}>{STATUS_LABEL[s]}</div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-control bg-surface-hover p-3 text-[13px] flex items-center gap-2">
            <XCircle className="w-4 h-4 text-text-muted" /> Lost: {LOST_LABEL[lead.lostReason || 'other'] || lead.lostReason}
            <button className="ml-auto text-primary font-medium" onClick={() => setStatus('contacted')}>Reopen</button>
          </div>
        )}

        {/* Main actions */}
        {open && (
          <div className="flex flex-wrap gap-2">
            {lead.status !== 'consult_booked' && lead.status !== 'visited' && (
              <Button size="sm" variant="secondary" onClick={book} loading={busy === 'book'}>
                {lead.patientId ? <CalendarPlus className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {lead.patientId ? 'Book consultation' : 'Register & book'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setStatus('won')} loading={busy === 'won'}><Trophy className="w-4 h-4" /> Treatment accepted</Button>
            <Button size="sm" variant="ghost" onClick={() => setLosing(v => !v)}><XCircle className="w-4 h-4" /> Lost</Button>
          </div>
        )}
        {losing && (
          <div className="flex flex-wrap items-end gap-2 rounded-control border border-line p-3">
            <div className="flex-1 min-w-[180px]"><Field label="Why didn't it work out?">
              <select value={lostReason} onChange={e => setLostReason(e.target.value)} className={selectClass}>
                <option value="">Choose a reason</option>
                {(meta?.lostReasons || Object.keys(LOST_LABEL)).map(r => <option key={r} value={r}>{LOST_LABEL[r] || r}</option>)}
              </select>
            </Field></div>
            <Button size="sm" variant="danger" disabled={!lostReason} loading={busy === 'lost'} onClick={() => setStatus('lost', lostReason)}>Mark lost</Button>
          </div>
        )}

        {/* Details */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
          <div><dt className="text-text-muted">Follow up</dt><dd className={lead.isOverdue ? 'text-error font-medium' : ''}>
            {lead.nextFollowUpAt ? format(parseISO(lead.nextFollowUpAt), 'd MMM, h:mm a') : '–'}</dd></div>
          <div><dt className="text-text-muted">Owner</dt><dd>
            <select aria-label="Owner" value={lead.assignedToId || ''} className="bg-transparent -ml-1 max-w-full"
              onChange={async e => applied(await updateLead(lead.id, { assignedToId: e.target.value || null }), 'Owner changed')}>
              <option value="">Front desk</option>
              {(meta?.staff || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></dd></div>
          <div><dt className="text-text-muted">Likely value</dt><dd>
            {editValue === null ? (
              <button className="hover:text-primary" onClick={() => setEditValue(String(lead.estimatedValue ?? ''))}>{lead.estimatedValue != null ? formatCurrency(lead.estimatedValue) : 'Add'}</button>
            ) : (
              <Input autoFocus type="number" min={0} value={editValue} className="h-8" onChange={e => setEditValue(e.target.value)}
                onBlur={async () => { const v = editValue; setEditValue(null); if (v !== String(lead.estimatedValue ?? '')) applied(await updateLead(lead.id, { estimatedValue: v ? Number(v) : null })); }} />
            )}</dd></div>
          <div><dt className="text-text-muted">WhatsApp</dt><dd>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={lead.whatsappConsent}
                onChange={async e => applied(await updateLead(lead.id, { whatsappConsent: e.target.checked }))} />
              Agreed
            </label></dd></div>
        </dl>
        {lead.message && <blockquote className="rounded-control bg-surface-hover p-3 text-[14px] whitespace-pre-wrap">“{lead.message}”</blockquote>}
        {lead.campaign && <p className="text-[12px] text-text-muted">Campaign: {Object.entries(lead.campaign).map(([k, v]) => `${k.replace('utm_', '')}: ${v}`).join(' · ')}</p>}

        {/* Log a call or note */}
        <div className="rounded-control border border-line p-3 space-y-3">
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className={textareaClass} placeholder="What did they say? Budget, timing, questions…" />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Call outcome" value={outcome} onChange={e => setOutcome(e.target.value as CallOutcome)} className={`${selectClass} w-auto h-9`}>
              {(Object.keys(OUTCOME_LABEL) as CallOutcome[]).map(o => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
            </select>
            <span className="text-[12px] text-text-muted">Next follow-up:</span>
            {QUICK.map(q => {
              const v = format(q.at(), "yyyy-MM-dd'T'HH:mm");
              return <button key={q.label} type="button" onClick={() => setNext(n => (n === v ? '' : v))}
                className={`h-8 px-2.5 rounded-full text-[12px] border ${next === v ? 'bg-primary text-white border-primary' : 'border-line text-text-muted hover:bg-surface-hover'}`}>{q.label}</button>;
            })}
            <input type="datetime-local" aria-label="Follow-up date and time" value={next} onChange={e => setNext(e.target.value)} className="h-8 px-2 rounded-control border border-line text-[12px] bg-surface" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={addNote} disabled={!note.trim()} loading={busy === 'note'}><StickyNote className="w-4 h-4" /> Add note</Button>
            <Button size="sm" onClick={logCall} loading={busy === 'call'}><Check className="w-4 h-4" /> Log call</Button>
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h3 className="text-[13px] font-semibold mb-2">History</h3>
          <ol className="space-y-2.5">
            {lead.activities.map(a => (
              <li key={a.id} className="flex gap-3 text-[13px]">
                <span className="w-1.5 h-1.5 rounded-full bg-line mt-2 flex-none" />
                <div className="min-w-0">
                  <div className="text-text-main">
                    <span className="font-medium">{activityTitle(a.kind, a.outcome)}</span>
                    {a.kind === 'follow_up' && typeof a.data?.at === 'string' && <span className="text-text-muted">{' — '}{format(parseISO(a.data.at), 'd MMM, h:mm a')}</span>}
                    {a.body && <span className="text-text-muted">{' — '}{a.body}</span>}
                  </div>
                  <div className="text-[11px] text-text-muted">{format(parseISO(a.createdAt), 'd MMM, h:mm a')}{a.createdByName ? ` · ${a.createdByName}` : ''}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {isAdmin && <button onClick={remove} className="text-[12px] text-text-muted hover:text-error inline-flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Delete (spam or test)</button>}
      </div>
    </Modal>
  );
}

function activityTitle(kind: string, outcome: string | null) {
  switch (kind) {
    case 'created': return 'Enquiry received';
    case 'enquired_again': return 'Enquired again';
    case 'call': return `Call: ${OUTCOME_LABEL[outcome as CallOutcome] || 'logged'}`;
    case 'whatsapp': return 'WhatsApp';
    case 'status': return 'Stage';
    case 'assigned': return 'Owner';
    case 'follow_up': return 'Follow-up set';
    case 'converted': return 'Patient record';
    default: return 'Note';
  }
}

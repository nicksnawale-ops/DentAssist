import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, Mail, Phone, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Field, selectClass, textareaClass } from '../../components/ui/Modal';
import { toast } from '../../components/ui/useToast';
import {
  DataRequestKind, download, getPortalPrivacy, getPrivacySettings, makePortalRequest, PortalPrivacy, PrivacySettings, savePrivacySettings,
} from '../../api/complianceService';

/** Admin: retention periods, response time and the contact patients see for questions and complaints. */
export function PrivacySettingsTab() {
  const [s, setS] = useState<PrivacySettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPrivacySettings().then(r => r.data && setS(r.data)); }, []);
  if (!s) return <p className="text-sm text-text-muted">Loading…</p>;
  const save = async () => {
    setBusy(true);
    const res = await savePrivacySettings(s);
    setBusy(false);
    toast(res.data ? { title: 'Data protection settings saved', variant: 'success' } : { title: res.error?.message || 'Could not save', variant: 'error' });
  };
  return (
    <Card className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Data protection</h2>
        <p className="text-[13px] text-text-muted">For the Digital Personal Data Protection Act, 2023. Confirm the periods below with your legal adviser and CA.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Keep clinical records (years after last visit)">
          <Input type="number" min={1} max={30} value={s.clinicalRetentionYears} onChange={e => setS({ ...s, clinicalRetentionYears: Number(e.target.value) })} />
        </Field>
        <Field label="Keep bills (years)">
          <Input type="number" min={1} max={30} value={s.billingRetentionYears} onChange={e => setS({ ...s, billingRetentionYears: Number(e.target.value) })} />
        </Field>
        <Field label="Reply to requests within (days)">
          <Input type="number" min={1} max={90} value={s.responseDays} onChange={e => setS({ ...s, responseDays: Number(e.target.value) })} />
        </Field>
      </div>
      <div>
        <h3 className="text-[14px] font-semibold mb-2">Contact for privacy questions and complaints</h3>
        <p className="text-[12px] text-text-muted mb-3">Shown to patients in their portal.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name or role"><Input value={s.grievanceOfficerName} onChange={e => setS({ ...s, grievanceOfficerName: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={s.grievanceOfficerEmail} onChange={e => setS({ ...s, grievanceOfficerEmail: e.target.value })} /></Field>
          <Field label="Phone"><Input value={s.grievanceOfficerPhone} onChange={e => setS({ ...s, grievanceOfficerPhone: e.target.value })} /></Field>
        </div>
      </div>
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" className="mt-1 h-4 w-4 rounded border-line text-primary" checked={s.logRecordViews} onChange={e => setS({ ...s, logRecordViews: e.target.checked })} />
        <span>Record who opens each patient's record <span className="block text-[12px] text-text-muted">Admins see it under Privacy → Who viewed on the patient's profile, and patients get it in their data copy.</span></span>
      </label>
      <div className="flex justify-end"><Button onClick={save} loading={busy}>Save</Button></div>
    </Card>
  );
}

const PORTAL_KINDS: { kind: DataRequestKind; label: string; hint: string }[] = [
  { kind: 'correction', label: 'Correct my details', hint: 'Tell us what is wrong and what it should be.' },
  { kind: 'erasure', label: 'Delete my data', hint: 'We delete what we can. Health and billing records we must keep by law are kept for the required time.' },
  { kind: 'grievance', label: 'Raise a concern', hint: 'Anything about how we handle your data.' },
];

/** Patient: download a copy, ask for corrections or deletion, stop messages, see request status. */
export function PortalPrivacyTab() {
  const [info, setInfo] = useState<PortalPrivacy | null>(null);
  const [kind, setKind] = useState<DataRequestKind>('correction');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => getPortalPrivacy().then(r => r.data && setInfo(r.data));
  useEffect(() => { load(); }, []);

  const exportData = async () => {
    setBusy('export');
    const err = await download('/patient-portal/data-export', {}, 'my-dental-records.json');
    setBusy(null);
    toast(err ? { title: err, variant: 'error' } : { title: 'Your data has been downloaded', variant: 'success' });
  };
  const send = async (k: DataRequestKind, text: string) => {
    setBusy(k);
    const res = await makePortalRequest(k, text);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    toast(res.data.status === 'completed'
      ? { title: 'Done. You won’t get reminders or offers on WhatsApp.', variant: 'success' }
      : { title: `Request sent. We'll reply by ${format(parseISO(res.data.dueOn), 'd MMM')}.`, variant: 'success' });
    setDetails('');
    load();
  };
  if (!info) return <p className="text-sm text-text-muted">Loading…</p>;
  const hint = PORTAL_KINDS.find(k => k.kind === kind)?.hint;

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /><h2 className="text-lg font-semibold">My data & privacy</h2></div>
        <p className="text-[14px] text-text-muted">You can get a copy of the information we hold about you, ask us to correct or delete it, or stop non-essential messages.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData} loading={busy === 'export'}><Download className="w-4 h-4" /> Download my data</Button>
          {info.whatsappOptIn && <Button variant="outline" loading={busy === 'withdraw_consent'}
            onClick={() => window.confirm('Stop appointment reminders and offers on WhatsApp?') && send('withdraw_consent', '')}>Stop WhatsApp messages</Button>}
        </div>
      </Card>
      <Card className="p-6 space-y-3">
        <h3 className="text-[15px] font-semibold">Make a request</h3>
        <Field label="I'd like to">
          <select value={kind} onChange={e => setKind(e.target.value as DataRequestKind)} className={selectClass}>
            {PORTAL_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </Field>
        {hint && <p className="text-[12px] text-text-muted">{hint}</p>}
        <textarea rows={3} value={details} onChange={e => setDetails(e.target.value)} className={textareaClass} maxLength={4000} aria-label="Details" />
        <div className="flex justify-end"><Button onClick={() => send(kind, details)} loading={busy === kind} disabled={kind !== 'erasure' && !details.trim()}>Send request</Button></div>
        <p className="text-[12px] text-text-muted">We reply within {info.responseDays} days.</p>
      </Card>
      {info.requests.length > 0 && (
        <Card className="p-6">
          <h3 className="text-[15px] font-semibold mb-2">My requests</h3>
          <ul className="divide-y divide-line text-[14px]">
            {info.requests.map(q => (
              <li key={q.id} className="py-2">
                <div className="flex justify-between gap-2"><span className="font-medium">{PORTAL_KINDS.find(k => k.kind === q.kind)?.label || 'Stop messages'}</span>
                  <span className="text-[12px] text-text-muted capitalize">{q.status.replace('_', ' ')}</span></div>
                <div className="text-[12px] text-text-muted">Sent {format(parseISO(q.createdAt), 'd MMM yyyy')}{q.status === 'received' || q.status === 'in_progress' ? ` · reply by ${format(parseISO(q.dueOn), 'd MMM')}` : ''}</div>
                {q.resolution && <p className="text-[13px] mt-1">{q.resolution}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(info.grievanceOfficer.email || info.grievanceOfficer.phone) && (
        <Card className="p-6 text-[14px] space-y-1">
          <h3 className="text-[15px] font-semibold">Questions or complaints about your data</h3>
          {info.grievanceOfficer.name && <p>{info.grievanceOfficer.name}</p>}
          {info.grievanceOfficer.email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-text-muted" /><a className="text-primary" href={`mailto:${info.grievanceOfficer.email}`}>{info.grievanceOfficer.email}</a></p>}
          {info.grievanceOfficer.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-text-muted" /><a className="text-primary" href={`tel:${info.grievanceOfficer.phone.replace(/\s/g, '')}`}>{info.grievanceOfficer.phone}</a></p>}
          <p className="text-[12px] text-text-muted pt-1">If you're not satisfied with our reply, you can complain to the Data Protection Board of India.</p>
        </Card>
      )}
    </div>
  );
}

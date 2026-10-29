import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, Eye, Lock, MessageCircleOff, Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  AccessLogRow, anonymisePatient, DataRequestKind, download, getAccessLog, getPatientPrivacy, logDataRequest, PatientPrivacy,
  REQUEST_KIND_LABEL, withdrawConsent,
} from '../../api/complianceService';

const ACTION_LABEL: Record<string, string> = {
  view: 'Opened the record', view_documents: 'Viewed documents and X-rays', export_data: 'Downloaded a copy of the data',
  update: 'Changed details', create: 'Created', withdraw_consent: 'Stopped messages', anonymise: 'Erased identity',
};

/** Data protection for one patient: retention, consent, export, requests, access log and erasure. */
export function PatientPrivacyCard({ patientId, patientName, onAnonymised }: { patientId: string; patientName: string; onAnonymised: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [info, setInfo] = useState<PatientPrivacy | null>(null);
  const [log, setLog] = useState<AccessLogRow[] | null>(null);
  const [logging, setLogging] = useState(false);
  const [erasing, setErasing] = useState(false);

  const load = () => getPatientPrivacy(patientId).then(r => r.data && setInfo(r.data));
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const r = info.retention;
  const fmt = (d: string | null) => (d ? format(parseISO(d), 'd MMM yyyy') : '–');

  const exportData = async () => {
    const err = await download(`/patients/${encodeURIComponent(patientId)}/data-export`, {}, `patient-data-${patientId}.json`);
    if (err) toast({ title: err, variant: 'error' }); else toast({ title: 'Data copy downloaded', description: 'Give it to the patient securely.', variant: 'success' });
  };
  const stop = async () => {
    if (!window.confirm(`Stop all reminders, recalls and offers to ${patientName}?`)) return;
    const res = await withdrawConsent(patientId);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    toast({ title: 'Messages stopped', variant: 'success' });
    load();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-primary" />
        <h3 className="text-[15px] font-semibold mr-auto">Privacy</h3>
        {isAdmin && <Button size="sm" variant="ghost" onClick={() => getAccessLog(patientId).then(x => setLog(x.data || []))}><Eye className="w-4 h-4" /> Who viewed</Button>}
      </div>
      {r.anonymisedAt ? (
        <p className="text-[13px] text-text-muted">Identity erased on {fmt(r.anonymisedAt)}. Clinical and billing records are kept without personal details.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-[13px]">
            <div><dt className="text-text-muted">WhatsApp messages</dt><dd>{info.consentWithdrawnAt ? `Stopped ${fmt(info.consentWithdrawnAt)}` : info.whatsappOptIn ? 'Agreed' : 'Not agreed'}</dd></div>
            <div><dt className="text-text-muted">Keep records until</dt><dd>{fmt(r.keepUntil)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {isAdmin && <Button size="sm" variant="outline" onClick={exportData}><Download className="w-4 h-4" /> Copy of data</Button>}
            {!info.consentWithdrawnAt && <Button size="sm" variant="outline" onClick={stop}><MessageCircleOff className="w-4 h-4" /> Stop messages</Button>}
            <Button size="sm" variant="ghost" onClick={() => setLogging(true)}>Log a request</Button>
            {isAdmin && <Button size="sm" variant="ghost" className="text-error" onClick={() => setErasing(true)}><Trash2 className="w-4 h-4" /> Erase identity</Button>}
          </div>
        </>
      )}
      {info.requests.length > 0 && (
        <ul className="text-[13px] divide-y divide-line">
          {info.requests.slice(0, 4).map(q => (
            <li key={q.id} className="py-1.5 flex gap-2"><span className="font-medium">{REQUEST_KIND_LABEL[q.kind]}</span>
              <span className="text-text-muted">{q.status.replace('_', ' ')} · {fmt(q.createdAt)}</span></li>
          ))}
        </ul>
      )}

      {log && (
        <Modal title="Who viewed or changed this record" subtitle={patientName} size="lg" onClose={() => setLog(null)}>
          <div className="p-5">
            {log.length === 0 ? <p className="text-sm text-text-muted">No access recorded yet.</p> : (
              <table className="w-full text-[13px]">
                <thead className="text-left text-text-muted"><tr><th className="font-medium py-1">When</th><th className="font-medium">Who</th><th className="font-medium">What</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {log.map(x => <tr key={x.id}><td className="py-1.5 whitespace-nowrap">{format(parseISO(x.at), 'd MMM yyyy, h:mm a')}</td>
                    <td>{x.userName}{x.role ? <span className="text-text-muted"> · {x.role.replace('_', ' ')}</span> : null}</td>
                    <td>{ACTION_LABEL[x.action] || x.action.replace(/_/g, ' ')}</td></tr>)}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
      {logging && <LogRequestDialog patientId={patientId} onClose={() => setLogging(false)} onDone={() => { setLogging(false); load(); }} />}
      {erasing && <EraseDialog patientId={patientId} patientName={patientName} info={info} onClose={() => setErasing(false)}
        onDone={() => { setErasing(false); load(); onAnonymised(); }} />}
    </Card>
  );
}

function LogRequestDialog({ patientId, onClose, onDone }: { patientId: string; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<DataRequestKind>('access');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await logDataRequest(patientId, kind, details.trim());
    setBusy(false);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    toast({ title: 'Request logged', description: 'An admin will see it under Compliance → Data requests.', variant: 'success' });
    onDone();
  };
  return (
    <Modal title="Log a data request" subtitle="Made at the desk, by phone or by email" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Log request</Button></>}>
      <div className="p-5 space-y-4">
        <Field label="They asked for">
          <select value={kind} onChange={e => setKind(e.target.value as DataRequestKind)} className={selectClass}>
            {(Object.keys(REQUEST_KIND_LABEL) as DataRequestKind[]).map(k => <option key={k} value={k}>{REQUEST_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Details"><Input value={details} onChange={e => setDetails(e.target.value)} placeholder="What exactly they asked" /></Field>
      </div>
    </Modal>
  );
}

function EraseDialog({ patientId, patientName, info, onClose, onDone }: {
  patientId: string; patientName: string; info: PatientPrivacy; onClose: () => void; onDone: () => void;
}) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const r = info.retention;
  const early = !r.canErase;
  const openErasure = info.requests.find(q => q.kind === 'erasure' && (q.status === 'received' || q.status === 'in_progress'));
  const save = async () => {
    setBusy(true);
    const res = await anonymisePatient(patientId, { confirm, overrideReason: reason.trim() || undefined, requestId: openErasure?.id });
    setBusy(false);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not erase', variant: 'error' });
    toast({ title: res.data.message, variant: 'success' });
    onDone();
  };
  return (
    <Modal title={`Erase ${patientName}'s identity`} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={save} loading={busy} disabled={confirm.trim().toUpperCase() !== 'ERASE' || (early && (user?.role !== 'super_admin' || !reason.trim()))}>Erase</Button></>}>
      <div className="p-5 space-y-3 text-[14px]">
        <p>This removes their name, phone, email, address, login, photos and X-ray files, and message text. Clinical notes, treatment and bills stay under an anonymous record. <strong>This can't be undone.</strong></p>
        {early && (
          <p className="rounded-control bg-warning/[0.08] text-warning p-3 text-[13px]">
            Records must be kept until {r.keepUntil ? format(parseISO(r.keepUntil), 'd MMM yyyy') : '–'}.
            {user?.role === 'super_admin' ? ' To erase earlier, record the legal reason.' : ' Only the platform admin can erase earlier. You can stop messages now.'}
          </p>
        )}
        {early && user?.role === 'super_admin' && <Field label="Reason for erasing early"><Input value={reason} onChange={e => setReason(e.target.value)} /></Field>}
        <Field label='Type ERASE to confirm'><Input value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></Field>
      </div>
    </Modal>
  );
}

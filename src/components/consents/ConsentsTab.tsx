import React, { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import {
  Check, Copy, FileSignature, Link2, Plus, Printer, ShieldCheck, ShieldAlert, Tablet, X, Ban, Clock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  ConsentForm, ConsentTemplate, getConsent, getConsents, getConsentTemplates, getMyConsents, prepareConsent,
  revokeConsent, sendConsentLink, signConsentInClinic, signMyConsent,
} from '../../api/prescriptionsService';
import { ConsentSignForm } from './ConsentSignForm';
import { User } from '../../types';

const VIA: Record<string, string> = { clinic_device: 'Signed in clinic', remote_link: 'Signed on phone link', patient_portal: 'Signed in patient portal' };

function StatusBadge({ f }: { f: ConsentForm }) {
  if (f.status === 'signed') return <Badge variant="success"><Check className="w-3 h-3" /> Signed</Badge>;
  if (f.status === 'revoked') return <Badge variant="outline">Withdrawn</Badge>;
  return <Badge variant="warning"><Clock className="w-3 h-3" /> Waiting for signature</Badge>;
}

/** Consent forms for one patient. Staff prepare and collect signatures; patients sign their own. */
export function ConsentsTab({ patientId, patientName, dentists = [] }: { patientId: string; patientName?: string; dentists?: User[] }) {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const [forms, setForms] = useState<ConsentForm[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [signing, setSigning] = useState<ConsentForm | null>(null);
  const [viewing, setViewing] = useState<ConsentForm | null>(null);
  const [link, setLink] = useState<{ form: ConsentForm; url: string; expiresAt: string; detail: string; sent: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = isPatient ? await getMyConsents() : await getConsents(patientId);
    setForms(res.data || []);
  }, [patientId, isPatient]);

  useEffect(() => { load(); }, [load]);

  const open = async (f: ConsentForm) => {
    const res = await getConsent(f.id);
    if (res.data) setViewing(res.data);
  };

  const sendLink = async (f: ConsentForm) => {
    setBusy(f.id);
    const res = await sendConsentLink(f.id);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not create the link', variant: 'error' });
    setLink({ form: f, url: res.data.url, expiresAt: res.data.expiresAt, detail: res.data.detail, sent: res.data.whatsappStatus === 'sent' });
    load();
  };

  const revoke = async (f: ConsentForm) => {
    const reason = window.prompt('Why is this form being withdrawn?');
    if (!reason || reason.trim().length < 3) return;
    const res = await revokeConsent(f.id, reason.trim());
    if (res.data) { toast({ title: 'Form withdrawn', variant: 'success' }); load(); setViewing(null); }
    else toast({ title: res.error?.message || 'Could not withdraw', variant: 'error' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Consent forms</h3>
          <p className="text-[13px] text-text-muted">{isPatient ? 'Forms your clinic has asked you to read and sign.' : 'Prepare a form, then let the patient sign on this device or send them a link.'}</p>
        </div>
        {!isPatient && <Button size="sm" onClick={() => setPreparing(true)}><Plus className="w-4 h-4" /> New consent form</Button>}
      </div>

      {forms === null ? (
        <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : forms.length === 0 ? (
        <EmptyState icon={FileSignature} title="No consent forms yet"
          description={isPatient ? 'Nothing to sign right now.' : 'Prepare one before extractions, root canals, implants and other procedures.'}
          actionLabel={isPatient ? undefined : 'New consent form'} onAction={isPatient ? undefined : () => setPreparing(true)} />
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {forms.map(f => (
            <li key={f.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <button className="flex-1 min-w-0 text-left" onClick={() => open(f)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{f.title}</span>
                  <StatusBadge f={f} />
                </div>
                <div className="text-[13px] text-text-muted truncate">
                  {[f.procedure, f.teeth.length ? `Tooth ${f.teeth.join(', ')}` : '', f.dentistName].filter(Boolean).join(' · ') || 'General'}
                </div>
                <div className="text-[12px] text-text-muted">
                  {f.status === 'signed' && f.signedAt ? `${VIA[f.signedVia || ''] || 'Signed'} ${format(parseISO(f.signedAt), 'd MMM yyyy, h:mm a')}` :
                    f.status === 'revoked' ? `Withdrawn${f.revokeReason ? `: ${f.revokeReason}` : ''}` :
                    f.linkExpiresAt ? `Link sent, valid ${formatDistanceToNowStrict(parseISO(f.linkExpiresAt))} more` : `Prepared ${formatDistanceToNowStrict(parseISO(f.createdAt))} ago`}
                </div>
              </button>
              {f.status === 'pending' && (
                <div className="flex gap-2 sm:flex-none">
                  <Button size="sm" onClick={() => setSigning(f)}>
                    {isPatient ? <><FileSignature className="w-4 h-4" /> Read and sign</> : <><Tablet className="w-4 h-4" /> Sign on this device</>}
                  </Button>
                  {!isPatient && (
                    <Button size="sm" variant="outline" onClick={() => sendLink(f)} loading={busy === f.id}><Link2 className="w-4 h-4" /> Send link</Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {preparing && (
        <PrepareDialog patientId={patientId} dentists={dentists} onClose={() => setPreparing(false)}
          onPrepared={f => { setPreparing(false); load(); setSigning(f); }} />
      )}

      {signing && (
        <SignDialog form={signing} defaultName={signing.patientName || patientName || ''} onClose={() => setSigning(null)}
          onSign={async s => {
            const res = isPatient ? await signMyConsent(signing.id, s) : await signConsentInClinic(signing.id, s);
            if (res.error || !res.data) return res.error?.message || 'Could not save the signature';
            setSigning(null);
            toast({ title: 'Consent signed and saved', variant: 'success' });
            load();
            setViewing(res.data);
            return null;
          }} />
      )}

      {viewing && <ViewDialog form={viewing} canRevoke={!isPatient && viewing.status !== 'revoked'} onRevoke={() => revoke(viewing)} onClose={() => setViewing(null)} />}

      {link && <LinkDialog {...link} onClose={() => setLink(null)} />}
    </div>
  );
}

function Shell({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50 print:hidden" />
        <Dialog.Content className={`fixed z-50 inset-x-0 bottom-0 top-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} sm:max-h-[92vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col print:static print:translate-x-0 print:translate-y-0 print:max-h-none print:shadow-none`}>
          <div className="flex items-center justify-between px-5 h-14 border-b border-line flex-none print:hidden">
            <Dialog.Title className="text-[17px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-surface-hover" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 flex-none print:hidden">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PrepareDialog({ patientId, dentists, onClose, onPrepared }: { patientId: string; dentists: User[]; onClose: () => void; onPrepared: (f: ConsentForm) => void }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ConsentTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [procedure, setProcedure] = useState('');
  const [teeth, setTeeth] = useState('');
  const [dentistId, setDentistId] = useState(user?.role === 'dentist' ? user.id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConsentTemplates().then(r => { setTemplates(r.data || []); if (r.data?.[0]) setTemplateId(r.data[0].id); });
  }, []);

  const chosen = templates?.find(t => t.id === templateId);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await prepareConsent(patientId, {
      templateId, procedure: procedure.trim() || undefined, dentistId: dentistId || undefined,
      teeth: teeth.split(/[,\s]+/).map(t => t.trim()).filter(Boolean),
    });
    setBusy(false);
    if (res.error || !res.data) setError(res.error?.message || 'Could not prepare the form');
    else onPrepared(res.data);
  };

  return (
    <Shell title="New consent form" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!templateId}>Prepare form</Button></>}>
      {templates === null ? <div className="p-5"><Skeleton className="h-48 w-full" /></div> : (
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium">Form</span>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-control border border-line bg-surface text-sm">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[13px] font-medium">Procedure</span>
              <Input className="mt-1" value={procedure} onChange={e => setProcedure(e.target.value)} placeholder="e.g. Surgical extraction" />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium">Teeth</span>
              <Input className="mt-1" value={teeth} onChange={e => setTeeth(e.target.value)} placeholder="e.g. 38, 48" />
            </label>
          </div>
          {dentists.length > 0 && (
            <label className="block">
              <span className="text-[13px] font-medium">Dentist</span>
              <select value={dentistId} onChange={e => setDentistId(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-control border border-line bg-surface text-sm">
                <option value="">Not specified</option>
                {dentists.map(d => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
              </select>
            </label>
          )}
          {chosen && (
            <div className="rounded-control bg-surface-hover p-3 text-[13px] text-text-muted max-h-40 overflow-y-auto">
              {chosen.body}
            </div>
          )}
          {error && <p className="text-[13px] text-error">{error}</p>}
        </div>
      )}
    </Shell>
  );
}

function SignDialog({ form, defaultName, onClose, onSign }: { form: ConsentForm; defaultName: string; onClose: () => void; onSign: Parameters<typeof ConsentSignForm>[0]['onSubmit'] }) {
  return (
    <Shell title="Read and sign" onClose={onClose} wide>
      <div className="p-5">
        <p className="text-[12px] text-text-muted mb-4">{form.clinicName}{form.dentistName ? ` · ${form.dentistName}` : ''}</p>
        <ConsentSignForm title={form.title} body={form.body} risks={form.risks} defaultName={defaultName} onSubmit={onSign} />
      </div>
    </Shell>
  );
}

function ViewDialog({ form, canRevoke, onRevoke, onClose }: { form: ConsentForm; canRevoke: boolean; onRevoke: () => void; onClose: () => void }) {
  return (
    <Shell title={form.title} onClose={onClose} wide
      footer={<>
        {canRevoke && <Button variant="ghost" className="text-error mr-auto" onClick={onRevoke}><Ban className="w-4 h-4" /> Withdraw</Button>}
        <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
        <Button onClick={onClose}>Done</Button>
      </>}>
      <article className="print-area p-5 sm:p-8 space-y-4 text-text-main">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-3">
          <div>
            <div className="text-[13px] text-text-muted">{form.clinicName}</div>
            <h2 className="text-lg font-semibold">{form.title}</h2>
          </div>
          <StatusBadge f={form} />
        </header>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-text-muted">Patient</dt><dd>{form.patientName}</dd>
          {form.procedure && <><dt className="text-text-muted">Procedure</dt><dd>{form.procedure}</dd></>}
          {form.teeth.length > 0 && <><dt className="text-text-muted">Teeth</dt><dd>{form.teeth.join(', ')}</dd></>}
          {form.dentistName && <><dt className="text-text-muted">Dentist</dt><dd>{form.dentistName}</dd></>}
        </dl>
        <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{form.body}</p>
        {form.risks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-1">Risks explained</h3>
            <ul className="list-disc pl-5 text-[14px] space-y-0.5">{form.risks.map(r => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
        {form.status !== 'pending' && form.signedAt && (
          <section className="border-t border-line pt-4 grid sm:grid-cols-2 gap-4 items-end">
            <div>
              {form.signature && <img src={form.signature} alt={`Signature of ${form.signedByName}`} className="h-24 w-auto max-w-full border-b border-text-muted/40" />}
              <div className="text-[13px] mt-1"><strong>{form.signedByName}</strong>{form.signerRelationship && form.signerRelationship !== 'Self' ? ` (${form.signerRelationship})` : ''}</div>
            </div>
            <div className="text-[12px] text-text-muted space-y-0.5">
              <div>{VIA[form.signedVia || ''] || 'Signed'} on {format(parseISO(form.signedAt), 'd MMM yyyy, h:mm a')}</div>
              {form.witnessName && <div>Witnessed by {form.witnessName}</div>}
              <div className={`flex items-center gap-1 ${form.verified ? 'text-success' : 'text-error'}`}>
                {form.verified ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {form.verified ? 'Unchanged since signing' : 'Record does not match its seal'}
              </div>
              {form.contentHash && <div className="font-mono break-all text-[10px]">Seal {form.contentHash}</div>}
            </div>
          </section>
        )}
        {form.status === 'revoked' && <p className="text-[13px] text-error">Withdrawn {form.revokedAt ? format(parseISO(form.revokedAt), 'd MMM yyyy') : ''}{form.revokeReason ? `: ${form.revokeReason}` : ''}</p>}
      </article>
    </Shell>
  );
}

function LinkDialog({ url, expiresAt, detail, sent, onClose }: { form: ConsentForm; url: string; expiresAt: string; detail: string; sent: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copy this link', url); }
  };
  return (
    <Shell title="Signing link" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="p-5 space-y-3">
        <p className={`text-sm ${sent ? 'text-success' : 'text-warning'}`}>{sent ? 'Sent to the patient on WhatsApp.' : detail}</p>
        <div className="flex gap-2">
          <Input readOnly value={url} onFocus={e => e.currentTarget.select()} aria-label="Signing link" />
          <Button variant="outline" onClick={copy} aria-label="Copy link">{copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}</Button>
        </div>
        <p className="text-[12px] text-text-muted">Works once, until {format(parseISO(expiresAt), 'd MMM, h:mm a')}. Sending a new link cancels this one.</p>
      </div>
    </Shell>
  );
}

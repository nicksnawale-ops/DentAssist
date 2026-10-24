import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass, textareaClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { createLead, Lead, LeadMeta, LeadSource, SOURCE_LABEL } from '../../api/leadsService';

/** Front desk logs a call, walk-in or message that came in outside the website form. */
export function NewLeadDialog({ clinicId, meta, onClose, onCreated }: {
  clinicId?: string; meta: LeadMeta | null; onClose: () => void; onCreated: (lead: Lead) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState<LeadSource>('phone');
  const [interest, setInterest] = useState('');
  const [message, setMessage] = useState('');
  const [value, setValue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [consent, setConsent] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter their name';
    if (phone.replace(/\D/g, '').length < 10) errs.phone = 'Enter a 10-digit mobile number';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const res = await createLead({
      clinicId, name: name.trim(), phone, source, interest: interest || undefined, message: message.trim() || undefined,
      estimatedValue: value ? Number(value) : undefined, assignedToId: assignee || undefined, whatsappConsent: consent, language,
    });
    setBusy(false);
    if (res.error || !res.data) {
      setErrors(res.error?.fieldErrors || {});
      return toast({ title: res.error?.message || 'Could not save', variant: 'error' });
    }
    toast(res.data.merged
      ? { title: `${res.data.lead.name} already had an open enquiry`, description: 'Added this to it instead of making a duplicate.', variant: 'success' }
      : { title: 'Enquiry added', variant: 'success' });
    onCreated(res.data.lead);
  };

  return (
    <Modal title="Add enquiry" subtitle="A call, walk-in or message" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="new-lead" loading={busy}>Add enquiry</Button></>}>
      <form id="new-lead" onSubmit={save} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} autoFocus />{errors.name && <span className="text-[12px] text-error">{errors.name}</span>}</Field>
        <Field label="Mobile number"><Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="98765 43210" />{errors.phone && <span className="text-[12px] text-error">{errors.phone}</span>}</Field>
        <Field label="How they reached us">
          <select value={source} onChange={e => setSource(e.target.value as LeadSource)} className={selectClass}>
            {(meta?.sources || (Object.keys(SOURCE_LABEL) as LeadSource[])).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Interested in">
          <select value={interest} onChange={e => setInterest(e.target.value)} className={selectClass}>
            <option value="">Not sure yet</option>
            {(meta?.interests || []).map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Likely treatment value (optional)"><Input type="number" min={0} value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 40000" /></Field>
        <Field label="Who follows up">
          <select value={assignee} onChange={e => setAssignee(e.target.value)} className={selectClass}>
            <option value="">Front desk (anyone)</option>
            {(meta?.staff || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="What they asked (optional)"><textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} className={textareaClass} /></Field></div>
        <Field label="Message language">
          <select value={language} onChange={e => setLanguage(e.target.value as 'en' | 'hi' | 'mr')} className={selectClass}>
            <option value="en">English</option><option value="hi">Hindi</option><option value="mr">Marathi</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 text-[13px] sm:pt-6">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line text-primary" checked={consent} onChange={e => setConsent(e.target.checked)} />
          They agreed to WhatsApp messages
        </label>
      </form>
    </Modal>
  );
}

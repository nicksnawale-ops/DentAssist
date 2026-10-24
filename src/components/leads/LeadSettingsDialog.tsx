import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { getClinics } from '../../api/apiService';
import { getLeadSettings, LeadSettings, saveLeadSettings } from '../../api/leadsService';
import { Clinic } from '../../types';

export function LeadSettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<LeadSettings | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getLeadSettings().then(r => r.data && setS(r.data));
    getClinics().then(r => setClinics((r.data || []).filter(c => c.status !== 'inactive')));
  }, []);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    const res = await saveLeadSettings(s);
    setBusy(false);
    if (res.data) { toast({ title: 'Enquiry settings saved', variant: 'success' }); onClose(); }
    else toast({ title: res.error?.message || 'Could not save', variant: 'error' });
  };

  return (
    <Modal title="Enquiry settings" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!s}>Save</Button></>}>
      {!s ? <p className="p-5 text-sm text-text-muted">Loading…</p> : (
        <div className="p-5 space-y-4">
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-line text-primary" checked={s.autoAcknowledge} onChange={e => setS({ ...s, autoAcknowledge: e.target.checked })} />
            <span>Send an instant WhatsApp “thank you, we'll call you” to new enquiries <span className="block text-[12px] text-text-muted">Only to people who ticked the WhatsApp box.</span></span>
          </label>
          <Field label="Call new enquiries back within (minutes)" hint="After this, the enquiry shows as overdue and the owner is alerted.">
            <Input type="number" min={1} max={1440} value={s.firstResponseMinutes} onChange={e => setS({ ...s, firstResponseMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Default gap between follow-ups (days)">
            <Input type="number" min={1} max={60} value={s.followUpDays} onChange={e => setS({ ...s, followUpDays: Number(e.target.value) })} />
          </Field>
          {clinics.length > 1 && (
            <Field label="WhatsApp messages from new numbers go to" hint="Needed when you have more than one clinic on the same WhatsApp number.">
              <select value={s.whatsappClinicId || ''} onChange={e => setS({ ...s, whatsappClinicId: e.target.value || null })} className={selectClass}>
                <option value="">Don't create enquiries</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

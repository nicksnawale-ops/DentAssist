import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import {
  addSteriliser, getSterilisationSettings, saveSterilisationSettings, SterilisationSettings, SteriliserStatus,
  STERILISER_KIND_LABEL, updateSteriliser,
} from '../../api/complianceService';

/** Add a steriliser, or update service dates / take it in and out of service. */
export function SteriliserDialog({ clinicId, steriliser, onClose, onSaved }: {
  clinicId?: string; steriliser?: SteriliserStatus; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(steriliser?.name || '');
  const [kind, setKind] = useState(steriliser?.kind || 'autoclave_b');
  const [serial, setSerial] = useState(steriliser?.serialNumber || '');
  const [serviced, setServiced] = useState(steriliser?.lastServicedOn || '');
  const [interval, setIntervalDays] = useState(String(steriliser?.serviceIntervalDays || 180));
  const [validated, setValidated] = useState(steriliser?.validatedOn || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (active?: boolean) => {
    setBusy(true);
    const res = steriliser
      ? await updateSteriliser(steriliser.id, {
        name, serviceIntervalDays: Number(interval),
        lastServicedOn: serviced && serviced !== steriliser.lastServicedOn ? serviced : undefined,
        validatedOn: validated && validated !== steriliser.validatedOn ? validated : undefined,
        ...(active !== undefined ? { isActive: active, note: note.trim() || undefined } : {}),
      })
      : await addSteriliser({ clinicId, name, kind, serialNumber: serial || undefined, lastServicedOn: serviced || undefined, serviceIntervalDays: Number(interval) });
    setBusy(false);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    toast({ title: active === true ? 'Back in service' : active === false ? 'Taken out of service' : 'Saved', variant: 'success' });
    onSaved();
  };

  return (
    <Modal title={steriliser ? steriliser.name : 'Add steriliser'} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => save()} loading={busy} disabled={!name.trim()}>Save</Button></>}>
      <div className="p-5 space-y-4">
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Autoclave A" /></Field>
        {!steriliser && (
          <>
            <Field label="Type">
              <select value={kind} onChange={e => setKind(e.target.value)} className={selectClass}>
                {Object.entries(STERILISER_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Serial number"><Input value={serial} onChange={e => setSerial(e.target.value)} /></Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Last serviced"><Input type="date" value={serviced} onChange={e => setServiced(e.target.value)} /></Field>
          <Field label="Service every (days)"><Input type="number" min={7} max={730} value={interval} onChange={e => setIntervalDays(e.target.value)} /></Field>
        </div>
        {steriliser && <Field label="Last validated"><Input type="date" value={validated} onChange={e => setValidated(e.target.value)} /></Field>}
        {steriliser && (
          <div className="rounded-control border border-line p-3 space-y-2">
            <div className="text-[13px] font-medium">{steriliser.isActive ? 'Take out of service' : 'Out of service'}</div>
            {!steriliser.isActive && steriliser.outOfServiceReason && <p className="text-[13px] text-error">{steriliser.outOfServiceReason}</p>}
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder={steriliser.isActive ? 'Reason (e.g. door seal leaking)' : 'What was fixed, and the passing retest'} />
            <Button size="sm" variant={steriliser.isActive ? 'danger' : 'secondary'} onClick={() => save(!steriliser.isActive)} loading={busy}
              disabled={steriliser.isActive ? !note.trim() : !(note.trim() || serviced !== (steriliser.lastServicedOn || ''))}>
              {steriliser.isActive ? 'Take out of service' : 'Put back in service'}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SterilisationSettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<SterilisationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getSterilisationSettings().then(r => r.data && setS(r.data)); }, []);
  const save = async () => {
    if (!s) return;
    setBusy(true);
    const res = await saveSterilisationSettings(s);
    setBusy(false);
    if (res.data) { toast({ title: 'Settings saved', variant: 'success' }); onClose(); } else toast({ title: res.error?.message || 'Could not save', variant: 'error' });
  };
  const num = (k: keyof SterilisationSettings) => (e: React.ChangeEvent<HTMLInputElement>) => s && setS({ ...s, [k]: Number(e.target.value) });
  return (
    <Modal title="Sterilisation settings" size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!s}>Save</Button></>}>
      {!s ? <p className="p-5 text-sm text-text-muted">Loading…</p> : (
        <div className="p-5 space-y-4">
          <Field label="Pack shelf life (days)" hint="Set this to match your infection-control policy and pouch maker's guidance.">
            <Input type="number" min={1} max={365} value={s.shelfLifeDays} onChange={num('shelfLifeDays')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum temperature °C"><Input type="number" value={s.minTemperatureC} onChange={num('minTemperatureC')} /></Field>
            <Field label="Minimum hold (min)"><Input type="number" value={s.minHoldMinutes} onChange={num('minHoldMinutes')} /></Field>
          </div>
          <Field label="Spore test every (days)"><Input type="number" min={1} max={90} value={s.sporeTestEveryDays} onChange={num('sporeTestEveryDays')} /></Field>
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-line text-primary" checked={s.requireDailyTest} onChange={e => setS({ ...s, requireDailyTest: e.target.checked })} />
            <span>Block loads until today's Bowie-Dick/helix test has passed <span className="block text-[12px] text-text-muted">Class B and S autoclaves. Otherwise staff only see a warning.</span></span>
          </label>
          <label className="flex items-start gap-2 text-[14px]">
            <input type="checkbox" className="mt-1 h-4 w-4 rounded border-line text-primary" checked={s.holdForSporeTest} onChange={e => setS({ ...s, holdForSporeTest: e.target.checked })} />
            <span>Hold packs until the spore test in their load is read</span>
          </label>
        </div>
      )}
    </Modal>
  );
}

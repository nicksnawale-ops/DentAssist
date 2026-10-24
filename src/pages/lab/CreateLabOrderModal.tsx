import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { Modal, Field, selectClass, textareaClass } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { getPatients, getStaff } from '../../api/apiService';
import { createLabOrder, getSuppliers, LAB_ITEMS, LabOrder, Supplier } from '../../api/inventoryService';
import { Patient, User } from '../../types';

const SHADES = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4', 'BL1', 'BL2'];
const MATERIALS: Record<string, string[]> = {
  Crown: ['Zirconia', 'PFM', 'E-max', 'Full metal'], Bridge: ['Zirconia', 'PFM', 'E-max'], Veneer: ['E-max', 'Composite'],
  'Inlay/Onlay': ['E-max', 'Composite', 'Gold'], Denture: ['Acrylic', 'Flexible', 'Cast partial'], Aligner: ['Clear aligner'],
  'Night Guard': ['Hard acrylic', 'Soft', 'Dual laminate'], Retainer: ['Essix', 'Hawley', 'Fixed'], 'Implant Component': ['Abutment', 'Screw-retained crown'],
};

export function CreateLabOrderModal({ onClose, defaultPatientId, defaultToothNumbers, onCreated }: {
  onClose: () => void; defaultPatientId?: string; defaultToothNumbers?: string[]; onCreated?: (o: LabOrder) => void;
}) {
  const { user, selectedClinicId } = useAuth();
  const [labs, setLabs] = useState<Supplier[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<User[]>([]);
  const [patientId, setPatientId] = useState(defaultPatientId || '');
  const [labId, setLabId] = useState('');
  const [itemType, setItemType] = useState<string>('Crown');
  const [teeth, setTeeth] = useState(defaultToothNumbers?.join(', ') || '');
  const [shade, setShade] = useState('');
  const [material, setMaterial] = useState('');
  const [instructions, setInstructions] = useState('');
  const [expected, setExpected] = useState('');
  const [cost, setCost] = useState(0);
  const [dentistId, setDentistId] = useState(user?.role === 'dentist' ? user.id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSuppliers({ labs: true }).then(r => { setLabs(r.data || []); if (r.data?.[0]) setLabId(r.data[0].id); });
    if (!defaultPatientId) getPatients({ clinicId: selectedClinicId }).then(r => setPatients(r.data || []));
    if (user?.role !== 'dentist') getStaff().then(r => setDentists((r.data || []).filter(s => s.role === 'dentist' && s.status !== 'inactive')));
  }, [defaultPatientId, selectedClinicId, user?.role]);

  const lab = labs.find(l => l.id === labId);
  const defaultDue = useMemo(() => format(addDays(new Date(), lab?.turnaroundDays || 7), 'yyyy-MM-dd'), [lab]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await createLabOrder({
      patientId, labId, itemType, toothNumbers: teeth.split(/[,\s]+/).map(t => t.trim()).filter(Boolean), shade, material,
      instructions: instructions.trim() || undefined, expectedDate: expected || undefined, cost, dentistId: dentistId || undefined,
    });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not create the lab case'); return; }
    toast({ title: `${res.data.orderNumber} sent to ${res.data.labName}`, variant: 'success' });
    onCreated?.(res.data);
    if (!onCreated) onClose();
  };

  return (
    <Modal title="New lab case" onClose={onClose} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!patientId || !labId}>Send to lab</Button></>}>
      <div className="p-5 grid sm:grid-cols-2 gap-3">
        {!defaultPatientId && (
          <div className="sm:col-span-2">
            <Field label="Patient">
              <select value={patientId} onChange={e => setPatientId(e.target.value)} className={selectClass}>
                <option value="">Choose a patient…</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} · {p.phone}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field label="Lab">
          <select value={labId} onChange={e => setLabId(e.target.value)} className={selectClass}>
            {labs.map(l => <option key={l.id} value={l.id}>{l.name}{l.turnaroundDays ? ` (${l.turnaroundDays} days)` : ''}</option>)}
          </select>
        </Field>
        <Field label="Work">
          <select value={itemType} onChange={e => { setItemType(e.target.value); setMaterial(''); }} className={selectClass}>
            {LAB_ITEMS.map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Teeth" hint="FDI numbers, e.g. 16 or 14, 15, 16"><Input value={teeth} onChange={e => setTeeth(e.target.value)} /></Field>
        <Field label="Shade">
          <select value={shade} onChange={e => setShade(e.target.value)} className={selectClass}>
            <option value="">Not needed</option>
            {SHADES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Material">
          <Input value={material} onChange={e => setMaterial(e.target.value)} list="lab-materials" placeholder={MATERIALS[itemType]?.[0] || ''} />
          <datalist id="lab-materials">{(MATERIALS[itemType] || []).map(m => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Due back" hint={`Lab's usual time: ${defaultDue}`}>
          <Input type="date" value={expected} min={format(new Date(), 'yyyy-MM-dd')} onChange={e => setExpected(e.target.value)} placeholder={defaultDue} />
        </Field>
        <Field label="Lab charge"><Input type="number" min={0} value={cost} onChange={e => setCost(Number(e.target.value))} /></Field>
        {dentists.length > 0 && (
          <Field label="Dentist">
            <select value={dentistId} onChange={e => setDentistId(e.target.value)} className={selectClass}>
              <option value="">Not specified</option>
              {dentists.map(d => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
            </select>
          </Field>
        )}
        <div className="sm:col-span-2"><Field label="Instructions for the lab"><textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} className={textareaClass} placeholder="Margins, occlusion, contacts, special requests" /></Field></div>
        {error && <p className="sm:col-span-2 text-[13px] text-error">{error}</p>}
      </div>
    </Modal>
  );
}

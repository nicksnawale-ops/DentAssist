import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Crown, IndianRupee, Plus, Search, Users, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import { getPatients } from '../../api/apiService';
import {
  Family, FamilyStatement, getFamily, getFamilyStatement, getFamilySuggestions, linkFamily, payFamily, RELATIONS, setFamilyHead, unlinkFamily,
} from '../../api/familyService';
import { Patient } from '../../types';

/** Family members on a patient's profile: link relatives, choose the account holder, take one payment for all. */
export function FamilyCard({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { user } = useAuth();
  const canBill = user?.role !== 'dentist';
  const { formatCurrency } = useCurrency();
  const [family, setFamily] = useState<Family | null | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<{ patientId: string; name: string; inFamily: boolean }[]>([]);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = () => {
    getFamily(patientId).then(r => setFamily(r.data ?? null));
    getFamilySuggestions(patientId).then(r => setSuggestions((r.data || []).filter(s => !s.inFamily)));
  };
  useEffect(load, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (pid: string, name: string) => {
    if (!window.confirm(`Remove ${name} from the family?`)) return;
    const res = await unlinkFamily(pid);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    load();
  };

  const makeHead = async (pid: string) => {
    if (!family) return;
    const res = await setFamilyHead(family.id, pid);
    if (res.data) { setFamily(res.data); toast({ title: 'Account holder changed', variant: 'success' }); }
  };

  if (family === undefined) return null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="text-[15px] font-semibold mr-auto">{family ? family.name : 'Family'}</h3>
        {family && canBill && family.totalBalance > 0 && (
          <Button size="sm" variant="outline" onClick={() => setPaying(true)}><IndianRupee className="w-4 h-4" /> Family payment</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add member</Button>
      </div>
      {!family ? (
        <p className="text-[13px] text-text-muted">Link relatives so one person can book, see records and pay for everyone from a single login.</p>
      ) : (
        <ul className="divide-y divide-line">
          {family.members.map(m => (
            <li key={m.patientId} className="py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <Link to={`/patients/${m.patientId}`} className={`text-sm font-medium hover:text-primary ${m.patientId === patientId ? 'text-primary' : ''}`}>{m.name}</Link>
                <div className="text-[12px] text-text-muted">
                  {m.isHead ? 'Account holder' : m.relation || 'Member'}
                  {m.nextAppointment ? ` · next ${format(parseISO(m.nextAppointment), 'd MMM')}` : ''}
                  {m.balance > 0 ? ` · owes ${formatCurrency(m.balance)}` : ''}
                </div>
              </div>
              {m.isHead ? <Crown className="w-4 h-4 text-warning" aria-label="Account holder" /> : (
                <button className="text-[12px] text-text-muted hover:text-primary" onClick={() => makeHead(m.patientId)}>Make account holder</button>
              )}
              <button className="p-1 text-text-muted hover:text-error" onClick={() => remove(m.patientId, m.name)} aria-label={`Remove ${m.name} from the family`}><X className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-control bg-accent/[0.06] p-3 text-[13px]">
          <div className="font-medium mb-1">Same mobile number</div>
          {suggestions.map(s => (
            <div key={s.patientId} className="flex items-center gap-2 py-0.5">
              <span className="flex-1">{s.name}</span>
              <Button size="sm" variant="ghost" onClick={async () => {
                const res = await linkFamily(s.patientId, family?.headPatientId || patientId, 'Other');
                if (res.error) return toast({ title: res.error.message, variant: 'error' });
                toast({ title: `${s.name} added to the family`, variant: 'success' });
                load();
              }}>Add to family</Button>
            </div>
          ))}
        </div>
      )}
      {family && family.totalBalance > 0 && <p className="text-[13px]">Family owes <strong>{formatCurrency(family.totalBalance)}</strong></p>}

      {adding && <AddMemberDialog patientId={patientId} patientName={patientName} family={family} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      {paying && family && <FamilyPaymentDialog family={family} onClose={() => setPaying(false)} onDone={() => { setPaying(false); load(); }} />}
    </Card>
  );
}

function AddMemberDialog({ patientId, patientName, family, onClose, onDone }: { patientId: string; patientName: string; family: Family | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [chosen, setChosen] = useState<Patient | null>(null);
  const [relation, setRelation] = useState<string>('Child');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => getPatients({ search: q.trim() }).then(r => setResults((r.data || []).filter(p => p.id !== patientId && !family?.members.some(m => m.patientId === p.id)).slice(0, 8))), 250);
    return () => clearTimeout(t);
  }, [q, patientId, family]);

  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    // The current patient becomes the account holder if there's no family yet.
    const res = await linkFamily(chosen.id, family?.headPatientId || patientId, relation);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    toast({ title: `${chosen.firstName} added to the family`, variant: 'success' });
    onDone();
  };

  return (
    <Modal title="Add a family member" subtitle={family ? undefined : `${patientName} will be the account holder`} onClose={onClose} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!chosen}>Add</Button></>}>
      <div className="p-5 space-y-3">
        {!chosen ? (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or phone" className="pl-9" autoFocus />
            </div>
            <ul className="divide-y divide-line">
              {results.map(p => (
                <li key={p.id}><button className="w-full text-left py-2 hover:bg-surface-hover px-1" onClick={() => setChosen(p)}>
                  <div className="text-sm font-medium">{p.firstName} {p.lastName}</div><div className="text-[12px] text-text-muted">{p.phone}</div>
                </button></li>
              ))}
            </ul>
            <p className="text-[12px] text-text-muted">Not registered yet? Register them first, then add them here.</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-control bg-surface-hover p-2.5">
              <span className="text-sm font-medium">{chosen.firstName} {chosen.lastName}</span>
              <button className="text-[12px] text-primary" onClick={() => setChosen(null)}>Change</button>
            </div>
            <Field label={`Relationship to the account holder`}>
              <select value={relation} onChange={e => setRelation(e.target.value)} className={selectClass}>{RELATIONS.map(r => <option key={r}>{r}</option>)}</select>
            </Field>
          </>
        )}
        {error && <p className="text-[13px] text-error">{error}</p>}
        <p className="text-[12px] text-text-muted">The account holder's portal login can book, see records and pay bills for every member.</p>
      </div>
    </Modal>
  );
}

function FamilyPaymentDialog({ family, onClose, onDone }: { family: Family; onClose: () => void; onDone: () => void }) {
  const { formatCurrency } = useCurrency();
  const [st, setSt] = useState<FamilyStatement | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('UPI');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getFamilyStatement(family.id).then(r => { setSt(r.data); setAmount(r.data?.totalDue || 0); }); }, [family.id]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const res = await payFamily(family.id, amount, method, ref || undefined);
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not record'); return; }
    toast({ title: `${formatCurrency(res.data.amount)} applied to ${res.data.applied.length} ${res.data.applied.length === 1 ? 'invoice' : 'invoices'}`, variant: 'success' });
    onDone();
  };

  return (
    <Modal title="Family payment" subtitle={family.name} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={pay} loading={busy} disabled={!st || amount <= 0 || amount > (st?.totalDue || 0)}>Record {formatCurrency(amount)}</Button></>}>
      <div className="p-5 space-y-4">
        {!st ? <p className="text-sm text-text-muted">Loading…</p> : (
          <>
            <table className="w-full text-[13px]">
              <thead className="text-text-muted text-left"><tr><th className="font-medium py-1">Invoice</th><th className="font-medium">For</th><th className="font-medium">Due</th><th className="font-medium text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-line">
                {st.invoices.map(i => <tr key={i.invoiceId}><td className="py-1.5">{i.invoiceNumber}</td><td>{i.patientName}</td><td>{format(parseISO(i.dueDate), 'd MMM')}</td><td className="text-right tabular-nums">{formatCurrency(i.balanceDue)}</td></tr>)}
              </tbody>
              <tfoot><tr><td colSpan={3} className="pt-2 font-semibold">Total due</td><td className="pt-2 text-right font-semibold tabular-nums">{formatCurrency(st.totalDue)}</td></tr></tfoot>
            </table>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount"><Input type="number" min={1} max={st.totalDue} value={amount} onChange={e => setAmount(Number(e.target.value))} /></Field>
              <Field label="Method"><select value={method} onChange={e => setMethod(e.target.value)} className={selectClass}>{['UPI', 'Cash', 'Card', 'Bank Transfer', 'Cheque'].map(m => <option key={m}>{m}</option>)}</select></Field>
              <div className="col-span-2"><Field label="Reference (optional)"><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="UPI ref / cheque no." /></Field></div>
            </div>
            <p className="text-[12px] text-text-muted">Applied to the oldest bills first. Each invoice gets its own receipt.</p>
          </>
        )}
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Modal>
  );
}

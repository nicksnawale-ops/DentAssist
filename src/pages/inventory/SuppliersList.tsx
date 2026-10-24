import React, { useEffect, useState } from 'react';
import { FlaskConical, Mail, Pencil, Phone, Plus, Truck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal, Field, textareaClass } from '../../components/ui/Modal';
import { toast } from '../../components/ui/useToast';
import { useCurrency } from '../../utils/currencyConfig';
import { getSuppliers, saveSupplier, Supplier } from '../../api/inventoryService';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** Suppliers and dental labs, with each lab's track record. */
export function SuppliersList() {
  const [rows, setRows] = useState<Supplier[] | null>(null);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const { formatCurrency } = useCurrency();

  const load = () => getSuppliers().then(r => setRows(r.data || []));
  useEffect(() => { load(); }, []);

  const labs = (rows || []).filter(s => s.isLab);
  const suppliers = (rows || []).filter(s => !s.isLab);

  const card = (s: Supplier) => (
    <div key={s.id} className="rounded-control border border-line p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-none ${s.isLab ? 'bg-accent/10 text-accent' : 'bg-primary/[0.07] text-primary'}`}>
          {s.isLab ? <FlaskConical className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{s.name}</div>
          <div className="text-[12px] text-text-muted">{s.contactPerson}{s.isLab && s.turnaroundDays ? ` · usually ${s.turnaroundDays} days` : ''}</div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil className="w-4 h-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-1">{s.itemsSupplied.map(i => <Badge key={i} variant="outline">{i}</Badge>)}</div>
      <div className="flex flex-wrap gap-3 text-[13px]">
        {s.phone && <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-primary"><Phone className="w-3.5 h-3.5" /> {s.phone}</a>}
        {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 text-primary truncate"><Mail className="w-3.5 h-3.5" /> {s.email}</a>}
      </div>
      {s.isLab && s.performance && s.performance.orders > 0 && (
        <dl className="grid grid-cols-4 gap-2 pt-2 border-t border-line text-center">
          <div><dt className="text-[11px] text-text-muted">Cases (1 yr)</dt><dd className="text-sm font-semibold">{s.performance.orders}</dd></div>
          <div><dt className="text-[11px] text-text-muted">Avg days</dt><dd className="text-sm font-semibold">{s.performance.averageTurnaroundDays ?? '—'}</dd></div>
          <div><dt className="text-[11px] text-text-muted">On time</dt><dd className={`text-sm font-semibold ${(s.performance.onTimeRate ?? 1) < 0.8 ? 'text-warning' : ''}`}>{pct(s.performance.onTimeRate)}</dd></div>
          <div><dt className="text-[11px] text-text-muted">Remakes</dt><dd className={`text-sm font-semibold ${(s.performance.remakeRate ?? 0) > 0.1 ? 'text-error' : ''}`}>{pct(s.performance.remakeRate)}</dd></div>
          <div className="col-span-4 text-[12px] text-text-muted">{formatCurrency(s.performance.spend)} spent{s.performance.openOverdue ? ` · ${s.performance.openOverdue} overdue now` : ''}</div>
        </dl>
      )}
    </div>
  );

  if (!rows) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center"><h3 className="text-[15px] font-semibold mr-auto">Dental labs</h3>
          <Button size="sm" variant="outline" onClick={() => setEditing({ isLab: true, isActive: true, itemsSupplied: [] })}><Plus className="w-4 h-4" /> Add lab</Button></div>
        <div className="grid md:grid-cols-2 gap-3">{labs.map(card)}</div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center"><h3 className="text-[15px] font-semibold mr-auto">Suppliers</h3>
          <Button size="sm" variant="outline" onClick={() => setEditing({ isLab: false, isActive: true, itemsSupplied: [] })}><Plus className="w-4 h-4" /> Add supplier</Button></div>
        <div className="grid md:grid-cols-2 gap-3">{suppliers.map(card)}</div>
      </section>
      {editing && <SupplierDialog value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SupplierDialog({ value, onClose, onSaved }: { value: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<Partial<Supplier>>(value);
  const [items, setItems] = useState((value.itemsSupplied || []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Supplier) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setS(v => ({ ...v, [k]: e.target.type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveSupplier({
      id: s.id, name: s.name || '', contactPerson: s.contactPerson || '', phone: s.phone || '', email: s.email || '', address: s.address || '',
      notes: s.notes || null, itemsSupplied: items.split(',').map(i => i.trim()).filter(Boolean), isLab: !!s.isLab,
      turnaroundDays: s.isLab ? s.turnaroundDays || null : null, isActive: s.isActive ?? true,
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    toast({ title: 'Saved', variant: 'success' });
    onSaved();
  };

  return (
    <Modal title={s.id ? `Edit ${s.name}` : s.isLab ? 'Add lab' : 'Add supplier'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={(s.name || '').length < 2}>Save</Button></>}>
      <div className="p-5 grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label="Name"><Input value={s.name || ''} onChange={set('name')} autoFocus /></Field></div>
        <Field label="Contact person"><Input value={s.contactPerson || ''} onChange={set('contactPerson')} /></Field>
        <Field label="Phone"><Input value={s.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Email"><Input value={s.email || ''} onChange={set('email')} type="email" /></Field>
        {s.isLab && <Field label="Usual turnaround (days)"><Input type="number" min={1} max={90} value={s.turnaroundDays ?? ''} onChange={set('turnaroundDays')} /></Field>}
        <div className="sm:col-span-2"><Field label={s.isLab ? 'Work they do' : 'What they supply'} hint="Separate with commas"><Input value={items} onChange={e => setItems(e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Address"><Input value={s.address || ''} onChange={set('address')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Notes"><textarea rows={2} value={s.notes || ''} onChange={set('notes')} className={textareaClass} /></Field></div>
        {error && <p className="sm:col-span-2 text-[13px] text-error">{error}</p>}
      </div>
    </Modal>
  );
}

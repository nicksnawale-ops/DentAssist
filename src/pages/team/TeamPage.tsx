import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, format, isAfter, parseISO, startOfMonth } from 'date-fns';
import { BadgeIndianRupee, CalendarDays, Check, ChevronLeft, ChevronRight, Lock, Plus, Printer, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal, Field, selectClass } from '../../components/ui/Modal';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import { getStaff } from '../../api/apiService';
import {
  addAdjustment, approvePayout, AttendanceDay, AttendanceStatus, editAttendance, generatePayouts, getMonthAttendance, getMyAttendance,
  getMyPayouts, getPayPlans, getPayouts, markPayoutPaid, PayPlan, Payout, removeAdjustment, reopenPayout, savePayPlan, StaffMonth,
} from '../../api/teamService';
import { User } from '../../types';

const STATUS_STYLE: Record<AttendanceStatus, { label: string; cls: string; short: string }> = {
  present: { label: 'Present', short: 'P', cls: 'bg-success/15 text-success' },
  half_day: { label: 'Half day', short: '½', cls: 'bg-warning/15 text-warning' },
  leave: { label: 'Leave', short: 'L', cls: 'bg-info/15 text-info' },
  absent: { label: 'Absent', short: 'A', cls: 'bg-error/15 text-error' },
  holiday: { label: 'Holiday', short: 'H', cls: 'bg-gray-200 text-text-muted' },
};

function MonthPicker({ period, setPeriod }: { period: string; setPeriod: (p: string) => void }) {
  const d = parseISO(`${period}-01`);
  const next = addMonths(d, 1);
  return (
    <div className="inline-flex items-center gap-1 rounded-control border border-line bg-surface">
      <button className="p-2 hover:bg-surface-hover rounded-l-control" onClick={() => setPeriod(format(addMonths(d, -1), 'yyyy-MM'))} aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-sm font-medium w-28 text-center">{format(d, 'MMMM yyyy')}</span>
      <button className="p-2 hover:bg-surface-hover rounded-r-control disabled:opacity-30" disabled={isAfter(next, new Date())} onClick={() => setPeriod(format(next, 'yyyy-MM'))} aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
}

export function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [tab, setTab] = useState<'attendance' | 'payouts'>(isAdmin ? 'payouts' : 'attendance');
  const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'));
  const showPay = isAdmin || user?.role === 'dentist';

  return (
    <div className="space-y-5">
      <PageHeader title={isAdmin ? 'Team & pay' : user?.role === 'dentist' ? 'My attendance & pay' : 'My attendance'}
        description={isAdmin ? 'Dentist payouts from what they collected, and everyone’s attendance.' : 'Your days at the clinic and your payout statements.'}
        actions={<MonthPicker period={period} setPeriod={setPeriod} />} />
      {showPay && (
        <div className="flex gap-1 border-b border-line" role="tablist">
          {(['payouts', 'attendance'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-11 px-4 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-2 ${tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
              {t === 'payouts' ? <><BadgeIndianRupee className="w-4 h-4" /> Payouts</> : <><CalendarDays className="w-4 h-4" /> Attendance</>}
            </button>
          ))}
        </div>
      )}
      {tab === 'payouts' && showPay ? (isAdmin ? <AdminPayouts period={period} /> : <MyPayouts />) : (isAdmin ? <AdminAttendance period={period} /> : <MyAttendance period={period} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

function AdminPayouts({ period }: { period: string }) {
  const { selectedClinicId, user } = useAuth();
  const { formatCurrency } = useCurrency();
  const clinicId = selectedClinicId === 'all' ? (user?.role === 'admin' ? user.clinicId : undefined) : selectedClinicId;
  const [rows, setRows] = useState<Payout[] | null>(null);
  const [open, setOpen] = useState<Payout | null>(null);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getPayouts(period, clinicId);
    setRows(res.data || []);
  }, [period, clinicId]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    const res = await generatePayouts(period, clinicId);
    setBusy(false);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    setRows(res.data || []);
    toast({ title: `${res.data?.length || 0} statements up to date`, variant: 'success' });
  };

  const total = (rows || []).reduce((s, p) => s + p.netAmount, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-text-muted mr-auto">
          Statements are worked out from payments on invoices credited to each dentist, less their share of lab bills.
          {!clinicId && user?.role === 'super_admin' && ' Pick a clinic at the top to create per-clinic statements.'}
        </p>
        <Button variant="ghost" onClick={() => setRules(true)}><Settings2 className="w-4 h-4" /> Pay rules</Button>
        <Button onClick={generate} loading={busy}><RefreshCw className="w-4 h-4" /> {rows?.length ? 'Recalculate drafts' : 'Create statements'}</Button>
      </div>
      {rows === null ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
        <EmptyState icon={BadgeIndianRupee} title="No statements for this month yet" description="Set each dentist's pay rules, then create the month's statements." actionLabel="Create statements" onAction={generate} />
      ) : (
        <div className="rounded-panel border border-line bg-surface overflow-hidden">
          <ul className="divide-y divide-line">
            {rows.map(p => (
              <li key={p.id}>
                <button onClick={() => setOpen(p)} className="w-full text-left px-4 py-3 hover:bg-surface-hover grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_130px_130px_130px_100px] gap-x-4 gap-y-1 items-center">
                  <div>
                    <div className="text-sm font-semibold">{p.staffName}</div>
                    <div className="text-[12px] text-text-muted">{p.figures.plan?.percent}% of {p.figures.plan?.basis}{p.figures.plan?.labSharePercent ? `, ${p.figures.plan.labSharePercent}% of lab` : ''} · {p.clinicName}</div>
                  </div>
                  <div className="hidden sm:block text-right"><div className="text-[11px] text-text-muted">Collected</div><div className="text-sm tabular-nums">{formatCurrency(p.figures.collections)}</div></div>
                  <div className="hidden sm:block text-right"><div className="text-[11px] text-text-muted">Gross</div><div className="text-sm tabular-nums">{formatCurrency(p.figures.gross)}</div></div>
                  <div className="text-right"><div className="text-[11px] text-text-muted">Net pay</div><div className="text-sm font-semibold tabular-nums">{formatCurrency(p.netAmount)}</div></div>
                  <div className="sm:text-right"><PayoutBadge status={p.status} /></div>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-line bg-surface-hover flex justify-between text-sm"><span className="text-text-muted">Total net pay</span><strong className="tabular-nums">{formatCurrency(total)}</strong></div>
        </div>
      )}
      {open && <PayoutStatement payout={open} admin onClose={() => setOpen(null)} onChanged={p => { setOpen(p); setRows(r => (r || []).map(x => (x.id === p.id ? p : x))); }} />}
      {rules && <PayRulesDialog clinicId={clinicId || null} onClose={() => setRules(false)} />}
    </div>
  );
}

function MyPayouts() {
  const [rows, setRows] = useState<Payout[] | null>(null);
  const [open, setOpen] = useState<Payout | null>(null);
  const { formatCurrency } = useCurrency();
  useEffect(() => { getMyPayouts().then(r => setRows(r.data || [])); }, []);
  if (!rows) return <Skeleton className="h-32 w-full" />;
  if (!rows.length) return <EmptyState icon={BadgeIndianRupee} title="No statements yet" description="Your monthly statement appears here once the clinic approves it." />;
  return (
    <>
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {rows.map(p => (
          <li key={p.id}>
            <button onClick={() => setOpen(p)} className="w-full text-left px-4 py-3 hover:bg-surface-hover flex items-center gap-4">
              <span className="text-sm font-medium flex-1">{format(parseISO(`${p.period}-01`), 'MMMM yyyy')} · {p.clinicName}</span>
              <PayoutBadge status={p.status} />
              <span className="text-sm font-semibold tabular-nums w-28 text-right">{formatCurrency(p.netAmount)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <PayoutStatement payout={open} onClose={() => setOpen(null)} onChanged={setOpen} />}
    </>
  );
}

function PayoutBadge({ status }: { status: Payout['status'] }) {
  return status === 'paid' ? <Badge variant="success"><Check className="w-3 h-3" /> Paid</Badge>
    : status === 'approved' ? <Badge variant="secondary"><Lock className="w-3 h-3" /> Approved</Badge> : <Badge variant="outline">Draft</Badge>;
}

function PayoutStatement({ payout, admin, onClose, onChanged }: { payout: Payout; admin?: boolean; onClose: () => void; onChanged: (p: Payout) => void }) {
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState('Bank Transfer');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const f = payout.figures;
  const draft = payout.status === 'draft';

  const run = async (key: string, fn: () => Promise<{ data: Payout | null; error: { message: string } | null }>, message?: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Something went wrong', variant: 'error' });
    onChanged(res.data);
    if (message) toast({ title: message, variant: 'success' });
  };

  const line = (label: string, value: number, opts: { minus?: boolean; strong?: boolean; hint?: string } = {}) => (
    <div className={`flex justify-between gap-4 py-1.5 ${opts.strong ? 'font-semibold border-t border-line pt-2' : ''}`}>
      <span>{label}{opts.hint && <span className="text-text-muted font-normal"> {opts.hint}</span>}</span>
      <span className="tabular-nums">{opts.minus && value ? '− ' : ''}{formatCurrency(value)}</span>
    </div>
  );

  return (
    <Modal title={`${payout.staffName} · ${format(parseISO(`${payout.period}-01`), 'MMMM yyyy')}`} subtitle={payout.clinicName || undefined} onClose={onClose} size="lg"
      footer={<>
        <Button variant="ghost" className="mr-auto" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
        {admin && user?.role === 'super_admin' && payout.status === 'approved' && <Button variant="outline" onClick={() => run('reopen', () => reopenPayout(payout.id), 'Reopened as draft')} loading={busy === 'reopen'}>Reopen</Button>}
        {admin && draft && <Button onClick={() => run('approve', () => approvePayout(payout.id), 'Approved. The dentist can now see it.')} loading={busy === 'approve'}><Lock className="w-4 h-4" /> Approve</Button>}
        {admin && payout.status === 'approved' && !paying && <Button onClick={() => setPaying(true)}>Mark as paid</Button>}
      </>}>
      <article className="print-area p-5 sm:p-6 space-y-5 text-[14px]">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="hidden print:block text-lg font-semibold">Payout statement · {payout.staffName}</div>
            <div className="text-[13px] text-text-muted">
              {f.plan?.arrangement === 'consultant' ? 'Visiting consultant' : f.plan?.arrangement === 'salaried' ? 'Salaried' : 'Associate'}: {f.plan?.percent}% of {f.plan?.basis}
              {f.plan?.labSharePercent ? `, bears ${f.plan.labSharePercent}% of lab bills` : ''}{f.plan?.minimumGuarantee ? `, minimum ${formatCurrency(f.plan.minimumGuarantee)}` : ''}
            </div>
          </div>
          <PayoutBadge status={payout.status} />
        </header>
        <section>
          {line(f.plan?.basis === 'billing' ? 'Billed' : 'Collected', f.plan?.basis === 'billing' ? f.billing : f.collections, { hint: `(${f.payments.length} payments)` })}
          {f.labDeduction > 0 && line('Share of lab bills', f.labDeduction, { minus: true, hint: `(${f.plan.labSharePercent}% of ${formatCurrency(f.labCosts)})` })}
          {line('Commission base', f.base, { strong: true })}
          {line(`Commission at ${f.plan?.percent}%`, f.commission)}
          {f.fixed > 0 && line('Fixed monthly', f.fixed)}
          {payout.adjustments.map(a => (
            <div key={a.id} className="flex justify-between gap-4 py-1.5">
              <span className="flex items-center gap-1.5">{a.label}
                {admin && draft && <button onClick={() => run('rm' + a.id, () => removeAdjustment(payout.id, a.id))} className="text-text-muted hover:text-error print:hidden" aria-label={`Remove ${a.label}`}><Trash2 className="w-3.5 h-3.5" /></button>}
              </span>
              <span className="tabular-nums">{a.amount < 0 ? '− ' : ''}{formatCurrency(Math.abs(a.amount))}</span>
            </div>
          ))}
          {f.guaranteeTopUp > 0 && line('Top-up to minimum guarantee', f.guaranteeTopUp)}
          {line('Gross', f.gross, { strong: true })}
          {line(`TDS at ${f.plan?.tdsPercent}%`, f.tds, { minus: true, hint: '(section 194J)' })}
          <div className="flex justify-between gap-4 pt-2 mt-1 border-t-2 border-text-main text-[16px] font-semibold"><span>Net pay</span><span className="tabular-nums">{formatCurrency(f.net)}</span></div>
        </section>

        {admin && draft && (
          <div className="flex flex-wrap gap-2 items-end print:hidden">
            <Field label="Bonus or deduction"><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Diwali bonus, advance recovery" className="w-60" /></Field>
            <Field label="Amount (− to deduct)"><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" /></Field>
            <Button variant="outline" disabled={label.trim().length < 2 || !Number(amount)} loading={busy === 'adj'}
              onClick={() => run('adj', () => addAdjustment(payout.id, label.trim(), Number(amount))).then(() => { setLabel(''); setAmount(''); })}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </div>
        )}

        {paying && (
          <div className="rounded-control border border-line p-3 flex flex-wrap items-end gap-2 print:hidden">
            <Field label="Paid by"><select value={method} onChange={e => setMethod(e.target.value)} className={selectClass}>{['Bank Transfer', 'UPI', 'Cheque', 'Cash'].map(m => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Reference"><Input value={ref} onChange={e => setRef(e.target.value)} placeholder="UTR / cheque no." /></Field>
            <Button onClick={() => run('paid', () => markPayoutPaid(payout.id, method, ref || undefined), 'Marked as paid').then(() => setPaying(false))} loading={busy === 'paid'}>Confirm</Button>
          </div>
        )}
        {payout.status === 'paid' && <p className="text-[13px] text-success">Paid {payout.paidAt ? format(parseISO(payout.paidAt), 'd MMM yyyy') : ''} by {payout.paymentMethod}{payout.paymentReference ? ` (${payout.paymentReference})` : ''}</p>}
        {payout.approvedAt && <p className="text-[12px] text-text-muted">Approved by {payout.approvedByName} on {format(parseISO(payout.approvedAt), 'd MMM yyyy')}</p>}

        <details className="text-[13px]">
          <summary className="cursor-pointer font-medium">Payments counted ({f.payments.length})</summary>
          <table className="w-full mt-2"><tbody className="divide-y divide-line">
            {f.payments.map((p, i) => <tr key={i}><td className="py-1">{format(parseISO(p.date), 'd MMM')}</td><td>{p.invoiceNumber}</td><td>{p.patient}</td><td>{p.method}</td><td className="text-right tabular-nums">{formatCurrency(p.amount)}</td></tr>)}
          </tbody></table>
        </details>
        {f.labCases.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer font-medium">Lab bills ({f.labCases.length})</summary>
            <table className="w-full mt-2"><tbody className="divide-y divide-line">
              {f.labCases.map((c, i) => <tr key={i}><td className="py-1">{c.orderNumber}</td><td>{c.patient}</td><td>{c.item}</td><td className="text-right tabular-nums">{formatCurrency(c.cost)}</td></tr>)}
            </tbody></table>
          </details>
        )}
        {draft && <p className="text-[12px] text-text-muted">Draft: figures update until approved. Approving freezes them and shows the statement to the dentist.</p>}
      </article>
    </Modal>
  );
}

function PayRulesDialog({ clinicId, onClose }: { clinicId: string | null; onClose: () => void }) {
  const [dentists, setDentists] = useState<User[]>([]);
  const [staffId, setStaffId] = useState('');
  const [plan, setPlan] = useState<PayPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStaff().then(r => {
      const list = (r.data || []).filter(s => s.role === 'dentist' && (!clinicId || s.clinicIds?.includes(clinicId) || s.clinicId === clinicId));
      setDentists(list);
      if (list[0]) setStaffId(list[0].id);
    });
  }, [clinicId]);

  useEffect(() => {
    if (!staffId) return;
    setError(null);
    getPayPlans(staffId).then(r => {
      const plans = r.data || [];
      setPlan(plans.find(p => p.clinicId === clinicId) || plans.find(p => p.clinicId === null) ||
        { clinicId, arrangement: 'associate', basis: 'collections', percent: 40, labSharePercent: 50, fixedMonthly: 0, minimumGuarantee: 0, tdsPercent: 10, isActive: true });
    });
  }, [staffId, clinicId]);

  const save = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const res = await savePayPlan(staffId, { ...plan, clinicId });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    toast({ title: 'Pay rules saved. Recalculate drafts to apply them.', variant: 'success' });
  };
  const num = (k: keyof PayPlan) => (e: React.ChangeEvent<HTMLInputElement>) => setPlan(p => (p ? { ...p, [k]: Number(e.target.value) } : p));

  return (
    <Modal title="Pay rules" subtitle={clinicId ? 'For this clinic' : 'For all clinics'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={save} loading={busy} disabled={!plan}>Save</Button></>}>
      <div className="p-5 space-y-4">
        <Field label="Dentist">
          <select value={staffId} onChange={e => setStaffId(e.target.value)} className={selectClass}>
            {dentists.map(d => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
          </select>
        </Field>
        {plan && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Arrangement">
              <select value={plan.arrangement} onChange={e => setPlan({ ...plan, arrangement: e.target.value as PayPlan['arrangement'] })} className={selectClass}>
                <option value="associate">Associate (share of work)</option><option value="consultant">Visiting consultant</option><option value="salaried">Salaried</option>
              </select>
            </Field>
            <Field label="Share of">
              <select value={plan.basis} onChange={e => setPlan({ ...plan, basis: e.target.value as PayPlan['basis'] })} className={selectClass}>
                <option value="collections">What patients paid (collections)</option><option value="billing">What was billed</option>
              </select>
            </Field>
            <Field label="Percentage"><Input type="number" min={0} max={100} value={plan.percent} onChange={num('percent')} /></Field>
            <Field label="Dentist's share of lab bills (%)"><Input type="number" min={0} max={100} value={plan.labSharePercent} onChange={num('labSharePercent')} /></Field>
            <Field label="Fixed monthly amount"><Input type="number" min={0} value={plan.fixedMonthly} onChange={num('fixedMonthly')} /></Field>
            <Field label="Minimum guarantee"><Input type="number" min={0} value={plan.minimumGuarantee} onChange={num('minimumGuarantee')} /></Field>
            <Field label="TDS (%)" hint="Usually 10% on professional fees; 0 for salaried staff paid through payroll"><Input type="number" min={0} max={40} value={plan.tdsPercent} onChange={num('tdsPercent')} /></Field>
          </div>
        )}
        {error && <p className="text-[13px] text-error">{error}</p>}
        <p className="text-[12px] text-text-muted">Not tax advice: check TDS and GST treatment of consultant fees with your accountant.</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

function AdminAttendance({ period }: { period: string }) {
  const { selectedClinicId } = useAuth();
  const clinicId = selectedClinicId === 'all' ? undefined : selectedClinicId;
  const [rows, setRows] = useState<StaffMonth[] | null>(null);
  const [edit, setEdit] = useState<{ staff: StaffMonth; day: string; current?: AttendanceDay } | null>(null);
  const days = useMemo(() => {
    const start = parseISO(`${period}-01`);
    return eachDayOfInterval({ start, end: endOfMonth(start) });
  }, [period]);

  const load = useCallback(() => { getMonthAttendance(period, clinicId).then(r => setRows(r.data || [])); }, [period, clinicId]);
  useEffect(() => { load(); }, [load]);

  if (!rows) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-[12px]">
        {Object.entries(STATUS_STYLE).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className={`w-5 h-5 rounded flex items-center justify-center font-semibold ${v.cls}`}>{v.short}</span>{v.label}</span>)}
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-error" /> Late</span>
        <span className="text-text-muted ml-auto">Tap a day to mark leave or correct times.</span>
      </div>
      <div className="rounded-panel border border-line bg-surface overflow-x-auto">
        <table className="text-[12px] min-w-full">
          <thead>
            <tr className="bg-surface-hover">
              <th className="sticky left-0 bg-surface-hover text-left font-medium px-3 py-2 min-w-[150px]">Staff</th>
              {days.map(d => <th key={d.toISOString()} className={`font-medium w-7 text-center ${d.getDay() === 0 ? 'text-text-muted/50' : 'text-text-muted'}`}>{format(d, 'd')}</th>)}
              <th className="font-medium px-2 text-right">Days</th><th className="font-medium px-2 text-right">Leave</th><th className="font-medium px-2 text-right">Late</th><th className="font-medium px-3 text-right">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(r => {
              const byDay = Object.fromEntries(r.days.map(d => [d.day, d]));
              return (
                <tr key={r.staffId}>
                  <td className="sticky left-0 bg-surface px-3 py-2"><div className="font-medium text-[13px]">{r.name}</div><div className="text-text-muted capitalize">{r.role}</div></td>
                  {days.map(d => {
                    const key = format(d, 'yyyy-MM-dd');
                    const rec = byDay[key];
                    const st = rec ? STATUS_STYLE[rec.status] : null;
                    return (
                      <td key={key} className="p-0.5 text-center">
                        <button onClick={() => setEdit({ staff: r, day: key, current: rec })} title={rec ? `${st!.label}${rec.lateMinutes ? `, ${rec.lateMinutes} min late` : ''}${rec.hours ? `, ${rec.hours} h` : ''}${rec.note ? ` · ${rec.note}` : ''}` : 'Not recorded'}
                          className={`relative w-6 h-6 rounded font-semibold ${st ? st.cls : 'text-line hover:bg-surface-hover'}`}>
                          {st ? st.short : '·'}
                          {rec?.lateMinutes ? <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-error" /> : null}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 text-right tabular-nums">{r.summary.present + r.summary.halfDay / 2}</td>
                  <td className="px-2 text-right tabular-nums">{r.summary.leave}</td>
                  <td className="px-2 text-right tabular-nums">{r.summary.lateDays}</td>
                  <td className="px-3 text-right tabular-nums">{r.summary.hours}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <EditDayDialog {...edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EditDayDialog({ staff, day, current, onClose, onSaved }: { staff: StaffMonth; day: string; current?: AttendanceDay; onClose: () => void; onSaved: () => void }) {
  const hhmm = (iso?: string | null) => (iso ? format(parseISO(iso), 'HH:mm') : '');
  const [status, setStatus] = useState<AttendanceStatus>(current?.status || 'present');
  const [cin, setCin] = useState(hhmm(current?.checkInAt));
  const [cout, setCout] = useState(hhmm(current?.checkOutAt));
  const [note, setNote] = useState(current?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const working = status === 'present' || status === 'half_day';
    const res = await editAttendance(staff.staffId, day, { status, checkIn: working && cin ? cin : undefined, checkOut: working && cout ? cout : undefined, note: note || undefined });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    toast({ title: 'Attendance updated', variant: 'success' });
    onSaved();
  };
  return (
    <Modal title={`${staff.name} · ${format(parseISO(day), 'EEE d MMM')}`} size="sm" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_STYLE) as AttendanceStatus[]).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={`h-8 px-3 rounded-full text-[13px] border ${status === s ? 'bg-primary text-white border-primary' : 'border-line hover:bg-surface-hover'}`}>{STATUS_STYLE[s].label}</button>
          ))}
        </div>
        {(status === 'present' || status === 'half_day') && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="In"><Input type="time" value={cin} onChange={e => setCin(e.target.value)} /></Field>
            <Field label="Out"><Input type="time" value={cout} onChange={e => setCout(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Sick leave, conference" maxLength={300} /></Field>
        {current?.source === 'self' && <p className="text-[12px] text-text-muted">Recorded by {staff.name} at check-in. Your change is logged.</p>}
        {error && <p className="text-[13px] text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function MyAttendance({ period }: { period: string }) {
  const [data, setData] = useState<{ summary: StaffMonth['summary']; days: AttendanceDay[] } | null>(null);
  useEffect(() => { getMyAttendance(period).then(r => setData(r.data)); }, [period]);
  if (!data) return <Skeleton className="h-48 w-full" />;
  const s = data.summary;
  const start = startOfMonth(parseISO(`${period}-01`));
  const byDay = Object.fromEntries(data.days.map(d => [d.day, d]));
  const all = eachDayOfInterval({ start, end: endOfMonth(start) });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['Days worked', s.present + s.halfDay / 2], ['Leave', s.leave], ['Late arrivals', s.lateDays], ['Hours', s.hours]].map(([l, v]) => (
          <div key={l as string} className="rounded-panel border border-line bg-surface p-4"><div className="text-[12px] text-text-muted">{l}</div><div className="text-xl font-semibold tabular-nums">{v}</div></div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5 max-w-md">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-center text-[11px] text-text-muted">{d}</div>)}
        {Array.from({ length: (start.getDay() + 6) % 7 }).map((_, i) => <div key={`x${i}`} />)}
        {all.map(d => {
          const rec = byDay[format(d, 'yyyy-MM-dd')];
          const st = rec ? STATUS_STYLE[rec.status] : null;
          return (
            <div key={d.toISOString()} title={rec ? `${st!.label}${rec.lateMinutes ? `, ${rec.lateMinutes} min late` : ''}` : ''}
              className={`aspect-square rounded flex flex-col items-center justify-center text-[12px] ${st ? st.cls : 'bg-surface-hover text-text-muted'}`}>
              <span>{format(d, 'd')}</span>{rec?.lateMinutes ? <span className="text-[9px]">late</span> : null}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-text-muted">Use Check in / Check out at the top of the screen each day. Ask your clinic admin to correct a day.</p>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { format, startOfYear, subDays } from 'date-fns';
import {
  ArrowDownRight, ArrowUpRight, BellRing, CalendarCheck2, Armchair, ClipboardCheck, Download, IndianRupee, UserPlus, UserX, Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import { getStaff } from '../../api/apiService';
import { Analytics, AnalyticsKpis, getAnalytics } from '../../api/analyticsService';
import { User } from '../../types';

// Validated with the dataviz palette checks (light surface): two adjacent categorical slots.
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const GRID = '#DCE5E6';
const AXIS = '#5B6E71';

type Preset = '30d' | '90d' | 'ytd' | '12m' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' },
  { key: 'ytd', label: 'This year' }, { key: '12m', label: 'Last 12 months' }, { key: 'custom', label: 'Custom' },
];

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
const compact = (n: number) => (n >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));

function rangeFor(p: Preset): { from: string; to: string } {
  const today = new Date();
  if (p === '30d') return { from: iso(subDays(today, 29)), to: iso(today) };
  if (p === 'ytd') return { from: iso(startOfYear(today)), to: iso(today) };
  if (p === '12m') return { from: iso(subDays(today, 364)), to: iso(today) };
  return { from: iso(subDays(today, 89)), to: iso(today) };
}

export function ReportsDashboard() {
  const { user, selectedClinicId } = useAuth();
  const isDentist = user?.role === 'dentist';
  const { formatCurrency } = useCurrency();
  const [preset, setPreset] = useState<Preset>('90d');
  const [custom, setCustom] = useState(rangeFor('90d'));
  const [dentistId, setDentistId] = useState('');
  const [dentists, setDentists] = useState<User[]>([]);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range = preset === 'custom' ? custom : rangeFor(preset);

  useEffect(() => {
    if (!isDentist) getStaff().then(r => setDentists((r.data || []).filter(s => s.role === 'dentist')));
  }, [isDentist]);

  useEffect(() => {
    if (range.from > range.to) return;
    setLoading(true);
    getAnalytics({ ...range, clinicId: selectedClinicId === 'all' ? undefined : selectedClinicId, dentistId: dentistId || undefined }).then(r => {
      setLoading(false);
      if (r.data) { setData(r.data); setError(null); } else setError(r.error?.message || 'Could not load analytics');
    });
  }, [range.from, range.to, selectedClinicId, dentistId]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      ['Period', `${data.range.from} to ${data.range.to}`], [],
      ['Measure', 'This period', 'Previous period'],
      ...(Object.keys(data.kpis) as (keyof AnalyticsKpis)[]).map(k => [k, data.kpis[k] ?? '', data.previous[k] ?? '']), [],
      ['Period', 'Collected', 'Visits', 'New patients', 'No-show rate', 'Cancellation rate'],
      ...data.trend.map(t => [t.label, t.collected, t.visits, t.newPatients, t.noShowRate ?? '', t.cancellationRate ?? '']), [],
      ['Dentist', 'Collected', 'Billed', 'Visits', 'Booked hours', 'Available hours', 'Utilisation', 'No-show rate'],
      ...data.byDentist.map(d => [d.name, d.collected, d.billed, d.visits, d.bookedHours, d.availableHours, d.utilisation ?? '', d.noShowRate ?? '']), [],
      ['Procedure', 'Count', 'Billed'], ...data.topProcedures.map(p => [p.name, p.count, p.revenue]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `dentassist-analytics-${data.range.from}-to-${data.range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const k = data?.kpis;
  const p = data?.previous;

  return (
    <div className="space-y-5">
      <PageHeader
        title={isDentist ? 'My performance' : 'Practice analytics'}
        description={isDentist ? 'Your collections, chair time and patients.' : 'Revenue, chair time, no-shows, treatment acceptance and recalls.'}
        actions={<Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="w-4 h-4" /> Export CSV</Button>}
      />

      {/* Filters: one row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Period">
          {PRESETS.map(x => (
            <button key={x.key} role="radio" aria-checked={preset === x.key} onClick={() => setPreset(x.key)}
              className={`h-9 px-3 rounded-full text-[13px] font-medium ${preset === x.key ? 'bg-primary text-white' : 'border border-line text-text-muted hover:bg-surface-hover'}`}>
              {x.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="w-40" aria-label="From" />
            <span className="text-text-muted">–</span>
            <Input type="date" value={custom.to} min={custom.from} max={iso(new Date())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="w-40" aria-label="To" />
          </div>
        )}
        {!isDentist && dentists.length > 0 && (
          <select value={dentistId} onChange={e => setDentistId(e.target.value)} className="h-9 px-3 rounded-control border border-line bg-surface text-sm sm:ml-auto" aria-label="Dentist">
            <option value="">All dentists</option>
            {dentists.map(d => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
          </select>
        )}
      </div>
      {data && <p className="text-[12px] text-text-muted -mt-2">Compared with {format(new Date(data.previousRange.from), 'd MMM yyyy')} – {format(new Date(data.previousRange.to), 'd MMM yyyy')}</p>}
      {error && <p className="text-sm text-error">{error}</p>}

      {/* Headline numbers */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {!k || !p ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />) : (
          <>
            <Kpi label="Collected" icon={IndianRupee} value={formatCurrency(k.collected)} now={k.collected} before={p.collected} />
            <Kpi label="Completed visits" icon={CalendarCheck2} value={k.visits.toLocaleString()} now={k.visits} before={p.visits} />
            <Kpi label="New patients" icon={UserPlus} value={k.newPatients.toLocaleString()} now={k.newPatients} before={p.newPatients} />
            <Kpi label="Collected per visit" icon={Wallet} value={k.revenuePerVisit == null ? '—' : formatCurrency(k.revenuePerVisit)} now={k.revenuePerVisit} before={p.revenuePerVisit} />
            <Kpi label="Chair utilisation" icon={Armchair} value={pct(k.chairUtilisation)} now={k.chairUtilisation} before={p.chairUtilisation} rate />
            <Kpi label="No-show rate" icon={UserX} value={pct(k.noShowRate, 1)} now={k.noShowRate} before={p.noShowRate} rate lowerIsBetter />
            <Kpi label="Treatment plans accepted" icon={ClipboardCheck} value={pct(k.planAcceptanceRate)} now={k.planAcceptanceRate} before={p.planAcceptanceRate} rate />
            <Kpi label="Recalls that booked" icon={BellRing} value={pct(k.recallSuccessRate)} now={k.recallSuccessRate} before={p.recallSuccessRate} rate />
          </>
        )}
      </div>

      {data && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Collections" subtitle={`Payments received per ${data.range.granularity}`}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ fill: 'rgba(15,76,92,0.06)' }} formatter={(v: number) => [formatCurrency(v), 'Collected']} />
                  <Bar dataKey="collected" name="Collected" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
              <DataTable headers={['Period', 'Collected']} rows={data.trend.map(t => [t.label, formatCurrency(t.collected)])} />
            </Panel>

            <Panel title="Patients" subtitle={`Completed visits and new patients per ${data.range.granularity}`}>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={32} />
                  <Tooltip />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: AXIS }} />
                  <Line type="monotone" dataKey="visits" name="Completed visits" stroke={SERIES_1} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                  <Line type="monotone" dataKey="newPatients" name="New patients" stroke={SERIES_2} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
              <DataTable headers={['Period', 'Visits', 'New patients']} rows={data.trend.map(t => [t.label, t.visits, t.newPatients])} />
            </Panel>
          </div>

          {!isDentist && (
            <Panel title="By dentist" subtitle="Collections credited to each dentist, and how much of their available chair time was booked">
              <div className="space-y-4">
                {data.byDentist.length === 0 && <p className="text-[13px] text-text-muted">No activity in this period.</p>}
                {data.byDentist.map(d => {
                  const max = Math.max(...data.byDentist.map(x => x.collected), 1);
                  return (
                    <div key={d.dentistId || 'none'} className="grid sm:grid-cols-[180px_1fr_1fr] gap-x-6 gap-y-1.5 items-center">
                      <div>
                        <div className="text-sm font-medium">{d.name}</div>
                        <div className="text-[12px] text-text-muted">{d.visits} visits · no-shows {pct(d.noShowRate)}</div>
                      </div>
                      <Meter label="Collected" value={d.collected / max} text={formatCurrency(d.collected)} color={SERIES_1} />
                      {d.dentistId ? (
                        <Meter label="Chair time booked" value={d.utilisation ?? 0} text={`${pct(d.utilisation)} · ${d.bookedHours}h of ${d.availableHours}h`} color={SERIES_1} />
                      ) : <span className="text-[12px] text-text-muted">Invoices not credited to a dentist</span>}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Missed and cancelled appointments" subtitle={`Share of appointments per ${data.range.granularity}`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip formatter={(v: number, n: string) => [pct(v, 1), n]} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: AXIS }} />
                  <Line type="monotone" dataKey="noShowRate" name="No-shows" stroke={SERIES_1} strokeWidth={2} connectNulls dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                  <Line type="monotone" dataKey="cancellationRate" name="Cancellations" stroke={SERIES_2} strokeWidth={2} connectNulls dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[12px] text-text-muted">WhatsApp reminders and confirmations are the main lever here.</p>
            </Panel>

            <Panel title="Conversion" subtitle="From proposed to done">
              <Funnel title="Treatment plans" steps={[
                { label: 'Proposed', value: data.plans.proposed, detail: formatCurrency(data.plans.proposedValue) },
                { label: 'Accepted', value: data.plans.accepted, detail: formatCurrency(data.plans.acceptedValue) },
                { label: 'Completed', value: data.plans.completed },
              ]} />
              <Funnel title="Recalls" steps={[
                { label: 'Due', value: data.recalls.created }, { label: 'Contacted', value: data.recalls.contacted },
                { label: 'Booked', value: data.recalls.booked },
              ]} />
              <p className="text-[12px] text-text-muted">{data.kpis.reviewRequests} Google review requests sent · {data.lab.cases} lab cases ({data.lab.remakes} remakes) · lab spend {formatCurrency(data.kpis.labSpend)}</p>
            </Panel>
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
            <Panel title="Top treatments" subtitle="By amount billed">
              <div className="space-y-2.5">
                {data.topProcedures.length === 0 && <p className="text-[13px] text-text-muted">Nothing billed in this period.</p>}
                {data.topProcedures.map(t => (
                  <React.Fragment key={t.name}>
                    <Meter label={`${t.name} (${t.count})`} value={t.revenue / Math.max(data.topProcedures[0]?.revenue || 1, 1)} text={formatCurrency(t.revenue)} color={SERIES_1} />
                  </React.Fragment>
                ))}
              </div>
            </Panel>
            <Panel title="How patients pay">
              <div className="space-y-2.5">
                {data.paymentMethods.map(m => {
                  const total = data.paymentMethods.reduce((s, x) => s + x.amount, 0) || 1;
                  return (
                    <React.Fragment key={m.method}>
                      <Meter label={m.method} value={m.amount / total} text={`${pct(m.amount / total)} · ${formatCurrency(m.amount)}`} color={SERIES_1} />
                    </React.Fragment>
                  );
                })}
              </div>
            </Panel>
          </div>

          <p className="text-[12px] text-text-muted">
            How these are worked out: collections are payments received; chair utilisation is booked time over each dentist's clinic and working hours up to today;
            no-show rate is no-shows out of completed plus no-show appointments; plan acceptance counts proposed plans that were approved or started.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, now, before, rate, lowerIsBetter }: {
  label: string; value: string; icon: React.ElementType; now: number | null; before: number | null; rate?: boolean; lowerIsBetter?: boolean;
}) {
  const delta = useMemo(() => {
    if (now == null || before == null) return null;
    if (rate) return { text: `${Math.abs((now - before) * 100).toFixed(1)} pts`, up: now > before, same: Math.abs(now - before) < 0.0005 };
    if (!before) return null;
    const change = (now - before) / before;
    return { text: `${Math.abs(change * 100).toFixed(0)}%`, up: change > 0, same: Math.abs(change) < 0.005 };
  }, [now, before, rate]);
  const good = delta && !delta.same && (lowerIsBetter ? !delta.up : delta.up);
  return (
    <div className="rounded-panel border border-line bg-surface p-4 shadow-panel">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] text-text-muted">{label}</span>
        <Icon className="w-4 h-4 text-text-muted" aria-hidden="true" />
      </div>
      <div className="text-[22px] font-semibold tabular-nums leading-tight">{value}</div>
      {delta && (
        <div className={`text-[12px] mt-1 flex items-center gap-0.5 ${delta.same ? 'text-text-muted' : good ? 'text-success' : 'text-error'}`}>
          {!delta.same && (delta.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />)}
          {delta.same ? 'No change' : `${delta.up ? 'Up' : 'Down'} ${delta.text}`} <span className="text-text-muted ml-1">vs previous</span>
        </div>
      )}
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-line bg-surface p-4 sm:p-5 shadow-panel space-y-3 min-w-0">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="text-[12px] text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Meter({ label, value, text, color }: { label: string; value: number; text: string; color: string }) {
  const w = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="min-w-0">
      <div className="flex justify-between gap-2 text-[12px] mb-1">
        <span className="text-text-muted truncate">{label}</span>
        <span className="tabular-nums whitespace-nowrap">{text}</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w * 100)} aria-label={label}>
        <div className="h-full rounded-r-full" style={{ width: `${w * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function Funnel({ title, steps }: { title: string; steps: { label: string; value: number; detail?: string }[] }) {
  const top = Math.max(steps[0]?.value || 0, 1);
  return (
    <div className="space-y-2">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[80px_1fr_auto] gap-3 items-center text-[12px]">
          <span className="text-text-muted">{s.label}</span>
          <div className="h-5 rounded bg-gray-100 overflow-hidden">
            <div className="h-full rounded-r" style={{ width: `${(s.value / top) * 100}%`, background: SERIES_1, opacity: 1 - i * 0.22 }} />
          </div>
          <span className="tabular-nums whitespace-nowrap">
            <strong>{s.value}</strong>{i > 0 && steps[0].value ? ` · ${Math.round((s.value / steps[0].value) * 100)}%` : ''}{s.detail ? ` · ${s.detail}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <details className="text-[12px]">
      <summary className="cursor-pointer text-text-muted hover:text-text-main">Show as table</summary>
      <table className="w-full mt-2">
        <thead><tr>{headers.map(h => <th key={h} className="text-left font-medium text-text-muted py-1">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

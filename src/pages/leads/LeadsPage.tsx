import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlertTriangle, BarChart3, Columns3, Inbox, LayoutList, Link2, Phone, PhoneCall, Plus, Search, Settings2, Timer, TrendingUp, Trophy } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatTile } from '../../components/ui/StatTile';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../utils/currencyConfig';
import { AppointmentFormModal } from '../../components/calendar/AppointmentFormModal';
import { NewLeadDialog } from '../../components/leads/NewLeadDialog';
import { LeadDetailDialog, statusVariant } from '../../components/leads/LeadDetailDialog';
import { CaptureLinksDialog } from '../../components/leads/CaptureLinksDialog';
import { LeadSettingsDialog } from '../../components/leads/LeadSettingsDialog';
import { getPatients, getStaff } from '../../api/apiService';
import {
  getLeadMeta, getLeads, getLeadSummary, Lead, LeadMeta, LeadSource, LeadStatus, LeadSummary, LOST_LABEL, SOURCE_LABEL, STATUS_LABEL,
} from '../../api/leadsService';
import { Patient, User } from '../../types';

type Tab = 'call' | 'open' | 'won' | 'lost' | 'sources';
const TABS: { key: Tab; label: string }[] = [
  { key: 'call', label: 'To call now' },
  { key: 'open', label: 'All open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'sources', label: 'Where they come from' },
];
const BOARD: LeadStatus[] = ['new', 'contacted', 'consult_booked', 'visited'];

function followLabel(l: Lead) {
  if (!l.nextFollowUpAt) return null;
  const d = parseISO(l.nextFollowUpAt);
  return l.isOverdue ? `Overdue ${formatDistanceToNowStrict(d)}` : `Follow up ${format(d, 'd MMM, h:mm a')}`;
}

export function LeadsPage() {
  const { user, selectedClinicId } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const { formatCurrency } = useCurrency();
  const clinicFilter = selectedClinicId === 'all' ? undefined : selectedClinicId;
  const clinicForActions = clinicFilter || user?.clinicId || undefined;

  const [tab, setTab] = useState<Tab>('call');
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [meta, setMeta] = useState<LeadMeta | null>(null);
  const [source, setSource] = useState<LeadSource | ''>('');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [capture, setCapture] = useState(false);
  const [settings, setSettings] = useState(false);
  const [booking, setBooking] = useState<{ patientId: string; clinicId: string } | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<User[]>([]);

  const loadSummary = useCallback(() => getLeadSummary(clinicFilter).then(r => r.data && setSummary(r.data)), [clinicFilter]);
  const load = useCallback(async () => {
    if (tab === 'sources') return;
    setRows(null);
    const view = tab === 'call' ? 'overdue' : tab === 'open' ? 'open' : 'closed';
    const status = tab === 'won' ? 'won' : tab === 'lost' ? 'lost' : undefined;
    const res = await getLeads({ clinicId: clinicFilter, view, status, source: source || undefined, assignedTo: mine ? 'me' : undefined, q: q.trim() || undefined });
    setRows(res.data || []);
    if (res.error) toast({ title: res.error.message, variant: 'error' });
  }, [tab, clinicFilter, source, mine, q]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { loadSummary(); getLeadMeta(clinicFilter).then(r => r.data && setMeta(r.data)); }, [clinicFilter, loadSummary]);

  const changed = (lead: Lead | null) => {
    if (lead) setRows(rs => (rs || []).map(x => (x.id === lead.id ? lead : x)));
    else load();
    loadSummary();
  };

  const startBooking = async (lead: Lead, patientId: string) => {
    const [p, s] = await Promise.all([getPatients({ clinicId: lead.clinicId }), getStaff()]);
    setPatients(p.data || []);
    setDentists((s.data || []).filter(d => d.role === 'dentist' && d.status !== 'inactive' && (d.clinicIds?.includes(lead.clinicId) || d.clinicId === lead.clinicId)));
    setOpenId(null);
    setBooking({ patientId, clinicId: lead.clinicId });
  };

  const grouped = useMemo(() => Object.fromEntries(BOARD.map(s => [s, (rows || []).filter(r => r.status === s)])) as Record<LeadStatus, Lead[]>, [rows]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enquiries"
        description="Every call, form, WhatsApp and Instagram enquiry in one place, until they become patients."
        actions={
          <>
            {clinicForActions && <Button variant="outline" onClick={() => setCapture(true)}><Link2 className="w-4 h-4" /> Get enquiries in</Button>}
            {isAdmin && <Button variant="ghost" onClick={() => setSettings(true)} aria-label="Enquiry settings"><Settings2 className="w-4 h-4" /></Button>}
            <Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add enquiry</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Not called yet" value={summary?.uncontacted ?? '–'} icon={PhoneCall} tone={summary?.uncontacted ? 'warning' : undefined} />
        <StatTile label="Overdue follow-ups" value={summary?.overdue ?? '–'} icon={AlertTriangle} tone={summary?.overdue ? 'error' : undefined} />
        <StatTile label="Booked, last 30 days" value={summary ? `${Math.round(summary.bookingRate * 100)}%` : '–'} icon={TrendingUp} tone="accent" />
        <StatTile label="Paid by them, 30 days" value={summary ? formatCurrency(summary.revenue) : '–'} icon={Trophy} />
      </div>
      {summary?.medianFirstResponseMinutes != null && (
        <p className="text-[13px] text-text-muted -mt-2 flex items-center gap-1.5"><Timer className="w-4 h-4" />
          Typical time to first call: <strong className="text-text-main">{summary.medianFirstResponseMinutes < 60 ? `${summary.medianFirstResponseMinutes} min` : `${Math.round(summary.medianFirstResponseMinutes / 60)} h`}</strong>.
          {summary.medianFirstResponseMinutes > 30 && ' Calling within 15 minutes books far more consultations.'}
        </p>
      )}

      <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
        <div className="border-b border-line px-2 sm:px-4 flex items-center gap-1 overflow-x-auto scrollbar-hide" role="tablist">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`h-12 px-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
              {t.label}
              {t.key === 'call' && summary && summary.overdue > 0 && <span className="ml-1.5 text-[11px] tabular-nums text-error">{summary.overdue}</span>}
            </button>
          ))}
        </div>

        {tab === 'sources' ? <SourcesTable summary={summary} /> : (
          <>
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-line">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, number or treatment" className="pl-9 h-9" />
              </div>
              <select aria-label="Source" value={source} onChange={e => setSource(e.target.value as LeadSource | '')} className="h-9 px-2 rounded-control border border-line bg-surface text-[13px]">
                <option value="">All sources</option>
                {(meta?.sources || []).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 text-[13px] text-text-muted">
                <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={mine} onChange={e => setMine(e.target.checked)} /> Mine only
              </label>
              {tab === 'open' && (
                <div className="ml-auto inline-flex rounded-control border border-line p-0.5" role="group" aria-label="Layout">
                  <button onClick={() => setLayout('list')} aria-pressed={layout === 'list'} className={`h-8 px-2 rounded-[6px] ${layout === 'list' ? 'bg-primary text-white' : 'text-text-muted'}`} aria-label="List"><LayoutList className="w-4 h-4" /></button>
                  <button onClick={() => setLayout('board')} aria-pressed={layout === 'board'} className={`h-8 px-2 rounded-[6px] ${layout === 'board' ? 'bg-primary text-white' : 'text-text-muted'}`} aria-label="Board"><Columns3 className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            {rows === null ? (
              <div className="p-4 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : rows.length === 0 ? (
              <EmptyState icon={tab === 'call' ? PhoneCall : Inbox}
                title={tab === 'call' ? 'All caught up' : 'No enquiries here'}
                description={tab === 'call' ? 'New enquiries and due follow-ups appear here.' : 'Share your enquiry form to start collecting enquiries.'} />
            ) : tab === 'open' && layout === 'board' ? (
              <div className="flex gap-3 p-3 overflow-x-auto">
                {BOARD.map(s => (
                  <div key={s} className="w-72 flex-none rounded-control bg-surface-hover/60 p-2">
                    <div className="px-1.5 py-1 text-[12px] font-semibold text-text-muted flex justify-between">
                      <span>{STATUS_LABEL[s]}</span><span className="tabular-nums">{grouped[s].length}</span>
                    </div>
                    <div className="space-y-2 mt-1">
                      {grouped[s].map(l => (
                        <button key={l.id} onClick={() => setOpenId(l.id)} className="w-full text-left bg-surface rounded-control border border-line p-3 hover:border-primary/40">
                          <div className="text-[14px] font-medium truncate">{l.name}</div>
                          <div className="text-[12px] text-text-muted truncate">{l.interest || 'General enquiry'} · {SOURCE_LABEL[l.source]}</div>
                          <div className="mt-1.5 flex items-center justify-between text-[12px]">
                            <span className={l.isOverdue ? 'text-error' : 'text-text-muted'}>{followLabel(l) || ' '}</span>
                            {l.estimatedValue != null && <span className="tabular-nums">{formatCurrency(l.estimatedValue)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {rows.map(l => (
                  <li key={l.id}>
                    <div className="px-4 py-3 flex items-center gap-3 hover:bg-surface-hover/50">
                      <button onClick={() => setOpenId(l.id)} className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-medium">{l.name}</span>
                          <Badge variant={statusVariant(l.status)}>{STATUS_LABEL[l.status]}</Badge>
                          <span className="text-[12px] text-text-muted">{SOURCE_LABEL[l.source]}</span>
                        </div>
                        <div className="text-[13px] text-text-muted truncate">
                          {l.interest || 'General enquiry'}
                          {l.message ? ` · “${l.message}”` : ''}
                        </div>
                        <div className="text-[12px] mt-0.5">
                          <span className={l.isOverdue ? 'text-error font-medium' : 'text-text-muted'}>
                            {l.status === 'lost' ? `Lost: ${LOST_LABEL[l.lostReason || 'other'] || l.lostReason}` : followLabel(l) || `Received ${formatDistanceToNowStrict(parseISO(l.createdAt), { addSuffix: true })}`}
                          </span>
                          {l.assignedToName && <span className="text-text-muted"> · {l.assignedToName}</span>}
                          {l.estimatedValue != null && <span className="text-text-muted"> · {formatCurrency(l.estimatedValue)}</span>}
                        </div>
                      </button>
                      <Button asChild size="icon" variant="outline" aria-label={`Call ${l.name}`}><a href={`tel:+${l.phone}`}><Phone className="w-4 h-4" /></a></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {adding && <NewLeadDialog clinicId={clinicForActions} meta={meta} onClose={() => setAdding(false)}
        onCreated={lead => { setAdding(false); load(); loadSummary(); setOpenId(lead.id); }} />}
      {openId && <LeadDetailDialog leadId={openId} meta={meta} onClose={() => setOpenId(null)} onChanged={changed} onBook={startBooking} />}
      {capture && clinicForActions && <CaptureLinksDialog clinicId={clinicForActions} onClose={() => setCapture(false)} />}
      {settings && <LeadSettingsDialog onClose={() => setSettings(false)} />}
      {booking && (
        <AppointmentFormModal isOpen onClose={() => setBooking(null)} clinicId={booking.clinicId} initialPatientId={booking.patientId}
          patients={patients} dentists={dentists}
          onSuccess={() => { setBooking(null); load(); loadSummary(); toast({ title: 'Consultation booked. The enquiry moves on by itself.', variant: 'success' }); }} />
      )}
    </div>
  );
}

function SourcesTable({ summary }: { summary: LeadSummary | null }) {
  const { formatCurrency } = useCurrency();
  if (!summary) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!summary.bySource.length) return <EmptyState icon={BarChart3} title="No enquiries in the last 30 days" description="Sources appear here once enquiries come in." />;
  const max = Math.max(...summary.bySource.map(r => r.leads));
  return (
    <div className="p-4 space-y-5">
      <p className="text-[13px] text-text-muted">Last 30 days. “Paid” is what those people have paid the clinic since they enquired, so you can see which channels are worth the ad spend.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead className="text-left text-text-muted">
            <tr><th className="font-medium py-2">Source</th><th className="font-medium">Enquiries</th><th className="font-medium text-right">Booked</th>
              <th className="font-medium text-right">Booking rate</th><th className="font-medium text-right">Won</th><th className="font-medium text-right">Paid</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summary.bySource.map(r => (
              <tr key={r.source}>
                <td className="py-2.5 font-medium">{SOURCE_LABEL[r.source] || r.source}</td>
                <td className="w-48">
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(6, (r.leads / max) * 120)}px` }} aria-hidden="true" />
                    <span className="tabular-nums">{r.leads}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums">{r.booked}</td>
                <td className="text-right tabular-nums">{Math.round(r.bookingRate * 100)}%</td>
                <td className="text-right tabular-nums">{r.won}</td>
                <td className="text-right tabular-nums">{formatCurrency(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {summary.lostReasons.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold mb-1.5">Why enquiries were lost</h3>
          <div className="flex flex-wrap gap-2">
            {summary.lostReasons.map(r => <span key={r.reason} className="px-2.5 py-1 rounded-full border border-line text-[12px]">{LOST_LABEL[r.reason] || r.reason} · {r.count}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

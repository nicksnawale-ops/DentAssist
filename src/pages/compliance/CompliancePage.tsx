import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNowStrict, parseISO, startOfMonth } from 'date-fns';
import {
  AlertTriangle, CheckCircle2, Clock, Download, FlaskConical, PackageCheck, Plus, Printer, RotateCcw, Settings2, ShieldCheck,
  Thermometer, Wrench, XCircle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatTile } from '../../components/ui/StatTile';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { CycleResultDialog, printPackLabels, SporeResultDialog, StartCycleDialog } from '../../components/sterilisation/CycleDialogs';
import { SterilisationSettingsDialog, SteriliserDialog } from '../../components/sterilisation/SteriliserDialogs';
import {
  Cycle, CycleKind, CYCLE_KIND_LABEL, DataRequest, download, getCycle, getCycles, getDataRequests, getPacks, getSterilisationOverview,
  Pack, PACK_STATUS_LABEL, REQUEST_KIND_LABEL, setPackStatus, SterilisationOverview, SteriliserStatus, STERILISER_KIND_LABEL, updateDataRequest,
} from '../../api/complianceService';

type Tab = 'sterilisation' | 'packs' | 'requests';

export function CompliancePage() {
  const { user, selectedClinicId } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const canSeeRequests = isAdmin || user?.role === 'receptionist';
  const clinicFilter = selectedClinicId === 'all' ? undefined : selectedClinicId;
  const [tab, setTab] = useState<Tab>('sterilisation');

  return (
    <div className="space-y-5">
      <PageHeader title="Compliance" description="Sterilisation records traced to each patient, and patients' requests about their data." />
      <div className="border-b border-line flex gap-1 overflow-x-auto scrollbar-hide" role="tablist">
        {([['sterilisation', 'Sterilisation'], ['packs', 'Instrument packs'], ...(canSeeRequests ? [['requests', 'Data requests']] : [])] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`h-11 px-3 text-[14px] font-medium whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>{label}</button>
        ))}
      </div>
      {tab === 'sterilisation' && <SterilisationTab clinicId={clinicFilter} isAdmin={isAdmin} defaultClinic={clinicFilter || user?.clinicId || undefined} />}
      {tab === 'packs' && <PacksTab clinicId={clinicFilter} />}
      {tab === 'requests' && canSeeRequests && <RequestsTab clinicId={clinicFilter} isAdmin={isAdmin} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function resultBadge(c: Cycle) {
  if (c.result === 'running') return <Badge variant="warning"><Clock className="w-3 h-3" /> Running</Badge>;
  if (c.result === 'failed') return <Badge variant="error"><XCircle className="w-3 h-3" /> Failed</Badge>;
  return <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Passed</Badge>;
}

function SterilisationTab({ clinicId, isAdmin, defaultClinic }: { clinicId?: string; isAdmin: boolean; defaultClinic?: string }) {
  const [ov, setOv] = useState<SterilisationOverview | null>(null);
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [starting, setStarting] = useState<{ st: SteriliserStatus; kind: CycleKind } | null>(null);
  const [resulting, setResulting] = useState<Cycle | null>(null);
  const [spore, setSpore] = useState<Cycle | null>(null);
  const [editing, setEditing] = useState<SteriliserStatus | 'new' | null>(null);
  const [settings, setSettings] = useState(false);
  const [detail, setDetail] = useState<Cycle | null>(null);

  const load = useCallback(() => {
    getSterilisationOverview(clinicId).then(r => r.data && setOv(r.data));
    getCycles({ clinicId, limit: 60 }).then(r => setCycles(r.data || []));
  }, [clinicId]);
  useEffect(load, [load]);

  const exportRegister = async () => {
    const err = await download('/sterilisation/register.csv', { clinicId, from: format(startOfMonth(new Date()), 'yyyy-MM-dd') }, 'sterilisation-register.csv');
    if (err) toast({ title: err, variant: 'error' });
  };
  const openDetail = async (c: Cycle) => { const r = await getCycle(c.id); if (r.data) setDetail(r.data); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" onClick={exportRegister}><Download className="w-4 h-4" /> Register (this month)</Button>
        {isAdmin && <Button variant="ghost" onClick={() => setSettings(true)} aria-label="Sterilisation settings"><Settings2 className="w-4 h-4" /></Button>}
        {isAdmin && <Button variant="ghost" onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> Steriliser</Button>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Packs ready to use" value={ov?.packs.sterile ?? '–'} icon={PackageCheck} tone="accent" />
        <StatTile label="Expire within 7 days" value={ov?.packs.expiringSoon ?? '–'} icon={Clock} tone={ov?.packs.expiringSoon ? 'warning' : undefined} />
        <StatTile label="Awaiting release" value={ov?.packs.awaitingRelease ?? '–'} icon={Thermometer} />
        <StatTile label="Recalled, to reprocess" value={ov?.packs.recalled ?? '–'} icon={RotateCcw} tone={ov?.packs.recalled ? 'error' : undefined} />
      </div>

      {!ov ? <Skeleton className="h-36 w-full" /> : ov.sterilisers.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No sterilisers yet" description={isAdmin ? 'Add your autoclaves to start logging cycles.' : 'Ask an admin to add the clinic’s autoclaves.'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ov.sterilisers.map(st => (
            <div key={st.id} className={`rounded-panel border bg-surface p-4 shadow-panel space-y-3 ${st.isActive ? 'border-line' : 'border-error/40'}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold">{st.name}</div>
                  <div className="text-[12px] text-text-muted">{STERILISER_KIND_LABEL[st.kind] || st.kind}{st.serialNumber ? ` · ${st.serialNumber}` : ''} · {st.cycleCount} cycles</div>
                </div>
                {isAdmin && <button onClick={() => setEditing(st)} className="p-1.5 rounded-control text-text-muted hover:bg-surface-hover" aria-label={`Edit ${st.name}`}><Wrench className="w-4 h-4" /></button>}
              </div>
              {!st.isActive && <p className="rounded-control bg-error/[0.07] text-error p-2.5 text-[13px]">Out of service: {st.outOfServiceReason}</p>}
              <div className="flex flex-wrap gap-1.5">
                {st.needsDailyTest && (st.dailyTestPassed
                  ? <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Today's test passed</Badge>
                  : <Badge variant="warning"><AlertTriangle className="w-3 h-3" /> Daily test not done</Badge>)}
                {st.sporeTestDue ? <Badge variant="warning"><FlaskConical className="w-3 h-3" /> Spore test due</Badge>
                  : <Badge variant="secondary"><FlaskConical className="w-3 h-3" /> Spore test {st.lastSporeTestAt ? formatDistanceToNowStrict(parseISO(st.lastSporeTestAt), { addSuffix: true }) : ''}</Badge>}
                {st.serviceOverdue ? <Badge variant="error"><Wrench className="w-3 h-3" /> Service overdue</Badge>
                  : st.serviceDueOn && <Badge variant="outline">Service by {format(parseISO(st.serviceDueOn), 'd MMM yyyy')}</Badge>}
              </div>
              {st.isActive && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setStarting({ st, kind: 'load' })}>Start load</Button>
                  {st.needsDailyTest && !st.dailyTestPassed && <Button size="sm" variant="outline" onClick={() => setStarting({ st, kind: 'helix' })}>Daily test</Button>}
                  {st.sporeTestDue && <Button size="sm" variant="ghost" onClick={() => setStarting({ st, kind: 'bi_test' })}>Spore test</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-line text-[15px] font-semibold">Cycles</div>
        {cycles === null ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : cycles.length === 0 ? (
          <EmptyState icon={Thermometer} title="No cycles yet" description="Start a load or a daily test above." />
        ) : (
          <ul className="divide-y divide-line">
            {cycles.map(c => (
              <li key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                <button className="flex-1 min-w-[220px] text-left" onClick={() => openDetail(c)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium">#{c.cycleNumber} · {CYCLE_KIND_LABEL[c.kind]}</span>
                    {resultBadge(c)}
                    {c.biStatus === 'pending' && <Badge variant="warning"><FlaskConical className="w-3 h-3" /> Spore test incubating</Badge>}
                    {c.biStatus === 'failed' && <Badge variant="error">Spore test failed</Badge>}
                  </div>
                  <div className="text-[12px] text-text-muted">
                    {c.steriliserName} · {format(parseISO(c.startedAt), 'd MMM, h:mm a')}
                    {c.kind === 'load' ? ` · ${c.packCount} packs${c.packsUsed ? `, ${c.packsUsed} used` : ''}` : ''}
                    {c.temperatureC != null ? ` · ${c.temperatureC}°C / ${c.holdMinutes ?? '–'} min` : ''}
                    {c.operatorName ? ` · ${c.operatorName}` : ''}
                    {c.failureReason ? ` · ${c.failureReason}` : ''}
                  </div>
                </button>
                {c.result === 'running' && <Button size="sm" onClick={() => setResulting(c)}>Record result</Button>}
                {c.biStatus === 'pending' && c.result !== 'running' && <Button size="sm" variant="outline" onClick={() => setSpore(c)}>Read spore test</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {starting && <StartCycleDialog steriliser={starting.st} initialKind={starting.kind} onClose={() => setStarting(null)}
        onStarted={c => { setStarting(null); load(); if (c.packs?.length) printPackLabels(c.packs, c); }} />}
      {resulting && <CycleResultDialog cycle={resulting} onClose={() => setResulting(null)} onSaved={() => { setResulting(null); load(); }} />}
      {spore && <SporeResultDialog cycle={spore} onClose={() => { setSpore(null); load(); }} onSaved={(_, exposed) => { if (!exposed.length) setSpore(null); load(); }} />}
      {editing && <SteriliserDialog clinicId={defaultClinic} steriliser={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {settings && <SterilisationSettingsDialog onClose={() => setSettings(false)} />}
      {detail && (
        <Modal title={`Cycle #${detail.cycleNumber}`} subtitle={`${detail.steriliserName} · ${format(parseISO(detail.startedAt), 'd MMM yyyy, h:mm a')}`} size="lg" onClose={() => setDetail(null)}>
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap gap-2 items-center">{resultBadge(detail)}<span className="text-[13px] text-text-muted">{CYCLE_KIND_LABEL[detail.kind]}{detail.program ? ` · ${detail.program}` : ''}</span>
              {detail.packs && detail.packs.length > 0 && <Button size="sm" variant="outline" className="ml-auto" onClick={() => printPackLabels(detail.packs!, detail)}><Printer className="w-4 h-4" /> Reprint labels</Button>}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
              <div><dt className="text-text-muted">Temperature</dt><dd>{detail.temperatureC ?? '–'} °C</dd></div>
              <div><dt className="text-text-muted">Pressure</dt><dd>{detail.pressureBar ?? '–'} bar</dd></div>
              <div><dt className="text-text-muted">Hold</dt><dd>{detail.holdMinutes ?? '–'} min</dd></div>
              <div><dt className="text-text-muted">Indicator</dt><dd>{detail.chemicalIndicatorOk == null ? '–' : detail.chemicalIndicatorOk ? 'OK' : 'Failed'}</dd></div>
              <div><dt className="text-text-muted">Operator</dt><dd>{detail.operatorName || '–'}</dd></div>
              <div><dt className="text-text-muted">Released by</dt><dd>{detail.releasedByName || '–'}</dd></div>
              <div><dt className="text-text-muted">Spore test</dt><dd>{detail.biStatus === 'none' ? '–' : detail.biStatus}{detail.biLot ? ` (lot ${detail.biLot})` : ''}</dd></div>
            </dl>
            {detail.packs && detail.packs.length > 0 && (
              <table className="w-full text-[13px]">
                <thead className="text-left text-text-muted"><tr><th className="font-medium py-1">Code</th><th className="font-medium">Contents</th><th className="font-medium">Status</th><th className="font-medium">Patient</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {detail.packs.map(p => (
                    <tr key={p.id}><td className="py-1.5 font-mono">{p.code}</td><td>{p.contents}</td><td>{PACK_STATUS_LABEL[p.status]}</td>
                      <td>{p.patientId ? <Link className="text-primary hover:underline" to={`/patients/${p.patientId}`}>{p.patientName}</Link> : '–'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PacksTab({ clinicId }: { clinicId?: string }) {
  const [status, setStatus] = useState('sterile');
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const load = useCallback(() => { setPacks(null); getPacks({ clinicId, status }).then(r => setPacks(r.data || [])); }, [clinicId, status]);
  useEffect(load, [load]);
  const discard = async (p: Pack) => {
    const res = await setPackStatus(p.id, 'discarded', 'Opened or damaged; reprocess');
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    load();
  };
  return (
    <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
      <div className="px-4 py-2.5 flex flex-wrap gap-2 border-b border-line">
        {['sterile', 'awaiting_release', 'used', 'recalled', 'expired'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 h-8 rounded-full text-[12px] font-medium ${status === s ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover border border-line'}`}>
            {PACK_STATUS_LABEL[s as keyof typeof PACK_STATUS_LABEL]}
          </button>
        ))}
      </div>
      {packs === null ? <div className="p-4"><Skeleton className="h-24 w-full" /></div> : packs.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No packs here" description="Packs are created when you start a load." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[620px]">
            <thead className="text-left text-text-muted"><tr><th className="font-medium px-4 py-2">Code</th><th className="font-medium">Contents</th><th className="font-medium">Cycle</th><th className="font-medium">Use by</th><th className="font-medium">Patient</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {packs.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-mono">{p.code}</td><td>{p.contents}</td>
                  <td>{p.steriliserName} #{p.cycleNumber}</td>
                  <td className={p.isExpired ? 'text-error' : ''}>{format(parseISO(p.expiresOn), 'd MMM yyyy')}</td>
                  <td>{p.patientId ? <Link className="text-primary hover:underline" to={`/patients/${p.patientId}`}>{p.patientName}</Link> : p.statusNote || '–'}</td>
                  <td className="pr-4 text-right">{p.status === 'sterile' && <button className="text-[12px] text-text-muted hover:text-error" onClick={() => discard(p)}>Discard</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function RequestsTab({ clinicId, isAdmin }: { clinicId?: string; isAdmin: boolean }) {
  const [view, setView] = useState<'open' | 'completed' | 'rejected'>('open');
  const [rows, setRows] = useState<DataRequest[] | null>(null);
  const [replying, setReplying] = useState<DataRequest | null>(null);
  const [text, setText] = useState('');
  const load = useCallback(() => { setRows(null); getDataRequests(view, clinicId).then(r => setRows(r.data || [])); }, [view, clinicId]);
  useEffect(load, [load]);

  const close = async (status: 'completed' | 'rejected' | 'in_progress') => {
    if (!replying) return;
    const res = await updateDataRequest(replying.id, status, text.trim() || undefined);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    toast({ title: status === 'in_progress' ? 'Marked in progress' : 'Request closed', variant: 'success' });
    setReplying(null);
    setText('');
    load();
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-text-muted">
        Requests from patients about their personal data, from the portal or logged at the desk. Open a patient's profile (Privacy) to export their data,
        stop messages or erase their details.
      </p>
      <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
        <div className="px-4 py-2.5 flex gap-2 border-b border-line">
          {(['open', 'completed', 'rejected'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 h-8 rounded-full text-[12px] font-medium capitalize ${view === v ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover border border-line'}`}>{v}</button>
          ))}
        </div>
        {rows === null ? <div className="p-4"><Skeleton className="h-20 w-full" /></div> : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No requests" description="Patients can make requests from My data & privacy in their portal settings." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(r => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium">{REQUEST_KIND_LABEL[r.kind]}</span>
                    {r.patientId ? <Link to={`/patients/${r.patientId}`} className="text-[13px] text-primary hover:underline">{r.patientName || r.requesterName}</Link> : <span className="text-[13px]">{r.requesterName}</span>}
                    {r.isOverdue && <Badge variant="error">Overdue</Badge>}
                    {r.status === 'in_progress' && <Badge variant="secondary">In progress</Badge>}
                  </div>
                  {r.details && <p className="text-[13px] text-text-muted mt-0.5">“{r.details}”</p>}
                  <div className="text-[12px] text-text-muted mt-0.5">
                    {r.source === 'portal' ? 'From the portal' : 'Logged by staff'} · {format(parseISO(r.createdAt), 'd MMM')} · reply by {format(parseISO(r.dueOn), 'd MMM')}
                    {r.resolution ? ` · ${r.resolution}` : ''}
                  </div>
                </div>
                {isAdmin && (r.status === 'received' || r.status === 'in_progress') && <Button size="sm" variant="outline" onClick={() => { setReplying(r); setText(''); }}>Respond</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {replying && (
        <Modal title={`${REQUEST_KIND_LABEL[replying.kind]} · ${replying.patientName || replying.requesterName}`} onClose={() => setReplying(null)}
          footer={<>
            <Button variant="ghost" onClick={() => close('in_progress')}>Mark in progress</Button>
            <Button variant="outline" onClick={() => close('rejected')} disabled={!text.trim()}>Refuse</Button>
            <Button onClick={() => close('completed')} disabled={!text.trim()}>Done</Button>
          </>}>
          <div className="p-5 space-y-3">
            {replying.details && <blockquote className="rounded-control bg-surface-hover p-3 text-[14px]">“{replying.details}”</blockquote>}
            {replying.patientId && <Link to={`/patients/${replying.patientId}`} className="text-[13px] text-primary hover:underline">Open the patient's profile to act on it</Link>}
            <label className="block">
              <span className="text-[13px] font-medium">Reply to the patient</span>
              <textarea rows={4} value={text} onChange={e => setText(e.target.value)} className="mt-1 w-full p-3 rounded-control border border-line bg-surface text-sm"
                placeholder="What was done, or why it can't be done (e.g. records we must keep by law)." />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
}

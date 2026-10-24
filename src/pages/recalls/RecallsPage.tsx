import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import {
  BellRing, CalendarPlus, CheckCircle2, Clock, MessageCircle, MoreHorizontal, Phone, RefreshCw, Send, Settings2,
  Star, Stethoscope, X, XCircle, AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatTile } from '../../components/ui/StatTile';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { AppointmentFormModal } from '../../components/calendar/AppointmentFormModal';
import { getClinicById, getPatients, getStaff } from '../../api/apiService';
import {
  getRecalls, getRecallSettings, getRecallSummary, Recall, RecallSettings, RecallSummary, refreshRecalls,
  saveRecallSettings, sendRecall, sendRecalls, setGoogleReviewUrl, updateRecall,
} from '../../api/recallsService';
import { Patient, User } from '../../types';

type Tab = 'now' | 'upcoming' | 'contacted' | 'booked' | 'dismissed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'now', label: 'Due now' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'contacted', label: 'Waiting for reply' },
  { key: 'booked', label: 'Booked' },
  { key: 'dismissed', label: 'Dismissed' },
];

function inTab(r: Recall, tab: Tab) {
  switch (tab) {
    case 'now': return (r.status === 'due' || r.status === 'contacted') && r.isDue;
    case 'upcoming': return r.status === 'due' && !r.isDue;
    case 'contacted': return r.status === 'contacted' && !r.isDue;
    case 'booked': return r.status === 'booked';
    case 'dismissed': return r.status === 'dismissed';
  }
}

function dueLabel(r: Recall) {
  const days = differenceInCalendarDays(parseISO(r.dueDate), new Date());
  if (days === 0) return 'Due today';
  if (days < 0) return `Overdue ${-days} ${-days === 1 ? 'day' : 'days'}`;
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function RecallsPage() {
  const { user, selectedClinicId } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [rows, setRows] = useState<Recall[] | null>(null);
  const [summary, setSummary] = useState<RecallSummary | null>(null);
  const [tab, setTab] = useState<Tab>('now');
  const [kind, setKind] = useState<'all' | 'checkup' | 'treatment'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [booking, setBooking] = useState<Recall | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<User[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const clinicFilter = selectedClinicId === 'all' ? undefined : selectedClinicId;

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([getRecalls({ clinicId: clinicFilter }), getRecallSummary(clinicFilter)]);
    setRows(list.data || []);
    if (sum.data) setSummary(sum.data);
    setSelected(new Set());
  }, [clinicFilter]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (rows || []).filter(r => inTab(r, tab) && (kind === 'all' || r.kind === kind)), [rows, tab, kind]);
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, (rows || []).filter(r => inTab(r, t.key)).length])) as Record<Tab, number>, [rows]);
  const sendable = visible.filter(r => r.whatsappOptIn && (r.status === 'due' || r.status === 'contacted'));
  const chosen = visible.filter(r => selected.has(r.id));

  const replace = (r: Recall) => setRows(rs => (rs || []).map(x => (x.id === r.id ? r : x)));

  const report = (results: { status: string; detail: string }[]) => {
    const sent = results.filter(r => r.status === 'sent').length;
    const skipped = results.length - sent;
    toast(sent
      ? { title: `Sent ${sent} ${sent === 1 ? 'recall' : 'recalls'} on WhatsApp`, description: skipped ? `${skipped} not sent (no WhatsApp opt-in or number).` : undefined, variant: 'success' }
      : { title: results[0]?.detail || 'Nothing was sent', variant: 'error' });
  };

  const sendOne = async (r: Recall) => {
    setBusy(r.id);
    const res = await sendRecall(r.id);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    report([res.data]);
    load();
  };

  const sendBulk = async (list: Recall[]) => {
    if (!list.length) return;
    setBusy('bulk');
    const res = await sendRecalls(list.map(r => r.id));
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    report(res.data);
    load();
  };

  const patch = async (r: Recall, change: { status?: 'due' | 'dismissed'; dueDate?: string }, message: string) => {
    setBusy(r.id);
    const res = await updateRecall(r.id, change);
    setBusy(null);
    if (res.data) { replace(res.data); toast({ title: message, variant: 'success' }); getRecallSummary(clinicFilter).then(s => s.data && setSummary(s.data)); }
    else toast({ title: res.error?.message || 'Could not update', variant: 'error' });
  };

  const openBooking = async (r: Recall) => {
    if (!patients.length || !dentists.length) {
      const [p, s] = await Promise.all([getPatients({ clinicId: r.clinicId }), getStaff()]);
      setPatients(p.data || []);
      setDentists((s.data || []).filter(d => d.role === 'dentist' && d.status !== 'inactive' && (d.clinicIds?.includes(r.clinicId) || d.clinicId === r.clinicId)));
    }
    setBooking(r);
  };

  const refresh = async () => {
    setBusy('refresh');
    const res = await refreshRecalls();
    await load();
    setBusy(null);
    if (res.data) toast({ title: res.data.created ? `${res.data.created} new ${res.data.created === 1 ? 'recall' : 'recalls'} found` : 'Recall list is up to date', variant: 'success' });
  };

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChosen = sendable.length > 0 && sendable.every(r => selected.has(r.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recalls"
        description="Patients due for a checkup or with treatment still to finish. Remind them on WhatsApp in one tap."
        actions={
          <>
            <Button variant="outline" onClick={refresh} loading={busy === 'refresh'}><RefreshCw className="w-4 h-4" /> Refresh</Button>
            {isAdmin && <Button variant="ghost" onClick={() => setSettingsOpen(true)}><Settings2 className="w-4 h-4" /> Settings</Button>}
            {tab === 'now' && (
              <Button onClick={() => sendBulk(chosen.length ? chosen : sendable)} disabled={!sendable.length} loading={busy === 'bulk'}>
                <Send className="w-4 h-4" /> {chosen.length ? `Send ${chosen.length} selected` : `Send all due (${sendable.length})`}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Due now" value={rows ? counts.now : '–'} icon={BellRing} tone={counts.now ? 'warning' : undefined} />
        <StatTile label="Waiting for reply" value={summary?.contacted ?? '–'} icon={Clock} />
        <StatTile label="Booked, last 30 days" value={summary?.bookedLast30Days ?? '–'} icon={CheckCircle2} tone="accent" />
        <StatTile label="Review requests, 30 days" value={summary?.reviewRequestsLast30Days ?? '–'} icon={Star} />
      </div>

      <div className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden">
        <div className="border-b border-line px-2 sm:px-4 flex items-center gap-1 overflow-x-auto scrollbar-hide" role="tablist">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setSelected(new Set()); }}
              className={`h-12 px-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
              {t.label}{rows && counts[t.key] > 0 && <span className="ml-1.5 text-[11px] tabular-nums opacity-70">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-line">
          {([['all', 'All'], ['checkup', 'Checkups'], ['treatment', 'Unfinished treatment']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setKind(k)}
              className={`px-3 h-8 rounded-full text-[12px] font-medium ${kind === k ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover border border-line'}`}>
              {label}
            </button>
          ))}
          {tab === 'now' && sendable.length > 0 && (
            <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-text-muted cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={allChosen}
                onChange={() => setSelected(allChosen ? new Set() : new Set(sendable.map(r => r.id)))} />
              Select all
            </label>
          )}
        </div>

        {rows === null ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={tab === 'now' ? CheckCircle2 : BellRing}
            title={tab === 'now' ? 'No one to call right now' : 'Nothing here'}
            description={tab === 'now' ? 'Patients appear here when a checkup falls due or a treatment plan stalls.' : 'Recalls move here as you contact, book or dismiss them.'} />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map(r => {
              const open = r.status === 'due' || r.status === 'contacted';
              return (
                <li key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {tab === 'now' && (
                      <input type="checkbox" className="h-4 w-4 mt-1 rounded border-line text-primary disabled:opacity-30"
                        checked={selected.has(r.id)} disabled={!r.whatsappOptIn} onChange={() => toggle(r.id)}
                        aria-label={`Select ${r.patientName}`} />
                    )}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-none ${r.kind === 'treatment' ? 'bg-accent/10 text-accent' : 'bg-primary/[0.07] text-primary'}`}>
                      {r.kind === 'treatment' ? <Stethoscope className="w-4 h-4" /> : <BellRing className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Link to={`/patients/${r.patientId}`} className="text-sm font-semibold hover:text-primary">{r.patientName}</Link>
                        <Badge variant={r.kind === 'treatment' ? 'secondary' : 'outline'}>{r.kind === 'treatment' ? 'Unfinished treatment' : 'Checkup'}</Badge>
                        {!r.whatsappOptIn && open && (
                          <span className="inline-flex items-center gap-1 text-[12px] text-warning"><AlertTriangle className="w-3.5 h-3.5" /> No WhatsApp, call instead</span>
                        )}
                      </div>
                      <div className="text-[13px] text-text-muted truncate">{r.reason}</div>
                      <div className="text-[12px] text-text-muted mt-0.5">
                        {r.status === 'booked' && r.bookedAt ? `Booked ${formatDistanceToNowStrict(parseISO(r.bookedAt))} ago` :
                          r.status === 'dismissed' ? `Dismissed${r.notes ? `: ${r.notes}` : ''}` : (
                          <>
                            <span className={r.isDue ? 'text-warning font-medium' : ''}>{dueLabel(r)}</span>
                            {r.contactCount > 0 && r.lastContactedAt && <> · Messaged {r.contactCount}× , last {formatDistanceToNowStrict(parseISO(r.lastContactedAt))} ago</>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {open && (
                    <div className="flex items-center gap-2 sm:flex-none pl-12 sm:pl-0">
                      {r.whatsappOptIn ? (
                        <Button size="sm" variant={r.isDue ? 'default' : 'outline'} onClick={() => sendOne(r)} loading={busy === r.id}>
                          <MessageCircle className="w-4 h-4" /> {r.contactCount ? 'Remind again' : 'WhatsApp'}
                        </Button>
                      ) : r.phone ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={`tel:${r.phone.replace(/\s/g, '')}`}><Phone className="w-4 h-4" /> Call</a>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => openBooking(r)}><CalendarPlus className="w-4 h-4" /> Book</Button>
                      <RowMenu
                        onSnooze={() => patch(r, { dueDate: format(addDays(new Date(), 14), 'yyyy-MM-dd') }, 'Snoozed for 2 weeks')}
                        onDismiss={() => patch(r, { status: 'dismissed' }, 'Recall dismissed')}
                      />
                    </div>
                  )}
                  {r.status === 'dismissed' && (
                    <Button size="sm" variant="ghost" className="sm:flex-none" onClick={() => patch(r, { status: 'due' }, 'Recall restored')}>Restore</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {booking && (
        <AppointmentFormModal
          isOpen
          onClose={() => setBooking(null)}
          clinicId={booking.clinicId}
          initialPatientId={booking.patientId}
          patients={patients}
          dentists={dentists}
          onSuccess={() => { setBooking(null); load(); toast({ title: 'Booked. The recall is closed.', variant: 'success' }); }}
        />
      )}

      {settingsOpen && <RecallSettingsDialog clinicId={clinicFilter} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function RowMenu({ onSnooze, onDismiss }: { onSnooze: () => void; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setOpen(o => !o)} aria-label="More actions" aria-expanded={open}>
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-48 rounded-control border border-line bg-surface shadow-float py-1">
            <button className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2" onClick={() => { setOpen(false); onSnooze(); }}>
              <Clock className="w-4 h-4 text-text-muted" /> Snooze 2 weeks
            </button>
            <button className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2 text-error" onClick={() => { setOpen(false); onDismiss(); }}>
              <XCircle className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RecallSettingsDialog({ clinicId, onClose }: { clinicId?: string; onClose: () => void }) {
  const [cfg, setCfg] = useState<RecallSettings | null>(null);
  const [reviewUrl, setReviewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecallSettings().then(r => r.data && setCfg(r.data));
    if (clinicId) getClinicById(clinicId).then(r => setReviewUrl(r.data?.googleReviewUrl || ''));
  }, [clinicId]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setError(null);
    const res = await saveRecallSettings(cfg);
    let linkError: string | undefined;
    if (clinicId) {
      const link = await setGoogleReviewUrl(clinicId, reviewUrl.trim());
      linkError = link.error ? 'The review link must start with https://' : undefined;
    }
    setSaving(false);
    if (res.error || linkError) { setError(res.error?.message || linkError || 'Could not save'); return; }
    toast({ title: 'Recall settings saved', variant: 'success' });
    onClose();
  };

  const num = (key: keyof RecallSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg(c => (c ? { ...c, [key]: Number(e.target.value) } : c));
  const flag = (key: keyof RecallSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg(c => (c ? { ...c, [key]: e.target.checked } : c));

  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg bg-surface rounded-panel border border-line shadow-float flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line flex-none">
            <Dialog.Title className="text-[17px] font-semibold">Recall settings</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-surface-hover" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          {!cfg ? <div className="p-5"><Skeleton className="h-60 w-full" /></div> : (
            <div className="p-5 space-y-5 overflow-y-auto">
              <section className="space-y-3">
                <h3 className="text-[13px] font-semibold text-text-muted">Recalls</h3>
                <Row label="Checkup every" suffix="months"><Input type="number" min={1} max={24} value={cfg.checkupIntervalMonths} onChange={num('checkupIntervalMonths')} /></Row>
                <Row label="Chase unfinished treatment after" suffix="days idle"><Input type="number" min={1} max={180} value={cfg.treatmentFollowupDays} onChange={num('treatmentFollowupDays')} /></Row>
                <Row label="Remind again after" suffix="days"><Input type="number" min={1} max={90} value={cfg.remindAgainDays} onChange={num('remindAgainDays')} /></Row>
                <Toggle checked={cfg.autoSendRecalls} onChange={flag('autoSendRecalls')} label="Send due recalls automatically"
                  hint="Once per recall, between 10am and 7pm. Needs automatic reminders switched on for the server." />
              </section>
              <section className="space-y-3 pt-4 border-t border-line">
                <h3 className="text-[13px] font-semibold text-text-muted">Google reviews</h3>
                <Toggle checked={cfg.reviewRequestsEnabled} onChange={flag('reviewRequestsEnabled')} label="Ask for a review after each visit"
                  hint="Sent on WhatsApp after a completed appointment, at most once per patient in the period below." />
                <Row label="Send after" suffix="hours"><Input type="number" min={0} max={48} step={0.5} value={cfg.reviewDelayHours} onChange={num('reviewDelayHours')} /></Row>
                <Row label="Ask the same patient at most every" suffix="days"><Input type="number" min={1} max={730} value={cfg.reviewCooldownDays} onChange={num('reviewCooldownDays')} /></Row>
                {clinicId ? (
                  <label className="block">
                    <span className="text-[13px] font-medium">This clinic's Google review link</span>
                    <Input className="mt-1" value={reviewUrl} onChange={e => setReviewUrl(e.target.value)} placeholder="https://g.page/r/…/review" inputMode="url" />
                    <span className="text-[12px] text-text-muted">In Google Business Profile, choose "Ask for reviews" and copy the link. No link means no review requests for this clinic.</span>
                  </label>
                ) : (
                  <p className="text-[12px] text-text-muted">Pick a clinic at the top of the screen to set its Google review link.</p>
                )}
              </section>
              {error && <p className="text-[13px] text-error">{error}</p>}
            </div>
          )}
          <div className="px-5 py-3 border-t border-line flex justify-end gap-2 flex-none">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!cfg}>Save</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({ label, suffix, children }: { label: string; suffix: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm flex-1">{label}</span>
      <div className="w-20">{children}</div>
      <span className="text-[13px] text-text-muted w-20">{suffix}</span>
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="h-4 w-4 mt-0.5 rounded border-line text-primary" checked={checked} onChange={onChange} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[12px] text-text-muted">{hint}</span>
      </span>
    </label>
  );
}

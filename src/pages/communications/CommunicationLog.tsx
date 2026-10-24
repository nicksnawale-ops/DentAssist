import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  AlertCircle, ArrowLeft, Check, CheckCheck, Clock, MessageSquare, Phone, RefreshCw, Search, Send, Settings2, Ban,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  formatPhone, getMessageLog, getMessagingStatus, LANGUAGE_LABELS, MESSAGE_KIND_LABELS, MessageLogEntry, MessagingStatus, sendReply,
} from '../../api/messagingService';

type Filter = 'all' | 'replies' | 'problems';

interface Conversation {
  phone: string;
  patientId: string | null;
  name: string;
  messages: MessageLogEntry[]; // oldest first
  last: MessageLogEntry;
  lastInbound?: MessageLogEntry;
  problems: number;
}

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

function StatusTick({ m }: { m: MessageLogEntry }) {
  switch (m.status) {
    case 'queued': return <Clock className="w-3.5 h-3.5" aria-label="Queued" />;
    case 'sent': return <Check className="w-3.5 h-3.5" aria-label="Sent" />;
    case 'delivered': return <CheckCheck className="w-3.5 h-3.5" aria-label="Delivered" />;
    case 'read': return <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" aria-label="Read" />;
    case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-error" aria-label="Failed" />;
    case 'skipped': return <Ban className="w-3.5 h-3.5 text-warning" aria-label="Not sent" />;
    default: return null;
  }
}

function Initials({ name }: { name: string }) {
  const text = name.startsWith('+') ? '#' : name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="w-9 h-9 rounded-full bg-accent/15 text-accent text-[13px] font-semibold flex items-center justify-center flex-none" aria-hidden="true">
      {text}
    </span>
  );
}

function dayLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE d MMM yyyy');
}

function shortTime(iso: string) {
  const d = parseISO(iso);
  return isToday(d) ? format(d, 'h:mm a') : isYesterday(d) ? 'Yesterday' : format(d, 'd MMM');
}

export function CommunicationLog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [rows, setRows] = useState<MessageLogEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    const res = await getMessageLog({});
    setRefreshing(false);
    if (res.data) setRows(res.data);
    else setRows(r => r ?? []);
  }, []);

  useEffect(() => {
    getMessagingStatus().then(r => r.data && setStatus(r.data));
    load();
    const t = window.setInterval(load, 30000); // new replies and delivery ticks
    return () => window.clearInterval(t);
  }, [load]);

  const conversations = useMemo<Conversation[]>(() => {
    const map = new Map<string, Conversation>();
    for (const m of [...(rows || [])].reverse()) {
      const key = m.phone || m.id;
      let c = map.get(key);
      if (!c) {
        c = { phone: m.phone, patientId: m.patientId, name: m.patientName || formatPhone(m.phone) || 'Unknown', messages: [], last: m, problems: 0 };
        map.set(key, c);
      }
      c.messages.push(m);
      c.last = m;
      if (m.patientName && c.name.startsWith('+')) { c.name = m.patientName; c.patientId = m.patientId; }
      if (m.direction === 'inbound') c.lastInbound = m;
      if (m.status === 'failed' || m.status === 'skipped') c.problems += 1;
    }
    return [...map.values()].sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }, [rows]);

  const visible = conversations.filter(c => {
    const q = query.trim().toLowerCase();
    const matches = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || '~') ||
      c.messages.some(m => m.body.toLowerCase().includes(q));
    if (!matches) return false;
    if (filter === 'replies') return !!c.lastInbound;
    if (filter === 'problems') return c.problems > 0;
    return true;
  });

  const active = conversations.find(c => (c.phone || c.last.id) === selected) || null;
  const canReply = !!active?.lastInbound && Date.now() - parseISO(active.lastInbound.createdAt).getTime() < REPLY_WINDOW_MS;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [selected, active?.messages.length]);

  const stats = useMemo(() => {
    const out = (rows || []).filter(m => m.direction === 'outbound' && isToday(parseISO(m.createdAt)));
    const delivered = out.filter(m => m.status === 'delivered' || m.status === 'read').length;
    return {
      sentToday: out.filter(m => !['skipped', 'failed'].includes(m.status)).length,
      delivered,
      replies: (rows || []).filter(m => m.direction === 'inbound' && isToday(parseISO(m.createdAt))).length,
      problems: (rows || []).filter(m => m.status === 'failed').length,
    };
  }, [rows]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    const res = await sendReply(active.phone, reply.trim());
    setSending(false);
    if (res.error || !res.data) {
      toast({ title: res.error?.message || 'Could not send', variant: 'error' });
      return;
    }
    if (res.data.message) setRows(r => [res.data!.message!, ...(r || [])]);
    setReply('');
  };

  const isStaffAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader
        className="flex-none mb-0"
        title="Messages"
        description="WhatsApp reminders, confirmations and patient replies in one place."
        actions={
          <>
            <Button variant="outline" onClick={load} loading={refreshing}><RefreshCw className="w-4 h-4" /> Refresh</Button>
            {isStaffAdmin && (
              <Button asChild variant="ghost"><Link to="/settings?tab=whatsapp"><Settings2 className="w-4 h-4" /> Templates</Link></Button>
            )}
          </>
        }
      />

      {status && !status.live && (
        <div className="flex-none flex items-start gap-2 rounded-control border border-warning/20 bg-warning/[0.06] px-3 py-2 text-[13px]">
          <AlertCircle className="w-4 h-4 text-warning flex-none mt-0.5" />
          <span>{status.detail}</span>
        </div>
      )}

      <div className="flex-none grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Sent today', value: stats.sentToday },
          { label: 'Delivered today', value: stats.delivered },
          { label: 'Replies today', value: stats.replies },
          { label: 'Failed', value: stats.problems, tone: stats.problems ? 'text-error' : '' },
        ].map(s => (
          <div key={s.label} className="rounded-panel border border-line bg-surface px-4 py-3 shadow-panel">
            <div className="text-[12px] text-text-muted">{s.label}</div>
            <div className={`text-xl font-semibold tabular-nums ${s.tone || ''}`}>{rows ? s.value : '–'}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-[480px] bg-surface rounded-panel border border-line shadow-panel flex overflow-hidden">
        {/* Conversation list */}
        <aside className={`w-full md:w-80 lg:w-96 flex-none border-r border-line flex flex-col ${active ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-line space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, number or message" className="pl-9" aria-label="Search messages" />
            </div>
            <div className="flex gap-1" role="tablist">
              {([['all', 'All'], ['replies', 'Replies'], ['problems', 'Not delivered']] as [Filter, string][]).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                  className={`px-3 h-8 rounded-full text-[12px] font-medium transition-colors ${filter === k ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows === null ? (
              <div className="p-3 space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : visible.length === 0 ? (
              <EmptyState icon={MessageSquare} title={conversations.length ? 'No matches' : 'No messages yet'}
                description={conversations.length ? 'Try a different search or filter.' : 'Booking confirmations and reminders will appear here as they go out.'} />
            ) : visible.map(c => {
              const key = c.phone || c.last.id;
              return (
                <button key={key} onClick={() => setSelected(key)}
                  className={`w-full text-left px-3 py-3 flex gap-3 border-b border-line/60 transition-colors ${selected === key ? 'bg-primary/[0.05]' : 'hover:bg-surface-hover'}`}>
                  <Initials name={c.name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <span className="text-[11px] text-text-muted flex-none">{shortTime(c.last.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[13px] text-text-muted">
                      {c.last.direction === 'outbound' && <StatusTick m={c.last} />}
                      <span className="truncate">{c.last.body}</span>
                    </div>
                  </div>
                  {c.problems > 0 && <span className="self-center w-2 h-2 rounded-full bg-error flex-none" aria-label="Has undelivered messages" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Thread */}
        <section className={`flex-1 min-w-0 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
          {!active ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={MessageSquare} title="Pick a conversation" description="See every reminder, confirmation and reply for a patient." />
            </div>
          ) : (
            <>
              <header className="h-14 flex-none border-b border-line px-3 flex items-center gap-3">
                <button className="md:hidden p-2 -ml-1 rounded-control hover:bg-surface-hover" onClick={() => setSelected(null)} aria-label="Back to conversations">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Initials name={active.name} />
                <div className="flex-1 min-w-0">
                  {active.patientId ? (
                    <Link to={`/patients/${active.patientId}`} className="text-sm font-semibold hover:text-primary truncate block">{active.name}</Link>
                  ) : <span className="text-sm font-semibold">{active.name}</span>}
                  <div className="text-[12px] text-text-muted">{formatPhone(active.phone)}</div>
                </div>
                {active.phone && (
                  <a href={`tel:+${active.phone}`} className="p-2 rounded-control text-text-muted hover:text-primary hover:bg-surface-hover" aria-label={`Call ${active.name}`}>
                    <Phone className="w-4 h-4" />
                  </a>
                )}
              </header>

              <div className="flex-1 overflow-y-auto bg-[#EFEAE2] dark:bg-[#0B141A] px-3 sm:px-6 py-4 space-y-2">
                {active.messages.map((m, i) => {
                  const showDay = i === 0 || dayLabel(active.messages[i - 1].createdAt) !== dayLabel(m.createdAt);
                  const mine = m.direction === 'outbound';
                  const problem = m.status === 'failed' || m.status === 'skipped';
                  return (
                    <React.Fragment key={m.id}>
                      {showDay && (
                        <div className="text-center my-3">
                          <span className="text-[11px] px-2.5 py-1 rounded-md bg-surface/90 text-text-muted shadow-sm">{dayLabel(m.createdAt)}</span>
                        </div>
                      )}
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                          mine ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-tr-none'
                               : 'bg-white dark:bg-[#202C33] text-[#111B21] dark:text-[#E9EDEF] rounded-tl-none'
                        } ${problem ? 'opacity-80 ring-1 ring-error/30' : ''}`}>
                          {mine && m.kind !== 'text' && (
                            <div className="text-[11px] font-semibold text-[#008069] dark:text-[#53BDEB] mb-0.5">
                              {MESSAGE_KIND_LABELS[m.kind] || m.kind}
                              {m.language && m.language !== 'en' && <span className="font-normal opacity-80"> · {LANGUAGE_LABELS[m.language] || m.language}</span>}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap break-words" lang={m.language || undefined}>{m.body}</div>
                          <div className="flex items-center justify-end gap-1 mt-1 text-[11px] opacity-60">
                            {format(parseISO(m.createdAt), 'h:mm a')}
                            {mine && <StatusTick m={m} />}
                          </div>
                          {problem && m.error && <div className="mt-1 text-[12px] text-error">{m.status === 'skipped' ? 'Not sent: ' : 'Failed: '}{m.error}</div>}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={endRef} />
              </div>

              <footer className="flex-none border-t border-line p-3">
                {canReply ? (
                  <form className="flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
                    <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="Type a reply" maxLength={1000} aria-label="Reply" />
                    <Button type="submit" disabled={!reply.trim()} loading={sending} aria-label="Send reply"><Send className="w-4 h-4" /></Button>
                  </form>
                ) : (
                  <p className="text-[12px] text-text-muted text-center">
                    WhatsApp allows free replies only within 24 hours of the patient's last message. Reminders and invoices are sent from the calendar and billing.
                  </p>
                )}
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

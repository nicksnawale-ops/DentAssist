import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, MessageSquare, RotateCcw, Send, Info, BellRing } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  getMessageTemplates, getMessagingStatus, LANGUAGE_LABELS, MessageTemplate, MessagingStatus, previewTemplate,
  sendTestMessage, updateMessageTemplate,
} from '../../api/messagingService';

export function WhatsAppTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin';

  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [activeKey, setActiveKey] = useState<string>('reminder_24h');
  const [lang, setLang] = useState<string>('en');
  const [draft, setDraft] = useState<MessageTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    Promise.all([getMessagingStatus(), getMessageTemplates()]).then(([s, t]) => {
      if (s.data) setStatus(s.data);
      if (t.data) {
        setTemplates(t.data);
        setDraft(t.data.find(x => x.key === activeKey) || t.data[0] || null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saved = templates.find(t => t.key === activeKey);
  const dirty = !!(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  const translation = draft && lang !== 'en' ? draft.translations[lang] : undefined;
  const text = draft ? (translation ? translation.body : draft.body) : '';
  const preview = useMemo(() => (draft ? previewTemplate({ body: text, params: draft.params }, lang) : ''), [draft, text, lang]);
  const languages = draft ? ['en', ...Object.keys(draft.translations)] : ['en'];

  const setText = (value: string) => {
    if (!draft) return;
    if (lang === 'en') setDraft({ ...draft, body: value });
    else setDraft({ ...draft, translations: { ...draft.translations, [lang]: { ...draft.translations[lang], body: value } } });
  };

  const select = (key: string) => {
    const t = templates.find(x => x.key === key) || null;
    setActiveKey(key);
    setDraft(t);
    if (t && lang !== 'en' && !t.translations[lang]) setLang('en');
    setError(null);
  };

  const save = async (patch?: Partial<MessageTemplate>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setSaving(true);
    setError(null);
    const res = await updateMessageTemplate(next.key, {
      body: next.body, metaName: next.metaName, enabled: next.enabled, translations: next.translations,
    });
    setSaving(false);
    if (res.error || !res.data) {
      setError(res.error?.message || 'Could not save');
      return;
    }
    setTemplates(ts => ts.map(t => (t.key === res.data!.key ? res.data! : t)));
    setDraft(res.data);
    toast({ title: 'Template saved', variant: 'success' });
  };

  const test = async () => {
    setTesting(true);
    const res = await sendTestMessage(testPhone);
    setTesting(false);
    if (res.error || !res.data) toast({ title: res.error?.message || 'Could not send', variant: 'error' });
    else toast({ title: res.data.detail, variant: res.data.status === 'sent' ? 'success' : 'error' });
  };

  if (!status || !draft) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Connection */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-none ${status.live ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
            {status.live ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">WhatsApp</h2>
              <Badge variant={status.live ? 'success' : 'warning'}>
                {status.live ? 'Live' : status.provider === 'console' ? 'Test mode' : 'Not connected'}
              </Badge>
              <Badge variant={status.remindersEnabled ? 'secondary' : 'outline'}>
                <BellRing className="w-3 h-3" /> Automatic reminders {status.remindersEnabled ? 'on' : 'off'}
              </Badge>
            </div>
            <p className="text-[13px] text-text-muted mt-1">{status.detail}</p>
            {!status.live && canEdit && (
              <p className="text-[13px] text-text-muted mt-1">
                To send to patients' phones, connect the WhatsApp Cloud API (see the backend README, "WhatsApp reminders").
              </p>
            )}
          </div>
          {canEdit && (
            <form className="flex gap-2 sm:w-72" onSubmit={e => { e.preventDefault(); test(); }}>
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="Your mobile number" inputMode="tel" aria-label="Mobile number for a test message" />
              <Button type="submit" variant="outline" disabled={testPhone.replace(/\D/g, '').length < 10} loading={testing} aria-label="Send test message">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          )}
        </div>
      </Card>

      {/* Templates */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <nav className="md:w-60 flex-none border-b md:border-b-0 md:border-r border-line p-2 flex md:flex-col gap-1 overflow-x-auto scrollbar-hide" aria-label="Message types">
            {templates.map(t => (
              <button
                key={t.key}
                onClick={() => select(t.key)}
                className={`text-left px-3 py-2 rounded-control text-[13px] font-medium whitespace-nowrap flex items-center justify-between gap-2 transition-colors ${
                  activeKey === t.key ? 'bg-primary/[0.07] text-primary' : 'text-text-main hover:bg-surface-hover'
                }`}
              >
                {t.label}
                {!t.enabled && <span className="text-[11px] text-text-muted font-normal">Off</span>}
              </button>
            ))}
          </nav>

          <div className="flex-1 p-5 space-y-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold">{draft.label}</h3>
                <p className="text-[13px] text-text-muted">Sent automatically to patients who have opted in to WhatsApp.</p>
              </div>
              <label className={`inline-flex items-center gap-2 text-[13px] font-medium ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  checked={draft.enabled}
                  disabled={!canEdit || saving}
                  onChange={e => save({ enabled: e.target.checked })}
                />
                Send this message
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-control border border-line p-0.5" role="tablist" aria-label="Language">
                {languages.map(code => (
                  <button key={code} role="tab" aria-selected={lang === code} onClick={() => setLang(code)}
                    className={`px-3 h-8 rounded-[6px] text-[13px] font-medium transition-colors ${lang === code ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-hover'}`}>
                    {LANGUAGE_LABELS[code] || code}
                    {code !== 'en' && draft.translations[code] && !draft.translations[code].enabled && <span className="ml-1 opacity-70">(off)</span>}
                  </button>
                ))}
              </div>
              {translation && (
                <label className={`inline-flex items-center gap-2 text-[13px] ${canEdit ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                    checked={translation.enabled}
                    disabled={!canEdit || saving}
                    onChange={e => setDraft({ ...draft, translations: { ...draft.translations, [lang]: { ...translation, enabled: e.target.checked } } })}
                  />
                  Use for patients who chose {LANGUAGE_LABELS[lang]}
                </label>
              )}
            </div>
            <p className="text-[12px] text-text-muted -mt-3">
              Patients get the message in the language on their profile. If a version is off or Meta hasn't approved it yet, they get English.
            </p>

            <div className="grid lg:grid-cols-2 gap-5">
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[13px] font-medium">Message</span>
                  <textarea
                    value={text}
                    readOnly={!canEdit}
                    lang={lang}
                    onChange={e => setText(e.target.value)}
                    rows={6}
                    className="mt-1 w-full p-3 bg-surface border border-line rounded-control text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none resize-y"
                  />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {draft.params.map((p, i) => (
                    <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-surface-hover border border-line text-text-muted">
                      {`{{${i + 1}}}`} {p.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <label className="block">
                  <span className="text-[13px] font-medium">Approved template name in Meta</span>
                  <Input className="mt-1 font-mono text-[13px]" value={draft.metaName} readOnly={!canEdit}
                    onChange={e => setDraft({ ...draft, metaName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} />
                </label>
                {error && <p className="text-[13px] text-error">{error}</p>}
                {canEdit && (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => saved && setDraft(saved)}>
                      <RotateCcw className="w-3.5 h-3.5" /> Undo changes
                    </Button>
                    <Button size="sm" disabled={!dirty} loading={saving} onClick={() => save()}>Save</Button>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[13px] font-medium">Preview</span>
                <div className="mt-1 rounded-control border border-line bg-[#EFEAE2] dark:bg-[#0B141A] p-4 min-h-[180px]">
                  <div lang={lang} className="bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-[90%] shadow-sm whitespace-pre-wrap">
                    {preview}
                    <div className="text-right text-[11px] opacity-50 mt-1">10:00 AM</div>
                  </div>
                </div>
                <p className="text-[12px] text-text-muted mt-2 flex gap-1.5">
                  <Info className="w-3.5 h-3.5 flex-none mt-0.5" />
                  Meta must approve each language. In WhatsApp Manager add {LANGUAGE_LABELS[lang] === 'English' ? 'this text' : `this as the ${lang === 'hi' ? 'Hindi' : 'Marathi'} translation`} of “{draft.metaName}”, keeping the numbered placeholders in order.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <p className="text-[12px] text-text-muted flex items-center gap-1.5 px-1">
        <MessageSquare className="w-3.5 h-3.5" />
        Patients can reply CONFIRM, CANCEL or RESCHEDULE. Confirmations and cancellations update the calendar automatically.
      </p>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mic, MicOff, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { AI_LANGUAGES, createRecognition, draftSoapNote, SoapDraft, speechSupported } from '../../api/aiService';

/**
 * Dictate the visit (or type a rough summary) and get a SOAP draft. Speech is turned into text by the
 * browser on this device; only the text is sent for drafting, with the patient's name removed.
 */
export function AiScribe({ patientId, onDraft, onClose, demo }: {
  patientId: string; onDraft: (d: SoapDraft) => void; onClose: () => void; demo?: boolean;
}) {
  const [lang, setLang] = useState('en-IN');
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<ReturnType<typeof createRecognition>>(null);
  const supported = speechSupported();

  useEffect(() => () => rec.current?.stop(), []);

  const start = () => {
    setError(null);
    const r = createRecognition(lang);
    if (!r) return;
    r.onresult = e => {
      let finalText = '';
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else partial += res[0].transcript;
      }
      if (finalText) setText(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${finalText.trim()}`);
      setInterim(partial);
    };
    r.onerror = e => {
      if (e.error === 'not-allowed') setError('Microphone access was blocked. Allow it in the browser, or type instead.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Dictation stopped (${e.error}). You can type instead.`);
    };
    r.onend = () => { setListening(false); setInterim(''); };
    rec.current = r;
    r.start();
    setListening(true);
  };

  const stop = () => { rec.current?.stop(); setListening(false); };

  const draft = async () => {
    stop();
    setBusy(true);
    setError(null);
    const res = await draftSoapNote(patientId, `${text} ${interim}`.trim());
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not draft the note'); return; }
    onDraft(res.data);
  };

  return (
    <div className="rounded-control border border-accent/30 bg-accent/[0.04] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <h4 className="text-sm font-semibold mr-auto">Dictate the visit</h4>
        {demo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning">Demo mode</span>}
        <button onClick={onClose} className="p-1 rounded text-text-muted hover:bg-surface-hover" aria-label="Close dictation"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-[12px] text-text-muted">
        Speak or type what you found and did, e.g. "Pain lower left for 3 days, worse with cold. 36 TTP positive, IOPA periapical radiolucency. Irreversible pulpitis 36. Started RCT, access opened, Augmentin 625 twice daily 5 days. Review in 1 week."
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {supported ? (
          <>
            <Button size="sm" variant={listening ? 'danger' : 'default'} onClick={listening ? stop : start}>
              {listening ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4" /> Start dictating</>}
            </Button>
            <select value={lang} onChange={e => setLang(e.target.value)} disabled={listening} className="h-9 px-2 rounded-control border border-line bg-surface text-[13px]" aria-label="Dictation language">
              {AI_LANGUAGES.map(l => <option key={l.speech} value={l.speech}>{l.label}</option>)}
            </select>
            {listening && <span className="flex items-center gap-1.5 text-[12px] text-error"><span className="w-2 h-2 rounded-full bg-error animate-pulse" /> Listening</span>}
          </>
        ) : <span className="text-[12px] text-text-muted">This browser can't dictate; type the summary instead (Chrome and Edge support dictation).</span>}
      </div>
      <textarea value={text + (interim ? ` ${interim}` : '')} onChange={e => { setText(e.target.value); setInterim(''); }} rows={5}
        placeholder="Your dictation appears here. You can edit it before drafting."
        className="w-full p-3 rounded-control border border-line bg-surface text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" />
      {error && <p className="text-[13px] text-error flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-text-muted mr-auto">The patient's name and phone number are removed before drafting. You review everything before it's saved.</span>
        <Button size="sm" onClick={draft} loading={busy} disabled={`${text}${interim}`.trim().length < 10}><Sparkles className="w-4 h-4" /> Draft note</Button>
      </div>
    </div>
  );
}

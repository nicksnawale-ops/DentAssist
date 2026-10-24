import React, { useState } from 'react';
import { AlertTriangle, Plus, Printer, Sparkles, Trash2 } from 'lucide-react';
import { Modal, Field, textareaClass } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/useToast';
import { AI_LANGUAGES, draftExplanation, PlanExplanation, saveExplanation } from '../../api/aiService';

/** Generate, edit and share a plain-language explanation of a treatment plan. */
export function PlanExplainer({ planId, planName, existing, aiEnabled, onClose, onSaved }: {
  planId: string; planName: string; existing?: PlanExplanation | null; aiEnabled: boolean;
  onClose: () => void; onSaved: (e: PlanExplanation) => void;
}) {
  const [lang, setLang] = useState<PlanExplanation['language']>(existing?.language || 'en');
  const [e, setE] = useState<PlanExplanation | null>(existing || null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy('gen');
    setError(null);
    const res = await draftExplanation(planId, lang);
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not write the explanation'); return; }
    setE(res.data);
  };

  const save = async (shared: boolean) => {
    if (!e) return;
    setBusy(shared ? 'share' : 'save');
    const res = await saveExplanation(planId, { ...e, language: lang, shared });
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not save'); return; }
    toast({ title: shared ? 'Shared with the patient in their portal' : 'Saved', variant: 'success' });
    onSaved(res.data);
  };

  const step = (i: number, k: 'name' | 'why' | 'whatToExpect', v: string) =>
    setE(x => (x ? { ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } : x));

  return (
    <Modal title="Explain to the patient" subtitle={planName} onClose={onClose} size="lg"
      footer={e ? <>
        <Button variant="ghost" className="mr-auto" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
        <Button variant="outline" onClick={() => save(false)} loading={busy === 'save'}>Save draft</Button>
        <Button onClick={() => save(true)} loading={busy === 'share'}>Share with patient</Button>
      </> : undefined}>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <Field label="Language">
            <div className="flex gap-1" role="radiogroup">
              {AI_LANGUAGES.map(l => (
                <button key={l.code} role="radio" aria-checked={lang === l.code} onClick={() => setLang(l.code)}
                  className={`h-9 px-3 rounded-full text-[13px] font-medium ${lang === l.code ? 'bg-primary text-white' : 'border border-line hover:bg-surface-hover'}`}>{l.label}</button>
              ))}
            </div>
          </Field>
          {aiEnabled && (
            <Button variant={e ? 'outline' : 'default'} onClick={generate} loading={busy === 'gen'}>
              <Sparkles className="w-4 h-4" /> {e ? 'Rewrite with AI' : 'Write with AI'}
            </Button>
          )}
          {!e && <Button variant="ghost" onClick={() => setE({ language: lang, summary: '', steps: [{ name: '', why: '', whatToExpect: '' }], aftercare: '', questions: [] })}>Write it myself</Button>}
        </div>
        {error && <p className="text-[13px] text-error">{error}</p>}
        {e && (
          <>
            <p className="text-[12px] rounded-control bg-warning/[0.06] border border-warning/20 p-2.5 flex gap-1.5 print:hidden">
              <AlertTriangle className="w-4 h-4 text-warning flex-none" />
              Read and correct this before sharing. It's written for the patient, so keep it simple and accurate.{e.demo ? ' (Demo text.)' : ''}
            </p>
            <article className="print-area space-y-4" lang={lang}>
              <h2 className="hidden print:block text-lg font-semibold">{planName}</h2>
              <Field label="In short"><textarea rows={3} value={e.summary} onChange={ev => setE({ ...e, summary: ev.target.value })} className={textareaClass} /></Field>
              <div className="space-y-3">
                <span className="text-[13px] font-medium">Each step</span>
                {e.steps.map((s, i) => (
                  <div key={i} className="rounded-control border border-line p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input value={s.name} onChange={ev => step(i, 'name', ev.target.value)} placeholder="Treatment" className="font-medium" />
                      <button className="p-2 text-text-muted hover:text-error print:hidden" onClick={() => setE({ ...e, steps: e.steps.filter((_, j) => j !== i) })} aria-label="Remove step"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <textarea rows={2} value={s.why} onChange={ev => step(i, 'why', ev.target.value)} placeholder="Why it's needed" className={textareaClass} />
                    <textarea rows={2} value={s.whatToExpect} onChange={ev => step(i, 'whatToExpect', ev.target.value)} placeholder="What to expect" className={textareaClass} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="print:hidden" onClick={() => setE({ ...e, steps: [...e.steps, { name: '', why: '', whatToExpect: '' }] })}><Plus className="w-4 h-4" /> Add step</Button>
              </div>
              <Field label="Looking after yourself afterwards"><textarea rows={3} value={e.aftercare} onChange={ev => setE({ ...e, aftercare: ev.target.value })} className={textareaClass} /></Field>
              <Field label="Questions you may want to ask (one per line)">
                <textarea rows={3} value={e.questions.join('\n')} onChange={ev => setE({ ...e, questions: ev.target.value.split('\n') })} className={textareaClass} />
              </Field>
            </article>
          </>
        )}
      </div>
    </Modal>
  );
}

/** Read-only view for the patient portal. */
export function PlanExplanationView({ e }: { e: PlanExplanation }) {
  return (
    <div className="rounded-control bg-accent/[0.05] border border-accent/20 p-4 space-y-3 text-[14px]" lang={e.language}>
      <p className="font-medium">{e.summary}</p>
      <ol className="space-y-2">
        {e.steps.map((s, i) => (
          <li key={i}>
            <div className="font-semibold">{i + 1}. {s.name}</div>
            {s.why && <p className="text-text-muted">{s.why}</p>}
            {s.whatToExpect && <p>{s.whatToExpect}</p>}
          </li>
        ))}
      </ol>
      {e.aftercare && <p><strong>Afterwards:</strong> {e.aftercare}</p>}
      {e.questions.filter(Boolean).length > 0 && (
        <div><strong>You may want to ask:</strong><ul className="list-disc pl-5">{e.questions.filter(Boolean).map((q, i) => <li key={i}>{q}</li>)}</ul></div>
      )}
      {e.reviewedBy && <p className="text-[12px] text-text-muted">Checked by {e.reviewedBy}</p>}
    </div>
  );
}

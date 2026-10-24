import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, FileText, Lock } from 'lucide-react';
import { ClinicalNote } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { addNote, editNote, getNotes, NoteInput } from '../../api/clinicalService';

const SECTIONS: { key: keyof NoteInput & ('subjective' | 'objective' | 'assessment' | 'plan'); label: string; hint: string }[] = [
  { key: 'subjective', label: 'Subjective', hint: "Complaint in the patient's words" },
  { key: 'objective', label: 'Objective', hint: 'Examination findings and tests' },
  { key: 'assessment', label: 'Assessment', hint: 'Diagnosis' },
  { key: 'plan', label: 'Plan', hint: 'Treatment done and next steps' },
];

const TEMPLATES: Record<string, NoteInput> = {
  'Recall exam': {
    subjective: 'Routine recall. No complaints.',
    objective: 'Extra-oral and intra-oral examination within normal limits. Oral hygiene fair. No new carious lesions.',
    assessment: 'Stable. Mild localised gingivitis.',
    plan: 'Scaling and polishing. Oral hygiene instructions. Recall in 6 months.',
  },
  'Toothache': {
    subjective: 'Pain in [area] for [duration], [sharp/dull], worse with [hot/cold/biting].',
    objective: 'Tooth [#]: tender to percussion [yes/no]. Cold test [result]. IOPA shows [finding].',
    assessment: '[Diagnosis] of tooth [#].',
    plan: 'Options discussed. Patient consented to [treatment]. [Treatment done today].',
  },
};

const empty: NoteInput = { subjective: '', objective: '', assessment: '', plan: '' };

export function ClinicalNotesTab({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canWrite = user?.role === 'dentist' || user?.role === 'admin';
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getNotes(patientId);
    setNotes(res.data || []);
    setError(res.error?.message || null);
    setLoading(false);
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    const res = editingId ? await editNote(editingId, draft) : await addNote(patientId, draft);
    setSaving(false);
    if (!res.data) return setSaveError(res.error?.message || 'The note could not be saved.');
    setNotes(ns => (editingId ? ns.map(n => (n.id === editingId ? res.data! : n)) : [res.data!, ...ns]));
    setDraft(null);
    setEditingId(null);
    toast({ title: editingId ? 'Note updated' : 'Note saved', variant: 'success' });
  };

  return (
    <div className="space-y-4">
      {draft ? (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold">{editingId ? 'Edit note' : 'New note'}</h3>
            {!editingId && (
              <div className="flex gap-2">
                {Object.keys(TEMPLATES).map(t => (
                  <Button key={t} variant="outline" size="sm" onClick={() => setDraft(TEMPLATES[t])}>{t}</Button>
                ))}
              </div>
            )}
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {SECTIONS.map(s => (
              <label key={s.key} className="block">
                <span className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-text-muted">{s.hint}</span>
                </span>
                <textarea
                  value={draft[s.key]}
                  onChange={e => setDraft({ ...draft, [s.key]: e.target.value })}
                  className="w-full h-28 bg-surface border border-line rounded-control p-3 text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 resize-y"
                />
              </label>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center justify-end gap-2">
            {saveError && <span className="text-sm text-error mr-auto">{saveError}</span>}
            <span className="text-xs text-text-muted mr-auto">Notes can be edited for 24 hours, then they're locked.</span>
            <Button variant="ghost" onClick={() => { setDraft(null); setEditingId(null); }}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save note</Button>
          </div>
        </Card>
      ) : canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setDraft({ ...empty })}><Plus className="w-4 h-4" /> New note</Button>
        </div>
      )}

      {loading ? <p className="text-sm text-text-muted">Loading notes…</p> : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : notes.length === 0 ? (
        !draft && <Card><EmptyState icon={FileText} title="No clinical notes" description="Notes from each visit appear here, newest first." /></Card>
      ) : (
        <ol className="space-y-4">
          {notes.map(note => (
            <li key={note.id}>
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <time className="font-medium">{format(parseISO(note.createdAt), 'd MMM yyyy, h:mm a')}</time>
                    <span className="text-text-muted">, {note.authorName || 'Clinician'}</span>
                  </div>
                  {note.editable ? (
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(note.id); setDraft({ subjective: note.subjective, objective: note.objective, assessment: note.assessment, plan: note.plan }); }}>
                      Edit
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-text-muted"><Lock className="w-3 h-3" /> Locked</span>
                  )}
                </div>
                <dl className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {SECTIONS.map(s => (
                    <div key={s.key}>
                      <dt className="text-[13px] font-medium text-text-muted mb-1">{s.label}</dt>
                      <dd className="text-sm leading-relaxed whitespace-pre-line">{note[s.key] || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

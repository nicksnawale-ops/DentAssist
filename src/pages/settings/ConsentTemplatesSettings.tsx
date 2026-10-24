import React, { useEffect, useState } from 'react';
import { FileSignature, Plus, Save } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { ConsentTemplate, getConsentTemplates, saveConsentTemplate } from '../../api/prescriptionsService';

const PLACEHOLDERS = ['{patient_name}', '{procedure}', '{teeth}', '{dentist}', '{clinic}', '{date}'];
type Draft = Pick<ConsentTemplate, 'name' | 'body' | 'risks' | 'isActive'> & { id?: string };

/** Admins edit consent wording. Edits create a new version; signed forms keep the text the patient saw. */
export function ConsentTemplatesSettings() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin';
  const [templates, setTemplates] = useState<ConsentTemplate[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [risksText, setRisksText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => getConsentTemplates(true).then(r => {
    setTemplates(r.data || []);
    if (!draft && r.data?.[0]) pick(r.data[0]);
  });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (t: Draft) => {
    setDraft({ id: t.id, name: t.name, body: t.body, risks: t.risks, isActive: t.isActive });
    setRisksText(t.risks.join('\n'));
    setError(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await saveConsentTemplate({ ...draft, risks: risksText.split('\n').map(r => r.trim()).filter(Boolean) });
    setSaving(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not save'); return; }
    toast({ title: `Saved "${res.data.name}" (version ${res.data.version})`, variant: 'success' });
    pick(res.data);
    load();
  };

  if (!templates) return <Skeleton className="h-96 w-full" />;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col md:flex-row">
        <nav className="md:w-60 flex-none border-b md:border-b-0 md:border-r border-line p-2 flex md:flex-col gap-1 overflow-x-auto scrollbar-hide">
          {templates.map(t => (
            <button key={t.id} onClick={() => pick(t)}
              className={`text-left px-3 py-2 rounded-control text-[13px] font-medium whitespace-nowrap flex items-center justify-between gap-2 ${draft?.id === t.id ? 'bg-primary/[0.07] text-primary' : 'hover:bg-surface-hover'}`}>
              {t.name} {!t.isActive && <span className="text-[11px] text-text-muted font-normal">Off</span>}
            </button>
          ))}
          {canEdit && (
            <button onClick={() => pick({ name: 'New consent form', body: 'I, {patient_name}, agree to {procedure} by {dentist} at {clinic}. ', risks: [], isActive: true })}
              className="text-left px-3 py-2 rounded-control text-[13px] font-medium text-primary hover:bg-primary/[0.05] whitespace-nowrap flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New form
            </button>
          )}
        </nav>
        {draft && (
          <div className="flex-1 p-5 space-y-4 min-w-0">
            <div className="flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-primary" />
              <h2 className="text-[15px] font-semibold mr-auto">Consent form wording</h2>
              {draft.id && <Badge variant="outline">v{templates.find(t => t.id === draft.id)?.version}</Badge>}
            </div>
            <label className="block">
              <span className="text-[13px] font-medium">Name</span>
              <Input className="mt-1" value={draft.name} readOnly={!canEdit} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium">What the patient agrees to</span>
              <textarea rows={6} value={draft.body} readOnly={!canEdit} onChange={e => setDraft({ ...draft, body: e.target.value })}
                className="mt-1 w-full p-3 rounded-control border border-line bg-surface text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
            </label>
            <div className="flex flex-wrap gap-1.5 -mt-2">
              {PLACEHOLDERS.map(p => (
                <button key={p} type="button" disabled={!canEdit} onClick={() => setDraft({ ...draft, body: `${draft.body}${p}` })}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-line bg-surface-hover font-mono text-text-muted hover:text-primary disabled:opacity-60">{p}</button>
              ))}
            </div>
            <label className="block">
              <span className="text-[13px] font-medium">Risks explained (one per line)</span>
              <textarea rows={5} value={risksText} readOnly={!canEdit} onChange={e => setRisksText(e.target.value)}
                className="mt-1 w-full p-3 rounded-control border border-line bg-surface text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none" />
            </label>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={draft.isActive} disabled={!canEdit}
                onChange={e => setDraft({ ...draft, isActive: e.target.checked })} />
              Available to staff
            </label>
            <p className="text-[12px] text-text-muted">Saving changed wording creates a new version. Forms already prepared or signed keep the exact text the patient saw. Have new wording checked by your clinic's legal adviser.</p>
            {error && <p className="text-[13px] text-error">{error}</p>}
            {canEdit && <div className="flex justify-end"><Button onClick={save} loading={saving}><Save className="w-4 h-4" /> Save</Button></div>}
          </div>
        )}
      </div>
    </Card>
  );
}

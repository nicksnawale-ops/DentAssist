import React, { useEffect, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { X, Plus } from 'lucide-react';
import { ToothRecord, ToothConditionType } from '../../types';
import { getToothNumber } from './utils';
import { Button } from '../ui/Button';

interface ToothDetailPanelProps {
  fdi: string;
  numberingSystem: 'FDI' | 'Universal';
  record?: ToothRecord;
  readOnly?: boolean;
  onClose: () => void;
  /** Resolves true when saved. */
  onSave: (fdi: string, data: { conditions: ToothConditionType[]; notes: string }) => Promise<boolean> | void;
  onAddToPlan?: () => void;
}

const ALL_CONDITIONS: ToothConditionType[] = [
  'Healthy', 'Cavity', 'Filled', 'Crown', 'Root Canal', 'Missing', 'Implant', 'Extraction Planned',
];

const when = (d: string) => {
  const parsed = parseISO(d);
  return isValid(parsed) ? format(parsed, 'd MMM yyyy') : d;
};

export function ToothDetailPanel({ fdi, numberingSystem, record, readOnly = false, onClose, onSave, onAddToPlan }: ToothDetailPanelProps) {
  const [conditions, setConditions] = useState<ToothConditionType[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConditions(record?.conditions?.length ? record.conditions : ['Healthy']);
    setNotes(record?.notes || '');
  }, [record, fdi]);

  const num = getToothNumber(fdi, numberingSystem);
  const dirty = JSON.stringify([...conditions].sort()) !== JSON.stringify([...(record?.conditions?.length ? record.conditions : ['Healthy'])].sort())
    || notes !== (record?.notes || '');

  const toggle = (cond: ToothConditionType) => {
    if (cond === 'Healthy') return setConditions(['Healthy']);
    let next = conditions.filter(c => c !== 'Healthy');
    next = next.includes(cond) ? next.filter(c => c !== cond) : [...next, cond];
    setConditions(next.length ? next : ['Healthy']);
  };

  const save = async () => {
    setSaving(true);
    await onSave(fdi, { conditions, notes });
    setSaving(false);
  };

  return (
    <div className="bg-surface flex flex-col h-full max-h-[80dvh] lg:max-h-none">
      <div className="flex justify-between items-center px-4 h-14 border-b border-line shrink-0">
        <h3 className="text-[17px] font-semibold text-text-main">
          Tooth {num}{numberingSystem === 'Universal' && <span className="ml-1.5 text-sm font-normal text-text-muted">(FDI {fdi})</span>}
        </h3>
        <button onClick={onClose} className="p-2 -mr-2 text-text-muted hover:bg-base rounded-control" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-5">
        <section>
          <h4 className="text-[13px] font-medium text-text-muted mb-2">Condition</h4>
          <div className="flex flex-wrap gap-2">
            {ALL_CONDITIONS.map(cond => {
              const on = conditions.includes(cond);
              return (
                <button
                  key={cond}
                  disabled={readOnly}
                  onClick={() => toggle(cond)}
                  aria-pressed={on}
                  className={`px-3 h-8 rounded-full text-[13px] font-medium border transition-colors disabled:cursor-default ${
                    on ? 'bg-primary text-white border-primary' : 'bg-surface border-line text-text-main hover:border-text-muted/40'
                  } ${readOnly && !on ? 'opacity-50' : ''}`}
                >
                  {cond}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <label htmlFor="tooth-notes" className="block text-[13px] font-medium text-text-muted mb-2">Notes</label>
          {readOnly ? (
            <p className="text-sm text-text-main">{notes || 'No notes.'}</p>
          ) : (
            <textarea
              id="tooth-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-surface border border-line rounded-control p-3 text-sm focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 resize-none h-20"
              placeholder="e.g. Distal caries, monitor"
            />
          )}
        </section>

        <section>
          <h4 className="text-[13px] font-medium text-text-muted mb-2">History</h4>
          {record?.history?.length ? (
            <ol className="relative border-l border-line ml-1.5 space-y-3">
              {record.history.map(entry => (
                <li key={entry.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-surface" aria-hidden="true" />
                  <div className="text-sm text-text-main">{entry.action}</div>
                  <div className="text-xs text-text-muted">{when(entry.date)}, {entry.dentist}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-muted">Nothing recorded for this tooth yet.</p>
          )}
        </section>
      </div>

      {!readOnly && (
        <div className="p-4 border-t border-line flex flex-col gap-2 shrink-0">
          <Button onClick={save} loading={saving} disabled={!dirty} className="w-full">Save tooth {num}</Button>
          {onAddToPlan && (
            <Button variant="outline" className="w-full" onClick={onAddToPlan}>
              <Plus className="w-4 h-4" /> Add treatment for this tooth
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

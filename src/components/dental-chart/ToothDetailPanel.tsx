import React, { useState, useEffect } from 'react';
import { ToothRecord, ToothConditionType } from '../../types';
import { getToothNumber } from './utils';
import { X, Plus, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Button } from '../ui/Button';

interface ToothDetailPanelProps {
  fdi: string;
  numberingSystem: 'FDI' | 'Universal';
  record?: ToothRecord;
  onClose: () => void;
  onSave: (fdi: string, data: Partial<ToothRecord>) => void;
}

const ALL_CONDITIONS: ToothConditionType[] = [
  'Healthy', 'Cavity', 'Filled', 'Crown', 'Root Canal', 'Missing', 'Implant', 'Extraction Planned'
];

export function ToothDetailPanel({ fdi, numberingSystem, record, onClose, onSave }: ToothDetailPanelProps) {
  const [conditions, setConditions] = useState<ToothConditionType[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setConditions(record?.conditions || ['Healthy']);
    setNotes(record?.notes || '');
  }, [record, fdi]);

  const num = getToothNumber(fdi, numberingSystem);

  const toggleCondition = (cond: ToothConditionType) => {
    if (cond === 'Healthy') {
      setConditions(['Healthy']);
      return;
    }
    
    let newConds = conditions.filter(c => c !== 'Healthy');
    if (newConds.includes(cond)) {
      newConds = newConds.filter(c => c !== cond);
      if (newConds.length === 0) newConds = ['Healthy'];
    } else {
      newConds.push(cond);
    }
    setConditions(newConds);
  };

  return (
    <div className="w-full md:w-80 border-l border-text-muted/10 bg-base flex flex-col h-full animate-in slide-in-from-right-4">
      <div className="flex justify-between items-center p-4 border-b border-text-muted/10 bg-surface">
        <h3 className="font-bold text-lg text-text-main">Tooth {num}</h3>
        <button onClick={onClose} className="p-1 text-text-muted hover:bg-text-muted/10 rounded-full">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Conditions</label>
          <div className="flex flex-wrap gap-2">
            {ALL_CONDITIONS.map(cond => (
              <button
                key={cond}
                onClick={() => toggleCondition(cond)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  conditions.includes(cond)
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-surface border-text-muted/20 text-text-main hover:border-text-muted/40'
                }`}
              >
                {cond}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Clinical Notes</label>
          <textarea 
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-surface border border-text-muted/20 rounded-lg p-3 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none h-24"
            placeholder="Add clinical observations..."
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">History</label>
          {record && record.history && record.history.length > 0 ? (
            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-text-muted/20 before:to-transparent">
              {record.history.map((entry, idx) => (
                <div key={entry.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-primary bg-base shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                     <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                  </div>
                  <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-lg border border-text-muted/10 bg-surface shadow-sm text-xs">
                     <div className="flex items-center gap-1 text-text-muted mb-1"><CalendarIcon className="w-3 h-3" /> {entry.date}</div>
                     <div className="font-bold text-text-main">{entry.action}</div>
                     <div className="text-text-muted mt-0.5">by {entry.dentist}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">No history for this tooth.</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-text-muted/10 bg-surface flex flex-col gap-3">
         <Button 
           onClick={() => onSave(fdi, { conditions, notes })}
           className="w-full gap-2"
         >
           <Save className="w-4 h-4" /> Save Changes
         </Button>
         <Button variant="outline" className="w-full gap-2 text-primary border-primary/30 hover:bg-primary/5">
           <Plus className="w-4 h-4" /> Add to Treatment Plan
         </Button>
      </div>
    </div>
  );
}

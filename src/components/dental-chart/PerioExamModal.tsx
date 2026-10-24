import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { PeriodontalReading } from '../../types';
import { Button } from '../ui/Button';
import { adultTeethFDI } from './utils';
import { savePerioExam } from '../../api/clinicalService';

interface PerioExamModalProps {
  patientId: string;
  /** Latest readings, shown faintly in each box for comparison. */
  previous: Record<string, PeriodontalReading>;
  onClose: () => void;
  onSaved: () => void;
}

type Row = { buccal: string[]; lingual: string[]; bop: boolean };

/** Fast keyboard entry of pocket depths: 3 buccal + 3 lingual sites per tooth, plus bleeding on probing. */
export function PerioExamModal({ patientId, previous, onClose, onSaved }: PerioExamModalProps) {
  const teeth = [...adultTeethFDI.upper, ...adultTeethFDI.lower];
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    teeth.forEach(t => {
      const p = previous[t];
      init[t] = { buccal: ['', '', ''], lingual: ['', '', ''], bop: false };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (t: string, side: 'buccal' | 'lingual', i: number, v: string) => {
    if (!/^\d{0,2}$/.test(v)) return;
    setRows(r => ({ ...r, [t]: { ...r[t], [side]: r[t][side].map((x, j) => (j === i ? v : x)) } }));
  };

  const complete = teeth.filter(t => [...rows[t].buccal, ...rows[t].lingual].every(v => v !== ''));

  const save = async () => {
    if (complete.length === 0) return setError('Enter all six depths for at least one tooth.');
    setSaving(true);
    setError(null);
    const res = await savePerioExam(patientId, complete.map(t => ({
      toothNumber: t,
      buccal: rows[t].buccal.map(Number),
      lingual: rows[t].lingual.map(Number),
      bleedingOnProbing: rows[t].bop,
    })));
    setSaving(false);
    if (res.data) onSaved();
    else setError(res.error?.message || 'The exam could not be saved.');
  };

  const cell = (t: string, side: 'buccal' | 'lingual', i: number) => {
    const v = rows[t][side][i];
    const last = previous[t]?.measurementPoints[side][i];
    return (
      <input
        placeholder={last !== undefined ? String(last) : ''}
        key={`${side}${i}`}
        value={v}
        inputMode="numeric"
        aria-label={`Tooth ${t} ${side} site ${i + 1}`}
        onChange={e => set(t, side, i, e.target.value)}
        className={`w-7 h-8 text-center text-sm border border-line rounded-[6px] placeholder:text-text-muted/40 focus:outline-none focus:border-accent ${Number(v) > 3 ? 'text-error font-semibold' : ''}`}
      />
    );
  };

  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="fixed z-50 inset-x-0 bottom-0 top-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-4xl sm:max-h-[90vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
            <Dialog.Title className="text-[17px] font-semibold">Gum exam</Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-base" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <p className="px-5 pt-3 text-[13px] text-text-muted shrink-0">
            Pocket depths in mm (distal, mid, mesial). Top row buccal, bottom row lingual. Depths over 3 mm are highlighted. Grey numbers are the last exam. Teeth left blank are skipped.
          </p>
          <div className="flex-1 overflow-auto px-5 py-4">
            {[adultTeethFDI.upper, adultTeethFDI.lower].map((arch, ai) => (
              <div key={ai} className="mb-5">
                <h4 className="text-sm font-medium mb-2">{ai === 0 ? 'Upper' : 'Lower'}</h4>
                <div className="flex gap-2 w-max">
                  {arch.map(t => (
                    <div key={t} className="border border-line rounded-control p-1.5 flex flex-col items-center gap-1">
                      <span className="text-xs font-semibold">{t}</span>
                      <div className="flex gap-0.5">{[0, 1, 2].map(i => cell(t, 'buccal', i))}</div>
                      <div className="flex gap-0.5">{[0, 1, 2].map(i => cell(t, 'lingual', i))}</div>
                      <label className="flex items-center gap-1 text-[11px] text-text-muted">
                        <input type="checkbox" checked={rows[t].bop} onChange={e => setRows(r => ({ ...r, [t]: { ...r[t], bop: e.target.checked } }))} className="w-3.5 h-3.5 accent-[var(--color-error)]" />
                        Bleeds
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 border-t border-line flex items-center justify-between gap-3 shrink-0">
            <span className="text-sm text-text-muted">{complete.length} teeth ready to save</span>
            <div className="flex items-center gap-2">
              {error && <span className="text-sm text-error">{error}</span>}
              <Button onClick={save} loading={saving}>Save exam</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

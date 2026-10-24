import React, { useCallback, useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { format, parseISO } from 'date-fns';
import { History, ClipboardPlus } from 'lucide-react';
import { GraphicalChart } from './GraphicalChart';
import { PeriodontalGrid } from './PeriodontalGrid';
import { ToothDetailPanel } from './ToothDetailPanel';
import { PerioExamModal } from './PerioExamModal';
import { PeriodontalReading, ToothConditionType, ToothRecord } from '../../types';
import { Button } from '../ui/Button';
import { useToast } from '../ui/useToast';
import { DentalChartData, getDentalChart, getMyDentalChart, saveTooth } from '../../api/clinicalService';

interface DentalChartProps {
  patientId: string;
  initialAge: number | 'Unknown';
  /** Patient portal / view-only: no editing, data from the patient's own endpoint. */
  readOnly?: boolean;
  /** "Add to treatment plan" from a tooth. */
  onAddToPlan?: (tooth: string) => void;
}

const tabCls = 'whitespace-nowrap shrink-0 px-4 h-10 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-primary outline-none';

export function DentalChart({ patientId, initialAge, readOnly = false, onAddToPlan }: DentalChartProps) {
  const { toast } = useToast();
  const [isPediatric, setIsPediatric] = useState(typeof initialAge === 'number' && initialAge < 12);
  // FDI is the standard in India; Universal is available for US-trained staff.
  const [numberingSystem, setNumberingSystem] = useState<'FDI' | 'Universal'>('FDI');
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string>('');
  const [data, setData] = useState<DentalChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perioOpen, setPerioOpen] = useState(false);

  const load = useCallback(async () => {
    const res = readOnly ? await getMyDentalChart() : await getDentalChart(patientId, asOf || undefined);
    if (res.data) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error?.message || 'The chart could not be loaded.');
    }
  }, [patientId, asOf, readOnly]);

  useEffect(() => { load(); }, [load]);

  const records: Record<string, ToothRecord> = {};
  data?.records.forEach(r => { records[r.toothNumber] = r; });
  const perio: Record<string, PeriodontalReading> = {};
  data?.perio.forEach(r => { perio[r.toothNumber] = r; });

  const viewingPast = !!asOf;
  const canEdit = !readOnly && !viewingPast;

  const handleSaveTooth = async (fdi: string, update: { conditions: ToothConditionType[]; notes: string }) => {
    const res = await saveTooth(patientId, fdi, update.conditions, update.notes);
    if (!res.data) {
      toast({ title: 'Tooth not saved', description: res.error?.message, variant: 'error' });
      return false;
    }
    setData(d => d && { ...d, records: [...d.records.filter(r => r.toothNumber !== fdi), res.data!] });
    toast({ title: `Tooth ${fdi} updated`, variant: 'success' });
    return true;
  };

  if (error) return <p className="p-6 text-sm text-error">{error}</p>;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-panel border border-line bg-surface p-3 sm:p-4">
          <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer">
            <input type="checkbox" checked={isPediatric} onChange={e => setIsPediatric(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
            Milk teeth
          </label>
          <div className="flex items-center gap-2" role="group" aria-label="Tooth numbering">
            <span className="text-sm text-text-muted">Numbering</span>
            <div className="flex rounded-control border border-line p-0.5 bg-base">
              {(['FDI', 'Universal'] as const).map(sys => (
                <button
                  key={sys}
                  onClick={() => setNumberingSystem(sys)}
                  aria-pressed={numberingSystem === sys}
                  className={`px-2.5 h-7 text-xs font-medium rounded-[8px] ${numberingSystem === sys ? 'bg-surface text-primary shadow-panel' : 'text-text-muted'}`}
                >
                  {sys}
                </button>
              ))}
            </div>
          </div>
          {!readOnly && (data?.examDates.length ?? 0) > 0 && (
            <label className="flex items-center gap-2 text-sm ml-auto">
              <History className="w-4 h-4 text-text-muted" aria-hidden="true" />
              <span className="sr-only">Show chart as of</span>
              <select
                value={asOf}
                onChange={e => { setAsOf(e.target.value); setSelectedTooth(null); }}
                className="h-9 px-2 bg-base border border-line rounded-control text-sm"
              >
                <option value="">Today</option>
                {data!.examDates.map(d => <option key={d} value={d}>As of {format(parseISO(d), 'd MMM yyyy')}</option>)}
              </select>
            </label>
          )}
        </div>

        {viewingPast && (
          <div className="rounded-control bg-warning/[0.08] border border-warning/20 px-3 py-2 text-sm text-warning">
            Showing the chart as it was on {format(parseISO(asOf), 'd MMM yyyy')}. Switch back to Today to make changes.
          </div>
        )}

        <Tabs.Root defaultValue="chart">
          <Tabs.List className="flex gap-1 border-b border-line mb-4 overflow-x-auto scrollbar-hide" aria-label="Chart views">
            <Tabs.Trigger value="chart" className={tabCls}>Teeth</Tabs.Trigger>
            <Tabs.Trigger value="perio" className={tabCls}>Gums (perio)</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="chart" className="outline-none">
            {!data ? <div className="h-72 rounded-panel bg-base animate-pulse" /> : (
              <GraphicalChart
                isPediatric={isPediatric}
                numberingSystem={numberingSystem}
                records={records}
                selectedTooth={selectedTooth}
                onSelectTooth={setSelectedTooth}
              />
            )}
            {!readOnly && <p className="mt-2 text-[13px] text-text-muted">Tap a tooth to see its history{canEdit ? ' or record a finding' : ''}.</p>}
          </Tabs.Content>
          <Tabs.Content value="perio" className="outline-none space-y-3">
            {canEdit && (
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setPerioOpen(true)}>
                  <ClipboardPlus className="w-4 h-4" /> Record gum exam
                </Button>
              </div>
            )}
            <PeriodontalGrid readings={perio} numberingSystem={numberingSystem} />
          </Tabs.Content>
        </Tabs.Root>
      </div>

      {selectedTooth && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] rounded-t-[20px] shadow-float lg:static lg:z-auto lg:max-h-none lg:rounded-panel lg:shadow-panel w-full lg:w-80 shrink-0 border border-line overflow-hidden lg:h-[600px] lg:sticky lg:top-6">
          <ToothDetailPanel
            fdi={selectedTooth}
            numberingSystem={numberingSystem}
            record={records[selectedTooth]}
            readOnly={!canEdit}
            onClose={() => setSelectedTooth(null)}
            onSave={handleSaveTooth}
            onAddToPlan={canEdit && onAddToPlan ? () => onAddToPlan(selectedTooth) : undefined}
            patientId={patientId}
          />
        </div>
      )}

      {perioOpen && (
        <PerioExamModal
          patientId={patientId}
          previous={perio}
          onClose={() => setPerioOpen(false)}
          onSaved={() => { setPerioOpen(false); load(); toast({ title: 'Gum exam saved', variant: 'success' }); }}
        />
      )}
    </div>
  );
}

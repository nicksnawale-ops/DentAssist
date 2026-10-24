import React, { useState, useEffect } from 'react';
import { GraphicalChart } from './GraphicalChart';
import { PeriodontalGrid } from './PeriodontalGrid';
import { ToothDetailPanel } from './ToothDetailPanel';
import { ToothRecord, PeriodontalReading } from '../../types';
import * as Tabs from '@radix-ui/react-tabs';
import { mockToothRecords, mockPeriodontalReadings } from '../../data/mockDentalChart';

export function DentalChart({ patientId, initialAge }: { patientId: string, initialAge: number | 'Unknown' }) {
  const [isPediatric, setIsPediatric] = useState(false);
  const [numberingSystem, setNumberingSystem] = useState<'FDI' | 'Universal'>('Universal');
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  
  // State for mock data
  const [records, setRecords] = useState<Record<string, ToothRecord>>({});
  const [perioReadings, setPerioReadings] = useState<Record<string, PeriodontalReading>>({});

  useEffect(() => {
    // Auto-suggest pediatric mode based on age
    if (typeof initialAge === 'number' && initialAge < 12) {
      setIsPediatric(true);
    }

    // Load mock data
    const patRecords = mockToothRecords.filter(r => r.patientId === patientId);
    const patPerio = mockPeriodontalReadings.filter(r => r.patientId === patientId);
    
    const recMap: Record<string, ToothRecord> = {};
    patRecords.forEach(r => recMap[r.toothNumber] = r);
    setRecords(recMap);

    const perioMap: Record<string, PeriodontalReading> = {};
    patPerio.forEach(r => perioMap[r.toothNumber] = r);
    setPerioReadings(perioMap);

  }, [patientId, initialAge]);

  const handleSaveTooth = (fdi: string, data: Partial<ToothRecord>) => {
    setRecords(prev => ({
      ...prev,
      [fdi]: {
        ...prev[fdi],
        ...data,
        toothNumber: fdi,
        patientId,
        id: prev[fdi]?.id || `tr-new-${Date.now()}`
      } as ToothRecord
    }));
    // In a real app, this would be an API call to PATCH /api/v1/patients/{id}/dental-chart
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[600px]">
      <div className="flex-1 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
           <div className="flex items-center gap-6">
             <label className="flex items-center gap-2 text-sm font-bold text-text-main cursor-pointer">
               <input 
                 type="checkbox" 
                 checked={isPediatric} 
                 onChange={e => setIsPediatric(e.target.checked)} 
                 className="rounded border-text-muted/30 text-primary focus:ring-primary w-4 h-4" 
               />
               Pediatric (Primary)
             </label>
             <div className="flex items-center gap-2">
               <span className="text-sm font-bold text-text-main">Numbering:</span>
               <div className="flex bg-base rounded-lg p-1 border border-text-muted/20">
                 <button 
                   onClick={() => setNumberingSystem('Universal')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${numberingSystem === 'Universal' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                 >
                   Universal
                 </button>
                 <button 
                   onClick={() => setNumberingSystem('FDI')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${numberingSystem === 'FDI' ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                 >
                   FDI
                 </button>
               </div>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text-muted">History:</span>
              <select className="bg-base border border-text-muted/20 rounded-lg px-3 py-1.5 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                <option>Current (Today)</option>
                <option>2024-03-01</option>
                <option>2023-01-15</option>
              </select>
           </div>
        </div>

        <Tabs.Root defaultValue="chart">
          <Tabs.List className="flex gap-4 border-b border-text-muted/10 mb-6">
            <Tabs.Trigger value="chart" className="px-4 py-2 font-bold text-sm text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">
              Graphical Chart
            </Tabs.Trigger>
            <Tabs.Trigger value="perio" className="px-4 py-2 font-bold text-sm text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">
              Periodontal
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="chart" className="outline-none animate-in fade-in">
             <GraphicalChart 
               isPediatric={isPediatric} 
               numberingSystem={numberingSystem} 
               records={records}
               selectedTooth={selectedTooth}
               onSelectTooth={setSelectedTooth}
             />
          </Tabs.Content>
          <Tabs.Content value="perio" className="outline-none animate-in fade-in">
             <PeriodontalGrid 
               readings={perioReadings}
               numberingSystem={numberingSystem}
             />
          </Tabs.Content>
        </Tabs.Root>
      </div>

      {selectedTooth && (
        <div className="w-full lg:w-80 shrink-0 border border-text-muted/10 rounded-2xl overflow-hidden shadow-sm h-[600px] sticky top-6">
          <ToothDetailPanel 
            fdi={selectedTooth} 
            numberingSystem={numberingSystem}
            record={records[selectedTooth]}
            onClose={() => setSelectedTooth(null)}
            onSave={handleSaveTooth}
          />
        </div>
      )}
    </div>
  );
}

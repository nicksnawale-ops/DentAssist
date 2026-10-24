import React from 'react';
import { ToothRecord } from '../../types';
import { adultTeethFDI, pediatricTeethFDI } from './utils';
import { Tooth } from './Tooth';
import { X } from 'lucide-react';

interface GraphicalChartProps {
  isPediatric: boolean;
  numberingSystem: 'FDI' | 'Universal';
  records: Record<string, ToothRecord>;
  selectedTooth: string | null;
  onSelectTooth: (fdi: string) => void;
}

export function GraphicalChart({ isPediatric, numberingSystem, records, selectedTooth, onSelectTooth }: GraphicalChartProps) {
  const layout = isPediatric ? pediatricTeethFDI : adultTeethFDI;

  return (
    <div className="flex flex-col items-center gap-8 sm:gap-12 py-6 bg-surface rounded-panel border border-line">
      {/* Upper Arch */}
      <div className="w-full max-w-4xl px-2 sm:px-4 overflow-x-auto scrollbar-hide">
        <div className="text-center text-xs font-bold text-text-muted mb-4">Upper Arch</div>
        <div className="flex w-max mx-auto gap-1 md:gap-2">
          {layout.upper.map((fdi, index) => (
            <React.Fragment key={fdi}>
               {/* Add a slightly larger gap at the midline */}
               {index === layout.upper.length / 2 && <div className="w-2 md:w-6" />}
               <Tooth 
                 fdi={fdi} 
                 numberingSystem={numberingSystem} 
                 record={records[fdi]} 
                 isSelected={selectedTooth === fdi}
                 onClick={onSelectTooth}
               />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full max-w-lg h-px bg-text-muted/10"></div>

      {/* Lower Arch */}
      <div className="w-full max-w-4xl px-2 sm:px-4 overflow-x-auto scrollbar-hide">
        <div className="flex w-max mx-auto gap-1 md:gap-2 mb-4">
          {layout.lower.map((fdi, index) => (
            <React.Fragment key={fdi}>
               {index === layout.lower.length / 2 && <div className="w-2 md:w-6" />}
               <Tooth 
                 fdi={fdi} 
                 numberingSystem={numberingSystem} 
                 record={records[fdi]} 
                 isSelected={selectedTooth === fdi}
                 onClick={onSelectTooth}
               />
            </React.Fragment>
          ))}
        </div>
        <div className="text-center text-xs font-bold text-text-muted mt-2">Lower Arch</div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs font-medium text-text-main px-6 bg-base py-3 rounded-xl border border-line shadow-panel">
        <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-text-muted/30 rounded-sm"></div> Healthy</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-error rounded-sm flex items-center justify-center"><div className="w-1.5 h-1.5 bg-error rounded-full"></div></div> Cavity</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-blue-500 rounded-sm flex items-center justify-center"><div className="w-1.5 h-1.5 bg-blue-500 rounded-sm"></div></div> Filled</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-100 border-2 border-amber-500 rounded-sm"></div> Crown</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-purple-500 rounded-sm flex items-center justify-center"><div className="w-0.5 h-2 bg-purple-500"></div></div> Root Canal</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-surface-hover border-2 border-line rounded-sm flex items-center justify-center"><X className="w-2 h-2 text-text-muted/50" /></div> Missing</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-teal-50 border-2 border-teal-500 rounded-sm flex items-center justify-center"><div className="w-1 h-2 bg-teal-500 rounded-full"></div></div> Implant</div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-50 border-2 border-orange-500 rounded-sm flex items-center justify-center"><X className="w-2 h-2 text-orange-500" /></div> Planned Ext.</div>
      </div>
    </div>
  );
}

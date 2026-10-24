import React from 'react';
import { PeriodontalReading } from '../../types';
import { adultTeethFDI, getToothNumber } from './utils';

interface PeriodontalGridProps {
  readings: Record<string, PeriodontalReading>;
  numberingSystem: 'FDI' | 'Universal';
}

export function PeriodontalGrid({ readings, numberingSystem }: PeriodontalGridProps) {
  // We'll just show the upper arch for simplicity in this standard view, 
  // or build a compact grid for all teeth.
  // A typical perio chart shows 3 boxes per tooth (distal, mid, mesial).
  
  const renderArch = (fdiList: string[], label: string) => (
    <div className="w-full overflow-x-auto pb-4">
      <div className="text-sm font-bold text-text-main mb-2">{label}</div>
      <div className="flex gap-1 min-w-max">
        {fdiList.map(fdi => {
          const num = getToothNumber(fdi, numberingSystem);
          const reading = readings[fdi];
          const b = reading?.measurementPoints.buccal || ['', '', ''];
          const l = reading?.measurementPoints.lingual || ['', '', ''];
          const bop = reading?.bleedingOnProbing;

          return (
            <div key={fdi} className="flex flex-col items-center w-12 border border-line bg-base rounded overflow-hidden">
              <div className={`w-full text-center py-1 text-xs font-bold ${bop ? 'bg-error/10 text-error' : 'bg-surface text-text-main'}`}>
                {num}
              </div>
              <div className="w-full grid grid-cols-3 divide-x divide-line border-b border-line">
                <div className={`text-center text-[10px] py-1 ${Number(b[0]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{b[0] || '-'}</div>
                <div className={`text-center text-[10px] py-1 ${Number(b[1]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{b[1] || '-'}</div>
                <div className={`text-center text-[10px] py-1 ${Number(b[2]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{b[2] || '-'}</div>
              </div>
              <div className="w-full grid grid-cols-3 divide-x divide-line bg-surface">
                <div className={`text-center text-[10px] py-1 ${Number(l[0]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{l[0] || '-'}</div>
                <div className={`text-center text-[10px] py-1 ${Number(l[1]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{l[1] || '-'}</div>
                <div className={`text-center text-[10px] py-1 ${Number(l[2]) > 3 ? 'text-error font-bold' : 'text-text-muted'}`}>{l[2] || '-'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="bg-surface p-6 rounded-panel border border-line shadow-panel space-y-6">
       <div className="flex justify-between items-center">
         <div>
           <h3 className="text-lg font-bold text-text-main">Periodontal Charting</h3>
           <p className="text-xs text-text-muted">Top row: Buccal/Facial • Bottom row: Lingual/Palatal • Values &gt; 3mm highlighted</p>
         </div>
       </div>

       <div className="space-y-6">
         {renderArch(adultTeethFDI.upper, "Upper Arch")}
         {renderArch(adultTeethFDI.lower, "Lower Arch")}
       </div>
    </div>
  );
}

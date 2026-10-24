import React from 'react';
import { ToothRecord } from '../../types';
import { getToothNumber } from './utils';
import { Check, X, Circle, Slash, AlertCircle } from 'lucide-react';

interface ToothProps {
  fdi: string;
  numberingSystem: 'FDI' | 'Universal';
  record?: ToothRecord;
  onClick: (fdi: string) => void;
  isSelected: boolean;
}

export function Tooth({ fdi, numberingSystem, record, onClick, isSelected }: ToothProps) {
  const num = getToothNumber(fdi, numberingSystem);
  const conditions = record?.conditions || ['Healthy'];
  
  // Determine primary visual style based on top condition
  let bgColor = 'bg-base';
  let borderColor = 'border-text-muted/30';
  let icon = null;

  if (conditions.includes('Missing')) {
    bgColor = 'bg-surface-hover';
    borderColor = 'border-text-muted/20';
    icon = <X className="w-5 h-5 text-text-muted/50" />;
  } else if (conditions.includes('Extraction Planned')) {
    borderColor = 'border-orange-500';
    bgColor = 'bg-orange-50';
    icon = <X className="w-5 h-5 text-orange-500" />;
  } else if (conditions.includes('Implant')) {
    bgColor = 'bg-teal-50';
    borderColor = 'border-teal-500';
    icon = <div className="w-2 h-4 rounded-full bg-teal-500" />;
  } else if (conditions.includes('Crown')) {
    bgColor = 'bg-amber-100';
    borderColor = 'border-amber-500';
  } else if (conditions.includes('Cavity')) {
    borderColor = 'border-error';
    icon = <div className="w-2 h-2 rounded-full bg-error" />;
  } else if (conditions.includes('Filled')) {
    borderColor = 'border-blue-500';
    icon = <div className="w-2 h-2 rounded-sm bg-blue-500" />;
  } else if (conditions.includes('Root Canal')) {
    borderColor = 'border-purple-500';
    icon = <div className="w-1 h-3 bg-purple-500" />;
  }

  return (
    <div 
      onClick={() => onClick(fdi)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(fdi);
        }
      }}
      aria-label={`Tooth ${num}, conditions: ${conditions.join(', ')}`}
      aria-pressed={isSelected}
      className={`flex flex-col items-center gap-1 cursor-pointer transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isSelected ? 'ring-2 ring-primary ring-offset-2 rounded-sm' : ''}`}
    >
      <span className="text-[10px] font-bold text-text-muted" aria-hidden="true">{num}</span>
      <div 
        className={`w-8 h-10 md:w-10 md:h-12 border-2 rounded-t-md rounded-b-xl flex items-center justify-center relative overflow-hidden transition-colors ${bgColor} ${borderColor} shadow-sm`}
      >
         {icon}
         {/* If multiple conditions, show a small indicator */}
         {conditions.length > 1 && !conditions.includes('Missing') && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-text-main rounded-bl-sm"></div>
         )}
      </div>
    </div>
  );
}

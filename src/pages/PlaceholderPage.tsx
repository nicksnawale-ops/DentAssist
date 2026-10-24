import React, { useState } from 'react';
import { FlaskConical, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  plannedFeatures?: string[];
}

export function PlaceholderPage({ 
  title, 
  description = "Coming in a later phase. We are currently focusing on laying down the foundational architecture, design system, and the core responsive shell for VisionEdge DentAssist.",
  icon: Icon = FlaskConical,
  plannedFeatures
}: PlaceholderPageProps) {
  const [showPlanned, setShowPlanned] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center max-w-lg mx-auto px-4">
      <div className="relative mb-8 mt-4">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-[1.3] pointer-events-none" aria-hidden="true" />
        
        {/* Icon Badge */}
        <div className="relative w-20 h-20 rounded-full bg-[#EAF7F5] border border-dashed border-primary/40 flex items-center justify-center text-accent shadow-panel">
          <Icon className="w-10 h-10" strokeWidth={1.5} />
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-text-main mb-3">{title}</h2>
      <p className="text-text-muted leading-relaxed mb-6">
        {description}
      </p>

      {plannedFeatures && plannedFeatures.length > 0 && (
        <div className="relative w-full max-w-sm flex flex-col items-center">
          <Button 
            variant="ghost" 
            onClick={() => setShowPlanned(!showPlanned)}
            className="text-text-muted hover:text-text-main text-sm gap-2 rounded-full px-4"
          >
            See what's planned
            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showPlanned ? 'rotate-180' : ''}`} />
          </Button>

          {showPlanned && (
            <div className="w-full mt-3 bg-surface border border-line rounded-xl p-5 text-left shadow-lg transform transition-all duration-200 opacity-100 translate-y-0">
              <h4 className="text-xs font-semibold text-text-muted mb-3">Planned Features</h4>
              <ul className="space-y-2.5">
                {plannedFeatures.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-text-main">
                    <CheckCircle2 className="w-4 h-4 text-primary/60 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

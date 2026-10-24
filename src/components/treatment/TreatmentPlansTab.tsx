import { useCurrency } from '../../utils/currencyConfig';
import React, { useState } from 'react';
import { TreatmentPlan } from '../../types';
import { mockTreatmentPlans } from '../../data/mockTreatmentPlans';
import { Button } from '../ui/Button';
import { Plus, CheckCircle, Clock, Check, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TreatmentPlanBuilder } from './TreatmentPlanBuilder';

export function TreatmentPlansTab({ patientId }: { patientId: string }) {
  const { formatCurrency } = useCurrency();
  const [plans, setPlans] = useState<TreatmentPlan[]>(mockTreatmentPlans.filter(p => p.patientId === patientId));
  const [isBuilding, setIsBuilding] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null);

  const handleSavePlan = (plan: TreatmentPlan) => {
    if (selectedPlan) {
      setPlans(plans.map(p => p.id === plan.id ? plan : p));
    } else {
      setPlans([plan, ...plans]);
    }
    setIsBuilding(false);
    setSelectedPlan(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft': return 'bg-text-muted/10 text-text-muted border-line';
      case 'Proposed': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Approved': return 'bg-primary/10 text-primary border-primary/20';
      case 'In Progress': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Completed': return 'bg-teal-100 text-teal-700 border-teal-200';
      default: return 'bg-text-muted/10 text-text-muted border-line';
    }
  };

  if (isBuilding) {
    return (
      <TreatmentPlanBuilder 
        patientId={patientId} 
        existingPlan={selectedPlan} 
        onSave={handleSavePlan} 
        onCancel={() => { setIsBuilding(false); setSelectedPlan(null); }} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-line shadow-panel">
        <div>
          <h3 className="text-lg font-bold text-text-main">Treatment Plans</h3>
          <p className="text-sm text-text-muted">Manage and track proposed procedures.</p>
        </div>
        <Button onClick={() => setIsBuilding(true)} className="gap-2 shadow-panel">
          <Plus className="w-4 h-4" /> New Plan
        </Button>
      </div>

      {plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map(plan => {
            const totalCost = plan.items.reduce((sum, item) => sum + item.cost, 0);
            const discountAmt = plan.discountType === 'percentage' ? (totalCost * plan.discount) / 100 : plan.discount;
            const subtotal = totalCost - discountAmt;
            const tax = (subtotal * plan.taxPercentage) / 100;
            const finalTotal = subtotal + tax;

            return (
              <div key={plan.id} className="bg-base border border-line rounded-xl p-5 shadow-panel hover:shadow transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-text-main">{plan.name}</h4>
                    <div className="text-xs text-text-muted mt-1">{format(parseISO(plan.createdAt), 'MMM d, yyyy')}</div>
                  </div>
                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-md border ${getStatusColor(plan.status)}`}>
                    {plan.status}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  {plan.items.slice(0, 3).map(item => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        {item.status === 'Completed' ? <CheckCircle className="w-3.5 h-3.5 text-teal-500" /> : 
                         item.status === 'Scheduled' ? <Clock className="w-3.5 h-3.5 text-amber-500" /> : 
                         <div className="w-3.5 h-3.5 rounded-full border-2 border-text-muted/30" />}
                        <span className={`truncate max-w-[150px] ${item.status === 'Completed' ? 'text-text-muted line-through' : 'text-text-main'}`}>
                          {item.toothNumber ? `T${item.toothNumber} ` : ''}Procedure {item.procedureId.split('-')[1]}
                        </span>
                      </div>
                      <span className="text-text-muted font-medium">{formatCurrency(item.cost)}</span>
                    </div>
                  ))}
                  {plan.items.length > 3 && (
                    <div className="text-xs text-text-muted italic">+{plan.items.length - 3} more items...</div>
                  )}
                </div>

                <div className="flex justify-between items-end pt-4 border-t border-line">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedPlan(plan); setIsBuilding(true); }}>Edit</Button>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-muted font-medium">Est. Total</div>
                    <div className="text-lg font-bold text-text-main">{formatCurrency(finalTotal)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-16 text-center bg-surface rounded-xl border border-line border-dashed">
          <FileText className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-main">No Treatment Plans</h3>
          <p className="text-sm text-text-muted mt-1 max-w-sm mx-auto">Create a treatment plan to estimate costs and outline procedures for the patient.</p>
          <Button onClick={() => setIsBuilding(true)} className="mt-6 gap-2">
            <Plus className="w-4 h-4" /> Create First Plan
          </Button>
        </div>
      )}
    </div>
  );
}

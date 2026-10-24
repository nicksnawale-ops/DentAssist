import React, { useState, useEffect } from 'react';
import { TreatmentPlan, TreatmentPlanItem, Procedure } from '../../types';
import { mockProcedureCatalog } from '../../data/mockProcedureCatalog';
import { Button } from '../ui/Button';
import { ArrowLeft, Plus, Save, Printer, CheckCircle, Trash2, Tag, Percent, IndianRupee, FlaskConical } from 'lucide-react';
import { CreateLabOrderModal } from '../../pages/lab/CreateLabOrderModal';
import { useCurrency, formatCurrency } from '../../utils/currencyConfig';

interface TreatmentPlanBuilderProps {
  patientId: string;
  existingPlan: TreatmentPlan | null;
  onSave: (plan: TreatmentPlan) => void;
  onCancel: () => void;
}

export function TreatmentPlanBuilder({ patientId, existingPlan, onSave, onCancel }: TreatmentPlanBuilderProps) {
  const { symbol } = useCurrency();
  const [name, setName] = useState(existingPlan?.name || '');
  const [status, setStatus] = useState(existingPlan?.status || 'Draft');
  const [discount, setDiscount] = useState(existingPlan?.discount || 0);
  const [discountType, setDiscountType] = useState(existingPlan?.discountType || 'percentage');
  const [discountReason, setDiscountReason] = useState(existingPlan?.discountReason || '');
  const [taxPercentage, setTaxPercentage] = useState(existingPlan?.taxPercentage || 18);

  const [labOrderContext, setLabOrderContext] = useState<{patientId: string, toothNumbers: string[]} | null>(null);

  const isLabProcedure = (proc: Procedure | undefined) => {
    if (!proc) return false;
    const lowerName = proc.name.toLowerCase();
    const cat = proc.category;
    return (['Prosthodontics', 'Orthodontics'].includes(cat) && !lowerName.includes('consultation')) || 
           lowerName.includes('night guard') || lowerName.includes('veneer') || lowerName.includes('aligner');
  };
  const [items, setItems] = useState<TreatmentPlanItem[]>(existingPlan?.items || []);

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  const categories = ['All', ...Array.from(new Set(mockProcedureCatalog.map(p => p.category)))];
  
  const filteredProcedures = selectedCategory === 'All' 
    ? mockProcedureCatalog 
    : mockProcedureCatalog.filter(p => p.category === selectedCategory);

  const handleAddItem = (procedure: Procedure) => {
    const newItem: TreatmentPlanItem = {
      id: `tpi-new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      procedureId: procedure.id,
      cost: procedure.defaultCost,
      status: 'Pending'
    };
    setItems([...items, newItem]);
    setIsAddingItem(false);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof TreatmentPlanItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSave = () => {
    const plan: TreatmentPlan = {
      id: existingPlan?.id || `tp-new-${Date.now()}`,
      patientId,
      name: name || 'Untitled Plan',
      status,
      discount,
      discountType,
      discountReason,
      taxPercentage,
      items,
      createdByStaffId: 'current-user',
      createdAt: existingPlan?.createdAt || new Date().toISOString(),
      approvedAt: status === 'Approved' && !existingPlan?.approvedAt ? new Date().toISOString() : existingPlan?.approvedAt
    };
    onSave(plan);
  };

  const getProcedureDetails = (id: string) => mockProcedureCatalog.find(p => p.id === id);

  // Calculations
  const subtotalGross = items.reduce((sum, item) => sum + Number(item.cost), 0);
  const discountAmt = discountType === 'percentage' ? (subtotalGross * discount) / 100 : discount;
  const subtotalNet = subtotalGross - discountAmt;
  const taxAmt = (subtotalNet * taxPercentage) / 100;
  const grandTotal = subtotalNet + taxAmt;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onCancel} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-bold text-text-main">{existingPlan ? 'Edit Treatment Plan' : 'New Treatment Plan'}</h3>
            <div className="flex items-center gap-2 mt-1">
               <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Status:</span>
               <select 
                 value={status} 
                 onChange={e => setStatus(e.target.value as any)}
                 className={`text-xs font-bold rounded px-2 py-0.5 border outline-none ${
                   status === 'Draft' ? 'bg-base text-text-muted' :
                   status === 'Proposed' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                   status === 'Approved' ? 'bg-primary/10 text-primary border-primary/20' :
                   'bg-surface text-text-main'
                 }`}
               >
                 <option value="Draft">Draft</option>
                 <option value="Proposed">Proposed</option>
                 <option value="Approved">Approved</option>
                 <option value="In Progress">In Progress</option>
                 <option value="Completed">Completed</option>
               </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {status === 'Proposed' && (
            <Button variant="outline" className="gap-2 bg-base"><Printer className="w-4 h-4" /> Print Estimate</Button>
          )}
          {status === 'Proposed' && (
            <Button onClick={() => setStatus('Approved')} className="gap-2 bg-teal-600 hover:bg-teal-700 text-white border-transparent"><CheckCircle className="w-4 h-4" /> Patient Approved</Button>
          )}
          <Button onClick={handleSave} className="gap-2"><Save className="w-4 h-4" /> Save Plan</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-base border border-text-muted/20 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-text-muted/10 bg-surface">
              <input 
                type="text" 
                placeholder="Plan Name (e.g., Phase 1 Restorations)" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full text-lg font-bold text-text-main bg-transparent border-none outline-none placeholder:font-normal placeholder:text-text-muted/50"
              />
            </div>
            
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-surface border-b border-text-muted/10 text-text-muted uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Procedure</th>
                    <th className="px-4 py-3 w-24">Tooth</th>
                    <th className="px-4 py-3 w-32">Status</th>
                    <th className="px-4 py-3 w-32 text-right">Cost ({symbol})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text-muted/10">
                  {items.map((item, index) => {
                    const proc = getProcedureDetails(item.procedureId);
                    return (
                      <tr key={item.id} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3 text-center">
                           <button onClick={() => handleRemoveItem(item.id)} className="text-text-muted hover:text-error transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                        <td className="px-4 py-3 font-medium text-text-main">
                           <div className="flex items-center gap-2">
                             <span>{proc?.name || 'Unknown Procedure'}</span>
                             {isLabProcedure(proc) && (
                               <button 
                                 title="Create Lab Order"
                                 onClick={() => setLabOrderContext({ patientId, toothNumbers: item.toothNumber ? item.toothNumber.split(',').map(s=>s.trim()) : [] })}
                                 className="p-1 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
                               >
                                 <FlaskConical className="w-3.5 h-3.5" />
                               </button>
                             )}
                           </div>
                           <div className="text-[10px] text-text-muted font-normal mt-0.5">{proc?.category}</div>
                        </td>
                        <td className="px-4 py-3">
                           <input 
                             type="text" 
                             placeholder="e.g. 16" 
                             value={item.toothNumber || ''}
                             onChange={e => handleUpdateItem(item.id, 'toothNumber', e.target.value)}
                             className="w-16 bg-surface border border-text-muted/20 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary"
                           />
                        </td>
                        <td className="px-4 py-3">
                           <select
                             value={item.status}
                             onChange={e => handleUpdateItem(item.id, 'status', e.target.value)}
                             className={`w-full bg-surface border border-text-muted/20 rounded px-2 py-1 text-xs focus:outline-none focus:border-primary ${
                               item.status === 'Completed' ? 'text-teal-600 font-medium' :
                               item.status === 'Scheduled' ? 'text-amber-600 font-medium' :
                               'text-text-main'
                             }`}
                           >
                             <option value="Pending">Pending</option>
                             <option value="Scheduled">Scheduled</option>
                             <option value="Completed">Completed</option>
                           </select>
                           {item.linkedAppointmentId && <div className="text-[9px] text-text-muted mt-1 truncate max-w-[100px]">Appt linked</div>}
                        </td>
                        <td className="px-4 py-3 text-right">
                           <input 
                             type="number" 
                             value={item.cost}
                             onChange={e => handleUpdateItem(item.id, 'cost', Number(e.target.value))}
                             className="w-24 bg-surface border border-text-muted/20 rounded px-2 py-1 text-right text-sm font-medium focus:outline-none focus:border-primary"
                           />
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-muted italic">No procedures added yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {!isAddingItem ? (
              <div className="p-4 border-t border-text-muted/10 bg-surface">
                <Button variant="outline" onClick={() => setIsAddingItem(true)} className="w-full gap-2 border-dashed">
                  <Plus className="w-4 h-4" /> Add Procedure
                </Button>
              </div>
            ) : (
              <div className="p-4 border-t border-text-muted/10 bg-surface animate-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-sm text-text-main">Procedure Catalog</h4>
                  <button onClick={() => setIsAddingItem(false)} className="text-xs font-medium text-text-muted hover:text-text-main">Close</button>
                </div>
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                  {categories.map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-text-main text-base' : 'bg-base border border-text-muted/20 text-text-muted hover:text-text-main'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {filteredProcedures.map(proc => (
                    <button 
                      key={proc.id} 
                      onClick={() => handleAddItem(proc)}
                      className="flex justify-between items-center p-3 rounded-lg border border-text-muted/20 bg-base hover:border-primary/50 text-left transition-colors group"
                    >
                      <div>
                        <div className="font-bold text-sm text-text-main group-hover:text-primary transition-colors">{proc.name}</div>
                        <div className="text-[10px] text-text-muted mt-0.5">{proc.category} • {proc.defaultDurationMinutes} min</div>
                      </div>
                      <div className="font-medium text-sm text-text-main">{formatCurrency(proc.defaultCost)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-base border border-text-muted/20 rounded-xl p-5 shadow-sm space-y-4 sticky top-6">
            <h3 className="font-bold text-text-main mb-4 flex items-center gap-2 border-b border-text-muted/10 pb-3"><Tag className="w-4 h-4 text-primary" /> Financial Summary</h3>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted font-medium">Subtotal</span>
              <span className="text-text-main font-bold">{formatCurrency(subtotalGross)}</span>
            </div>
            
            <div className="space-y-2 py-3 border-y border-text-muted/10 border-dashed">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-muted font-medium flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" /> Discount</span>
                <div className="flex items-center gap-2">
                   <input 
                     type="number" 
                     value={discount} 
                     onChange={e => setDiscount(Number(e.target.value))}
                     className="w-16 bg-surface border border-text-muted/20 rounded px-2 py-1 text-right text-xs focus:outline-none focus:border-primary"
                   />
                   <select 
                     value={discountType} 
                     onChange={e => setDiscountType(e.target.value as any)}
                     className="bg-surface border border-text-muted/20 rounded px-1 py-1 text-xs focus:outline-none"
                   >
                     <option value="percentage">%</option>
                     <option value="flat">{symbol}</option>
                   </select>
                </div>
              </div>
              {discount > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <input 
                    type="text" 
                    placeholder="Reason for discount..." 
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    className="flex-1 bg-surface border border-text-muted/20 rounded px-2 py-1 text-xs focus:outline-none focus:border-primary mr-4"
                  />
                  <span className="text-error font-medium">- {formatCurrency(discountAmt)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted font-medium">Net Amount</span>
              <span className="text-text-main font-bold">{formatCurrency(subtotalNet)}</span>
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted font-medium">Tax</span>
              <div className="flex items-center gap-2">
                 <select 
                   value={taxPercentage} 
                   onChange={e => setTaxPercentage(Number(e.target.value))}
                   className="bg-surface border border-text-muted/20 rounded px-2 py-1 text-xs focus:outline-none"
                 >
                   <option value={0}>0%</option>
                   <option value={5}>5%</option>
                   <option value={12}>12%</option>
                   <option value={18}>18% GST</option>
                 </select>
                 <span className="text-text-muted font-medium w-16 text-right">+ {formatCurrency(taxAmt, {maximumFractionDigits: 0})}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-text-muted/20">
              <span className="text-base font-bold text-text-main">Estimated Total</span>
              <span className="text-2xl font-bold text-primary flex items-center">{formatCurrency(grandTotal, {maximumFractionDigits: 0})}</span>
            </div>
          </div>
        </div>
      </div>
      
      {labOrderContext && (
        <CreateLabOrderModal
          onClose={() => setLabOrderContext(null)}
          defaultPatientId={labOrderContext.patientId}
          defaultToothNumbers={labOrderContext.toothNumbers}
        />
      )}
    </div>
  );
}

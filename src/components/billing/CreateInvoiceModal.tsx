import React, { useState, useEffect } from 'react';
import { mockPatients } from '../../data/mockPatients';
import { mockTreatmentPlans } from '../../data/mockTreatmentPlans';
import { Invoice, InvoiceLineItem, TreatmentPlan } from '../../types';
import { X, Plus, Trash2, Calendar, FileText, IndianRupee } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { format, addDays } from 'date-fns';
import { useCurrency } from '../../utils/currencyConfig';

interface CreateInvoiceModalProps {
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  initialPatientId?: string;
  initialTreatmentPlanId?: string;
}

export function CreateInvoiceModal({ onClose, onSave, initialPatientId, initialTreatmentPlanId }: CreateInvoiceModalProps) {
  const { selectedClinicId } = useAuth();
  const { formatCurrency, symbol } = useCurrency();
  const [patientId, setPatientId] = useState(initialPatientId || '');
  const [treatmentPlanId, setTreatmentPlanId] = useState(initialTreatmentPlanId || '');
  
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    { id: 'new-1', procedureName: '', quantity: 1, unitCost: 0, total: 0 }
  ]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat');
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');

  // Auto-fill from treatment plan if selected
  useEffect(() => {
    if (treatmentPlanId) {
      const plan = mockTreatmentPlans.find(tp => tp.id === treatmentPlanId);
      if (plan) {
        const newLineItems = plan.items.map(item => {
          const procName = item.procedureId; // In a real app we'd map this from master procedures list
          return {
            id: `li-${Date.now()}-${Math.random()}`,
            procedureName: procName + (item.toothNumber ? ` (Tooth: ${item.toothNumber})` : ''),
            toothNumber: item.toothNumber,
            quantity: 1,
            unitCost: item.cost,
            total: item.cost
          };
        });
        setLineItems(newLineItems);
        if (plan.discount > 0) {
            setDiscount(plan.discount);
            setDiscountType(plan.discountType);
        }
      }
    }
  }, [treatmentPlanId]);

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setLineItems(items => items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitCost') {
          updatedItem.total = updatedItem.quantity * updatedItem.unitCost;
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { id: `new-${Date.now()}`, procedureName: '', quantity: 1, unitCost: 0, total: 0 }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(items => items.filter(i => i.id !== id));
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const discountAmount = discountType === 'percentage' ? (subtotal * (discount / 100)) : discount;
  const taxableAmount = subtotal - discountAmount;
  
  // Hardcoding 18% GST for medical/services if applicable (usually healthcare is exempt, but let's assume some taxable procedures for demo)
  // Let's assume an overall 18% GST (9% CGST, 9% SGST) for the sake of demonstrating itemized taxes.
  const cgst = taxableAmount * 0.09;
  const sgst = taxableAmount * 0.09;
  const totalTax = cgst + sgst;
  const total = taxableAmount + totalTax;

  const handleSave = () => {
    const newInvoice: Invoice = {
      id: `inv_new_${Date.now()}`,
      patientId,
      clinicId: selectedClinicId !== 'all' ? selectedClinicId : 'c1',
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      treatmentPlanId: treatmentPlanId || undefined,
      lineItems: lineItems.filter(li => li.procedureName.trim() !== ''),
      subtotal,
      discount,
      discountType,
      taxBreakdown: { cgst, sgst, igst: 0 },
      totalTax,
      total,
      status: 'Draft',
      dueDate: new Date(dueDate).toISOString(),
      notes,
      createdAt: new Date().toISOString()
    };
    onSave(newInvoice);
  };

  const patientPlans = mockTreatmentPlans.filter(tp => tp.patientId === patientId && tp.status === 'Approved');

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-4xl rounded-panel border border-line shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-line flex justify-between items-center bg-base">
          <h3 className="font-bold text-text-main flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Create Invoice
          </h3>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted mb-2">Select Patient</label>
                <select 
                  value={patientId} 
                  onChange={e => { setPatientId(e.target.value); setTreatmentPlanId(''); }}
                  className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  disabled={!!initialPatientId}
                >
                  <option value="">-- Select Patient --</option>
                  {mockPatients.map(p => (
                    <option key={p.id} value={p.id}>{p.firstName} {p.lastName} ({p.phone})</option>
                  ))}
                </select>
              </div>
              
              {patientId && patientPlans.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-2">Generate from Treatment Plan</label>
                  <select 
                    value={treatmentPlanId} 
                    onChange={e => setTreatmentPlanId(e.target.value)}
                    className="w-full bg-primary/5 border border-primary/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary text-primary font-medium"
                    disabled={!!initialTreatmentPlanId}
                  >
                    <option value="">-- Manual Invoice --</option>
                    {patientPlans.map(tp => (
                      <option key={tp.id} value={tp.id}>{tp.name} (Total: {formatCurrency(tp.items.reduce((sum, i) => sum + i.cost, 0))})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted mb-2">Due Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input 
                    type="date" 
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-base border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-xs font-bold text-text-muted">Line Items</label>
              <Button size="sm" variant="outline" onClick={addLineItem} className="gap-2">
                <Plus className="w-4 h-4" /> Add Item
              </Button>
            </div>
            
            <div className="border border-line rounded-xl overflow-hidden bg-base">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
                  <tr>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 w-24 text-right">Qty</th>
                    <th className="px-4 py-3 w-32 text-right">Unit Price ({symbol})</th>
                    <th className="px-4 py-3 w-32 text-right">Total ({symbol})</th>
                    <th className="px-4 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineItems.map((item, index) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <input 
                          type="text" 
                          placeholder="Procedure or item description"
                          value={item.procedureName}
                          onChange={(e) => updateLineItem(item.id, 'procedureName', e.target.value)}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input 
                          type="number" 
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input 
                          type="number" 
                          min="0"
                          value={item.unitCost}
                          onChange={(e) => updateLineItem(item.id, 'unitCost', Number(e.target.value))}
                          className="w-full bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => removeLineItem(item.id)} className="p-1 text-text-muted hover:text-error hover:bg-error/10 rounded transition-colors" disabled={lineItems.length === 1}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted mb-2">Notes to Patient</label>
                <textarea 
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Thank you for your visit..."
                  className="w-full bg-base border border-line rounded-lg p-3 text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
            
            <div className="w-full md:w-80 bg-surface rounded-xl border border-line p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Subtotal</span>
                <span className="font-medium text-text-main">{formatCurrency(subtotal)}</span>
              </div>
              
              <div className="flex justify-between items-center text-sm group">
                <span className="text-text-muted flex items-center gap-2">
                  Discount
                  <select 
                    value={discountType} 
                    onChange={e => setDiscountType(e.target.value as any)}
                    className="bg-transparent border border-line rounded px-1 text-xs focus:outline-none"
                  >
                    <option value="flat">{symbol}</option>
                    <option value="percentage">%</option>
                  </select>
                </span>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    value={discount}
                    onChange={e => setDiscount(Number(e.target.value))}
                    className="w-16 bg-base border border-line rounded px-2 py-0.5 text-right text-sm focus:outline-none focus:border-primary"
                  />
                  <span className="text-error font-medium w-16 text-right">-{formatCurrency(discountAmount)}</span>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-text-muted">CGST (9%)</span>
                <span className="font-medium text-text-main">{formatCurrency(cgst, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">SGST (9%)</span>
                <span className="font-medium text-text-main">{formatCurrency(sgst, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>

              <div className="border-t border-line pt-3 flex justify-between items-center">
                <span className="font-bold text-text-main">Total</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(total, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-line bg-base flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!patientId || lineItems.every(li => li.procedureName.trim() === '')} className="gap-2">
            <Plus className="w-4 h-4" /> Generate Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

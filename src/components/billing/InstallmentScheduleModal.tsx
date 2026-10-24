import React, { useState } from 'react';
import { InstallmentPlan, Invoice } from '../../types';
import { mockInstallments, mockInvoices } from '../../data/mockInvoices';
import { Button } from '../ui/Button';
import { X, CalendarDays, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '../../utils/currencyConfig';

interface InstallmentScheduleModalProps {
  invoiceId: string;
  onClose: () => void;
}

export function InstallmentScheduleModal({ invoiceId, onClose }: InstallmentScheduleModalProps) {
  const invoice = mockInvoices.find(i => i.id === invoiceId);
  const installments = mockInstallments.filter(i => i.invoiceId === invoiceId);
  
  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-2xl border border-text-muted/20 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
         <div className="p-4 border-b border-text-muted/10 flex justify-between items-center bg-base">
            <div>
              <h3 className="font-bold text-text-main flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" /> Installment Schedule</h3>
              <p className="text-xs text-text-muted mt-1">For Invoice {invoice.invoiceNumber}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
         </div>
         
         <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-text-main">Total Amount</p>
                <p className="text-xl font-black text-primary">{formatCurrency(invoice.total)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-text-main">Installments</p>
                <p className="text-xl font-black text-text-main">{installments.length}</p>
              </div>
            </div>

            <div className="space-y-3">
              {installments.sort((a, b) => a.installmentNumber - b.installmentNumber).map((inst) => (
                <div key={inst.id} className="bg-base border border-text-muted/20 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface border border-text-muted/10 flex items-center justify-center font-bold text-text-main">
                      {inst.installmentNumber}
                    </div>
                    <div>
                      <p className="font-bold text-text-main">{formatCurrency(inst.amount)}</p>
                      <p className="text-xs text-text-muted">Due: {format(parseISO(inst.dueDate), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                  <div>
                    {inst.status === 'Paid' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20"><CheckCircle className="w-3.5 h-3.5" /> Paid</span>}
                    {inst.status === 'Pending' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20"><Clock className="w-3.5 h-3.5" /> Pending</span>}
                    {inst.status === 'Overdue' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-error/10 text-error border border-error/20"><AlertCircle className="w-3.5 h-3.5" /> Overdue</span>}
                  </div>
                </div>
              ))}
            </div>
         </div>
      </div>
    </div>
  );
}

import { useCurrency } from '../../utils/currencyConfig';
import React, { useState } from 'react';
import { Invoice, PaymentMethod } from '../../types';
import { mockPayments } from '../../data/mockPayments';
import { X, IndianRupee } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

interface RecordPaymentModalProps {
  invoice: Invoice;
  onClose: () => void;
  onPaymentRecorded: (amount: number, method: string) => void;
}

export function RecordPaymentModal({ invoice, onClose, onPaymentRecorded }: RecordPaymentModalProps) {
  const { symbol, formatCurrency } = useCurrency();
  const { user } = useAuth();
  
  const existingPayments = mockPayments.filter(p => p.invoiceId === invoice.id);
  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = Math.max(0, invoice.total - totalPaid);

  const [amount, setAmount] = useState<number>(remainingBalance);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0 || amount > remainingBalance) return;
    
    // Simulating save
    onPaymentRecorded(amount, method);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-panel border border-line shadow-2xl overflow-hidden flex flex-col">
         <div className="p-4 border-b border-line flex justify-between items-center bg-base">
            <div>
              <h3 className="font-bold text-text-main flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-primary" /> Record Payment
              </h3>
              <p className="text-xs text-text-muted mt-1">Invoice {invoice.invoiceNumber}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
         </div>

         <form onSubmit={handleSave} className="p-6 space-y-4">
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-text-main">Remaining Balance</span>
              <span className="text-lg font-bold text-primary">{formatCurrency(remainingBalance)}</span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Amount to Pay ({symbol})</label>
              <input
                type="number"
                required
                min="1"
                max={remainingBalance}
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Payment Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value as PaymentMethod)}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              >
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Insurance">Insurance</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Reference Number (Optional)</label>
              <input
                type="text"
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="e.g. UPI TXN ID or Cheque No"
                className="w-full px-4 py-2 bg-base border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-text-main mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 bg-base border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              ></textarea>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit">Record Payment</Button>
            </div>
         </form>
      </div>
    </div>
  );
}

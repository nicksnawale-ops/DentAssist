import React, { useState } from 'react';
import { mockInvoices } from '../../data/mockInvoices';
import { mockPatients } from '../../data/mockPatients';
import { useAuth } from '../../context/AuthContext';
import { InvoiceStatus } from '../../types';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Search, AlertCircle, MessageCircle, Send } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/useToast';
import { formatCurrency } from '../../utils/currencyConfig';

export function OutstandingBalances() {
  const { selectedClinicId } = useAuth();
  const { toast } = useToast();
  const clinicInvoices = selectedClinicId === 'all' ? mockInvoices : mockInvoices.filter(i => i.clinicId === selectedClinicId);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  const outstandingInvoices = clinicInvoices.filter(
    inv => inv.status === 'Sent' || inv.status === 'Partially Paid' || inv.status === 'Overdue'
  );

  const filteredInvoices = outstandingInvoices.filter(invoice => {
    const patient = mockPatients.find(p => p.id === invoice.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : '';
    return invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
           (patientName.toLowerCase().includes(searchTerm.toLowerCase()));
  }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Oldest due first

  const totalOutstanding = filteredInvoices.reduce((sum, inv) => sum + inv.total, 0);

  const handleSendReminder = (invoiceIds: string[]) => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      toast({
        title: "Reminders Sent",
        description: `Successfully sent payment reminders via WhatsApp for ${invoiceIds.length} invoice(s).`,
      });
      setSelectedInvoices([]);
    }, 1500);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.length === filteredInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(filteredInvoices.map(i => i.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedInvoices(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-error/10 border border-error/20 rounded-xl p-6 flex flex-col justify-center">
          <div className="flex items-center gap-3 text-error mb-2">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">Total Outstanding</h3>
          </div>
          <p className="text-3xl font-black text-error">{formatCurrency(totalOutstanding)}</p>
          <p className="text-sm text-error/80 mt-1">{filteredInvoices.length} pending invoices</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search outstanding by invoice # or patient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-3">
          {selectedInvoices.length > 0 && (
            <Button onClick={() => handleSendReminder(selectedInvoices)} className="gap-2" disabled={isSending}>
              {isSending ? (
                 <div className="w-4 h-4 border-2 border-base border-t-transparent rounded-full animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              Remind Selected ({selectedInvoices.length})
            </Button>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-text-muted/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-base border-b border-text-muted/10 text-text-muted uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    checked={selectedInvoices.length === filteredInvoices.length && filteredInvoices.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-text-muted/30 text-primary focus:ring-primary/20"
                  />
                </th>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Patient</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Days Overdue</th>
                <th className="px-6 py-4 text-right">Balance</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-muted/10">
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((invoice) => {
                  const patient = mockPatients.find(p => p.id === invoice.patientId);
                  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient';
                  const daysOverdue = Math.max(0, differenceInDays(new Date(), parseISO(invoice.dueDate)));
                  const isOverdue = daysOverdue > 0;
                  
                  return (
                    <tr key={invoice.id} className={`hover:bg-surface-hover/50 transition-colors ${selectedInvoices.includes(invoice.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          checked={selectedInvoices.includes(invoice.id)}
                          onChange={() => toggleSelect(invoice.id)}
                          className="rounded border-text-muted/30 text-primary focus:ring-primary/20"
                        />
                      </td>
                      <td className="px-6 py-4 font-medium text-text-main">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                            {patientName.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-medium text-text-main">{patientName}</p>
                            <p className="text-xs text-text-muted">{patient?.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-text-muted">
                        {format(parseISO(invoice.dueDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20">
                            {daysOverdue} Days
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">Not Overdue</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-error text-right">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="outline" size="sm" onClick={() => handleSendReminder([invoice.id])} className="gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5" /> Remind
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
                    No outstanding balances found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

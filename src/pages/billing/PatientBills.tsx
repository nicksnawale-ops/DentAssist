import React, { useState } from 'react';
import { mockInvoices } from '../../data/mockInvoices';
import { mockPatients } from '../../data/mockPatients';
import { mockClinics } from '../../data/mockClinics';
import { useAuth } from '../../context/AuthContext';
import { Invoice } from '../../types';
import { format, parseISO } from 'date-fns';
import { Receipt, CreditCard, Clock, CheckCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { InvoicePreviewModal } from '../../components/billing/InvoicePreviewModal';
import { CheckoutModal } from '../../components/billing/CheckoutModal';
import * as Tabs from '@radix-ui/react-tabs';
import { formatCurrency } from '../../utils/currencyConfig';

export function PatientBills() {
  const { user } = useAuth();
  
  // For demo, we map the generic 'patient@example.com' user to pat_1 (Alice)
  const patientId = 'pat_1'; 
  const patient = mockPatients.find(p => p.id === patientId);
  const patientInvoices = mockInvoices.filter(inv => inv.patientId === patientId);

  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<Invoice | null>(null);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);

  const unpaidInvoices = patientInvoices.filter(i => i.status !== 'Paid');
  const paidInvoices = patientInvoices.filter(i => i.status === 'Paid');

  const totalOutstanding = unpaidInvoices.reduce((sum, inv) => sum + inv.total, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Paid':
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success border border-success/20"><CheckCircle className="w-3 h-3" /> Paid</span>;
      case 'Overdue':
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-error/10 text-error border border-error/20"><Clock className="w-3 h-3" /> Overdue</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-600 border border-yellow-500/20"><Clock className="w-3 h-3" /> {status}</span>;
    }
  };

  const InvoiceList = ({ invoices }: { invoices: Invoice[] }) => (
    <div className="space-y-4 mt-6">
      {invoices.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-xl border border-text-muted/10">
          <Receipt className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
          <p className="text-text-muted font-medium">No invoices found.</p>
        </div>
      ) : (
        invoices.map(invoice => {
          const clinic = mockClinics.find(c => c.id === invoice.clinicId);
          return (
            <div key={invoice.id} className="bg-surface rounded-xl border border-text-muted/10 shadow-sm p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${invoice.status === 'Paid' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                  <Receipt className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-text-main text-lg">{invoice.invoiceNumber}</h3>
                    {getStatusBadge(invoice.status)}
                  </div>
                  <p className="text-sm text-text-muted mb-1">
                    {format(parseISO(invoice.createdAt), 'MMM d, yyyy')} • {clinic?.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    Due: {format(parseISO(invoice.dueDate), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3 w-full md:w-auto mt-4 md:mt-0 border-t md:border-t-0 border-text-muted/10 pt-4 md:pt-0">
                <div className="text-right w-full md:w-auto flex justify-between md:block">
                  <span className="md:hidden text-text-muted text-sm font-medium">Amount</span>
                  <p className="text-xl font-black text-text-main">{formatCurrency(invoice.total)}</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <Button variant="outline" size="sm" onClick={() => setSelectedInvoiceForPreview(invoice)} className="flex-1 md:flex-auto">
                    View Invoice
                  </Button>
                  {invoice.status !== 'Paid' && (
                    <Button size="sm" onClick={() => setSelectedInvoiceForPayment(invoice)} className="flex-1 md:flex-auto gap-2">
                      <CreditCard className="w-4 h-4" /> Pay Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text-main">My Bills</h1>
        <p className="text-sm text-text-muted mt-2">View your invoice history and manage payments securely.</p>
      </div>

      {totalOutstanding > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary/80 uppercase tracking-wider mb-1">Total Outstanding Balance</p>
              <h2 className="text-3xl font-black text-text-main">{formatCurrency(totalOutstanding)}</h2>
            </div>
          </div>
          <p className="text-sm text-text-muted max-w-xs">
            You have {unpaidInvoices.length} unpaid invoice(s). You can pay securely online using UPI, Credit/Debit Card, or Netbanking.
          </p>
        </div>
      )}

      <Tabs.Root defaultValue="unpaid" className="mt-8">
        <Tabs.List className="flex border-b border-text-muted/10">
          <Tabs.Trigger value="unpaid" className="px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors">
            Unpaid ({unpaidInvoices.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="paid" className="px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors">
            Paid History
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="unpaid" className="outline-none">
          <InvoiceList invoices={unpaidInvoices} />
        </Tabs.Content>
        <Tabs.Content value="paid" className="outline-none">
          <InvoiceList invoices={paidInvoices} />
        </Tabs.Content>
      </Tabs.Root>

      {selectedInvoiceForPreview && (
        <InvoicePreviewModal 
          invoice={selectedInvoiceForPreview} 
          onClose={() => setSelectedInvoiceForPreview(null)} 
        />
      )}

      {selectedInvoiceForPayment && (
        <CheckoutModal
          invoice={selectedInvoiceForPayment}
          onClose={() => setSelectedInvoiceForPayment(null)}
          onSuccess={() => {
            // Re-fetch or update UI would happen here. For mock, just close it.
            setSelectedInvoiceForPayment(null);
          }}
        />
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { mockInvoices } from '../../data/mockInvoices';
import { Invoice, InvoiceStatus } from '../../types';
import { format, parseISO } from 'date-fns';
import { Plus, FileText, CheckCircle, Clock, AlertCircle, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import { formatCurrency } from '../../utils/currencyConfig';

export function PatientInvoicesTab({ patientId }: { patientId: string }) {
  const patientInvoices = mockInvoices.filter(i => i.patientId === patientId);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  const getStatusBadge = (status: InvoiceStatus) => {
    const styles = {
      'Draft': 'bg-text-muted/10 text-text-muted border-line',
      'Sent': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      'Partially Paid': 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      'Paid': 'bg-success/10 text-success border-success/20',
      'Overdue': 'bg-error/10 text-error border-error/20'
    };
    
    const icons = {
      'Draft': FileText,
      'Sent': Send,
      'Partially Paid': Clock,
      'Paid': CheckCircle,
      'Overdue': AlertCircle
    };
    
    const Icon = icons[status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold border ${styles[status]}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  const totalOutstanding = patientInvoices
    .filter(i => i.status === 'Sent' || i.status === 'Partially Paid' || i.status === 'Overdue')
    .reduce((sum, i) => sum + i.total, 0); // In real app, we would track amountPaid to calculate exact outstanding.

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-line shadow-panel">
        <div>
          <h3 className="text-lg font-bold text-text-main">Billing & Invoices</h3>
          {totalOutstanding > 0 ? (
            <p className="text-sm font-medium text-error mt-1">Outstanding Balance: {formatCurrency(totalOutstanding)}</p>
          ) : (
            <p className="text-sm text-text-muted mt-1">No outstanding balance.</p>
          )}
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create Invoice
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-line shadow-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
              <tr>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {patientInvoices.length > 0 ? (
                patientInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-surface-hover/50 transition-colors cursor-pointer" onClick={() => setPreviewInvoice(invoice)}>
                    <td className="px-6 py-4 font-medium text-text-main">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {format(parseISO(invoice.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-6 py-4 font-bold text-text-main text-right">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPreviewInvoice(invoice); }}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <FileText className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-text-main">No Invoices</h3>
                    <p className="text-sm text-text-muted mt-1">This patient does not have any billing history.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <CreateInvoiceModal 
          onClose={() => setShowCreateModal(false)} 
          initialPatientId={patientId}
          onSave={(inv) => {
            console.log('Saved invoice', inv);
            setShowCreateModal(false);
          }}
        />
      )}

      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
}

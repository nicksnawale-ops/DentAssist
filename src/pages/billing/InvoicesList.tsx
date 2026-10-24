import React, { useState } from 'react';
import { mockInvoices } from '../../data/mockInvoices';
import { mockPatients } from '../../data/mockPatients';
import { mockTreatmentPlans } from '../../data/mockTreatmentPlans';
import { Invoice, InvoiceStatus } from '../../types';
import { format, parseISO } from 'date-fns';
import { Search, Filter, Plus, FileText, CheckCircle, Clock, AlertCircle, Send, MoreVertical, FilePlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { CreateInvoiceModal } from '../../components/billing/CreateInvoiceModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { InvoicePreviewModal } from '../../components/billing/InvoicePreviewModal';
import { InstallmentScheduleModal } from '../../components/billing/InstallmentScheduleModal';
import { mockInstallments } from '../../data/mockInvoices';
import { formatCurrency } from '../../utils/currencyConfig';

export function InvoicesList() {
  const { selectedClinicId } = useAuth();
  const clinicInvoices = selectedClinicId === 'all' ? mockInvoices : mockInvoices.filter(i => i.clinicId === selectedClinicId);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'All'>('All');
  const [dateFilter, setDateFilter] = useState<'all' | 'this_month' | 'last_month'>('all');
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [viewInstallmentsFor, setViewInstallmentsFor] = useState<string | null>(null);

  const filteredInvoices = clinicInvoices.filter(invoice => {
    const patient = mockPatients.find(p => p.id === invoice.patientId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : '';
    const searchMatch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (patientName.toLowerCase().includes(searchTerm.toLowerCase()));
    const statusMatch = statusFilter === 'All' || invoice.status === statusFilter;
    
    let dateMatch = true;
    const invoiceDate = parseISO(invoice.createdAt);
    const now = new Date();
    if (dateFilter === 'this_month') {
      dateMatch = invoiceDate.getMonth() === now.getMonth() && invoiceDate.getFullYear() === now.getFullYear();
    } else if (dateFilter === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      dateMatch = invoiceDate.getMonth() === lastMonth.getMonth() && invoiceDate.getFullYear() === lastMonth.getFullYear();
    }

    return searchMatch && statusMatch && dateMatch;
  });

  const getStatusBadge = (status: InvoiceStatus) => {
    const styles = {
      'Draft': 'bg-text-muted/10 text-text-muted border-text-muted/20',
      'Sent': 'bg-blue-500/10 text-blue-800 border-blue-500/20',
      'Partially Paid': 'bg-yellow-500/10 text-yellow-800 border-yellow-500/20',
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
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
        <Icon className="w-3.5 h-3.5" />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-3">
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create Invoice
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search by invoice number or patient name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary min-w-[140px]"
          >
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Overdue">Overdue</option>
          </select>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-3 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary min-w-[140px]"
          >
            <option value="all">All Dates</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-surface rounded-xl border border-text-muted/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-base border-b border-text-muted/10 text-text-muted uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Patient</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-muted/10">
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((invoice) => {
                  const patient = mockPatients.find(p => p.id === invoice.patientId);
                  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient';
                  return (
                    <tr key={invoice.id} className="hover:bg-surface-hover/50 transition-colors cursor-pointer" onClick={() => setPreviewInvoice(invoice)}>
                      <td className="px-6 py-4 font-medium text-text-main">
                        {invoice.invoiceNumber}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-text-main">{patientName}</div>
                        <div className="text-xs text-text-muted">{patient?.phone}</div>
                      </td>
                      <td className="px-6 py-4 text-text-muted">
                        {format(parseISO(invoice.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-text-main">{formatCurrency(invoice.total)}</div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(invoice.status)}
                      </td>
                      <td className="px-6 py-4 text-text-muted">
                        {format(parseISO(invoice.dueDate), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {mockInstallments.some(inst => inst.invoiceId === invoice.id) && (
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setViewInstallmentsFor(invoice.id); }}>
                              Installments
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setPreviewInvoice(invoice); }}>
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                     <EmptyState
                       icon={FileText}
                       title="No Invoices Found"
                       description={mockInvoices.length === 0 ? "Create your first invoice to get started." : "Adjust your filters or create a new invoice."}
                       actionLabel={mockInvoices.length === 0 ? "Create Invoice" : undefined}
                       onAction={mockInvoices.length === 0 ? () => setShowCreateModal(true) : undefined}
                     />
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
          onSave={(inv) => {
            console.log('Saved', inv);
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

      {viewInstallmentsFor && (
        <InstallmentScheduleModal
          invoiceId={viewInstallmentsFor}
          onClose={() => setViewInstallmentsFor(null)}
        />
      )}
    </div>
  );
}

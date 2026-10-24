import React, { useState } from 'react';
import { mockInsuranceClaims } from '../../data/mockInsuranceClaims';
import { mockPatients } from '../../data/mockPatients';
import { mockInvoices } from '../../data/mockInvoices';
import { useAuth } from '../../context/AuthContext';
import { InsuranceClaimStatus } from '../../types';
import { format, parseISO } from 'date-fns';
import { Search, FileText, CheckCircle, Clock, XCircle, AlertCircle, ShieldPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { formatCurrency } from '../../utils/currencyConfig';

export function InsuranceClaimsTab() {
  const { selectedClinicId } = useAuth();
  
  // Filter claims based on selected clinic
  const clinicClaims = mockInsuranceClaims.filter(claim => {
    const invoice = mockInvoices.find(i => i.id === claim.invoiceId);
    return selectedClinicId === 'all' || invoice?.clinicId === selectedClinicId;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<InsuranceClaimStatus | 'All'>('All');

  const filteredClaims = clinicClaims.filter(claim => {
    const patient = mockPatients.find(p => p.id === claim.patientId);
    const invoice = mockInvoices.find(i => i.id === claim.invoiceId);
    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : '';
    
    const searchMatch = claim.providerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (patientName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                        (invoice?.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()));
                        
    const statusMatch = statusFilter === 'All' || claim.status === statusFilter;
    
    return searchMatch && statusMatch;
  });

  const getStatusBadge = (status: InsuranceClaimStatus) => {
    const styles = {
      'Submitted': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      'Under Review': 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      'Approved': 'bg-success/10 text-success border-success/20',
      'Rejected': 'bg-error/10 text-error border-error/20',
      'Paid': 'bg-text-main/10 text-text-main border-text-main/20'
    };

    const icons = {
      'Submitted': FileText,
      'Under Review': Clock,
      'Approved': CheckCircle,
      'Rejected': XCircle,
      'Paid': CheckCircle
    };

    const Icon = icons[status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${styles[status]}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface p-4 rounded-xl border border-text-muted/10 shadow-sm">
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search provider, patient, or invoice #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2 bg-base border border-text-muted/20 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors"
          >
            <option value="All">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Paid">Paid</option>
          </select>
          <Button className="gap-2">
            <ShieldPlus className="w-4 h-4" /> New Claim
          </Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-text-muted/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-base border-b border-text-muted/10 text-text-muted uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4">Patient / Invoice</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Claim Amt</th>
                <th className="px-6 py-4 text-right">Approved Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-muted/10">
              {filteredClaims.length > 0 ? (
                filteredClaims.map((claim) => {
                  const patient = mockPatients.find(p => p.id === claim.patientId);
                  const invoice = mockInvoices.find(i => i.id === claim.invoiceId);
                  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient';
                  
                  return (
                    <tr key={claim.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-6 py-4 text-text-muted">
                        {format(parseISO(claim.submittedAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-text-main">{patientName}</p>
                        <p className="text-xs text-text-muted">{invoice?.invoiceNumber}</p>
                      </td>
                      <td className="px-6 py-4 font-medium text-text-main">
                        {claim.providerName}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(claim.status)}
                      </td>
                      <td className="px-6 py-4 font-bold text-text-main text-right">
                        {formatCurrency(claim.claimAmount)}
                      </td>
                      <td className="px-6 py-4 font-bold text-success text-right">
                        {claim.approvedAmount ? formatCurrency(claim.approvedAmount) : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                    <ShieldPlus className="w-12 h-12 text-text-muted/30 mx-auto mb-3" />
                    <p>No insurance claims found.</p>
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

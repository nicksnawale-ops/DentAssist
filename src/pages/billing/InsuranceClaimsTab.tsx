import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ShieldCheck } from 'lucide-react';
import { InsuranceClaim, InsuranceClaimStatus } from '../../types';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/useToast';
import { InvoicePreviewModal } from '../../components/billing/InvoicePreviewModal';
import { getClaims, updateClaim } from '../../api/billingService';
import { formatCurrency } from '../../utils/currencyConfig';

const STATUSES: InsuranceClaimStatus[] = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Paid'];
const VARIANT: Record<InsuranceClaimStatus, 'secondary' | 'warning' | 'success' | 'error' | 'outline'> = {
  Submitted: 'secondary', 'Under Review': 'warning', Approved: 'success', Rejected: 'error', Paid: 'outline',
};

export function InsuranceClaimsTab() {
  const { toast } = useToast();
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [editing, setEditing] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<InsuranceClaimStatus>('Approved');
  const [approved, setApproved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getClaims(filter === 'open' ? 'Submitted,Under Review,Approved' : undefined);
    setClaims(res.data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (c: InsuranceClaim) => {
    setEditing(c.id);
    setNextStatus(c.status === 'Submitted' ? 'Under Review' : c.status === 'Under Review' ? 'Approved' : 'Paid');
    setApproved(c.approvedAmount ?? c.claimAmount);
    setError(null);
  };

  const save = async (c: InsuranceClaim) => {
    setSaving(true);
    const res = await updateClaim(c.id, {
      status: nextStatus,
      approvedAmount: nextStatus === 'Approved' || nextStatus === 'Paid' ? approved : undefined,
    });
    setSaving(false);
    if (!res.data) return setError(res.error?.message || 'The claim could not be updated.');
    setEditing(null);
    toast({ title: nextStatus === 'Paid' ? 'Insurance payment added to the invoice' : `Claim marked ${nextStatus.toLowerCase()}`, variant: 'success' });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {(['open', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`h-8 px-3 rounded-full text-[13px] font-medium border ${filter === f ? 'bg-primary text-white border-primary' : 'bg-surface border-line text-text-main'}`}>
            {f === 'open' ? 'In progress' : 'All claims'}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {loading ? <p className="p-6 text-sm text-text-muted">Loading claims…</p> : claims.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No claims here" description="File a claim from any issued invoice using “Insurance claim”." />
        ) : (
          <ul className="divide-y divide-line">
            {claims.map(c => (
              <li key={c.id} className="px-4 sm:px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-text-main">{c.patientName || 'Patient'}</div>
                    <div className="text-[13px] text-text-muted">
                      {c.providerName}{c.policyNumber ? `, policy ${c.policyNumber}` : ''}, filed {format(parseISO(c.submittedAt), 'd MMM yyyy')}
                    </div>
                    <button onClick={() => setOpenInvoice(c.invoiceId)} className="text-[13px] font-medium text-primary hover:underline">
                      {c.invoiceNumber || 'View invoice'}
                    </button>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-semibold tabular">{formatCurrency(c.approvedAmount ?? c.claimAmount)}</div>
                    {c.approvedAmount != null && c.approvedAmount !== c.claimAmount && (
                      <div className="text-xs text-text-muted line-through tabular">{formatCurrency(c.claimAmount)}</div>
                    )}
                    <Badge variant={VARIANT[c.status]}>{c.status}</Badge>
                  </div>
                </div>
                {editing === c.id ? (
                  <div className="mt-3 rounded-control bg-surface-hover border border-line p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                    <label className="block">
                      <span className="block text-xs text-text-muted mb-1">New status</span>
                      <select value={nextStatus} onChange={e => setNextStatus(e.target.value as InsuranceClaimStatus)} className="w-full h-10 px-3 border border-line rounded-control text-sm bg-surface">
                        {STATUSES.filter(s => s !== c.status).map(s => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                    {(nextStatus === 'Approved' || nextStatus === 'Paid') && (
                      <label className="block">
                        <span className="block text-xs text-text-muted mb-1">Approved amount</span>
                        <input type="number" min={0} max={c.claimAmount} value={approved} onChange={e => setApproved(Number(e.target.value) || 0)} className="w-full h-10 px-3 border border-line rounded-control text-sm" />
                      </label>
                    )}
                    <Button onClick={() => save(c)} loading={saving}>Save</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    {nextStatus === 'Paid' && <p className="sm:col-span-4 text-[13px] text-text-muted">The approved amount will be recorded as an insurance payment on the invoice.</p>}
                    {error && <p className="sm:col-span-4 text-sm text-error">{error}</p>}
                  </div>
                ) : c.status !== 'Paid' && c.status !== 'Rejected' && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => startEdit(c)}>Update status</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {openInvoice && <InvoicePreviewModal invoiceId={openInvoice} onClose={() => setOpenInvoice(null)} onChanged={load} />}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MessageCircle, Wallet } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { getOutstandingReport, OutstandingReport } from '../../api/billingService';
import { formatCurrency } from '../../utils/currencyConfig';

const BUCKET_LABEL: Record<string, string> = {
  current: 'Not yet due',
  '1-30': '1–30 days late',
  '31-60': '31–60 days late',
  '61-90': '61–90 days late',
  '90+': 'Over 90 days late',
};

/** WhatsApp click-to-chat link with a polite reminder pre-written. */
function whatsappLink(phone: string, name: string, amount: number) {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  const text = `Hello ${name.split(' ')[0]}, this is a gentle reminder that ${formatCurrency(amount)} is due for your dental treatment. You can pay at the clinic or reply here for a UPI link. Thank you!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function OutstandingBalances() {
  const { selectedClinicId } = useAuth();
  const [report, setReport] = useState<OutstandingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    getOutstandingReport(selectedClinicId).then(res => {
      setReport(res.data);
      setError(res.error?.message || null);
    });
  }, [selectedClinicId]);

  if (error) return <Card className="p-6 text-sm text-error">{error}</Card>;
  if (!report) return <Card className="p-6 space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-24 w-full" /></Card>;

  const max = Math.max(...report.buckets.map(b => b.amount), 1);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[17px] font-semibold text-text-main">Money owed to the clinic</h2>
          <span className="text-xl font-semibold tabular text-text-main">{formatCurrency(report.total)}</span>
        </div>
        <div className="space-y-2.5">
          {report.buckets.map(b => (
            <div key={b.bucket} className="grid grid-cols-[120px_1fr_auto] sm:grid-cols-[150px_1fr_120px] items-center gap-3 text-sm">
              <span className="text-text-muted">{BUCKET_LABEL[b.bucket] || b.bucket}</span>
              <div className="h-2 rounded-full bg-base overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${b.bucket === 'current' ? 'bg-accent' : b.bucket === '1-30' ? 'bg-warning' : 'bg-error'}`}
                  style={{ width: `${(b.amount / max) * 100}%` }}
                />
              </div>
              <span className="text-right tabular text-text-main">{formatCurrency(b.amount)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-[17px] font-semibold text-text-main">Patients to follow up</h2>
          <p className="text-[13px] text-text-muted">Longest overdue first</p>
        </div>
        {report.patients.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing outstanding" description="Every issued invoice has been paid." />
        ) : (
          <ul className="divide-y divide-line">
            {report.patients.map(p => (
              <li key={p.patientId} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <Link to={`/patients/${p.patientId}`} className="text-[15px] font-medium text-text-main hover:text-primary">{p.patientName}</Link>
                  <div className="text-[13px] text-text-muted">
                    {p.invoiceCount} invoice{p.invoiceCount > 1 ? 's' : ''}
                    {p.maxDaysOverdue > 0 ? <span className="text-error">, {p.maxDaysOverdue} days late</span> : ', not yet due'}
                  </div>
                </div>
                <div className="text-[15px] font-semibold tabular text-text-main shrink-0">{formatCurrency(p.balance)}</div>
                {p.phone && (
                  <div className="flex gap-1 shrink-0">
                    <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="p-2 rounded-control text-text-muted hover:text-primary hover:bg-base" aria-label={`Call ${p.patientName}`}>
                      <Phone className="w-4 h-4" />
                    </a>
                    <a href={whatsappLink(p.phone, p.patientName, p.balance)} target="_blank" rel="noreferrer"
                      className="p-2 rounded-control text-text-muted hover:text-success hover:bg-base" aria-label={`Send ${p.patientName} a WhatsApp reminder`}>
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

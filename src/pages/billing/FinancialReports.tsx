import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { getRevenueReport, RevenueReport } from '../../api/billingService';
import { useCurrency } from '../../utils/currencyConfig';

export function FinancialReports() {
  const { selectedClinicId, user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [months, setMonths] = useState(6);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    getRevenueReport({ clinicId: selectedClinicId, months }).then(res => {
      setReport(res.data);
      setError(res.error?.message || null);
    });
  }, [selectedClinicId, months]);

  if (user?.role === 'receptionist' || user?.role === 'dentist') {
    return <Card className="p-6 text-sm text-text-muted">Financial reports are available to clinic admins.</Card>;
  }
  if (error) return <Card className="p-6 text-sm text-error">{error}</Card>;
  if (!report) return <Card className="p-6 space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-64 w-full" /></Card>;

  const collectionRate = report.totalBilled > 0 ? Math.round((report.totalCollected / report.totalBilled) * 100) : 0;
  const methodTotal = report.byMethod.reduce((s, m) => s + m.amount, 0) || 1;

  const exportCsv = () => {
    const rows = [['Month', 'Billed', 'Collected'], ...report.trend.map(t => [t.month, t.billed, t.revenue])];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dentassist-revenue-${months}m.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[3, 6, 12].map(m => (
            <button key={m} onClick={() => setMonths(m)}
              className={`h-8 px-3 rounded-full text-[13px] font-medium border ${months === m ? 'bg-primary text-white border-primary' : 'bg-surface border-line text-text-main'}`}>
              {m} months
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4" /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4"><div className="text-[13px] text-text-muted">Collected</div><div className="text-2xl font-semibold tabular mt-1">{formatCurrency(report.totalCollected)}</div></Card>
        <Card className="p-4"><div className="text-[13px] text-text-muted">Billed</div><div className="text-2xl font-semibold tabular mt-1">{formatCurrency(report.totalBilled)}</div></Card>
        <Card className="p-4"><div className="text-[13px] text-text-muted">Collected vs billed</div><div className="text-2xl font-semibold tabular mt-1">{collectionRate}%</div></Card>
      </div>

      <Card className="p-5">
        <h2 className="text-[17px] font-semibold text-text-main mb-4">Billed and collected by month</h2>
        <div className="h-[260px] sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="#DCE5E6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#5B6E71', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} width={56} tick={{ fill: '#5B6E71', fontSize: 12 }}
                tickFormatter={v => formatCurrency(v, { notation: 'compact' })} />
              <Tooltip
                cursor={{ fill: 'rgba(18,165,148,0.06)' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #DCE5E6', fontSize: 13 }}
                formatter={(v: number, name: string) => [formatCurrency(v), name === 'revenue' ? 'Collected' : 'Billed']}
              />
              <Legend formatter={v => (v === 'revenue' ? 'Collected' : 'Billed')} wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="billed" fill="#C3D0D2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="revenue" fill="#12A594" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-[17px] font-semibold text-text-main mb-4">How patients paid</h2>
          {report.byMethod.length === 0 ? <p className="text-sm text-text-muted">No payments in this period.</p> : (
            <ul className="space-y-3">
              {report.byMethod.map(m => (
                <li key={m.method}>
                  <div className="flex justify-between text-sm mb-1"><span>{m.method}</span><span className="tabular">{formatCurrency(m.amount)}</span></div>
                  <div className="h-2 rounded-full bg-base overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${(m.amount / methodTotal) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {report.byClinic.length > 1 && (
          <Card className="p-5">
            <h2 className="text-[17px] font-semibold text-text-main mb-4">Collected by clinic</h2>
            <ul className="divide-y divide-line">
              {report.byClinic.map(c => (
                <li key={c.clinicId} className="flex justify-between py-2.5 text-sm"><span>{c.name}</span><span className="tabular font-medium">{formatCurrency(c.amount)}</span></li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

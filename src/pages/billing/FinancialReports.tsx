import React, { useState } from 'react';
import { mockPayments } from '../../data/mockPayments';
import { mockInvoices } from '../../data/mockInvoices';
import { mockTreatmentPlans } from '../../data/mockTreatmentPlans';
import { mockStaff as mockUsers } from '../../data/mockStaff';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Download, TrendingUp, IndianRupee, PieChart as PieChartIcon, BarChart3, User, Activity } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useCurrency } from '../../utils/currencyConfig';

export function FinancialReports() {
  const { selectedClinicId } = useAuth();
  const { formatCurrency, symbol } = useCurrency();
  
  const clinicPayments = selectedClinicId === 'all' ? mockPayments : mockPayments.filter(p => {
    const inv = mockInvoices.find(i => i.id === p.invoiceId);
    return inv?.clinicId === selectedClinicId;
  });

  const clinicInvoices = selectedClinicId === 'all' ? mockInvoices : mockInvoices.filter(i => i.clinicId === selectedClinicId);

  // Total Revenue (Collected)
  const totalRevenue = clinicPayments.reduce((sum, p) => sum + p.amount, 0);
  
  // Total Outstanding
  const totalOutstanding = clinicInvoices
    .filter(i => i.status === 'Sent' || i.status === 'Partially Paid' || i.status === 'Overdue')
    .reduce((sum, i) => sum + i.total, 0) - clinicPayments.reduce((sum, p) => sum + p.amount, 0); // Simplified outstanding calc

  // Revenue by Month (Last 6 months)
  const revenueByMonth = Array.from({ length: 6 }).map((_, i) => {
    const d = subMonths(new Date(), 5 - i);
    const monthStr = format(d, 'MMM yyyy');
    const monthPayments = clinicPayments.filter(p => {
      const pDate = parseISO(p.paidAt);
      return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear();
    });
    return {
      name: monthStr,
      revenue: monthPayments.reduce((sum, p) => sum + p.amount, 0)
    };
  });

  // Payment Methods
  const methodColors: Record<string, string> = {
    'UPI': '#3b82f6',
    'Card': '#8b5cf6',
    'Cash': '#10b981',
    'Bank Transfer': '#f59e0b',
    'Insurance': '#ec4899'
  };

  const paymentMethods = clinicPayments.reduce((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(paymentMethods).map(([name, value]) => ({ name, value }));

  // Revenue by Procedure Type
  const procedureRevenueMap = clinicInvoices.reduce((acc, inv) => {
    inv.lineItems.forEach(item => {
      acc[item.procedureName] = (acc[item.procedureName] || 0) + item.total;
    });
    return acc;
  }, {} as Record<string, number>);

  const procedureData = Object.entries(procedureRevenueMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5); // Top 5 procedures

  // Revenue by Dentist
  const dentistRevenueMap = clinicInvoices.reduce((acc, inv) => {
    if (inv.treatmentPlanId) {
      const tp = mockTreatmentPlans.find(t => t.id === inv.treatmentPlanId);
      if (tp) {
        const dentist = mockUsers.find(u => u.id === tp.createdByStaffId);
        const name = dentist ? `${dentist.firstName} ${dentist.lastName}` : 'Unknown';
        acc[name] = (acc[name] || 0) + inv.total;
      }
    }
    return acc;
  }, {} as Record<string, number>);

  const dentistData = Object.entries(dentistRevenueMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-line shadow-panel">
        <div>
          <h2 className="text-xl font-bold text-text-main">Financial Overview</h2>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 flex flex-col justify-center">
          <div className="flex items-center gap-3 text-primary mb-2">
            <span className="w-5 h-5 flex items-center justify-center font-bold text-lg">{symbol}</span>
            <h3 className="font-semibold">Total Revenue Collected</h3>
          </div>
          <p className="text-4xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
        </div>
        
        <div className="bg-error/5 border border-error/20 rounded-xl p-6 flex flex-col justify-center">
          <div className="flex items-center gap-3 text-error mb-2">
            <TrendingUp className="w-5 h-5" />
            <h3 className="font-semibold">Total Outstanding</h3>
          </div>
          <p className="text-4xl font-bold text-error">{formatCurrency(Math.max(0, totalOutstanding))}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-line shadow-panel p-6">
          <h3 className="font-bold text-text-main mb-6 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-text-muted" /> 6-Month Revenue Trend
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => formatCurrency(val, {notation: 'compact'})} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-line shadow-panel p-6">
          <h3 className="font-bold text-text-main mb-6 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-text-muted" /> Revenue by Payment Method
          </h3>
          <div className="h-64 flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={methodColors[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-text-muted">No payment data available.</p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {pieData.map(entry => (
              <div key={entry.name} className="flex items-center gap-2 text-xs text-text-main">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: methodColors[entry.name] || '#94a3b8' }}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-line shadow-panel p-6">
          <h3 className="font-bold text-text-main mb-6 flex items-center gap-2">
            <Activity className="w-4 h-4 text-text-muted" /> Top 5 Procedures by Revenue
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={procedureData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => formatCurrency(val, {notation: "compact"})} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} width={120} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-line shadow-panel p-6">
          <h3 className="font-bold text-text-main mb-6 flex items-center gap-2">
            <User className="w-4 h-4 text-text-muted" /> Revenue by Dentist
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dentistData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(val) => formatCurrency(val, {notation: 'compact'})} />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' }}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-line shadow-panel overflow-hidden">
        <div className="p-4 border-b border-line bg-base">
          <h3 className="font-bold text-text-main">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-hover border-b border-line text-text-muted text-[13px] font-medium">
              <tr>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clinicPayments.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()).slice(0, 10).map((payment) => {
                const invoice = clinicInvoices.find(i => i.id === payment.invoiceId);
                return (
                  <tr key={payment.id} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="px-6 py-4 text-text-muted">
                      {format(parseISO(payment.paidAt), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-6 py-4 font-medium text-text-main">
                      {invoice?.invoiceNumber}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border border-line bg-base">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: methodColors[payment.method] || '#94a3b8' }}></span>
                        {payment.method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {payment.referenceNumber || '-'}
                    </td>
                    <td className="px-6 py-4 font-bold text-success text-right">
                      {formatCurrency(payment.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

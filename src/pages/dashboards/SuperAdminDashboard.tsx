import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UserPlus, Building, Calendar, Wallet } from 'lucide-react';
import { useCurrency } from '../../utils/currencyConfig';
import { format } from 'date-fns';
import { PageHeader, greeting } from '../../components/ui/PageHeader';
import { StatTile } from '../../components/ui/StatTile';

export function SuperAdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    if (!user) return;
    getDashboardStats('super_admin').then(res => {
      setData(res.data);
      setError(res.error?.message || null);
      setLoading(false);
    });
  }, [user]);

  const header = (
    <PageHeader
      title={greeting(user?.firstName)}
      description={`All clinics, ${format(new Date(), 'EEEE d MMMM')}`}
    />
  );

  if (!loading && !data) {
    return (
      <div>
        {header}
        <Card className="p-6 text-sm text-error">{error || 'The dashboard could not be loaded. Refresh to try again.'}</Card>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        <div className="md:col-span-2 lg:col-span-3"><SkeletonCard /></div>
        <div className="md:col-span-2 lg:col-span-1"><SkeletonCard /></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {header}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Active clinics" value={data.totalClinics} icon={Building} to="/clinics" />
        <StatTile label="Patients" value={data.activePatients.toLocaleString()} icon={UserPlus} to="/patients" />
        <StatTile label="Appointments today" value={data.todayAppointments} icon={Calendar} to="/appointments" />
        <StatTile label="Revenue this month" value={formatCurrency(data.revenueTrend.length ? data.revenueTrend[data.revenueTrend.length - 1].revenue : 0)} icon={Wallet} to="/billing" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>All clinics, last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {data.revenueTrend.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center rounded-control bg-surface-hover text-sm text-text-muted text-center px-6">
                Revenue appears here once invoices are recorded.
              </div>
            ) : (
            <div className="h-[240px] sm:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#DCE5E6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#5A6B6E', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#5A6B6E', fontSize: 12}} tickFormatter={(val) => formatCurrency(val, {notation: "compact"})} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '10px', border: '1px solid #DCE5E6', boxShadow: '0 12px 32px -8px rgb(11 54 64 / 0.18)', fontSize: 13 }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#12A594" strokeWidth={2.5} dot={{r: 3, fill: '#12A594', strokeWidth: 2, stroke: '#FFFFFF'}} activeDot={{r: 5}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Top Clinics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.topClinics.map((clinic: any, i: number) => (
                  <div key={clinic.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-base flex items-center justify-center font-bold text-xs text-text-muted">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-main">{clinic.name}</p>
                        <p className="text-xs text-text-muted">{clinic.patients} patients</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-text-main tabular">{formatCurrency(clinic.revenue)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
                            <div className="space-y-4">
                {data.recentActivity.length === 0 && <p className="text-sm text-text-muted">Changes made by your team will show here.</p>}
                {data.recentActivity.map((activity: any) => (
                  <div key={activity.id} className="relative pl-6">
                    <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-accent"></div>
                    <p className="text-sm text-text-main">{activity.text}</p>
                    <p className="text-xs text-text-muted mt-0.5">{activity.time}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

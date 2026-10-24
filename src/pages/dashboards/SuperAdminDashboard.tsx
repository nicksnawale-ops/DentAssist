import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UserPlus, Building, Calendar, Wallet } from 'lucide-react';
import { useCurrency } from '../../utils/currencyConfig';

export function SuperAdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    if (!user) return;
    getDashboardStats('super_admin').then(res => {
      setData(res.data);
      setLoading(false);
    });
  }, [user]);

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Organization Overview</h1>
          <p className="text-sm text-text-muted">Welcome back! Here's what's happening across all clinics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Total Clinics</p>
                <h3 className="text-3xl font-bold text-text-main">{data.totalClinics}</h3>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Building className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Active Patients</p>
                <h3 className="text-3xl font-bold text-text-main">{data.activePatients.toLocaleString()}</h3>
              </div>
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center text-accent">
                <UserPlus className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Today's Appointments</p>
                <h3 className="text-3xl font-bold text-text-main">{data.todayAppointments}</h3>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success">
                <Calendar className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Monthly Revenue</p>
                <h3 className="text-3xl font-bold text-text-main">{formatCurrency(data.revenueTrend[data.revenueTrend.length - 1].revenue)}</h3>
              </div>
              <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center text-warning">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Aggregate revenue across all clinics over the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#5A6B6E', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#5A6B6E', fontSize: 12}} tickFormatter={(val) => formatCurrency(val, {notation: "compact"})} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#0F4C5C" strokeWidth={3} dot={{r: 4, fill: '#0F4C5C', strokeWidth: 2, stroke: '#FFFFFF'}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
                    <span className="text-sm font-medium text-success">{formatCurrency(clinic.revenue)}</span>
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
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-text-muted/10 before:to-transparent hidden pb-4" /> {/* Just a spacer hack to keep DOM clean */}
              <div className="space-y-4">
                {data.recentActivity.map((activity: any) => (
                  <div key={activity.id} className="relative pl-6">
                    <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-primary ring-4 ring-primary/10"></div>
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

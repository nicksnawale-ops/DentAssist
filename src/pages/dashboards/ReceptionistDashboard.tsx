import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Users, AlertTriangle, CreditCard, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export function ReceptionistDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDashboardStats('receptionist').then(res => {
      setData(res.data);
      setLoading(false);
    });
  }, [user]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SkeletonCard /><SkeletonCard />
        <div className="md:col-span-2"><SkeletonCard /></div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'checked-in': return <Badge variant="success">Checked In</Badge>;
      case 'waiting': return <Badge variant="warning">Waiting</Badge>;
      case 'in-progress': return <Badge variant="secondary">In Progress</Badge>;
      case 'completed': return <Badge variant="default">Completed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Front Desk Dashboard</h1>
          <p className="text-sm text-text-muted">Manage today's patient queue and clinic operations.</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Quick Add Appointment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center text-warning">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Pending Payments</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-text-main">{data.pendingPayments}</h3>
                  <span className="text-xs text-text-muted">requires action</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center text-error">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Low Inventory Alerts</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-2xl font-bold text-text-main">{data.lowInventoryItems}</h3>
                  <span className="text-xs text-text-muted">items below threshold</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today's Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text-muted">
              <thead className="text-xs text-text-muted uppercase bg-base/50">
                <tr>
                  <th className="px-6 py-3 font-semibold">Time</th>
                  <th className="px-6 py-3 font-semibold">Patient Name</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text-muted/10">
                {data.queue.length > 0 ? (
                  data.queue.map((item: any) => (
                    <tr key={item.id} className="hover:bg-base/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-text-main">{item.time}</td>
                      <td className="px-6 py-4">{item.patientName}</td>
                      <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm">Manage</Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12">
                      <EmptyState
                        icon={Users}
                        title="Queue is Empty"
                        description="There are no patients scheduled for today."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCurrency } from '../../utils/currencyConfig';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Users, FileText, DollarSign, Clock, AlertTriangle } from 'lucide-react';

export function DentistDashboard() {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDashboardStats('dentist').then(res => {
      setData(res.data);
      setLoading(false);
    });
  }, [user]);

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
        <div className="md:col-span-2"><SkeletonCard /></div>
        <div className="md:col-span-1"><SkeletonCard /></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-main tracking-tight">Dr. {user?.lastName}'s Dashboard</h1>
        <p className="text-sm text-text-muted">Here is your daily overview and schedule.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Patients This Week</p>
                <h3 className="text-3xl font-bold text-text-main">{data.patientsSeenThisWeek}</h3>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Pending Plans</p>
                <h3 className="text-3xl font-bold text-text-main">{data.pendingTreatmentPlans}</h3>
              </div>
              <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center text-warning">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Low Inventory</p>
                <h3 className="text-3xl font-bold text-error">{data.lowInventoryItems}</h3>
              </div>
              <div className="w-12 h-12 bg-error/10 rounded-full flex items-center justify-center text-error">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted mb-1">Today's Revenue</p>
                <h3 className="text-3xl font-bold text-text-main">{formatCurrency(data.todayRevenue)}</h3>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center text-success">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today's Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.todaySchedule.map((appt: any) => (
                <div key={appt.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-text-muted/10 hover:bg-base/50 transition-colors">
                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                    <div className="flex flex-col items-center justify-center bg-primary/5 text-primary rounded-lg px-3 py-2 min-w-[80px]">
                      <Clock className="w-4 h-4 mb-1" />
                      <span className="text-xs font-semibold">{appt.time}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-text-main">{appt.patientName}</p>
                      <p className="text-sm text-text-muted">{appt.procedure}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">View File</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div>
          <Card className="bg-primary text-white border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-white">Next Patient</CardTitle>
            </CardHeader>
            <CardContent>
              <h3 className="text-2xl font-bold mb-1">{data.nextPatient.name}</h3>
              <p className="text-primary-100 mb-4">{data.nextPatient.time} • {data.nextPatient.procedure}</p>
              
              <div className="bg-white/10 p-4 rounded-xl">
                <p className="text-xs text-primary-100 uppercase tracking-wider font-semibold mb-1">Notes</p>
                <p className="text-sm">{data.nextPatient.notes}</p>
              </div>

              <button className="w-full mt-6 bg-white text-primary font-semibold py-2.5 rounded-lg hover:bg-white/90 transition-colors">
                Start Session
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

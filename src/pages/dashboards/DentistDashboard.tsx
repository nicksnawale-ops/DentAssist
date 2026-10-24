import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useCurrency } from '../../utils/currencyConfig';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader, greeting } from '../../components/ui/PageHeader';
import { StatTile } from '../../components/ui/StatTile';
import { Users, FileText, Wallet, AlertTriangle, CalendarCheck, ChevronRight, ShieldAlert } from 'lucide-react';

interface ScheduleItem {
  id: string;
  patientId?: string;
  time: string;
  patientName: string;
  procedure: string;
  status?: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'secondary' | 'success' | 'outline' | 'warning' }> = {
  in_progress: { label: 'In chair', variant: 'secondary' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  scheduled: { label: 'Booked', variant: 'outline' },
  completed: { label: 'Done', variant: 'outline' },
};

export function DentistDashboard() {
  const { formatCurrency } = useCurrency();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDashboardStats('dentist').then(res => {
      setData(res.data);
      setError(res.error?.message || null);
      setLoading(false);
    });
  }, [user]);

  const header = (
    <PageHeader
      title={greeting(user?.lastName ? `Dr. ${user.lastName}` : user?.firstName)}
      description={format(new Date(), 'EEEE, d MMMM')}
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <SkeletonCard />
          <div className="lg:col-span-2"><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        {header}
        <Card className="p-6 text-sm text-error">{error || 'The dashboard could not be loaded. Refresh to try again.'}</Card>
      </div>
    );
  }

  const schedule: ScheduleItem[] = data.todaySchedule || [];
  const next = data.nextPatient;

  return (
    <div>
      {header}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
        {/* Next patient: the one thing a dentist needs between appointments */}
        <section className="rounded-panel bg-ink text-white p-5 sm:p-6 flex flex-col" aria-labelledby="next-patient">
          <h2 id="next-patient" className="text-sm text-white/60 mb-3">Next patient</h2>
          {next ? (
            <>
              <div className="text-[22px] font-semibold leading-tight">{next.name}</div>
              <div className="mt-1 text-[15px] text-white/75">
                <time>{next.time}</time>, {next.procedure}
              </div>
              <div className="mt-5 flex items-start gap-3 rounded-control bg-white/[0.07] p-3.5">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-white/85">{next.notes}</p>
              </div>
              <div className="mt-auto pt-5">
                <Link
                  to={next.patientId ? `/patients/${next.patientId}` : '/patients'}
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 h-11 px-5 rounded-control bg-accent text-ink font-semibold hover:bg-accent/90"
                >
                  Open patient record
                </Link>
              </div>
            </>
          ) : (
            <p className="text-[15px] text-white/75">No more patients today.</p>
          )}
        </section>

        {/* Today's schedule */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="text-[17px] font-semibold text-text-main">Today's schedule</h2>
            <span className="text-[13px] text-text-muted">{schedule.length} booked</span>
          </div>
          {schedule.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Nothing booked today" description="Your appointments for today will appear here." />
          ) : (
            <ol className="divide-y divide-line">
              {schedule.map(appt => {
                const status = appt.status ? STATUS_LABEL[appt.status] : undefined;
                const isNow = appt.status === 'in_progress';
                return (
                  <li key={appt.id}>
                    <Link
                      to={appt.patientId ? `/patients/${appt.patientId}` : '/patients'}
                      className={`flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover ${isNow ? 'bg-accent/[0.06]' : ''}`}
                    >
                      <time className="w-[72px] shrink-0 text-sm font-medium text-text-main">{appt.time}</time>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-text-main truncate">{appt.patientName}</div>
                        <div className="text-[13px] text-text-muted truncate">{appt.procedure}</div>
                      </div>
                      {status && <Badge variant={status.variant} className="hidden sm:inline-flex">{status.label}</Badge>}
                      <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Seen this week" value={data.patientsSeenThisWeek} icon={Users} />
        <StatTile label="Plans awaiting approval" value={data.pendingTreatmentPlans} icon={FileText} to="/treatments" />
        <StatTile label="Billed today" value={formatCurrency(data.todayRevenue || 0)} icon={Wallet} />
        <StatTile
          label="Low stock items"
          value={data.lowInventoryItems}
          icon={AlertTriangle}
          tone={data.lowInventoryItems > 0 ? 'error' : undefined}
          to="/inventory"
        />
      </div>
    </div>
  );
}

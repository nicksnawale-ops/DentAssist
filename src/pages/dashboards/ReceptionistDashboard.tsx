import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { getDashboardStats } from '../../api/apiService';
import { Card } from '../../components/ui/Card';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Users, AlertTriangle, CreditCard, Plus, ChevronRight, UserPlus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader, greeting } from '../../components/ui/PageHeader';
import { StatTile as Stat } from '../../components/ui/StatTile';
import { BookingLinkCard } from '../../components/scheduling/BookingLinkCard';

interface QueueItem {
  id: string;
  patientId?: string;
  patientName: string;
  time: string;
  status: 'waiting' | 'checked-in' | 'in-progress' | 'completed' | string;
}

const STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'secondary' | 'outline' }> = {
  waiting: { label: 'Waiting', variant: 'warning' },
  'checked-in': { label: 'Checked in', variant: 'success' },
  'in-progress': { label: 'In chair', variant: 'secondary' },
  completed: { label: 'Done', variant: 'outline' },
};

export function ReceptionistDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDashboardStats('receptionist').then(res => {
      setData(res.data);
      setError(res.error?.message || null);
      setLoading(false);
    });
  }, [user]);

  const header = (
    <PageHeader
      title={greeting(user?.firstName)}
      description={format(new Date(), 'EEEE, d MMMM')}
      actions={
        <>
          <Button variant="outline" onClick={() => navigate('/patients')}>
            <UserPlus className="w-4 h-4" /> Register patient
          </Button>
          <Button onClick={() => navigate('/appointments?new=1')}>
            <Plus className="w-4 h-4" /> New appointment
          </Button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <SkeletonCard /><SkeletonCard />
          <div className="md:col-span-2"><SkeletonCard /></div>
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

  const queue: QueueItem[] = data.queue || [];
  const waiting = queue.filter(q => q.status === 'waiting' || q.status === 'checked-in').length;
  const done = queue.filter(q => q.status === 'completed').length;

  return (
    <div>
      {header}

      {/* Today at a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat label="Booked today" value={queue.length} icon={Users} />
        <Stat label="Waiting now" value={waiting} icon={Users} tone="accent" />
        <Stat
          label="Unpaid balances"
          value={data.pendingPayments}
          icon={CreditCard}
          tone={data.pendingPayments > 0 ? 'warning' : undefined}
          to="/billing"
        />
        <Stat
          label="Low stock items"
          value={data.lowInventoryItems}
          icon={AlertTriangle}
          tone={data.lowInventoryItems > 0 ? 'error' : undefined}
          to="/inventory"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
      <Card className="overflow-hidden xl:col-span-2">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-[17px] font-semibold text-text-main">Today's queue</h2>
            <p className="text-[13px] text-text-muted">{done} of {queue.length} seen</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/appointments')}>
            Open calendar
          </Button>
        </div>

        {queue.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No one is booked for today"
            description="New bookings for today will appear here as they come in."
            actionLabel="New appointment"
            onAction={() => navigate('/appointments?new=1')}
          />
        ) : (
          <ul className="divide-y divide-line">
            {queue.map(item => {
              const status = STATUS[item.status] || { label: item.status, variant: 'outline' as const };
              const row = (
                <>
                  <time className="w-[72px] shrink-0 text-sm font-medium text-text-main">{item.time}</time>
                  <span className="flex-1 min-w-0 text-[15px] text-text-main truncate">{item.patientName}</span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
                </>
              );
              return (
                <li key={item.id}>
                  <Link
                    to={item.patientId ? `/patients/${item.patientId}` : '/appointments'}
                    className="flex items-center gap-3 sm:gap-4 px-5 py-3.5 hover:bg-surface-hover focus-visible:bg-surface-hover"
                  >
                    {row}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {user?.clinicId && <BookingLinkCard clinicId={user.clinicId} />}
      </div>
    </div>
  );
}

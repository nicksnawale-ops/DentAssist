import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { toast } from '../ui/useToast';
import { AttendanceDay, checkIn, checkOut, getMyToday } from '../../api/teamService';

/** Header button for staff to check in and out for the day. */
export function CheckInButton() {
  const [today, setToday] = useState<AttendanceDay | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getMyToday().then(r => setToday(r.error ? undefined : r.data)); }, []);
  if (today === undefined) return null;

  const act = async () => {
    setBusy(true);
    const res = today?.checkInAt ? await checkOut() : await checkIn();
    setBusy(false);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not record', variant: 'error' });
    setToday(res.data);
    toast(res.data.checkOutAt
      ? { title: `Checked out. ${res.data.hours ?? ''} hours today.`, variant: 'success' }
      : { title: res.data.lateMinutes ? `Checked in, ${res.data.lateMinutes} min late` : 'Checked in. Have a good day!', variant: 'success' });
  };

  if (today?.checkOutAt) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-control text-[12px] text-text-muted" title="Today's attendance">
        <Clock className="w-4 h-4" /> {today.hours ?? 0} h today
      </span>
    );
  }
  if (today && today.status !== 'present' && today.status !== 'half_day') return null; // on leave or a holiday

  const inAt = today?.checkInAt ? format(parseISO(today.checkInAt), 'h:mm a') : null;
  return (
    <button onClick={act} disabled={busy}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-control text-[13px] font-medium border transition-colors ${inAt ? 'border-line text-text-main hover:bg-surface-hover' : 'border-accent/40 bg-accent/[0.08] text-accent hover:bg-accent/[0.14]'}`}
      title={inAt ? `Checked in at ${inAt}` : 'Record your arrival'}>
      {inAt ? <LogOut className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
      <span className="hidden sm:inline">{inAt ? `Check out · in ${inAt}` : 'Check in'}</span>
    </button>
  );
}

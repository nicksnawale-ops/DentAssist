import React from 'react';
import { AlertCircle } from 'lucide-react';
import { differenceInMinutes, format, getHours, getMinutes, parseISO } from 'date-fns';
import { Appointment, Patient } from '../../types';
import { useNowMinutes } from './useFitHeight';

/** Shared pieces of the day and week views. The grid stretches to its container's height. */
export const START_HOUR = 8;
export const END_HOUR = 20;
export const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;
export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

export const pct = (minutesFromStart: number) => `${(Math.min(Math.max(minutesFromStart, 0), TOTAL_MINUTES) / TOTAL_MINUTES) * 100}%`;

export function minutesFromStart(iso: string) {
  const d = parseISO(iso);
  return (getHours(d) - START_HOUR) * 60 + getMinutes(d);
}

export function hourLabel(hour: number, short = false) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? (short ? 'a' : ' AM') : (short ? 'p' : ' PM');
  return `${h}${suffix}`;
}

/** Time from a click inside a column, rounded down to 15 minutes. */
export function clickedTime(e: React.MouseEvent<HTMLElement>, day: Date): Date {
  const rect = e.currentTarget.getBoundingClientRect();
  const minutes = Math.max(0, Math.min(TOTAL_MINUTES - 15, ((e.clientY - rect.top) / rect.height) * TOTAL_MINUTES));
  const total = START_HOUR * 60 + Math.floor(minutes / 15) * 15;
  const d = new Date(day);
  d.setHours(Math.floor(total / 60), total % 60, 0, 0);
  return d;
}

/** Left column with hour labels. Labels sit on their line; the first one is nudged inside the grid. */
export function TimeColumn({ headerHeight, short = false }: { headerHeight: string; short?: boolean }) {
  return (
    <div className="w-14 md:w-16 flex-none flex flex-col border-r border-line bg-surface">
      <div className={`${headerHeight} flex-none border-b border-line`} />
      <div className="relative flex-1">
        {HOURS.map((hour, i) => (
          <div key={hour} className={`absolute right-2 text-[11px] font-medium text-text-muted tabular-nums ${i === 0 ? 'translate-y-0.5' : '-translate-y-1/2'}`}
            style={{ top: pct((hour - START_HOUR) * 60) }}>
            {hourLabel(hour, short)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hour lines (solid) and half-hour lines (faint) across the grid. */
export function HourLines() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {HOURS.map(hour => (
        <React.Fragment key={hour}>
          {hour !== START_HOUR && <div className="absolute inset-x-0 border-t border-line/70" style={{ top: pct((hour - START_HOUR) * 60) }} />}
          <div className="absolute inset-x-0 border-t border-dashed border-line/40" style={{ top: pct((hour - START_HOUR) * 60 + 30) }} />
        </React.Fragment>
      ))}
    </div>
  );
}

/** Red line at the current time, for today's column. */
export function NowLine({ withDot = true }: { withDot?: boolean }) {
  const now = useNowMinutes() - START_HOUR * 60;
  if (now < 0 || now > TOTAL_MINUTES) return null;
  return (
    <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: pct(now) }} aria-hidden="true">
      <div className="relative border-t-2 border-error/80">
        {withDot && <span className="absolute -left-1 -top-[5px] w-2 h-2 rounded-full bg-error" />}
      </div>
    </div>
  );
}

/** Shaded areas outside working hours (or the whole column when off duty). */
export function OffHours({ start, end, offDuty }: { start: number; end: number; offDuty: boolean }) {
  if (offDuty) {
    return (
      <div className="absolute inset-0 pointer-events-none bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(15,23,42,0.035)_6px,rgba(15,23,42,0.035)_12px)] flex items-center justify-center">
        <span className="text-[11px] font-semibold tracking-[0.2em] text-text-muted/50">OFF DUTY</span>
      </div>
    );
  }
  return (
    <>
      {start > 0 && <div className="absolute inset-x-0 top-0 bg-text-muted/[0.045] pointer-events-none" style={{ height: pct(start) }} />}
      {end < TOTAL_MINUTES && <div className="absolute inset-x-0 bottom-0 bg-text-muted/[0.045] pointer-events-none" style={{ top: pct(end) }} />}
    </>
  );
}

export const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-teal-50 text-teal-900 border-l-teal-500',
  confirmed: 'bg-blue-50 text-blue-900 border-l-blue-500',
  in_progress: 'bg-amber-50 text-amber-900 border-l-amber-500',
  completed: 'bg-green-50 text-green-900 border-l-green-500',
  cancelled: 'bg-gray-50 text-gray-500 border-l-gray-400 line-through',
  no_show: 'bg-red-50 text-red-900 border-l-red-500',
};

/** One appointment block. Short slots show a single line; longer ones add the procedure and time. */
export function AppointmentBlock({ appt, patient, compact = false }: { appt: Appointment; patient?: Patient; compact?: boolean }) {
  const minutes = differenceInMinutes(parseISO(appt.endTime), parseISO(appt.startTime));
  const flagged = !!patient?.medicalHistory && ((patient.medicalHistory.allergies?.length || 0) > 0 || (patient.medicalHistory.chronicConditions?.length || 0) > 0);
  const name = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';
  const time = `${format(parseISO(appt.startTime), 'h:mm')}–${format(parseISO(appt.endTime), 'h:mm a')}`;
  const oneLine = minutes <= 30;
  return (
    <div title={`${name} · ${appt.procedureType} · ${time}`}
      className={`w-full h-full rounded-[6px] border-l-[3px] ring-1 ring-black/[0.04] shadow-[0_1px_2px_rgba(15,23,42,0.06)] text-left px-1.5 overflow-hidden leading-tight transition-shadow hover:shadow-md hover:ring-black/10 ${oneLine ? 'flex items-center gap-1 py-0' : 'py-1'} ${STATUS_STYLE[appt.status] || STATUS_STYLE.scheduled}`}>
      {oneLine ? (
        <span className="truncate text-[11px]">
          <span className="font-semibold">{name}</span>
          {!compact && <span className="opacity-70"> · {appt.procedureType}</span>}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1 text-[11px] font-semibold">
            <span className="truncate">{name}</span>
            {flagged && <AlertCircle className="w-3 h-3 text-error shrink-0" aria-label="Medical alert" />}
          </div>
          <div className="truncate text-[10px] opacity-75">{appt.procedureType}</div>
          {minutes >= 60 && <div className="truncate text-[10px] opacity-60 tabular-nums">{time}</div>}
        </>
      )}
    </div>
  );
}

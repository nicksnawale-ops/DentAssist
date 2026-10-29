import React from 'react';
import { Appointment, Patient, User } from '../../types';
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import { AppointmentPopover } from './AppointmentPopover';
import {
  AppointmentBlock, clickedTime, HourLines, minutesFromStart, NowLine, OffHours, pct, TimeColumn, TOTAL_MINUTES, START_HOUR,
} from './TimeGrid';

interface WeekViewProps {
  date: Date;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  onRefresh: () => void;
  onSlotClick?: (date: Date, dentistId?: string) => void;
}

const HEADER = 'h-14';

/** Seven days, 8 AM–8 PM, sized to fit the screen height. */
export function WeekView({ date, appointments, patients, dentists, onRefresh, onSlotClick }: WeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const single = dentists.length === 1 ? dentists[0] : null;

  return (
    <div className="flex h-full min-h-[560px] md:min-h-0 min-w-[760px] md:min-w-0">
      <TimeColumn headerHeight={HEADER} short />

      <div className="flex-1 flex min-w-0">
        {days.map(day => {
          const today = isSameDay(day, new Date());
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          const dayAppointments = appointments.filter(a => isSameDay(parseISO(a.startTime), day));

          // Working hours are shown only when one dentist is selected (otherwise they'd overlap).
          let off: { start: number; end: number; offDuty: boolean } | null = null;
          if (single) {
            const wd = single.workingHours?.find(w => w.day === format(day, 'EEEE'));
            if (wd && wd.isWorking) {
              const [sh, sm] = wd.startTime.split(':').map(Number);
              const [eh, em] = wd.endTime.split(':').map(Number);
              off = { start: (sh - START_HOUR) * 60 + sm, end: (eh - START_HOUR) * 60 + em, offDuty: false };
            } else {
              off = { start: 0, end: TOTAL_MINUTES, offDuty: true };
            }
          }

          return (
            <div key={day.toISOString()} className={`flex-1 min-w-0 flex flex-col border-r border-line last:border-r-0 ${today ? 'bg-primary/[0.025]' : weekend ? 'bg-text-muted/[0.02]' : ''}`}>
              <div className={`${HEADER} flex-none border-b border-line flex flex-col items-center justify-center gap-0.5 bg-surface`}>
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${today ? 'text-primary' : 'text-text-muted'}`}>{format(day, 'EEE')}</span>
                <span className={`text-[15px] leading-none tabular-nums ${today ? 'font-bold bg-primary text-white rounded-full w-7 h-7 flex items-center justify-center' : 'font-semibold text-text-main'}`}>
                  {format(day, 'd')}
                </span>
              </div>

              <div className="relative flex-1 cursor-pointer group" onClick={e => onSlotClick?.(clickedTime(e, day), single?.id)}>
                <HourLines />
                {off && <OffHours {...off} />}
                {today && <NowLine />}
                {dayAppointments.map(appt => {
                  const top = minutesFromStart(appt.startTime);
                  const end = minutesFromStart(appt.endTime);
                  return (
                    <div key={appt.id} className="absolute left-1 right-1 z-10" style={{ top: pct(top), height: `calc(${pct(end)} - ${pct(top)} - 2px)` }}
                      onClick={e => e.stopPropagation()}>
                      <AppointmentPopover appointment={appt} patient={patients.find(p => p.id === appt.patientId)}
                        dentist={dentists.find(d => d.id === appt.dentistId)} onRefresh={onRefresh}>
                        <button className="w-full h-full block">
                          <AppointmentBlock appt={appt} patient={patients.find(p => p.id === appt.patientId)} compact />
                        </button>
                      </AppointmentPopover>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

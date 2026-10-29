import React from 'react';
import { Appointment, Patient, User } from '../../types';
import { format, isSameDay, parseISO } from 'date-fns';
import { AppointmentPopover } from './AppointmentPopover';
import {
  AppointmentBlock, clickedTime, HourLines, minutesFromStart, NowLine, OffHours, pct, TimeColumn, TOTAL_MINUTES, START_HOUR,
} from './TimeGrid';

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  onRefresh: () => void;
  onSlotClick?: (date: Date, dentistId?: string) => void;
}

const HEADER = 'h-14';

/** One column per dentist for the chosen day, 8 AM–8 PM, sized to fit the screen height. */
export function DayView({ date, appointments, patients, dentists, onRefresh, onSlotClick }: DayViewProps) {
  const dayAppointments = appointments.filter(a => isSameDay(parseISO(a.startTime), date));
  const today = isSameDay(date, new Date());
  const dayName = format(date, 'EEEE');

  if (dentists.length === 0) {
    return <div className="flex-1 min-h-[320px] flex items-center justify-center text-sm text-text-muted">No dentists to show. Choose a clinic with dentists, or select a dentist above.</div>;
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-[560px] md:min-h-0">
      <TimeColumn headerHeight={HEADER} />

      <div className="flex-1 flex min-w-0">
        {dentists.map(dentist => {
          const wd = dentist.workingHours?.find(w => w.day === dayName);
          let off = { start: 0, end: TOTAL_MINUTES, offDuty: true };
          if (wd && wd.isWorking) {
            const [sh, sm] = wd.startTime.split(':').map(Number);
            const [eh, em] = wd.endTime.split(':').map(Number);
            off = { start: (sh - START_HOUR) * 60 + sm, end: (eh - START_HOUR) * 60 + em, offDuty: false };
          }
          const mine = dayAppointments.filter(a => a.dentistId === dentist.id);
          const initials = `${dentist.firstName?.[0] || ''}${dentist.lastName?.[0] || ''}`;

          return (
            <div key={dentist.id} className="flex-1 min-w-0 flex flex-col border-r border-line last:border-r-0">
              <div className={`${HEADER} flex-none border-b border-line bg-surface flex items-center justify-center gap-2.5 px-2`}>
                <span className="w-8 h-8 flex-none rounded-full bg-primary/10 text-primary text-[12px] font-semibold flex items-center justify-center">{initials}</span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[13px] font-semibold text-text-main truncate">Dr. {dentist.firstName} {dentist.lastName}</div>
                  <div className="text-[11px] text-text-muted truncate">
                    {dentist.specializations?.[0] || 'Dentist'}{wd && wd.isWorking ? ` · ${wd.startTime}–${wd.endTime}` : ' · Off today'}
                    {` · ${mine.filter(a => a.status !== 'cancelled').length} booked`}
                  </div>
                </div>
              </div>

              <div className="relative flex-1 cursor-pointer" onClick={e => onSlotClick?.(clickedTime(e, date), dentist.id)}>
                <HourLines />
                <OffHours {...off} />
                {today && <NowLine />}
                {mine.map(appt => {
                  const top = minutesFromStart(appt.startTime);
                  const end = minutesFromStart(appt.endTime);
                  const patient = patients.find(p => p.id === appt.patientId);
                  return (
                    <div key={appt.id} className="absolute left-1.5 right-1.5 md:left-2 md:right-2 z-10" style={{ top: pct(top), height: `calc(${pct(end)} - ${pct(top)} - 2px)` }}
                      onClick={e => e.stopPropagation()}>
                      <AppointmentPopover appointment={appt} patient={patient} dentist={dentist} onRefresh={onRefresh}>
                        <button className="w-full h-full block">
                          <AppointmentBlock appt={appt} patient={patient} />
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

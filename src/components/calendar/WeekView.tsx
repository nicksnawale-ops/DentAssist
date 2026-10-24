import React from 'react';
import { Appointment, Patient, User } from '../../types';
import { isSameDay, parseISO, startOfWeek, addDays, format, getHours, getMinutes, differenceInMinutes, setHours, setMinutes } from 'date-fns';
import { AppointmentPopover } from './AppointmentPopover';
import { AlertCircle } from 'lucide-react';

interface WeekViewProps {
  date: Date;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  onRefresh: () => void;
  onSlotClick?: (date: Date, dentistId?: string) => void;
}

const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

const statusColorMap: Record<string, string> = {
  scheduled: 'bg-teal-50 border-teal-200 text-teal-800',
  confirmed: 'bg-blue-50 border-blue-200 text-blue-800',
  in_progress: 'bg-amber-50 border-amber-200 text-amber-800',
  completed: 'bg-green-50 border-green-200 text-green-800',
  cancelled: 'bg-gray-50 border-gray-200 text-gray-500 line-through',
  no_show: 'bg-red-50 border-red-200 text-red-800',
};

const statusBorderMap: Record<string, string> = {
  scheduled: 'border-l-teal-500',
  confirmed: 'border-l-blue-500',
  in_progress: 'border-l-amber-500',
  completed: 'border-l-green-500',
  cancelled: 'border-l-gray-400',
  no_show: 'border-l-red-500',
};

export function WeekView({ date, appointments, patients, dentists, onRefresh, onSlotClick }: WeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  const getPosition = (timeStr: string) => {
    const d = parseISO(timeStr);
    const hrs = getHours(d);
    const mins = getMinutes(d);
    const minutesSinceStart = (hrs - START_HOUR) * 60 + mins;
    return (minutesSinceStart / TOTAL_MINUTES) * 100;
  };

  const getDurationPct = (startStr: string, endStr: string) => {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const diff = differenceInMinutes(end, start);
    return (diff / TOTAL_MINUTES) * 100;
  };

  const handleTimeClick = (e: React.MouseEvent<HTMLDivElement>, dayDate: Date) => {
     if (!onSlotClick) return;
     const rect = e.currentTarget.getBoundingClientRect();
     const y = e.clientY - rect.top;
     const percentage = y / rect.height;
     const totalMinutesClicked = percentage * TOTAL_MINUTES;
     const clickedHour = START_HOUR + Math.floor(totalMinutesClicked / 60);
     const clickedMin = Math.floor((totalMinutesClicked % 60) / 15) * 15;
     
     const slotDate = setMinutes(setHours(dayDate, clickedHour), clickedMin);
     onSlotClick(slotDate, dentists.length === 1 ? dentists[0].id : undefined);
  };

  return (
    <div className="flex min-w-[1000px]">
      {/* Time column */}
      <div className="w-16 flex-shrink-0 border-r border-line bg-surface z-10 sticky left-0">
        <div className="h-14 border-b border-line flex items-end justify-end pr-2 pb-2 text-xs font-medium text-text-muted">
          GMT
        </div>
        <div className="relative h-[1080px] md:h-[960px]">
          {hours.map(hour => (
            <div 
              key={`time-${hour}`} 
              className="absolute w-full text-right pr-2 text-xs text-text-muted -translate-y-3"
              style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
            >
              {hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`}
            </div>
          ))}
        </div>
      </div>

      {/* Days grid */}
      <div className="flex-1 flex relative">
        <div className="absolute inset-0 pointer-events-none">
           {hours.map(hour => (
              <div 
                key={`grid-${hour}`} 
                className="absolute w-full border-t border-text-muted/5 border-dashed"
                style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
              />
            ))}
        </div>

        {weekDays.map((day, dayIndex) => {
          const isToday = isSameDay(day, new Date());
          const dayAppointments = appointments.filter(a => isSameDay(parseISO(a.startTime), day));

          const dayName = format(day, 'EEEE');
          
          let combinedWorkingStart = -1;
          let combinedWorkingEnd = -1;
          let anyWorking = false;
          
          if (dentists.length === 1) {
            const workDay = dentists[0].workingHours?.find(wh => wh.day === dayName);
             if (workDay && workDay.isWorking) {
               anyWorking = true;
               const [startH, startM] = workDay.startTime.split(':').map(Number);
               const [endH, endM] = workDay.endTime.split(':').map(Number);
               combinedWorkingStart = (startH - START_HOUR) * 60 + startM;
               combinedWorkingEnd = (endH - START_HOUR) * 60 + endM;
             }
          }

          return (
            <div key={dayIndex} className="flex-1 border-r border-line relative">
              <div className="h-14 border-b border-line flex flex-col items-center justify-center bg-surface sticky top-0 z-10 shadow-panel">
                <span className={`text-xs font-semibold ${isToday ? 'text-primary' : 'text-text-muted'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-lg transition-colors ${isToday ? 'font-bold bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center' : 'font-medium text-text-main'}`}>
                  {format(day, 'd')}
                </span>
              </div>
              
              <div 
                className="relative h-[1080px] md:h-[960px] cursor-pointer hover:bg-black/5"
                onClick={(e) => handleTimeClick(e, day)}
              >
                {dentists.length === 1 && !anyWorking && (
                   <div className="absolute inset-0 bg-text-muted/5 flex items-center justify-center pointer-events-none">
                     <span className="text-sm font-medium text-text-muted/50 rotate-[-90deg]">OFF DUTY</span>
                   </div>
                )}
                {dentists.length === 1 && anyWorking && (
                   <>
                     {combinedWorkingStart > 0 && (
                        <div 
                          className="absolute w-full bg-text-muted/5 pointer-events-none"
                          style={{ top: 0, height: `${(combinedWorkingStart / TOTAL_MINUTES) * 100}%` }}
                        />
                     )}
                     {combinedWorkingEnd < TOTAL_MINUTES && (
                        <div 
                          className="absolute w-full bg-text-muted/5 pointer-events-none"
                          style={{ 
                            top: `${(combinedWorkingEnd / TOTAL_MINUTES) * 100}%`,
                            height: `${((TOTAL_MINUTES - combinedWorkingEnd) / TOTAL_MINUTES) * 100}%`
                          }}
                        />
                     )}
                   </>
                )}

                {dayAppointments.map(appt => {
                  const top = getPosition(appt.startTime);
                  const height = getDurationPct(appt.startTime, appt.endTime);
                  const patient = patients.find(p => p.id === appt.patientId);
                  const dentist = dentists.find(d => d.id === appt.dentistId);
                  
                  return (
                     <div
                      key={appt.id}
                      className="absolute left-0.5 right-0.5"
                      style={{ top: `${top}%`, height: `${height}%` }}
                      onClick={(e) => e.stopPropagation()}
                     >
                       <AppointmentPopover 
                         appointment={appt} 
                         patient={patient} 
                         dentist={dentist}
                         onRefresh={onRefresh}
                       >
                          <button 
                            className={`w-full h-full rounded-md border-l-4 border text-left p-1.5 shadow-panel transition-transform hover:scale-[1.02] flex flex-col overflow-hidden leading-tight ${statusColorMap[appt.status]} ${statusBorderMap[appt.status]}`}
                          >
                             <span className="font-bold text-[10px] truncate w-full flex items-center gap-1">
                               {patient?.firstName} {patient?.lastName}
                               {patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0) && (
                                 <AlertCircle className="w-2.5 h-2.5 text-error shrink-0" />
                               )}
                             </span>
                             <span className="text-[9px] opacity-80 truncate w-full">{appt.procedureType}</span>
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

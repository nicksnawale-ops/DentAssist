import React from 'react';
import { Appointment, Patient, User } from '../../types';
import { isSameDay, getHours, getMinutes, differenceInMinutes, parseISO, format, setHours, setMinutes } from 'date-fns';
import { AppointmentPopover } from './AppointmentPopover';
import { AlertCircle } from 'lucide-react';

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  onRefresh: () => void;
  onSlotClick?: (date: Date, dentistId?: string) => void;
}

const START_HOUR = 8;
const END_HOUR = 20; // 8 PM
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

export function DayView({ date, appointments, patients, dentists, onRefresh, onSlotClick }: DayViewProps) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

  // Filter appointments for the selected day
  const todaysAppointments = appointments.filter(a => isSameDay(parseISO(a.startTime), date));

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

  const handleTimeClick = (e: React.MouseEvent<HTMLDivElement>, dentistId: string) => {
     if (!onSlotClick) return;
     const rect = e.currentTarget.getBoundingClientRect();
     const y = e.clientY - rect.top;
     const percentage = y / rect.height;
     const totalMinutesClicked = percentage * TOTAL_MINUTES;
     const clickedHour = START_HOUR + Math.floor(totalMinutesClicked / 60);
     const clickedMin = Math.floor((totalMinutesClicked % 60) / 15) * 15; // round to nearest 15
     
     const slotDate = setMinutes(setHours(date, clickedHour), clickedMin);
     onSlotClick(slotDate, dentistId);
  };

  return (
    <div className="flex min-w-full md:min-w-[800px]">
      {/* Time column */}
      <div className="w-[88px] md:w-20 flex-shrink-0 border-r border-text-muted/10 bg-surface z-10 sticky left-0">
        <div className="h-12 border-b border-text-muted/10 flex items-end justify-end pr-2 md:pr-3 pb-2 text-xs font-medium text-text-muted">
          GMT
        </div>
        <div className="relative h-[840px] md:h-[960px]">
          {hours.map(hour => (
            <div 
              key={`time-${hour}`} 
              className="absolute w-full text-right pr-2 md:pr-3 text-xs md:text-sm text-text-muted -translate-y-3"
              style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
            >
              {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
            </div>
          ))}
        </div>
      </div>

      {/* Dentist columns */}
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
        
        {dentists.map((dentist, i) => {
          const dentistAppointments = todaysAppointments.filter(a => a.dentistId === dentist.id);
          const dayName = format(date, 'EEEE');
          const workDay = dentist.workingHours?.find(wh => wh.day === dayName);
          
          let workingStartMins = 0;
          let workingEndMins = TOTAL_MINUTES;
          let isWorkingStr = false;
          
          if (workDay && workDay.isWorking) {
             isWorkingStr = true;
             const [startH, startM] = workDay.startTime.split(':').map(Number);
             const [endH, endM] = workDay.endTime.split(':').map(Number);
             workingStartMins = (startH - START_HOUR) * 60 + startM;
             workingEndMins = (endH - START_HOUR) * 60 + endM;
          }

          return (
            <div key={dentist.id} className="flex-1 min-w-0 md:min-w-[200px] border-r border-text-muted/10 relative">
              <div className="h-12 border-b border-text-muted/10 flex flex-col items-center justify-center bg-surface sticky top-0 z-10 shadow-sm">
                <span className="font-semibold text-sm text-text-main truncate px-1 max-w-full">Dr. {dentist.firstName}</span>
                <span className="text-[10px] md:text-xs text-text-muted truncate px-1 max-w-full">{dentist.specializations?.[0] || 'Dentist'}</span>
              </div>
              
              <div 
                 className="relative h-[840px] md:h-[960px] cursor-pointer hover:bg-black/5"
                 onClick={(e) => handleTimeClick(e, dentist.id)}
              >
                {/* Background slots - off-duty hours */}
                {!isWorkingStr ? (
                   <div className="absolute inset-0 bg-text-muted/5 flex items-center justify-center pointer-events-none">
                     <span className="text-sm font-medium text-text-muted/50 rotate-[-90deg]">OFF DUTY</span>
                   </div>
                ) : (
                   <>
                     {workingStartMins > 0 && (
                        <div 
                          className="absolute w-full bg-text-muted/5 pointer-events-none"
                          style={{ top: 0, height: `${(workingStartMins / TOTAL_MINUTES) * 100}%` }}
                        />
                     )}
                     {workingEndMins < TOTAL_MINUTES && (
                        <div 
                          className="absolute w-full bg-text-muted/5 pointer-events-none"
                          style={{ 
                            top: `${(workingEndMins / TOTAL_MINUTES) * 100}%`,
                            height: `${((TOTAL_MINUTES - workingEndMins) / TOTAL_MINUTES) * 100}%`
                          }}
                        />
                     )}
                   </>
                )}
                
                {/* Appointments */}
                {dentistAppointments.map(appt => {
                  const top = getPosition(appt.startTime);
                  const height = getDurationPct(appt.startTime, appt.endTime);
                  const patient = patients.find(p => p.id === appt.patientId);
                  const startTimeStr = format(parseISO(appt.startTime), 'h:mm a');
                  const endTimeStr = format(parseISO(appt.endTime), 'h:mm a');
                  
                  return (
                    <div
                      key={appt.id}
                      className="absolute left-1 right-1 md:left-2 md:right-2"
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
                          className={`w-full h-full rounded-md border-l-4 border text-left p-1.5 md:p-2 shadow-sm transition-transform hover:scale-[1.02] flex flex-col overflow-hidden leading-tight ${statusColorMap[appt.status]} ${statusBorderMap[appt.status]}`}
                        >
                           <div className="font-bold text-[11px] md:text-xs w-full flex items-start md:items-center justify-between md:justify-start gap-1 mb-0.5 md:mb-0 whitespace-normal md:whitespace-nowrap break-words md:truncate">
                             <span className="md:truncate">{patient?.firstName} {patient?.lastName}</span>
                             {patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0) && (
                               <AlertCircle className="w-3 h-3 text-error shrink-0 md:mt-0 mt-0.5" />
                             )}
                           </div>
                           <div className="text-[10px] opacity-90 md:opacity-80 w-full mb-0.5 md:mb-0 whitespace-normal md:whitespace-nowrap break-words md:truncate leading-tight">{appt.procedureType}</div>
                           <div className="text-[9px] opacity-75 font-medium mt-auto block md:hidden">
                             {startTimeStr} - {endTimeStr}
                           </div>
                        </button>
                      </AppointmentPopover>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {dentists.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-text-muted italic">
            Select at least one dentist to view schedule.
          </div>
        )}
      </div>
    </div>
  );
}

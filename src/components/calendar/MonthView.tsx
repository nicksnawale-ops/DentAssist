import React, { useState, useEffect } from 'react';
import { Appointment, Patient, User } from '../../types';
import { format, startOfMonth, startOfWeek, endOfMonth, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, compareAsc } from 'date-fns';
import { AppointmentPopover } from './AppointmentPopover';
import { X, Plus, MoreHorizontal, User as UserIcon } from 'lucide-react';
import { Button } from '../ui/Button';

interface MonthViewProps {
  date: Date;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  onDayClick: (d: Date) => void;
  onRefresh?: () => void;
  onNewApptForDate?: (d: Date) => void;
}

const statusColorMap: Record<string, string> = {
  scheduled: 'bg-teal-500',
  confirmed: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-500',
  cancelled: 'bg-coral-red', // Using a generic red if coral-red isn't defined, maybe text-red-500
  no_show: 'bg-red-500',
};

// Map status to specific brand colors based on prompt
const getStatusColor = (status: string) => {
  switch (status) {
    case 'scheduled':
    case 'confirmed': return 'bg-teal-500';
    case 'completed': return 'bg-green-500';
    case 'in_progress': return 'bg-amber-500';
    case 'cancelled':
    case 'no_show': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'scheduled':
    case 'confirmed': return 'bg-teal-500/10 text-teal-800 border-teal-500/20';
    case 'completed': return 'bg-green-500/10 text-green-800 border-green-500/20';
    case 'in_progress': return 'bg-amber-500/10 text-amber-800 border-amber-500/20';
    case 'cancelled':
    case 'no_show': return 'bg-red-500/10 text-red-800 border-red-500/20';
    default: return 'bg-gray-500/10 text-gray-800 border-gray-500/20';
  }
};

export function MonthView({ date, appointments, patients, dentists, onDayClick, onRefresh, onNewApptForDate }: MonthViewProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday start
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const dateFormat = 'd';
  const rows = [];
  
  let days = [];
  let day = startDate;
  let formattedDate = '';

  const handleDaySelect = (d: Date) => {
    onDayClick(d);
    if (isMobile) {
      setShowMobilePanel(true);
    }
  };

  const today = new Date();

  // Generate grid
  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      formattedDate = format(day, dateFormat);
      const cloneDay = day;
      
      const dayAppointments = appointments.filter(a => isSameDay(parseISO(a.startTime), cloneDay));
      
      // Keep only up to 3 indicators to not overflow visually
      const indicators = dayAppointments.slice(0, 3);
      const extraCount = dayAppointments.length > 3 ? dayAppointments.length - 3 : 0;

      const isCurrentMonth = isSameMonth(day, monthStart);
      const isToday = isSameDay(day, today);
      const isSelected = isSameDay(day, date);

      days.push(
        <div
          key={day.toString()}
          onClick={() => handleDaySelect(cloneDay)}
          className={`flex flex-col items-center p-0.5 md:p-1 cursor-pointer group h-full`}
        >
          <div 
            className={`w-full h-full rounded-xl md:rounded-2xl p-1 md:p-2 flex flex-col items-center justify-start transition-all overflow-hidden
              ${isToday && !isSelected ? 'bg-[#0F4C5C] text-white shadow-sm' : ''}
              ${isSelected ? 'bg-[#14A89D] text-white shadow-md' : ''}
              ${!isToday && !isSelected && isCurrentMonth ? 'bg-white hover:bg-surface-hover shadow-sm border border-text-muted/5' : ''}
              ${!isToday && !isSelected && !isCurrentMonth ? 'bg-transparent text-[#C5D0CF]' : ''}
            `}
          >
            <span className={`text-xs md:text-sm font-semibold ${(!isToday && !isSelected && !isCurrentMonth) ? 'text-[#C5D0CF]' : ''}`}>
              {formattedDate}
            </span>
            
            <div className="mt-1 md:mt-2 flex flex-wrap justify-center gap-1">
               {indicators.map((appt, idx) => (
                  <span key={idx} className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${getStatusColor(appt.status)}`} />
               ))}
               {extraCount > 0 && (
                  <span className={`text-[9px] md:text-[10px] font-bold ${isToday || isSelected ? 'text-white/80' : 'text-text-muted'}`}>
                    +{extraCount}
                  </span>
               )}
            </div>
          </div>
        </div>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7 gap-1 md:gap-2 h-full" key={day.toString()}>
        {days}
      </div>
    );
    days = [];
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Selected Day Appointments
  const selectedDayAppointments = appointments
    .filter(a => isSameDay(parseISO(a.startTime), date))
    .sort((a, b) => compareAsc(parseISO(a.startTime), parseISO(b.startTime)));

  const PanelContent = () => (
    <div className="flex flex-col h-full bg-white md:rounded-2xl md:shadow-sm md:border md:border-text-muted/10 overflow-hidden">
      <div className="p-4 md:p-5 border-b border-text-muted/10 flex items-center justify-between bg-white shrink-0">
        <div>
          <h3 className="font-bold text-lg text-text-main">
            {format(date, 'EEEE, MMMM d')}
          </h3>
          <p className="text-sm text-text-muted">{selectedDayAppointments.length} appointments</p>
        </div>
        {isMobile && (
          <button onClick={() => setShowMobilePanel(false)} className="p-2 -mr-2 text-text-muted hover:bg-surface rounded-full">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 bg-surface/30">
        {selectedDayAppointments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-text-muted/50">
              <UserIcon className="w-8 h-8" />
            </div>
            <div>
              <p className="text-text-main font-medium">No appointments on this day</p>
              <p className="text-text-muted text-sm mt-1">Enjoy the quiet time or schedule a new one.</p>
            </div>
          </div>
        ) : (
          selectedDayAppointments.map(appt => {
            const patient = patients.find(p => p.id === appt.patientId);
            const dentist = dentists.find(d => d.id === appt.dentistId);
            const startTimeStr = format(parseISO(appt.startTime), 'h:mm a');
            const endTimeStr = format(parseISO(appt.endTime), 'h:mm a');
            
            return (
              <div key={appt.id} className="bg-white border border-text-muted/10 rounded-xl p-3 md:p-4 shadow-sm flex flex-col gap-2 relative">
                <div className="flex justify-between items-start">
                   <div className="text-xs font-semibold text-text-muted tracking-tight">
                     {startTimeStr} – {endTimeStr}
                   </div>
                   <AppointmentPopover 
                      appointment={appt} 
                      patient={patient} 
                      dentist={dentist} 
                      onRefresh={onRefresh || (() => {})}
                   >
                     <button className="p-1 -m-1 text-text-muted hover:bg-surface rounded shrink-0">
                       <MoreHorizontal className="w-4 h-4" />
                     </button>
                   </AppointmentPopover>
                </div>
                <div>
                  <div className="font-bold text-text-main">{patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient'}</div>
                  <div className="text-sm text-text-muted">{appt.procedureType}</div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs text-text-muted flex items-center gap-1.5">
                    {dentist && (
                      <>
                        <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[8px]">
                          {dentist.firstName[0]}{dentist.lastName[0]}
                        </div>
                        Dr. {dentist.firstName}
                      </>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getStatusBadgeColor(appt.status)}`}>
                    {appt.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="p-4 md:p-5 border-t border-text-muted/10 bg-white shrink-0">
         <Button className="w-full gap-2" onClick={() => onNewApptForDate?.(date)}>
           <Plus className="w-4 h-4" />
           New Appointment
         </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-full bg-[#F7FAFA] relative overflow-hidden">
      {/* Month Grid Area */}
      <div className="flex-1 flex flex-col h-full w-full md:w-[60%] lg:w-[65%] p-2 md:p-6 overflow-hidden">
        <div className="grid grid-cols-7 mb-2 shrink-0">
          {weekDays.map(wd => (
            <div key={wd} className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider">
              {wd}
            </div>
          ))}
        </div>
        <div className="flex-1 flex flex-col h-full space-y-1 md:space-y-2">
          {rows.map((row, i) => (
             <div key={i} className="flex-1">
               {row}
             </div>
          ))}
        </div>
      </div>

      {/* Side Panel (Desktop) */}
      <div className="hidden md:block w-[40%] lg:w-[35%] h-full p-6 pl-0">
        <PanelContent />
      </div>

      {/* Bottom Sheet (Mobile) */}
      {isMobile && showMobilePanel && (
        <>
          <div className="absolute inset-0 bg-black/20 z-40" onClick={() => setShowMobilePanel(false)} />
          <div className="absolute bottom-0 left-0 right-0 z-50 h-[70%] bg-white rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col transition-transform transform translate-y-0">
            <PanelContent />
          </div>
        </>
      )}
    </div>
  );
}

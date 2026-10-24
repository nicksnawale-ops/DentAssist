import React, { useState, useEffect } from 'react';
import { Appointment, Patient, User } from '../../types';
import { CalendarToolbar } from './CalendarToolbar';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';

interface CalendarComponentProps {
  date: Date;
  setDate: (d: Date) => void;
  view: 'day' | 'week' | 'month';
  setView: (v: 'day' | 'week' | 'month') => void;
  appointments: Appointment[];
  patients: Patient[];
  dentists: User[];
  selectedDentists: string[];
  setSelectedDentists: React.Dispatch<React.SetStateAction<string[]>>;
  onRefresh: () => void;
  onNewAppointment: () => void;
  onToggleWaitlist: () => void;
  onSlotClick?: (date: Date, dentistId?: string) => void;
}

export function CalendarComponent(props: CalendarComponentProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeDayViewDentists = React.useMemo(() => {
    const filtered = props.dentists.filter(d => props.selectedDentists.includes(d.id));
    if (isMobile && props.view === 'day') {
      return filtered.length > 0 ? [filtered[0]] : (props.dentists.length > 0 ? [props.dentists[0]] : []);
    }
    return filtered;
  }, [props.dentists, props.selectedDentists, isMobile, props.view]);

  return (
    <div className="flex flex-col h-full bg-base">
      <CalendarToolbar 
        date={props.date}
        setDate={props.setDate}
        view={props.view}
        setView={props.setView}
        dentists={props.dentists}
        selectedDentists={props.selectedDentists}
        setSelectedDentists={props.setSelectedDentists}
        onNewAppointment={props.onNewAppointment}
        onToggleWaitlist={props.onToggleWaitlist}
        isMobileDayView={isMobile && props.view === 'day'}
        activeMobileDentistId={activeDayViewDentists[0]?.id}
      />
      <div className="flex-1 overflow-auto bg-surface/50">
        {props.view === 'day' && (
          <DayView 
            date={props.date}
            appointments={props.appointments}
            patients={props.patients}
            dentists={activeDayViewDentists}
            onRefresh={props.onRefresh}
            onSlotClick={(date, dentistId) => props.onSlotClick?.(date, dentistId)}
          />
        )}
        {props.view === 'week' && (
           <WeekView 
             date={props.date}
             appointments={props.appointments}
             patients={props.patients}
             dentists={props.dentists.filter(d => props.selectedDentists.includes(d.id))}
             onRefresh={props.onRefresh}
             onSlotClick={(date, dentistId) => props.onSlotClick?.(date, dentistId)}
           />
        )}
        {props.view === 'month' && (
          <MonthView 
             date={props.date}
             appointments={props.appointments}
             patients={props.patients}
             dentists={props.dentists.filter(d => props.selectedDentists.includes(d.id))}
             onDayClick={(d) => {
               props.setDate(d);
             }}
             onRefresh={props.onRefresh}
             onNewApptForDate={(d) => props.onSlotClick?.(d)}
           />
        )}
      </div>
    </div>
  );
}

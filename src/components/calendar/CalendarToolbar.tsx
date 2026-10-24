import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, ListTodo } from 'lucide-react';
import { Button } from '../ui/Button';
import { User } from '../../types';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';

interface CalendarToolbarProps {
  date: Date;
  setDate: (d: Date) => void;
  view: 'day' | 'week' | 'month';
  setView: (v: 'day' | 'week' | 'month') => void;
  dentists: User[];
  selectedDentists: string[];
  setSelectedDentists: React.Dispatch<React.SetStateAction<string[]>>;
  onNewAppointment: () => void;
  onToggleWaitlist: () => void;
  isMobileDayView?: boolean;
  activeMobileDentistId?: string;
}

export function CalendarToolbar({
  date,
  setDate,
  view,
  setView,
  dentists,
  selectedDentists,
  setSelectedDentists,
  onNewAppointment,
  onToggleWaitlist,
  isMobileDayView,
  activeMobileDentistId
}: CalendarToolbarProps) {

  const handlePrev = () => {
    if (view === 'month') setDate(subMonths(date, 1));
    else if (view === 'week') setDate(subWeeks(date, 1));
    else setDate(subDays(date, 1));
  };

  const handleNext = () => {
    if (view === 'month') setDate(addMonths(date, 1));
    else if (view === 'week') setDate(addWeeks(date, 1));
    else setDate(addDays(date, 1));
  };

  const handleToday = () => {
    setDate(new Date());
  };

  const toggleDentist = (id: string) => {
    setSelectedDentists(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 border-b border-text-muted/10 bg-base">
      
      {/* Date Navigation & View Switcher */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-text-muted/10">
          <Button variant="ghost" size="sm" onClick={handlePrev} className="px-2" aria-label="Previous">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToday} className="font-medium text-xs">
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNext} className="px-2" aria-label="Next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 min-w-[200px]">
          <CalendarIcon className="w-5 h-5 text-text-muted" />
          <h2 className="text-xl font-bold text-text-main tracking-tight">
            {view === 'day' && format(date, 'MMMM d, yyyy')}
            {view === 'week' && `${format(subDays(date, date.getDay() - 1), 'MMM d')} - ${format(addDays(date, 7 - date.getDay()), 'MMM d, yyyy')}`}
            {view === 'month' && format(date, 'MMMM yyyy')}
          </h2>
        </div>

        <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-text-muted/10 h-10">
          {(['day', 'week', 'month'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${
                view === v 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-text-muted hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Dentist Filter & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full xl:w-auto">
        {dentists.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Desktop Avatars */}
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-text-muted">Dentists:</span>
              <div className="flex items-center -space-x-2">
                {dentists.map((dentist, i) => {
                  const isSelected = selectedDentists.includes(dentist.id);
                  return (
                    <button 
                      key={dentist.id}
                      onClick={() => toggleDentist(dentist.id)}
                      title={`${dentist.firstName} ${dentist.lastName}`}
                      className={`relative rounded-full ring-2 transition-all ${
                        isSelected ? 'ring-primary z-10 scale-110' : 'ring-surface z-0 opacity-50 hover:opacity-100'
                      }`}
                      style={{ zIndex: isSelected ? 10 + i : i }}
                    >
                      <AvatarPrimitive.Root className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface border border-text-muted/20 overflow-hidden">
                        {dentist.avatarUrl ? (
                           <AvatarPrimitive.Image src={dentist.avatarUrl} alt={dentist.firstName} className="h-full w-full object-cover" />
                        ) : (
                           <AvatarPrimitive.Fallback className="text-xs font-medium text-text-muted">
                             {dentist.firstName[0]}{dentist.lastName[0]}
                           </AvatarPrimitive.Fallback>
                        )}
                      </AvatarPrimitive.Root>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mobile Dropdown */}
            <div className="sm:hidden flex-1">
              <select 
                className="w-full bg-surface border border-text-muted/20 rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={isMobileDayView ? activeMobileDentistId : (selectedDentists.length === 1 ? selectedDentists[0] : 'all')}
                onChange={(e) => {
                  if (e.target.value === 'all') setSelectedDentists(dentists.map(d => d.id));
                  else setSelectedDentists([e.target.value]);
                }}
              >
                {!isMobileDayView && <option value="all">All Dentists</option>}
                {dentists.map(d => (
                  <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2 shrink-0 flex-1 sm:flex-none" onClick={onToggleWaitlist}>
            <ListTodo className="w-4 h-4" />
            Waitlist
          </Button>
          <Button className="gap-2 shrink-0 flex-1 sm:flex-none" onClick={onNewAppointment}>
            <Plus className="w-4 h-4" />
            New Appointment
          </Button>
        </div>
      </div>

    </div>
  );
}

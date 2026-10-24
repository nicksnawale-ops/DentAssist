import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Appointment, Patient, User } from '../../types';
import { getAppointments, getPatients, getStaff } from '../../api/apiService';
import { CalendarComponent } from '../../components/calendar/CalendarComponent';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppointmentFormModal } from '../../components/calendar/AppointmentFormModal';
import { WaitlistModal } from '../../components/calendar/WaitlistModal';

export function AppointmentsList() {
  const { selectedClinicId } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isNewApptOpen, setIsNewApptOpen] = useState(false);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [initialApptDate, setInitialApptDate] = useState<Date | undefined>(undefined);
  const [initialApptDentistId, setInitialApptDentistId] = useState<string | undefined>(undefined);

  // Filters state managed by the views/toolbar
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [selectedDentists, setSelectedDentists] = useState<string[]>([]);

  const fetchAppointmentsOnly = useCallback(async () => {
    try {
      const apptsRes = await getAppointments({ clinicId: selectedClinicId });
      if (apptsRes.data) setAppointments(apptsRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [selectedClinicId]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [apptsRes, patientsRes, staffRes] = await Promise.all([
          getAppointments({ clinicId: selectedClinicId }),
          getPatients(),
          getStaff()
        ]);
        
        if (apptsRes.data) setAppointments(apptsRes.data);
        if (patientsRes.data) setPatients(patientsRes.data);
        if (staffRes.data) {
           const clinicDentists = staffRes.data.filter(s => 
             s.role === 'dentist' && 
             (selectedClinicId === 'all' || s.clinicIds?.includes(selectedClinicId))
           );
           setDentists(clinicDentists);
           // Default select all dentists if none selected
           if (selectedDentists.length === 0) {
             setSelectedDentists(clinicDentists.map(d => d.id));
           }
        }
      } catch (err) {
        console.error("Error fetching calendar data", err);
      }
      setLoading(false);
    };

    fetchData();
  }, [selectedClinicId]);

  const handleOpenNewAppt = (date?: Date, dentistId?: string) => {
    setInitialApptDate(date);
    setInitialApptDentistId(dentistId);
    setIsNewApptOpen(true);
  };

  const handleOpenNewApptFromWaitlist = (patientId: string, preferredDentistId?: string) => {
    setInitialApptDate(new Date());
    setInitialApptDentistId(preferredDentistId);
    setIsWaitlistOpen(false);
    setIsNewApptOpen(true);
    // Ideally we'd pre-fill patientId too, but it's fine for now as a light feature
  };

  if (loading) {
    return <div className="space-y-4">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-[600px] w-full" />
    </div>;
  }

  // Filter appointments by selected dentists
  const filteredAppointments = appointments.filter(a => selectedDentists.includes(a.dentistId));

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex-none">
        <h1 className="text-2xl font-bold text-text-main tracking-tight">Appointments</h1>
        <p className="text-sm text-text-muted mt-1">Manage schedules, bookings, and availability</p>
      </div>

      <div className="flex-1 min-h-0 bg-surface rounded-xl border border-text-muted/10 flex flex-col overflow-hidden">
         <CalendarComponent 
           date={date}
           setDate={setDate}
           view={view}
           setView={setView}
           appointments={filteredAppointments}
           patients={patients}
           dentists={dentists}
           selectedDentists={selectedDentists}
           setSelectedDentists={setSelectedDentists}
           onRefresh={fetchAppointmentsOnly}
           onNewAppointment={() => handleOpenNewAppt()}
           onToggleWaitlist={() => setIsWaitlistOpen(true)}
           onSlotClick={(date, dentistId) => handleOpenNewAppt(date, dentistId)}
         />
      </div>

      {isNewApptOpen && (
        <AppointmentFormModal 
          isOpen={isNewApptOpen}
          onClose={() => setIsNewApptOpen(false)}
          clinicId={selectedClinicId === 'all' ? 'clinic_1' : selectedClinicId}
          initialDate={initialApptDate}
          initialDentistId={initialApptDentistId}
          patients={patients}
          dentists={dentists}
          onSuccess={fetchAppointmentsOnly}
        />
      )}

      {isWaitlistOpen && (
        <WaitlistModal
          isOpen={isWaitlistOpen}
          onClose={() => setIsWaitlistOpen(false)}
          clinicId={selectedClinicId}
          patients={patients}
          dentists={dentists}
          onSchedule={handleOpenNewApptFromWaitlist}
        />
      )}

    </div>
  );
}

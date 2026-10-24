import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Appointment, Patient, User } from '../../types';
import { getAppointments, getPatients, getStaff, SLOT_FREED_EVENT } from '../../api/apiService';
import { CalendarComponent } from '../../components/calendar/CalendarComponent';
import { Skeleton } from '../../components/ui/Skeleton';
import { AppointmentFormModal } from '../../components/calendar/AppointmentFormModal';
import { WaitlistModal } from '../../components/calendar/WaitlistModal';
import { PageHeader } from '../../components/ui/PageHeader';

interface AppointmentsListProps {
  /** Dentist's own calendar ("My schedule"): only their appointments, day view first. */
  mySchedule?: boolean;
}

interface NewBooking {
  date?: Date;
  dentistId?: string;
  patientId?: string;
  durationMinutes?: number;
  waitlistEntryId?: string;
}

export function AppointmentsList({ mySchedule = false }: AppointmentsListProps) {
  const { selectedClinicId, user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBooking, setNewBooking] = useState<NewBooking | null>(null);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [freedAppointment, setFreedAppointment] = useState<Appointment | null>(null);

  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>(mySchedule ? 'day' : 'week');
  const [selectedDentists, setSelectedDentists] = useState<string[]>([]);

  const scope = mySchedule && user ? { dentistId: user.id } : {};

  const fetchAppointmentsOnly = useCallback(async () => {
    const res = await getAppointments({ clinicId: selectedClinicId, ...scope });
    if (res.data) setAppointments(res.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClinicId, mySchedule, user?.id]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [apptsRes, patientsRes, staffRes] = await Promise.all([
        getAppointments({ clinicId: selectedClinicId, ...scope }),
        getPatients({ clinicId: selectedClinicId }),
        getStaff(),
      ]);
      if (apptsRes.data) setAppointments(apptsRes.data);
      if (patientsRes.data) setPatients(patientsRes.data);
      if (staffRes.data) {
        const clinicDentists = mySchedule && user
          ? staffRes.data.filter(s => s.id === user.id)
          : staffRes.data.filter(s =>
              s.role === 'dentist' && s.status !== 'inactive' &&
              (selectedClinicId === 'all' || s.clinicIds?.includes(selectedClinicId) || s.clinicId === selectedClinicId));
        // A dentist looking at "My schedule" may not be in the staff list they can see; add them.
        if (mySchedule && user && clinicDentists.length === 0) clinicDentists.push(user);
        setDentists(clinicDentists);
        setSelectedDentists(clinicDentists.map(d => d.id));
      }
      setLoading(false);
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClinicId, mySchedule, user?.id]);

  // "/appointments?new=1" (e.g. from the dashboard) opens the booking form straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (!loading && searchParams.get('new') === '1') {
      setNewBooking({});
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [loading, searchParams, setSearchParams]);

  // After a cancellation anywhere in the calendar, offer the freed slot to the waitlist.
  useEffect(() => {
    const onFreed = (e: Event) => {
      const appt = (e as CustomEvent<Appointment>).detail;
      if (appt && new Date(appt.startTime).getTime() > Date.now()) {
        setFreedAppointment(appt);
        setIsWaitlistOpen(true);
      }
    };
    window.addEventListener(SLOT_FREED_EVENT, onFreed);
    return () => window.removeEventListener(SLOT_FREED_EVENT, onFreed);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const filteredAppointments = appointments.filter(a => selectedDentists.includes(a.dentistId));

  return (
    <div className="h-full flex flex-col space-y-4">
      <PageHeader
        className="flex-none mb-0"
        title={mySchedule ? 'My schedule' : 'Appointments'}
        description={mySchedule ? 'Your patients for the day and the week ahead.' : "Book, move and check in patients across your dentists' calendars."}
      />

      <div className="flex-1 min-h-0 bg-surface rounded-panel border border-line shadow-panel flex flex-col overflow-hidden">
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
          onNewAppointment={() => setNewBooking({})}
          onToggleWaitlist={() => { setFreedAppointment(null); setIsWaitlistOpen(true); }}
          onSlotClick={(d, dentistId) => setNewBooking({ date: d, dentistId })}
        />
      </div>

      {newBooking && (
        <AppointmentFormModal
          isOpen
          onClose={() => setNewBooking(null)}
          clinicId={selectedClinicId}
          initialDate={newBooking.date}
          initialDentistId={newBooking.dentistId || (mySchedule ? user?.id : undefined)}
          initialPatientId={newBooking.patientId}
          initialDuration={newBooking.durationMinutes}
          waitlistEntryId={newBooking.waitlistEntryId}
          patients={patients}
          dentists={dentists}
          onSuccess={fetchAppointmentsOnly}
        />
      )}

      {isWaitlistOpen && (
        <WaitlistModal
          isOpen
          onClose={() => { setIsWaitlistOpen(false); setFreedAppointment(null); }}
          clinicId={selectedClinicId}
          patients={patients}
          dentists={dentists}
          freedAppointment={freedAppointment}
          onSchedule={(patientId, preferredDentistId, slot) => {
            setIsWaitlistOpen(false);
            setNewBooking({
              patientId,
              dentistId: slot?.dentistId || preferredDentistId,
              date: slot ? new Date(slot.startTime) : undefined,
              durationMinutes: slot ? Math.round((new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 60000) : undefined,
              waitlistEntryId: slot?.entryId,
            });
            setFreedAppointment(null);
          }}
        />
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Appointment } from '../../types';
import { BookingOption, cancelMyAppointment, getBookingOptions, getMyAppointments } from '../../api/apiService';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Calendar as CalendarIcon, Clock, MapPin, User as UserIcon } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { PatientBookingModal } from '../dashboards/PatientBookingModal';
import { generateICS } from '../../utils/icsGenerator';

export function PatientAppointmentsList() {
  const { user } = useAuth();
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [userAppointments, setUserAppointments] = useState<Appointment[]>([]);
  const [clinics, setClinics] = useState<BookingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [apptRes, optRes] = await Promise.all([getMyAppointments(), getBookingOptions()]);
    setUserAppointments([...(apptRes.data || [])]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()));
    setClinics(optRes.data || []);
    setError(apptRes.error?.message || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) return null;

  const clinicFor = (appt: Appointment) => clinics.find(c => c.id === appt.clinicId);
  const dentistName = (appt: Appointment) =>
    clinics.flatMap(c => c.dentists).find(d => d.id === appt.dentistId)?.name || 'Your dentist';

  const handleCancel = async (appt: Appointment) => {
    if (!window.confirm(`Cancel your appointment on ${format(parseISO(appt.startTime), 'EEE d MMM, h:mm a')}?`)) return;
    const res = await cancelMyAppointment(appt.id);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    load();
  };

  const isActive = (a: Appointment) => a.status === 'scheduled' || a.status === 'confirmed';
  const upcoming = userAppointments.filter(a => isActive(a) && isAfter(parseISO(a.startTime), new Date()));
  const past = userAppointments.filter(a => !upcoming.includes(a)).reverse();

  const handleDownloadICS = (appt: Appointment) => {
    const clinic = clinicFor(appt);

    const icsContent = generateICS({
      title: 'Dental Appointment',
      description: `Appointment with ${dentistName(appt)}`,
      location: clinic?.name || 'Clinic',
      startDate: parseISO(appt.startTime),
      endDate: parseISO(appt.endTime)
    });
    
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'appointment.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderAppointmentCard = (appt: Appointment, isUpcoming: boolean) => {
    const clinic = clinicFor(appt);

    return (
      <Card key={appt.id} className="mb-4 shadow-panel border-line">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-main mb-1">{format(parseISO(appt.startTime), 'EEEE, MMMM d, yyyy')}</h3>
                <div className="flex items-center gap-2 text-sm text-text-main font-medium mb-3">
                  <Clock className="w-4 h-4 text-text-muted" />
                  {format(parseISO(appt.startTime), 'h:mm a')} - {format(parseISO(appt.endTime), 'h:mm a')}
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <UserIcon className="w-4 h-4" /> {dentistName(appt)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <MapPin className="w-4 h-4" /> {clinic?.name || 'Clinic'}
                  </div>
                  {!isUpcoming && appt.status !== 'completed' && (
                    <div className="text-xs font-medium text-text-muted">{appt.status.replace('_', ' ')}</div>
                  )}
                </div>
              </div>
            </div>
            
            {isUpcoming && (
              <div className="flex flex-row md:flex-col gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setRescheduling(appt)}>Reschedule</Button>
                <Button size="sm" onClick={() => handleDownloadICS(appt)}>Add to Calendar</Button>
                <Button variant="outline" className="text-error border-error/20 hover:bg-error/5" size="sm" onClick={() => handleCancel(appt)}>Cancel</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">My Appointments</h1>
          <p className="text-sm text-text-muted">Manage your upcoming visits and view past history.</p>
        </div>
        <Button className="gap-2" onClick={() => setIsBookingModalOpen(true)}>
          <CalendarIcon className="w-4 h-4" /> Book New
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</div>
      )}
      {loading && <p className="text-sm text-text-muted">Loading your appointments…</p>}

      <div>
        <h2 className="text-xl font-semibold text-text-main mb-4 border-b border-line pb-2">Upcoming</h2>
        {upcoming.length > 0 ? (
          upcoming.map(a => renderAppointmentCard(a, true))
        ) : (
          <p className="text-sm text-text-muted italic bg-base p-6 rounded-xl border border-line text-center">No upcoming appointments scheduled.</p>
        )}
      </div>

      <div className="pt-4">
        <h2 className="text-xl font-semibold text-text-main mb-4 border-b border-line pb-2">Past</h2>
        {past.length > 0 ? (
          past.map(a => renderAppointmentCard(a, false))
        ) : (
          <p className="text-sm text-text-muted italic bg-base p-6 rounded-xl border border-line text-center">No past appointments.</p>
        )}
      </div>

      {isBookingModalOpen && (
        <PatientBookingModal onClose={() => setIsBookingModalOpen(false)} onBooked={() => load()} />
      )}
      {rescheduling && (
        <PatientBookingModal
          rescheduleAppointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onBooked={() => load()}
        />
      )}
    </div>
  );
}

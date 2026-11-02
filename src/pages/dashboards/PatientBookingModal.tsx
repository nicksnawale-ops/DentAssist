import React, { useEffect, useState } from 'react';
import { X, MapPin, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { format, addDays, startOfToday, addMinutes } from 'date-fns';
import { Address, Appointment } from '../../types';
import { BookingOption, bookMyAppointment, getBookingOptions, rescheduleMyAppointment } from '../../api/apiService';

interface PatientBookingModalProps {
  onClose: () => void;
  /** Called after a successful booking or reschedule. */
  onBooked?: (appointment: Appointment) => void;
  /** When set, the modal reschedules this appointment instead of booking a new one. */
  rescheduleAppointment?: Appointment;
}

const REASONS = [
  'Routine Checkup',
  'Tooth Pain',
  'Cleaning',
  'Cosmetic Consultation',
  'Follow-up',
  'Emergency'
];

const SLOT_MINUTES = 30;
const TIME_SLOTS = ['09:00', '09:30', '10:00', '11:00', '14:00', '15:30', '16:00'];

export function formatAddress(address?: Address | string): string {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.street, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

export function PatientBookingModal({ onClose, onBooked, rescheduleAppointment }: PatientBookingModalProps) {
  const isReschedule = !!rescheduleAppointment;
  const [step, setStep] = useState(isReschedule ? 3 : 1);
  const [reason, setReason] = useState(rescheduleAppointment?.procedureType || '');
  const [clinicId, setClinicId] = useState(rescheduleAppointment?.clinicId || '');
  const [dentistId, setDentistId] = useState(rescheduleAppointment?.dentistId || '');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState('');
  const [options, setOptions] = useState<BookingOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getBookingOptions().then(res => {
      setOptions(res.data || []);
      if (res.error) setOptionsError(res.error.message);
    });
  }, []);

  const today = startOfToday();
  const next14Days = Array.from({ length: 14 }).map((_, i) => addDays(today, i + 1));

  const isEmergency = reason === 'Emergency';
  const selectedClinic = options.find(c => c.id === clinicId);
  const dentists = selectedClinic?.dentists || [];

  const handleNext = () => {
    if (isEmergency) return; // Can't proceed in flow if emergency
    setStep(s => s + 1);
  };

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitError(null);
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const start = new Date(selectedDate);
    start.setHours(hours, minutes, 0, 0);
    const end = addMinutes(start, SLOT_MINUTES);

    // "No preference" books the first dentist available at the clinic.
    const chosenDentist = dentistId || dentists[0]?.id;
    if (!chosenDentist) {
      setSubmitError('No dentist is available for online booking at this clinic. Please call the clinic.');
      return;
    }

    setSubmitting(true);
    const res = isReschedule
      ? await rescheduleMyAppointment(rescheduleAppointment!.id, start.toISOString(), end.toISOString())
      : await bookMyAppointment({
          dentistId: chosenDentist,
          clinicId,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          procedureType: reason,
        });
    setSubmitting(false);

    if (!res.data) {
      setSubmitError(res.error?.code === 'APPOINTMENT_CONFLICT'
        ? 'That time was just taken. Please pick another slot.'
        : res.error?.message || 'Booking failed. Please try again or call the clinic.');
      return;
    }
    onBooked?.(res.data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl border border-text-muted/20 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-text-muted/10 flex justify-between items-center bg-base rounded-t-2xl">
          <h2 className="text-lg font-bold text-text-main">{isReschedule ? 'Reschedule Appointment' : 'Book an Appointment'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {optionsError && (
            <div role="alert" className="mb-4 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{optionsError}</div>
          )}

          {/* Step 1: Reason */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-main mb-3">What is the reason for your visit?</h3>
              <div className="grid grid-cols-2 gap-3">
                {REASONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setReason(r)}
                    className={`p-3 text-sm font-medium border rounded-xl text-left transition-colors ${
                      reason === r
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-text-muted/20 text-text-main hover:border-primary/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {isEmergency && (
                <div className="mt-4 p-4 bg-error/10 border border-error/20 rounded-xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-error mb-1">Call the clinic directly for urgent issues</h4>
                    <p className="text-sm text-error/80 mb-3">Please do not use the online booking system for emergencies.</p>
                    {options.map(c => (
                      <div key={c.id} className="text-sm font-bold text-error mb-1">
                        {c.name}{c.phone ? `: ${c.phone}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-6 flex justify-end">
                <Button onClick={handleNext} disabled={!reason || isEmergency}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 2: Clinic & Provider */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-text-main mb-3">Which clinic?</h3>
                <div className="space-y-3">
                  {options.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setClinicId(c.id); setDentistId(''); }}
                      className={`w-full p-4 flex items-center gap-3 border rounded-xl text-left transition-colors ${
                        clinicId === c.id
                          ? 'border-primary bg-primary/5'
                          : 'border-text-muted/20 hover:border-primary/50'
                      }`}
                    >
                      <MapPin className={`w-5 h-5 ${clinicId === c.id ? 'text-primary' : 'text-text-muted'}`} />
                      <div>
                        <div className={`font-semibold ${clinicId === c.id ? 'text-primary' : 'text-text-main'}`}>{c.name}</div>
                        <div className="text-xs text-text-muted">{formatAddress(c.address)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-main mb-3">Preferred Dentist</h3>
                <select
                  value={dentistId}
                  onChange={(e) => setDentistId(e.target.value)}
                  disabled={!clinicId}
                  className="w-full px-4 py-3 bg-base border border-text-muted/20 rounded-xl focus:outline-none focus:border-primary text-sm font-medium"
                >
                  <option value="">No Preference</option>
                  {dentists.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 flex justify-between border-t border-text-muted/10">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={!clinicId}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 3: Date & Time */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-text-main mb-3">Select a Date</h3>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {next14Days.map((d, i) => {
                    const isSelected = selectedDate?.toDateString() === d.toDateString();
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDate(d)}
                        className={`flex flex-col items-center min-w-[70px] p-3 border rounded-xl transition-colors shrink-0 ${
                          isSelected
                            ? 'border-primary bg-primary text-white'
                            : 'border-text-muted/20 text-text-main hover:border-primary/50 bg-base'
                        }`}
                      >
                        <span className="text-xs opacity-80">{format(d, 'EEE')}</span>
                        <span className="text-lg font-bold">{format(d, 'd')}</span>
                        <span className="text-xs opacity-80">{format(d, 'MMM')}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedDate && (
                <div>
                  <h3 className="text-sm font-semibold text-text-main mb-3">Available Times</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {TIME_SLOTS.map(t => (
                      <button
                        key={t}
                        onClick={() => setSelectedTime(t)}
                        className={`py-2 px-3 text-sm font-bold border rounded-lg transition-colors ${
                          selectedTime === t
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-text-muted/20 text-text-main hover:border-primary/50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {submitError && (
                <div role="alert" className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{submitError}</div>
              )}

              <div className="pt-4 flex justify-between border-t border-text-muted/10">
                {isReschedule ? <div /> : <Button variant="outline" onClick={() => setStep(2)}>Back</Button>}
                <Button onClick={handleBook} loading={submitting} disabled={!selectedDate || !selectedTime}>
                  {isReschedule ? 'Confirm New Time' : 'Confirm Booking'}
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { X, ListTodo, Phone, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Appointment, Patient, User, WaitlistEntry } from '../../types';
import { getWaitlist, getWaitlistMatches, WaitlistMatch } from '../../api/apiService';

export interface FreedSlot {
  dentistId: string;
  startTime: string;
  endTime: string;
  entryId: string;
}

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string;
  patients: Patient[];
  dentists: User[];
  /** When set, show who could take this just-cancelled slot. */
  freedAppointment?: Appointment | null;
  onSchedule: (patientId: string, preferredDentistId?: string, slot?: FreedSlot) => void;
}

export function WaitlistModal({ isOpen, onClose, clinicId, patients, dentists, freedAppointment, onSchedule }: WaitlistModalProps) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [matches, setMatches] = useState<WaitlistMatch[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    if (freedAppointment) {
      getWaitlistMatches(freedAppointment.id).then(res => {
        setMatches(res.data || []);
        setIsLoading(false);
      });
    } else {
      setMatches(null);
      getWaitlist(clinicId).then(res => {
        setWaitlist((res.data || []).filter(w => w.status === 'waiting'));
        setIsLoading(false);
      });
    }
  }, [isOpen, clinicId, freedAppointment]);

  const dentistName = (id?: string) => {
    const d = dentists.find(x => x.id === id);
    return d ? `Dr. ${d.firstName} ${d.lastName}` : undefined;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full sm:max-w-md bg-surface border-l border-line shadow-float flex flex-col">
          <div className="flex items-center justify-between px-5 h-14 border-b border-line flex-none">
            <Dialog.Title className="text-[17px] font-semibold flex items-center gap-2">
              {freedAppointment ? <Sparkles className="w-4 h-4 text-accent" /> : <ListTodo className="w-4 h-4 text-primary" />}
              {freedAppointment ? 'Fill the freed slot' : 'Waitlist'}
            </Dialog.Title>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-base" aria-label="Close">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          {freedAppointment && (
            <div className="px-5 py-3 bg-accent/[0.06] border-b border-line text-sm">
              <div className="font-medium">{format(parseISO(freedAppointment.startTime), "EEEE d MMM, h:mm a")}</div>
              <div className="text-text-muted">{dentistName(freedAppointment.dentistId) || 'Dentist'} is now free. These patients asked to be called:</div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading ? (
              <p className="text-center text-sm text-text-muted py-10">Loading…</p>
            ) : freedAppointment ? (
              matches && matches.length > 0 ? matches.map(m => (
                <div key={m.entryId} className="p-4 rounded-control border border-line space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-medium">{m.patientName}</div>
                      <div className="text-[13px] text-text-muted">{m.preferredDateRange || 'Any time'}, waiting {formatDistanceToNowStrict(parseISO(m.waitingSince))}</div>
                    </div>
                    {m.phone && (
                      <a href={`tel:${m.phone.replace(/\s/g, '')}`} className="p-2 rounded-control text-text-muted hover:text-primary hover:bg-base" aria-label={`Call ${m.patientName}`}>
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                  <Button size="sm" className="w-full" onClick={() => onSchedule(m.patientId, m.preferredDentistId, {
                    dentistId: freedAppointment.dentistId, startTime: freedAppointment.startTime, endTime: freedAppointment.endTime, entryId: m.entryId,
                  })}>
                    Book into this slot
                  </Button>
                </div>
              )) : (
                <p className="text-center text-sm text-text-muted py-10">No one on the waitlist matches this slot.</p>
              )
            ) : waitlist.length === 0 ? (
              <div className="text-center text-sm text-text-muted py-10">
                <ListTodo className="w-8 h-8 mx-auto mb-3 opacity-25" />
                No one is waiting. Add patients from the booking form when there's no suitable time.
              </div>
            ) : (
              waitlist.map(entry => {
                const patient = patients.find(p => p.id === entry.patientId);
                const alert = patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0);
                return (
                  <div key={entry.id} className="p-4 rounded-control border border-line space-y-3">
                    <div>
                      <div className="text-[15px] font-medium flex items-center gap-1.5">
                        {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}
                        {alert && <AlertCircle className="w-3.5 h-3.5 text-error" aria-label="Medical alert" />}
                      </div>
                      <div className="text-[13px] text-text-muted">
                        {entry.preferredDateRange || 'Any time'}
                        {dentistName(entry.preferredDentistId) && `, prefers ${dentistName(entry.preferredDentistId)}`}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => onSchedule(entry.patientId, entry.preferredDentistId)}>
                      Find a time
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

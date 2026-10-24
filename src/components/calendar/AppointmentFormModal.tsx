import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Calendar as CalendarIcon, Clock, User as UserIcon, AlertCircle, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Patient, User, Appointment, WaitlistEntry } from '../../types';
import { createAppointment, getAppointments, createPatient, addToWaitlist } from '../../api/apiService';
import { format, parseISO, addMinutes, isBefore, isAfter } from 'date-fns';

interface AppointmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string;
  initialDate?: Date;
  initialDentistId?: string;
  initialPatientId?: string;
  patients: Patient[];
  dentists: User[];
  onSuccess: () => void;
}

const PROCEDURE_TYPES = [
  'Consultation', 'Teeth Cleaning', 'Filling', 'Root Canal', 
  'Extraction', 'Crown/Bridge', 'Orthodontic Adjustment', 
  'Whitening', 'Implant Consultation', 'Follow-up', 'Emergency'
];

export function AppointmentFormModal({ isOpen, onClose, clinicId, initialDate, initialDentistId, initialPatientId, patients, dentists, onSuccess }: AppointmentFormModalProps) {
  const [patientId, setPatientId] = useState<string>(initialPatientId || '');
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [newPatientData, setNewPatientData] = useState({ 
    firstName: '', 
    lastName: '', 
    phone: '',
    communicationPrefs: { whatsappOptIn: true, language: 'English' }
  });
  
  const [dentistId, setDentistId] = useState<string>(initialDentistId || (dentists[0]?.id || ''));
  const [procedureType, setProcedureType] = useState(PROCEDURE_TYPES[0]);
  const [date, setDate] = useState(initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(initialDate ? format(initialDate, 'HH:mm') : '09:00');
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState('');
  const [sendWhatsApp, setWhatsApp] = useState(true);
  
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceCount, setRecurrenceCount] = useState(1);
  const [recurrenceFreq, setRecurrenceFreq] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [hasCheckedConflict, setHasCheckedConflict] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      getAppointments({ clinicId }).then(res => setAppointments(res.data || []));
      if (initialDate) {
        setDate(format(initialDate, 'yyyy-MM-dd'));
        setStartTime(format(initialDate, 'HH:mm'));
      }
      if (initialDentistId) setDentistId(initialDentistId);
      setConflictWarning(null);
      setHasCheckedConflict(false);
    }
  }, [isOpen, clinicId, initialDate, initialDentistId]);

  useEffect(() => {
    if (date && startTime && dentistId && appointments.length > 0) {
      const startDateTime = new Date(`${date}T${startTime}`);
      const endDateTime = addMinutes(startDateTime, duration);
      
      const overlapping = appointments.find(a => {
        if (a.dentistId !== dentistId || a.status === 'cancelled') return false;
        const aStart = new Date(a.startTime);
        const aEnd = new Date(a.endTime);
        return (startDateTime >= aStart && startDateTime < aEnd) ||
               (endDateTime > aStart && endDateTime <= aEnd) ||
               (startDateTime <= aStart && endDateTime >= aEnd);
      });
      
      if (overlapping) {
        const p = patients.find(pat => pat.id === overlapping.patientId);
        setConflictWarning(`This overlaps with ${p ? p.firstName + ' ' + p.lastName : 'an existing'} appointment from ${format(new Date(overlapping.startTime), 'HH:mm')} to ${format(new Date(overlapping.endTime), 'HH:mm')}.`);
      } else {
        setConflictWarning(null);
      }
      setHasCheckedConflict(true);
    }
  }, [date, startTime, duration, dentistId, appointments, patients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let finalPatientId = patientId;
      
      if (isNewPatient) {
        const res = await createPatient(newPatientData);
        if (res.data) finalPatientId = res.data.id;
      }
      
      if (!finalPatientId) throw new Error("Select or create a patient");

      // Generate recurrences
      const occurrences = isRecurring ? recurrenceCount : 1;
      let currDate = new Date(`${date}T${startTime}`);
      
      for (let i = 0; i < occurrences; i++) {
        const startIso = currDate.toISOString();
        const endIso = addMinutes(currDate, duration).toISOString();
        
        await createAppointment({
          patientId: finalPatientId,
          dentistId,
          clinicId,
          startTime: startIso,
          endTime: endIso,
          procedureType,
          notes,
          status: 'scheduled'
        });
        
        if (isRecurring) {
          if (recurrenceFreq === 'weekly') currDate.setDate(currDate.getDate() + 7);
          else if (recurrenceFreq === 'biweekly') currDate.setDate(currDate.getDate() + 14);
          else if (recurrenceFreq === 'monthly') currDate.setMonth(currDate.getMonth() + 1);
        }
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error creating appointment");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWaitlist = async () => {
    if (!patientId && !isNewPatient) return alert("Select a patient to waitlist");
    setIsLoading(true);
    let finalPatientId = patientId;
    if (isNewPatient) {
        const res = await createPatient(newPatientData);
        if (res.data) finalPatientId = res.data.id;
    }
    
    await addToWaitlist({
      patientId: finalPatientId,
      preferredDentistId: dentistId,
      preferredDateRange: `Preferred: ${date}`,
      clinicId
    });
    
    alert("Added to waitlist");
    setIsLoading(false);
    onClose();
    onSuccess();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-base/80 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] bg-surface border border-text-muted/10 p-6 shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-xl font-bold text-text-main flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-primary" />
              New Appointment
            </Dialog.Title>
            <Dialog.Close className="text-text-muted hover:text-text-main hover:bg-surface-hover p-1.5 rounded-md transition-colors">
              <X className="w-5 h-5" aria-label="Close" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Patient Section */}
            <div className="bg-base p-4 rounded-xl border border-text-muted/5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-text-main uppercase tracking-wider">Patient Details</label>
                {!initialPatientId && (
                  <div className="flex bg-surface rounded-md p-1 border border-text-muted/10">
                    <button type="button" onClick={() => setIsNewPatient(false)} className={`text-xs font-medium px-3 py-1 rounded ${!isNewPatient ? 'bg-primary text-white shadow-sm' : 'text-text-muted'}`}>Existing</button>
                    <button type="button" onClick={() => setIsNewPatient(true)} className={`text-xs font-medium px-3 py-1 rounded ${isNewPatient ? 'bg-primary text-white shadow-sm' : 'text-text-muted'}`}>New</button>
                  </div>
                )}
              </div>
              
              {!isNewPatient ? (
                <select required className="w-full bg-surface border border-text-muted/20 rounded-md px-3 py-2 text-sm text-text-main" value={patientId} onChange={e => setPatientId(e.target.value)} disabled={!!initialPatientId}>
                  <option value="" disabled>Select Patient...</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} - {p.phone}</option>)}
                </select>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input placeholder="First Name" required value={newPatientData.firstName} onChange={e => setNewPatientData({...newPatientData, firstName: e.target.value})} />
                  <Input placeholder="Last Name" required value={newPatientData.lastName} onChange={e => setNewPatientData({...newPatientData, lastName: e.target.value})} />
                  <Input placeholder="Phone Number" required value={newPatientData.phone} onChange={e => setNewPatientData({...newPatientData, phone: e.target.value})} className="md:col-span-2" />
                  
                  <div className="md:col-span-2 p-3 bg-surface border border-text-muted/10 rounded-lg space-y-3">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Communication Preferences</label>
                    <div className="flex items-center gap-4">
                       <label className="flex items-center gap-2 cursor-pointer">
                         <input type="checkbox" checked={newPatientData.communicationPrefs.whatsappOptIn} onChange={e => setNewPatientData({...newPatientData, communicationPrefs: {...newPatientData.communicationPrefs, whatsappOptIn: e.target.checked}})} className="rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" />
                         <span className="text-sm font-medium text-text-main">WhatsApp Opt-in</span>
                       </label>
                       <div className="h-4 w-[1px] bg-text-muted/20"></div>
                       <select 
                         className="bg-base border border-text-muted/20 rounded px-2 py-1 text-sm text-text-main"
                         value={newPatientData.communicationPrefs.language}
                         onChange={e => setNewPatientData({...newPatientData, communicationPrefs: {...newPatientData.communicationPrefs, language: e.target.value}})}
                       >
                          <option value="English">English</option>
                          <option value="Hindi">Hindi</option>
                          <option value="Marathi">Marathi</option>
                       </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Appointment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Provider</label>
                <select className="w-full bg-surface border border-text-muted/20 rounded-md px-3 py-2 text-sm text-text-main" value={dentistId} onChange={e => setDentistId(e.target.value)} required>
                  {dentists.map(d => <option key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Procedure Type</label>
                <select className="w-full bg-surface border border-text-muted/20 rounded-md px-3 py-2 text-sm text-text-main" value={procedureType} onChange={e => setProcedureType(e.target.value)} required>
                  {PROCEDURE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Date & Time */}
            <div className="border border-text-muted/10 rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-muted flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5"/> Date</label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-muted flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Start Time</label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-text-muted flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Duration (Mins)</label>
                  <Input type="number" step="5" min="10" value={duration} onChange={e => setDuration(Number(e.target.value))} required />
                </div>
              </div>

              {conflictWarning && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-700 p-3 rounded-lg flex items-start gap-3 mt-4">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold mb-1">Schedule Conflict Detected</p>
                    <p>{conflictWarning}</p>
                    <p className="text-xs mt-2 italic opacity-80">You can still proceed to double-book, or choose another time.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Extras */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-base p-3 rounded-xl border border-text-muted/5">
                <input type="checkbox" id="recurring" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 text-primary rounded border-text-muted/30 focus:ring-primary" />
                <label htmlFor="recurring" className="text-sm font-medium text-text-main flex-1 cursor-pointer">Make this recurring</label>
              </div>
              
              {isRecurring && (
                <div className="pl-8 flex items-end gap-4 animate-in fade-in slide-in-from-top-2">
                   <div className="space-y-1">
                     <label className="text-xs text-text-muted block">Frequency</label>
                     <select className="bg-surface border border-text-muted/20 rounded pl-2 pr-8 py-1.5 text-sm" value={recurrenceFreq} onChange={e => setRecurrenceFreq(e.target.value as any)}>
                       <option value="weekly">Weekly</option>
                       <option value="biweekly">Bi-weekly</option>
                       <option value="monthly">Monthly</option>
                     </select>
                   </div>
                   <div className="space-y-1">
                     <label className="text-xs text-text-muted block">Count</label>
                     <Input type="number" min="2" max="20" className="w-24 h-8 text-sm" value={recurrenceCount} onChange={e => setRecurrenceCount(Number(e.target.value))} />
                   </div>
                   <div className="text-xs text-text-muted italic pb-2">
                     Creates {recurrenceCount} appointments.
                   </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted flex items-center gap-1 uppercase tracking-wider"><FileText className="w-3.5 h-3.5"/> Notes</label>
                <textarea 
                  className="w-full bg-surface border border-text-muted/20 rounded-md px-3 py-2 text-sm text-text-main min-h-[80px]"
                  placeholder="Optional internal notes..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2 bg-teal-500/5 p-3 rounded-xl border border-teal-500/10">
                <div className="flex items-start gap-3">
                  <input type="checkbox" id="whatsapp" checked={sendWhatsApp} onChange={e => setWhatsApp(e.target.checked)} className="w-4 h-4 mt-0.5 text-teal-600 rounded border-teal-500/30 focus:ring-teal-500" />
                  <label htmlFor="whatsapp" className="text-sm font-medium text-teal-800 cursor-pointer">
                    Queue WhatsApp Confirmation
                  </label>
                </div>
                {sendWhatsApp && (
                  <div className="pl-7">
                    <p className="text-xs text-teal-600/80 italic font-normal">"Hi [Patient], your appointment for {procedureType} is confirmed for {date} at {startTime}..."</p>
                    {(!isNewPatient && patients.find(p => p.id === patientId)?.communicationPrefs?.whatsappOptIn === false) && (
                      <p className="text-xs text-amber-600 mt-1.5 font-medium flex items-center gap-1">
                         <AlertCircle className="w-3.5 h-3.5" /> Patient has opted out of WhatsApp messages.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-text-muted/10 flex items-center justify-between">
              <Button type="button" variant="outline" onClick={handleWaitlist} className="text-text-muted hover:text-text-main">
                 Add to Waitlist instead
              </Button>
              <div className="flex gap-3">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">Cancel</Button>
                </Dialog.Close>
                <Button type="submit" disabled={isLoading || (!isNewPatient && !patientId)}>
                   {isLoading ? 'Saving...' : 'Book Appointment'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

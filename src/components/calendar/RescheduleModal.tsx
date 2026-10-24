import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Calendar as CalendarIcon, Clock, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Appointment } from '../../types';
import { updateAppointment } from '../../api/apiService';
import { format, parseISO, addMinutes } from 'date-fns';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment;
  onSuccess: () => void;
}

export function RescheduleModal({ isOpen, onClose, appointment, onSuccess }: RescheduleModalProps) {
  const [date, setDate] = useState(format(parseISO(appointment.startTime), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(format(parseISO(appointment.startTime), 'HH:mm'));
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const durationStr = `${Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / 60000)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const startDateTime = new Date(`${date}T${startTime}`);
      const duration = parseInt(durationStr, 10);
      const endDateTime = addMinutes(startDateTime, duration);
      
      await updateAppointment(appointment.id, {
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        status: 'scheduled'
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error rescheduling appointment");
    } finally {
       setIsLoading(false);
    }
  };

  const oldStart = parseISO(appointment.startTime);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-base/80 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] bg-surface border border-text-muted/10 p-6 shadow-2xl rounded-2xl">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-xl font-bold text-text-main">
              Reschedule Appointment
            </Dialog.Title>
            <Dialog.Close className="text-text-muted hover:text-text-main p-1.5 rounded-md">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-base rounded-xl border border-text-muted/10">
               <div className="space-y-1">
                 <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">Current</p>
                 <p className="font-medium text-sm text-text-main">{format(oldStart, 'MMM d, yyyy')}</p>
                 <p className="text-sm text-text-muted">{format(oldStart, 'HH:mm')}</p>
               </div>
               <ArrowRight className="w-5 h-5 text-text-muted/50" />
               <div className="space-y-1 text-right">
                 <p className="text-xs font-semibold text-primary uppercase tracking-wider">New</p>
                 <p className="font-medium text-sm text-text-main">{format(new Date(`${date}T${startTime||'00:00'}`), 'MMM d, yyyy')}</p>
                 <p className="text-sm text-text-muted">{startTime}</p>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5"/> New Date</label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-muted flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> New Time</label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
              </div>
            </div>

            <div className="flex items-start gap-3 bg-teal-500/5 p-3 rounded-xl border border-teal-500/10">
              <input type="checkbox" id="notify" checked={notifyPatient} onChange={e => setNotifyPatient(e.target.checked)} className="w-4 h-4 mt-0.5 text-teal-600 border-teal-500/30 focus:ring-teal-500 rounded" />
              <label htmlFor="notify" className="text-sm font-medium text-teal-800 cursor-pointer">
                Notify patient of change via WhatsApp
              </label>
            </div>

            <div className="pt-4 border-t border-text-muted/10 flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={isLoading}>
                 {isLoading ? 'Saving...' : 'Confirm Reschedule'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

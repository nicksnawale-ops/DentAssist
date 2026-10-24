import React, { useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Appointment, Patient, User } from '../../types';
import { Badge } from '../ui/Badge';
import { User as UserIcon, Clock, Stethoscope, Mail, Phone, FileText, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { checkinAppointment, cancelAppointment, updateAppointment } from '../../api/apiService';
import { RescheduleModal } from './RescheduleModal';

interface AppointmentPopoverProps {
  appointment: Appointment;
  patient?: Patient;
  dentist?: User;
  children: React.ReactNode;
  onRefresh: () => void;
}

const statusColorMap: Record<string, string> = {
  scheduled: 'bg-teal-500/10 text-teal-800 border-teal-500/20',
  confirmed: 'bg-blue-500/10 text-blue-800 border-blue-500/20',
  in_progress: 'bg-amber-500/10 text-amber-800 border-amber-500/20',
  completed: 'bg-green-500/10 text-green-800 border-green-500/20',
  cancelled: 'bg-gray-500/10 text-gray-700 border-gray-500/20',
  no_show: 'bg-red-500/10 text-red-800 border-red-500/20',
};

export function AppointmentPopover({ appointment, patient, dentist, children, onRefresh }: AppointmentPopoverProps) {
  const [isRescheduleOpen, setRescheduleOpen] = useState(false);
  const [open, setOpen] = useState(false);

  const startTimeStr = new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = new Date(appointment.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const handleCheckin = async () => {
    await checkinAppointment(appointment.id);
    onRefresh();
    setOpen(false);
  };

  const handleCancel = async () => {
    const reason = window.prompt("Optional cancellation reason:");
    if (reason !== null) {
      await cancelAppointment(appointment.id, reason);
      onRefresh();
      setOpen(false);
    }
  };

  const handleComplete = async () => {
    await updateAppointment(appointment.id, { status: 'completed' });
    if (window.confirm("Add treatment notes now? (Creates an EHR entry)")) {
      // Placeholder for EHR forward link
      console.log("Navigating to EHR...");
    }
    onRefresh();
    setOpen(false);
  };

  return (
    <>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          {children}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content 
            align="start" 
            sideOffset={5}
            collisionPadding={16}
            className="z-50 w-[calc(100vw-32px)] sm:w-80 rounded-xl bg-surface p-4 shadow-xl border border-text-muted/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-text-main flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-primary" />
                    {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient'}
                    {patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0) && (
                      <AlertCircle className="w-4 h-4 text-error" title="Medical Alert" />
                    )}
                  </h4>
                  <div className="text-sm text-text-muted mt-0.5">{appointment.procedureType}</div>
                </div>
                 <Badge className={`capitalize ${statusColorMap[appointment.status] || ''}`} variant="outline">
                    {appointment.status.replace('_', ' ')}
                 </Badge>
              </div>

              {patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0) && (
                <div className="bg-error/10 text-error p-2 rounded border border-error/20 text-xs">
                  <div className="font-bold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> MEDICAL ALERT</div>
                  {patient.medicalHistory.allergies.length > 0 && <div>Allergies: {patient.medicalHistory.allergies.join(', ')}</div>}
                  {patient.medicalHistory.chronicConditions.length > 0 && <div>Conditions: {patient.medicalHistory.chronicConditions.join(', ')}</div>}
                </div>
              )}
              
              {/* Details */}
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-3 text-text-muted">
                  <Clock className="w-4 h-4" />
                  <span>{startTimeStr} - {endTimeStr}</span>
                </div>
                <div className="flex items-center gap-3 text-text-muted">
                  <Stethoscope className="w-4 h-4" />
                  <span>{dentist ? `Dr. ${dentist.firstName} ${dentist.lastName}` : 'Unassigned'}</span>
                </div>
                {patient?.phone && (
                  <div className="flex items-center gap-3 text-text-muted">
                    <Phone className="w-4 h-4" />
                    <span>{patient.phone}</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              {appointment.notes && (
                <div className="p-3 bg-base rounded-md border border-text-muted/10 mt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-main mb-1">
                    <FileText className="w-3.5 h-3.5" /> Notes
                  </div>
                  <p className="text-sm text-text-muted italic">{appointment.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 flex flex-wrap items-center gap-2 border-t border-text-muted/10">
                {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                  <>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setOpen(false); setRescheduleOpen(true); }}>Reschedule</Button>
                    <Button size="sm" variant="outline" className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 focus:ring-red-500" onClick={handleCancel}>Cancel</Button>
                    <Button size="sm" className="w-full" onClick={handleCheckin}>Check-in Patient</Button>
                  </>
                )}
                {appointment.status === 'in_progress' && (
                  <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleComplete}>Mark Complete</Button>
                )}
              </div>
              
            </div>
            <PopoverPrimitive.Arrow className="fill-surface" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      {isRescheduleOpen && (
        <RescheduleModal
          isOpen={isRescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          appointment={appointment}
          onSuccess={() => {
            onRefresh();
            setRescheduleOpen(false);
          }}
        />
      )}
    </>
  );
}

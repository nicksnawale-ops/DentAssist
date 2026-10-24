import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Calendar as CalendarIcon, User as UserIcon, ListTodo, Plus, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { WaitlistEntry, Patient, User } from '../../types';
import { getWaitlist } from '../../api/apiService';
import { Badge } from '../ui/Badge';

interface WaitlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicId: string;
  patients: Patient[];
  dentists: User[];
  onSchedule: (patientId: string, preferredDentistId?: string) => void;
}

export function WaitlistModal({ isOpen, onClose, clinicId, patients, dentists, onSchedule }: WaitlistModalProps) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      getWaitlist(clinicId).then(res => {
        setWaitlist(res.data || []);
        setIsLoading(false);
      });
    }
  }, [isOpen, clinicId]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-base/80 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-surface border-l border-line p-6 shadow-2xl flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex items-center justify-between mb-5 flex-none">
            <Dialog.Title className="text-xl font-bold text-text-main flex items-center gap-2">
              <ListTodo className="w-5 h-5 text-primary" />
              Waitlist
            </Dialog.Title>
            <Dialog.Close className="text-text-muted hover:text-text-main p-1.5 rounded-md hover:bg-surface-hover">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {isLoading ? (
               <div className="text-center text-text-muted py-10">Loading...</div>
            ) : waitlist.length === 0 ? (
               <div className="text-center text-text-muted py-10">
                 <ListTodo className="w-8 h-8 mx-auto mb-3 opacity-20" />
                 No patients on the waitlist.
               </div>
            ) : (
               waitlist.map(entry => {
                 const patient = patients.find(p => p.id === entry.patientId);
                 const dentist = dentists.find(d => d.id === entry.preferredDentistId);
                 if (entry.status !== 'waiting') return null;
                 
                 return (
                   <div key={entry.id} className="p-4 bg-base rounded-xl border border-line space-y-3">
                     <div className="flex justify-between items-start gap-2">
                       <div>
                         <h4 className="font-bold text-sm text-text-main flex items-center gap-1.5">
                           {patient ? `${patient.firstName} ${patient.lastName}` : 'Unknown Patient'}
                           {patient?.medicalHistory && (patient.medicalHistory.allergies.length > 0 || patient.medicalHistory.chronicConditions.length > 0) && (
                             <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" title="Medical Alert" />
                           )}
                         </h4>
                         <p className="text-xs text-text-muted mt-0.5">{entry.preferredDateRange}</p>
                       </div>
                       <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">Waiting</Badge>
                     </div>
                     {dentist && (
                       <div className="text-xs text-text-muted flex items-center gap-1.5">
                         <UserIcon className="w-3.5 h-3.5" /> Prefers Dr. {dentist.lastName}
                       </div>
                     )}
                     <div className="pt-2">
                       <Button size="sm" className="w-full gap-2" onClick={() => onSchedule(entry.patientId, entry.preferredDentistId)}>
                         <Plus className="w-3.5 h-3.5" />
                         Try to schedule
                       </Button>
                     </div>
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

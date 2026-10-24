import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, UserRound, MapPin, Clock } from 'lucide-react';
import { User, WorkingHours, Clinic } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { getClinics } from '../../api/apiService';

interface StaffFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: User | null;
  onSave: (staff: Partial<User>) => void;
}

const DEFAULT_HOURS: WorkingHours[] = [
  { day: 'Monday', isWorking: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Tuesday', isWorking: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Wednesday', isWorking: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Thursday', isWorking: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Friday', isWorking: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Saturday', isWorking: true, startTime: '09:00', endTime: '14:00' },
  { day: 'Sunday', isWorking: false, startTime: '09:00', endTime: '18:00' },
];

export function StaffFormModal({ open, onOpenChange, staff, onSave }: StaffFormModalProps) {
  const isEditing = !!staff;
  const [clinics, setClinics] = useState<Clinic[]>([]);
  
  const [formData, setFormData] = useState<Partial<User>>(
    () => staff || {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'dentist',
      clinicIds: [],
      status: 'active',
      dateJoined: new Date().toISOString().split('T')[0],
      specializations: [],
      licenseNumber: '',
      workingHours: DEFAULT_HOURS
    }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getClinics().then(res => {
      if (res.data) setClinics(res.data);
    });
  }, []);

  const handleTextChange = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClinicToggle = (clinicId: string) => {
    setFormData(prev => {
      const current = prev.clinicIds || [];
      if (current.includes(clinicId)) {
        return { ...prev, clinicIds: current.filter(id => id !== clinicId) };
      }
      return { ...prev, clinicIds: [...current, clinicId] };
    });
  };

  const handleHourToggle = (idx: number) => {
    setFormData(prev => {
      const newHours = [...(prev.workingHours || DEFAULT_HOURS)];
      newHours[idx].isWorking = !newHours[idx].isWorking;
      return { ...prev, workingHours: newHours };
    });
  };

  const handleTimeChange = (idx: number, field: 'startTime' | 'endTime', value: string) => {
    setFormData(prev => {
      const newHours = [...(prev.workingHours || DEFAULT_HOURS)];
      newHours[idx][field] = value;
      return { ...prev, workingHours: newHours };
    });
  };

  const handeSpecializationsChange = (val: string) => {
    const arr = val.split(',').map(s => s.trim()).filter(Boolean);
    handleTextChange('specializations', arr);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};
    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.role) newErrors.role = 'Role is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave(formData);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] gap-4 bg-surface p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:rounded-2xl border border-text-muted/10 md:w-full overflow-hidden flex flex-col max-h-[90vh]">
          
          <div className="flex items-center justify-between p-6 border-b border-text-muted/10 bg-base/50">
            <DialogPrimitive.Title className="text-xl font-bold text-text-main flex items-center gap-2">
              <UserRound className="w-5 h-5 text-primary" />
              {isEditing ? 'Edit Staff Details' : 'Add New Staff'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="text-text-muted hover:bg-text-muted/10 p-1.5 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <form id="staff-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Basic Info */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main uppercase tracking-wider text-primary border-b border-text-muted/10 pb-2">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="First Name" error={errors.firstName} required>
                    <Input 
                      placeholder="e.g. John" 
                      value={formData.firstName || ''} 
                      onChange={(e) => handleTextChange('firstName', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Last Name" error={errors.lastName} required>
                    <Input 
                      placeholder="e.g. Doe" 
                      value={formData.lastName || ''} 
                      onChange={(e) => handleTextChange('lastName', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Email" error={errors.email} required>
                    <Input 
                      type="email"
                      placeholder="staff@example.com" 
                      value={formData.email || ''} 
                      onChange={(e) => handleTextChange('email', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Phone Number">
                    <Input 
                      placeholder="+91..." 
                      value={formData.phone || ''} 
                      onChange={(e) => handleTextChange('phone', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Role" required>
                     <select 
                      className="w-full bg-base border border-text-muted/20 rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={formData.role}
                      onChange={(e) => handleTextChange('role', e.target.value)}
                    >
                      <option value="dentist">Dentist</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="admin">Clinic Admin</option>
                    </select>
                  </FormField>
                  <FormField label="Status">
                     <select 
                      className="w-full bg-base border border-text-muted/20 rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={formData.status}
                      onChange={(e) => handleTextChange('status', e.target.value)}
                    >
                      <option value="active">Active</option>
                      <option value="on_leave">On Leave</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </FormField>
                  <FormField label="Date Joined">
                    <Input 
                      type="date"
                      value={formData.dateJoined?.split('T')[0] || ''} 
                      onChange={(e) => handleTextChange('dateJoined', e.target.value)} 
                    />
                  </FormField>
                </div>
              </section>

              {/* Dentist specific fields */}
              {formData.role === 'dentist' && (
                <section className="space-y-4">
                  <h4 className="text-sm font-semibold text-text-main uppercase tracking-wider text-primary border-b border-text-muted/10 pb-2">Professional Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="License/Registration Number">
                      <Input 
                        placeholder="e.g. DCI-12345" 
                        value={formData.licenseNumber || ''} 
                        onChange={(e) => handleTextChange('licenseNumber', e.target.value)} 
                      />
                    </FormField>
                    <FormField label="Specializations (comma separated)">
                      <Input 
                        placeholder="Orthodontics, General" 
                        value={formData.specializations?.join(', ') || ''} 
                        onChange={(e) => handeSpecializationsChange(e.target.value)} 
                      />
                    </FormField>
                  </div>
                </section>
              )}

              {/* Clinic Assignment */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main uppercase tracking-wider text-primary border-b border-text-muted/10 pb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Clinic Assignment
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {clinics.map(clinic => (
                    <label key={clinic.id} className="flex items-center gap-3 p-3 bg-base rounded-lg border border-text-muted/10 cursor-pointer hover:bg-surface-hover transition-colors">
                      <input 
                        type="checkbox"
                        checked={(formData.clinicIds || []).includes(clinic.id)}
                        onChange={() => handleClinicToggle(clinic.id)}
                        className="rounded border-text-muted/30 text-primary w-4 h-4 focus:ring-primary/20"
                      />
                      <span className="text-sm text-text-main font-medium">{clinic.name}</span>
                    </label>
                  ))}
                </div>
              </section>

              {/* Working Hours */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main uppercase tracking-wider text-primary border-b border-text-muted/10 pb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Working Schedule
                </h4>
                <div className="space-y-3">
                  {formData.workingHours?.map((hour, idx) => (
                    <div key={hour.day} className="flex items-center gap-4 bg-base p-3 rounded-lg border border-text-muted/10">
                      <div className="w-28 flex items-center gap-2">
                         <input 
                           type="checkbox" 
                           checked={hour.isWorking} 
                           onChange={() => handleHourToggle(idx)}
                           className="rounded border-text-muted/30 text-primary focus:ring-primary/20 w-4 h-4"
                         />
                         <span className="text-sm font-medium text-text-main">{hour.day}</span>
                      </div>
                      
                      {hour.isWorking ? (
                        <div className="flex flex-1 items-center gap-3">
                          <Input 
                            type="time" 
                            value={hour.startTime} 
                            onChange={(e) => handleTimeChange(idx, 'startTime', e.target.value)} 
                            className="w-32" 
                          />
                          <span className="text-text-muted text-sm">to</span>
                          <Input 
                            type="time" 
                            value={hour.endTime} 
                            onChange={(e) => handleTimeChange(idx, 'endTime', e.target.value)} 
                            className="w-32" 
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-text-muted flex-1 italic">Off Duty</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

            </form>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-text-muted/10 bg-base flex justify-end gap-3">
             <DialogPrimitive.Close asChild>
               <Button variant="outline">Cancel</Button>
             </DialogPrimitive.Close>
             <Button type="submit" form="staff-form">
               {isEditing ? 'Save Changes' : 'Create Staff Member'}
             </Button>
          </div>

        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

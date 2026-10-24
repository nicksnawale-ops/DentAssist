import React, { useState } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Building, MapPin, Clock } from 'lucide-react';
import { Clinic, OperatingHours } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormField } from '../ui/FormField';

interface ClinicFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinic?: Clinic | null;
  onSave: (clinic: Partial<Clinic>) => void;
}

const DEFAULT_HOURS: OperatingHours[] = [
  { day: 'Monday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 'Tuesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 'Wednesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 'Thursday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 'Friday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
  { day: 'Saturday', isOpen: true, openTime: '09:00', closeTime: '14:00' },
  { day: 'Sunday', isOpen: false, openTime: '09:00', closeTime: '18:00' },
];

export function ClinicFormModal({ open, onOpenChange, clinic, onSave }: ClinicFormModalProps) {
  const isEditing = !!clinic;
  
  const [formData, setFormData] = useState<Partial<Clinic>>(
    () => clinic || {
      name: '',
      phone: '',
      email: '',
      timezone: 'Asia/Kolkata',
      status: 'active',
      address: {
        street: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India'
      },
      operatingHours: DEFAULT_HOURS
    }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleTextChange = (field: keyof Clinic, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (field: keyof Clinic['address'], value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address!, [field]: value }
    }));
  };

  const handleHourToggle = (idx: number) => {
    setFormData(prev => {
      const newHours = [...(prev.operatingHours || DEFAULT_HOURS)];
      newHours[idx].isOpen = !newHours[idx].isOpen;
      return { ...prev, operatingHours: newHours };
    });
  };

  const handleTimeChange = (idx: number, field: 'openTime' | 'closeTime', value: string) => {
    setFormData(prev => {
      const newHours = [...(prev.operatingHours || DEFAULT_HOURS)];
      newHours[idx][field] = value;
      return { ...prev, operatingHours: newHours };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Clinic name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.address?.city) newErrors.city = 'City is required';
    
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
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] gap-4 bg-surface p-0 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-panel border border-line md:w-full overflow-hidden flex flex-col max-h-[90vh]">
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-line bg-base/50">
            <DialogPrimitive.Title className="text-xl font-bold text-text-main flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              {isEditing ? 'Edit Clinic Details' : 'Add New Clinic'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="text-text-muted hover:bg-text-muted/10 p-1.5 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            <form id="clinic-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Basic Info */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main text-primary border-b border-line pb-2">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Clinic Name" error={errors.name} required>
                    <Input 
                      placeholder="e.g. Central Dental Clinic" 
                      value={formData.name || ''} 
                      onChange={(e) => handleTextChange('name', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Status">
                     <select 
                      className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={formData.status}
                      onChange={(e) => handleTextChange('status', e.target.value)}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </FormField>
                  <FormField label="Phone Number">
                    <Input 
                      placeholder="+91..." 
                      value={formData.phone || ''} 
                      onChange={(e) => handleTextChange('phone', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Email Address" error={errors.email} required>
                    <Input 
                      type="email" 
                      placeholder="clinic@example.com" 
                      value={formData.email || ''} 
                      onChange={(e) => handleTextChange('email', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Timezone">
                    <select 
                      className="w-full bg-base border border-line rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      value={formData.timezone}
                      onChange={(e) => handleTextChange('timezone', e.target.value)}
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </FormField>
                </div>
              </section>

              {/* Address */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main text-primary border-b border-line pb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Location Details
                </h4>
                <FormField label="Street Address">
                  <Input 
                    placeholder="123 Dental Street" 
                    value={formData.address?.street || ''} 
                    onChange={(e) => handleAddressChange('street', e.target.value)} 
                  />
                </FormField>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="City" error={errors.city} required>
                    <Input 
                      placeholder="Mumbai" 
                      value={formData.address?.city || ''} 
                      onChange={(e) => handleAddressChange('city', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="State">
                    <Input 
                      placeholder="Maharashtra" 
                      value={formData.address?.state || ''} 
                      onChange={(e) => handleAddressChange('state', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Pincode/Zip Code">
                    <Input 
                      placeholder="400001" 
                      value={formData.address?.pincode || ''} 
                      onChange={(e) => handleAddressChange('pincode', e.target.value)} 
                    />
                  </FormField>
                  <FormField label="Country">
                    <Input 
                      placeholder="India" 
                      value={formData.address?.country || ''} 
                      onChange={(e) => handleAddressChange('country', e.target.value)} 
                    />
                  </FormField>
                </div>
              </section>

              {/* Operating Hours */}
              <section className="space-y-4">
                <h4 className="text-sm font-semibold text-text-main text-primary border-b border-line pb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Operating Hours
                </h4>
                <div className="space-y-3">
                  {formData.operatingHours?.map((hour, idx) => (
                    <div key={hour.day} className="flex items-center gap-4 bg-base p-3 rounded-lg border border-line">
                      <div className="w-28 flex items-center gap-2">
                         <input 
                           type="checkbox" 
                           checked={hour.isOpen} 
                           onChange={() => handleHourToggle(idx)}
                           className="rounded border-text-muted/30 text-primary focus:ring-primary/20 w-4 h-4"
                         />
                         <span className="text-sm font-medium text-text-main">{hour.day}</span>
                      </div>
                      
                      {hour.isOpen ? (
                        <div className="flex flex-1 items-center gap-3">
                          <Input 
                            type="time" 
                            value={hour.openTime} 
                            onChange={(e) => handleTimeChange(idx, 'openTime', e.target.value)} 
                            className="w-32" 
                          />
                          <span className="text-text-muted text-sm">to</span>
                          <Input 
                            type="time" 
                            value={hour.closeTime} 
                            onChange={(e) => handleTimeChange(idx, 'closeTime', e.target.value)} 
                            className="w-32" 
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-text-muted flex-1 italic">Closed</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

            </form>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-line bg-base flex justify-end gap-3">
             <DialogPrimitive.Close asChild>
               <Button variant="outline">Cancel</Button>
             </DialogPrimitive.Close>
             <Button type="submit" form="clinic-form">
               {isEditing ? 'Save Changes' : 'Create Clinic'}
             </Button>
          </div>

        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, AlertCircle, Search, UserCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Patient } from '../../types';
import { checkDuplicatePatient, createPatient, updatePatient } from '../../api/apiService';
import { useAuth } from '../../context/AuthContext';

interface PatientRegistrationFormProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Patient;
  mode?: 'register' | 'edit';
  /** Called with the saved patient after it has been stored. */
  onSaved?: (patient: Patient) => void;
}

const splitList = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean);

export function PatientRegistrationForm({ isOpen, onClose, initialData, mode = 'register', onSaved }: PatientRegistrationFormProps) {
  const { user, selectedClinicId } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', dob: '', gender: '', phone: '', email: '', address: '',
    emergencyName: '', emergencyRel: '', emergencyPhone: '',
    allergies: '', medications: '', chronicConditions: [] as string[], pastSurgeries: '',
    reasonForVisit: '', lastDentalVisit: '', ongoingIssues: '', smoking: false,
    insuranceProvider: '', policyNumber: '', insuranceNotes: '',
    referralSource: '', whatsappOptIn: true, language: 'English'
  });

  useEffect(() => {
    if (initialData && mode === 'edit') {
      setFormData({
        firstName: initialData.firstName || '',
        lastName: initialData.lastName || '',
        dob: initialData.dob || '',
        gender: initialData.gender || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: typeof initialData.address === 'string' ? initialData.address : '',
        emergencyName: initialData.emergencyContact?.name || '',
        emergencyRel: initialData.emergencyContact?.relationship || '',
        emergencyPhone: initialData.emergencyContact?.phone || '',
        allergies: initialData.medicalHistory?.allergies?.join(', ') || '',
        medications: initialData.medicalHistory?.medications?.join(', ') || '',
        chronicConditions: initialData.medicalHistory?.chronicConditions || [],
        pastSurgeries: initialData.medicalHistory?.pastSurgeries || '',
        reasonForVisit: initialData.dentalHistory?.reasonForVisit || '',
        lastDentalVisit: initialData.dentalHistory?.lastDentalVisit || '',
        ongoingIssues: initialData.dentalHistory?.ongoingIssues || '',
        smoking: initialData.dentalHistory?.smokingTobaccoUse ?? false,
        insuranceProvider: initialData.insurance?.provider || '',
        policyNumber: initialData.insurance?.policyNumber || '',
        insuranceNotes: initialData.insurance?.notes || '',
        referralSource: initialData.referralSource || '',
        whatsappOptIn: initialData.communicationPrefs?.whatsappOptIn ?? true,
        language: initialData.communicationPrefs?.language || 'English'
      });
      setStep(1); // Reset step on open
    }
  }, [initialData, mode, isOpen]);
  
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const checkDuplicates = async (phone: string) => {
    const res = await checkDuplicatePatient(phone, mode === 'edit' ? initialData?.id : undefined);
    const existing = res.data?.matches[0];
    if (existing) {
      setDuplicateWarning(`A patient named ${existing.firstName} ${existing.lastName} with this phone number already exists.`);
    } else {
      setDuplicateWarning(null);
    }
  };

  const buildPayload = (): Partial<Patient> & { clinicId?: string } => ({
    firstName: formData.firstName.trim(),
    lastName: formData.lastName.trim(),
    dob: formData.dob || undefined,
    gender: formData.gender || undefined,
    phone: formData.phone.trim(),
    email: formData.email.trim() || undefined,
    address: formData.address.trim() || (mode === 'edit' ? initialData?.address : undefined),
    emergencyContact: { name: formData.emergencyName, relationship: formData.emergencyRel, phone: formData.emergencyPhone },
    medicalHistory: {
      allergies: splitList(formData.allergies),
      medications: splitList(formData.medications),
      chronicConditions: formData.chronicConditions,
      pastSurgeries: formData.pastSurgeries,
    },
    dentalHistory: {
      reasonForVisit: formData.reasonForVisit,
      lastDentalVisit: formData.lastDentalVisit,
      ongoingIssues: formData.ongoingIssues,
      smokingTobaccoUse: formData.smoking,
    },
    insurance: { provider: formData.insuranceProvider, policyNumber: formData.policyNumber, notes: formData.insuranceNotes },
    referralSource: formData.referralSource || undefined,
    communicationPrefs: { whatsappOptIn: formData.whatsappOptIn, language: formData.language },
    ...(mode === 'register'
      ? { clinicId: selectedClinicId !== 'all' ? selectedClinicId : user?.clinicId || undefined }
      : {}),
  });

  const handleSubmit = async () => {
    setSaveError(null);
    setFieldErrors({});
    if (!formData.firstName.trim() || !formData.phone.trim()) {
      setStep(1);
      setSaveError('First name and phone number are required.');
      return;
    }
    setSaving(true);
    const payload = buildPayload();
    const res = mode === 'edit' && initialData
      ? await updatePatient(initialData.id, payload)
      : await createPatient(payload, confirmDuplicate);
    setSaving(false);

    if (res.error || !res.data) {
      if (res.error?.code === 'DUPLICATE_PATIENT') {
        setConfirmDuplicate(true);
        setSaveError(`${res.error.message}. Click "Register anyway" if this is a different person (e.g. a family member sharing a phone).`);
      } else {
        setFieldErrors(res.error?.fieldErrors || {});
        setSaveError(res.error?.message || 'Could not save the patient. Please try again.');
        if (res.error?.fieldErrors && Object.keys(res.error.fieldErrors).some(f => ['firstName', 'lastName', 'phone', 'dob', 'email'].includes(f))) {
          setStep(1);
        }
      }
      return;
    }
    setConfirmDuplicate(false);
    onSaved?.(res.data);
    onClose();
  };

  const phoneCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePhoneChange = (val: string) => {
    setFormData({ ...formData, phone: val });
    setConfirmDuplicate(false);
    if (phoneCheckTimer.current) clearTimeout(phoneCheckTimer.current);
    if (val.replace(/\D/g, '').length >= 10) {
      phoneCheckTimer.current = setTimeout(() => checkDuplicates(val), 400);
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleToggleCondition = (condition: string) => {
    const current = formData.chronicConditions;
    if (current.includes(condition)) {
      setFormData({ ...formData, chronicConditions: current.filter(c => c !== condition) });
    } else {
      setFormData({ ...formData, chronicConditions: [...current, condition] });
    }
  };

  const commonConditions = ['Diabetes', 'Hypertension', 'Heart Condition', 'Pregnancy', 'Blood Thinners', 'Asthma', 'Epilepsy'];

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-text-main uppercase tracking-wider mb-2">Personal Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">First Name <span className="text-error">*</span></label>
                <Input value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Last Name <span className="text-error">*</span></label>
                <Input value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Date of Birth <span className="text-error">*</span></label>
                <Input type="date" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Gender <span className="text-error">*</span></label>
                <select 
                  className="w-full bg-base border border-text-muted/20 rounded-lg px-3 h-10 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                 <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Phone Number <span className="text-error">*</span></label>
                 <Input value={formData.phone} onChange={e => handlePhoneChange(e.target.value)} required />
                 {duplicateWarning && (
                   <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded flex items-start gap-2 text-amber-800 text-xs">
                     <UserCheck className="w-4 h-4 shrink-0 mt-0.5" />
                     <div>
                       <p className="font-medium">{duplicateWarning}</p>
                       <button type="button" className="underline font-bold mt-1 hover:text-amber-900">View their profile instead?</button>
                     </div>
                   </div>
                 )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Email Address</label>
                <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Address</label>
                <textarea 
                  className="w-full bg-base border border-text-muted/20 rounded-lg p-3 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none h-20"
                  value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})}
                  placeholder="Full residential address"
                />
              </div>
              <div className="col-span-2 p-3 bg-surface border border-text-muted/10 rounded-lg space-y-3">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Communication Preferences</label>
                <div className="flex items-center gap-4">
                   <label className="flex items-center gap-2 cursor-pointer">
                     <input type="checkbox" checked={formData.whatsappOptIn} onChange={e => setFormData({...formData, whatsappOptIn: e.target.checked})} className="rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" />
                     <span className="text-sm font-medium text-text-main">WhatsApp Notifications Opt-in</span>
                   </label>
                   <div className="h-4 w-[1px] bg-text-muted/20"></div>
                   <select 
                     className="bg-base border border-text-muted/20 rounded px-2 py-1 text-sm text-text-main"
                     value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})}
                   >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                      <option value="Marathi">Marathi</option>
                   </select>
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-text-main uppercase tracking-wider mb-3">Emergency Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Emergency Contact Name</label>
                  <Input value={formData.emergencyName} onChange={e => setFormData({...formData, emergencyName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Relationship</label>
                  <Input value={formData.emergencyRel} onChange={e => setFormData({...formData, emergencyRel: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Emergency Contact Phone</label>
                  <Input value={formData.emergencyPhone} onChange={e => setFormData({...formData, emergencyPhone: e.target.value})} />
                </div>
              </div>
            </div>
            <hr className="border-text-muted/10" />
            <div>
              <div className="flex items-center gap-2 mb-3">
                 <AlertCircle className="w-4 h-4 text-error" />
                 <h3 className="text-sm font-semibold text-text-main uppercase tracking-wider">Medical History</h3>
              </div>
              <div className="space-y-4">
                 <div>
                   <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Known Allergies</label>
                   <Input placeholder="e.g., Penicillin, Latex" value={formData.allergies} onChange={e => setFormData({...formData, allergies: e.target.value})} />
                   <p className="text-[11px] text-text-muted mt-1">Separate multiple entries with commas</p>
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Current Medications</label>
                   <Input placeholder="e.g., Aspirin" value={formData.medications} onChange={e => setFormData({...formData, medications: e.target.value})} />
                   <p className="text-[11px] text-text-muted mt-1">Separate multiple entries with commas</p>
                 </div>
                 
                 <div>
                   <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Chronic Conditions</label>
                   <div className="flex flex-wrap gap-2">
                     {commonConditions.map(cond => (
                       <button
                         key={cond}
                         type="button"
                         onClick={() => handleToggleCondition(cond)}
                         className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                           formData.chronicConditions.includes(cond) 
                           ? 'bg-error text-white border-error shadow-sm' 
                           : 'bg-surface border-text-muted/20 text-text-main hover:border-text-muted/40'
                         }`}
                       >
                         {cond}
                       </button>
                     ))}
                   </div>
                 </div>
                 
                 <div>
                   <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Past Surgeries / Notes</label>
                   <textarea 
                     className="w-full bg-base border border-text-muted/20 rounded-lg p-3 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none h-16"
                     value={formData.pastSurgeries} onChange={e => setFormData({...formData, pastSurgeries: e.target.value})}
                   />
                 </div>
              </div>
            </div>
          </div>
        );
      case 3:
         return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-text-main uppercase tracking-wider mb-3">Dental History</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Reason for Visit</label>
                    <Input value={formData.reasonForVisit} onChange={e => setFormData({...formData, reasonForVisit: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Last Dental Visit Date</label>
                    <Input type="date" value={formData.lastDentalVisit} onChange={e => setFormData({...formData, lastDentalVisit: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Ongoing Dental Issues</label>
                  <textarea 
                    className="w-full bg-base border border-text-muted/20 rounded-lg p-3 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none h-16"
                    value={formData.ongoingIssues} onChange={e => setFormData({...formData, ongoingIssues: e.target.value})}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer p-3 bg-surface border border-text-muted/10 rounded-lg">
                  <input type="checkbox" checked={formData.smoking} onChange={e => setFormData({...formData, smoking: e.target.checked})} className="rounded border-text-muted/30 text-primary focus:ring-primary h-4 w-4" />
                  <div>
                    <span className="text-sm font-medium text-text-main block">Smoking / Tobacco Use</span>
                    <span className="text-xs text-text-muted">Important for assessing gum health and healing</span>
                  </div>
                </label>
              </div>
            </div>
            <hr className="border-text-muted/10" />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 mb-1">
                <h3 className="text-sm font-semibold text-text-main uppercase tracking-wider">Insurance & Referral</h3>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Insurance Provider</label>
                <Input value={formData.insuranceProvider} onChange={e => setFormData({...formData, insuranceProvider: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Policy Number</label>
                <Input value={formData.policyNumber} onChange={e => setFormData({...formData, policyNumber: e.target.value})} />
              </div>
              <div className="col-span-2">
                 <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Referral Source</label>
                 <select 
                   className="w-full bg-base border border-text-muted/20 rounded-lg px-3 h-10 text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                   value={formData.referralSource} onChange={e => setFormData({...formData, referralSource: e.target.value})}
                 >
                   <option value="">How did you hear about us?</option>
                   <option value="Walk-in">Walk-in</option>
                   <option value="Referral">Patient Referral</option>
                   <option value="Google">Google Search</option>
                   <option value="Social Media">Social Media</option>
                   <option value="Other">Other</option>
                 </select>
              </div>
            </div>
          </div>
         );
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-base rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col h-[740px] max-h-[90vh]">
          
          <div className="px-6 py-4 border-b border-text-muted/10 flex justify-between items-center bg-surface shrink-0">
            <div>
              <Dialog.Title className="text-lg font-bold text-text-main tracking-tight">
                {mode === 'edit' ? 'Edit Patient Profile' : 'Register New Patient'}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-text-muted">
                Step {step} of 3: {step === 1 ? 'Personal Info' : step === 2 ? 'Medical History' : 'Dental & Insurance'}
              </Dialog.Description>
            </div>
            <button onClick={onClose} className="p-2 text-text-muted hover:bg-text-muted/10 rounded-full transition-colors">
              <X className="w-5 h-5" aria-label="Close" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
             <div className="flex items-center gap-2 mb-6">
                <div className={`h-1.5 rounded-full flex-1 ${step >= 1 ? 'bg-primary' : 'bg-primary/20'}`}></div>
                <div className={`h-1.5 rounded-full flex-1 ${step >= 2 ? 'bg-primary' : 'bg-primary/20'}`}></div>
                <div className={`h-1.5 rounded-full flex-1 ${step >= 3 ? 'bg-primary' : 'bg-primary/20'}`}></div>
             </div>
             
             {saveError && (
               <div role="alert" className="mb-4 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                 <p>{saveError}</p>
                 {Object.entries(fieldErrors).length > 0 && (
                   <ul className="mt-1 list-disc pl-5 text-xs">
                     {Object.entries(fieldErrors).map(([field, msg]) => <li key={field}>{field}: {msg}</li>)}
                   </ul>
                 )}
               </div>
             )}

             {renderStepContent()}
          </div>

          <div className="px-6 py-4 border-t border-text-muted/10 bg-surface flex justify-between shrink-0">
            {step > 1 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
            ) : (
              <div></div>
            )}
            
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>Continue</Button>
            ) : (
              <Button onClick={handleSubmit} loading={saving}>
                {mode === 'edit' ? 'Save Changes' : confirmDuplicate ? 'Register anyway' : 'Register Patient'}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

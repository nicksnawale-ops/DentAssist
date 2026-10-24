import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import * as Tabs from '@radix-ui/react-tabs';
import { format, parseISO, differenceInYears } from 'date-fns';
import { 
  ArrowLeft, Phone, Mail, MapPin, AlertCircle, Edit, CalendarDays, 
  FileText, Wallet, Package, MessageSquare, Clock, User, ClipboardList, Activity,
  AlertTriangle, ChevronDown,
  Pill, FileSignature,
} from 'lucide-react';
import { getAppointments, getPatientById, getStaff } from '../../api/apiService';
import { Appointment, Patient, User as StaffMember } from '../../types';
import { DentalChart } from '../../components/dental-chart/DentalChart';
import { TreatmentPlansTab } from '../../components/treatment/TreatmentPlansTab';
import { ClinicalNotesTab } from '../../components/clinical-notes/ClinicalNotesTab';
import { PatientInvoicesTab } from '../../components/billing/PatientInvoicesTab';
import { DocumentsTab } from '../../components/documents/DocumentsTab';
import { PrescriptionsTab } from '../../components/prescriptions/PrescriptionsTab';
import { ConsentsTab } from '../../components/consents/ConsentsTab';
import { LabOrdersList } from '../lab/LabOrdersList';
import { FamilyCard } from '../../components/family/FamilyCard';
import { PatientRegistrationForm } from '../../components/patients/PatientRegistrationForm';
import { AppointmentFormModal } from '../../components/calendar/AppointmentFormModal';
import { useToast } from '../../components/ui/useToast';
import { useAuth } from '../../context/AuthContext';

export function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
  const [dentists, setDentists] = useState<StaffMember[]>([]);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [planTooth, setPlanTooth] = useState<string | null>(null);
  const [isAlertEnabled, setIsAlertEnabled] = useState(true);
  const [isAlertExpanded, setIsAlertExpanded] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  
  const { selectedClinicId, user } = useAuth();
  const { toast } = useToast();
  // Chart and clinical notes are for clinicians; reception sees plans and billing.
  const isClinicalRole = user?.role === 'dentist' || user?.role === 'admin' || user?.role === 'super_admin';

  const loadAppointments = React.useCallback(async (patientId: string) => {
    const res = await getAppointments({ patientId });
    if (res.data) {
      setPatientAppointments([...res.data].sort((a, b) => b.startTime.localeCompare(a.startTime)));
    }
  }, []);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingPatient(true);
    setLoadError(null);
    Promise.all([getPatientById(id), getStaff()]).then(([patientRes, staffRes]) => {
      if (cancelled) return;
      setPatient(patientRes.data);
      if (patientRes.error && patientRes.error.code !== 'PATIENT_NOT_FOUND') setLoadError(patientRes.error.message);
      setDentists((staffRes.data || []).filter(s => s.role === 'dentist' || s.role === 'admin'));
      setLoadingPatient(false);
    });
    loadAppointments(id);
    return () => { cancelled = true; };
  }, [id, loadAppointments]);

  if (loadingPatient) {
    return <div className="p-8 text-center text-sm text-text-muted">Loading patient…</div>;
  }

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-text-main">Could not load this patient</h2>
        <p className="text-sm text-text-muted mt-2">{loadError}</p>
        <Link to="/patients" className="text-primary mt-4 inline-block hover:underline">Return to directory</Link>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-text-main">Patient not found</h2>
        <Link to="/patients" className="text-primary mt-4 inline-block hover:underline">Return to directory</Link>
      </div>
    );
  }

  const age = patient.dob ? differenceInYears(new Date(), parseISO(patient.dob)) : 'Unknown';
  
  const { allergies = [], chronicConditions = [], medications = [], pastSurgeries } = patient.medicalHistory || {};
  const hasMedicalAlert = allergies.length > 0 || chronicConditions.length > 0;
  
  const alertSummary = [
    allergies.length > 0 ? `Allergies: ${allergies.join(', ')}` : '',
    chronicConditions.length > 0 ? `Conditions: ${chronicConditions.join(', ')}` : ''
  ].filter(Boolean).join(' • ');


  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link to="/patients" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Directory
        </Link>
        {hasMedicalAlert && !isAlertEnabled && (
          <div className="mt-1">
            <button 
              onClick={() => setIsAlertEnabled(true)}
              className="text-xs text-text-muted hover:text-primary transition-colors underline"
            >
              Show medical alert
            </button>
          </div>
        )}
      </div>

      {hasMedicalAlert && isAlertEnabled && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between h-10 px-3 bg-[#FEF2F2] border-l-4 border-l-error rounded-lg shadow-panel text-[#7F1D1D] transition-all">
            <div className="flex items-center gap-2 overflow-hidden flex-1" title={alertSummary}>
              <AlertTriangle className="w-4 h-4 shrink-0 text-error" />
              <span className="text-sm font-medium truncate">{alertSummary}</span>
            </div>
            <div className="flex items-center gap-4 shrink-0 pl-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#7F1D1D]/70">Alert</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAlertEnabled}
                  onClick={() => setIsAlertEnabled(false)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAlertEnabled ? 'bg-error' : 'bg-gray-300'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAlertEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              <button 
                onClick={() => setIsAlertExpanded(!isAlertExpanded)}
                className="p-1 hover:bg-[#7F1D1D]/10 rounded transition-colors"
                aria-label={isAlertExpanded ? "Collapse alert details" : "Expand alert details"}
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${isAlertExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          
          {isAlertExpanded && (
            <div className="bg-white border border-line rounded-lg p-4 shadow-panel animate-in slide-in-from-top-2 fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {allergies.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#7F1D1D]/70 mb-2">Allergies</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {allergies.map(a => <span key={a} className="px-2.5 py-0.5 bg-[#FEF2F2] border border-error/20 text-[#7F1D1D] rounded-full text-xs font-medium">{a}</span>)}
                    </div>
                  </div>
                )}
                {chronicConditions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-amber-800/70 mb-2">Chronic Conditions</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {chronicConditions.map(c => <span key={c} className="px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-medium">{c}</span>)}
                    </div>
                  </div>
                )}
                {medications.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text-muted mb-2">Current Medications</h4>
                    <p className="text-sm text-text-main">{medications.join(', ')}</p>
                  </div>
                )}
              </div>
              {pastSurgeries && (
                <div className="mt-4 pt-4 border-t border-line">
                  <h4 className="text-xs font-semibold text-text-muted mb-2">Past Surgeries / Notes</h4>
                  <p className="text-sm text-text-main">{pastSurgeries}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-surface rounded-panel p-6 border border-line shadow-panel flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold border-2 border-primary/20 shrink-0">
            {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
               <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">{patient.firstName} {patient.lastName}</h1>
               {patient.tags?.map(tag => (
                 <span key={tag} className="px-2 py-0.5 rounded text-[11px] font-bold bg-text-muted/10 text-text-muted">
                   {tag}
                 </span>
               ))}
            </div>
            <p className="text-sm text-text-muted font-medium mb-3">
               {age} yrs • {patient.gender || 'Unknown'} {patient.dob ? `• Born ${format(parseISO(patient.dob), 'MMM d, yyyy')}` : ''}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-main">
               <div className="flex items-center gap-1.5"><Phone className="w-4 h-4 text-text-muted" /> {patient.phone}</div>
               {patient.email && <div className="flex items-center gap-1.5"><Mail className="w-4 h-4 text-text-muted" /> {patient.email}</div>}
               {patient.address && (
                  <div className="flex items-center gap-1.5 max-w-xs truncate" title={typeof patient.address === 'string' ? patient.address : ''}>
                    <MapPin className="w-4 h-4 text-text-muted shrink-0" /> 
                    <span className="truncate">{typeof patient.address === 'string' ? patient.address : 'Address object'}</span>
                  </div>
               )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 bg-base" onClick={() => setIsEditModalOpen(true)}><Edit className="w-4 h-4" /> Edit Profile</Button>
          <Button className="gap-2" onClick={() => setIsBookingModalOpen(true)}><CalendarDays className="w-4 h-4" /> Book Appointment</Button>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex gap-2 overflow-x-auto pb-2 border-b border-line mb-6 scrollbar-hide">
          <Tabs.Trigger value="overview" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <User className="w-4 h-4" /> Overview
          </Tabs.Trigger>
          <Tabs.Trigger value="appointments" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <CalendarDays className="w-4 h-4" /> Appointments
          </Tabs.Trigger>
          <Tabs.Trigger value="treatment" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <ClipboardList className="w-4 h-4" /> Treatment Plans
          </Tabs.Trigger>
          {isClinicalRole && (<>
          <Tabs.Trigger value="dental-chart" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <Activity className="w-4 h-4" /> Dental Chart
          </Tabs.Trigger>
          <Tabs.Trigger value="notes" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <FileText className="w-4 h-4" /> Clinical Notes
          </Tabs.Trigger>
          </>)}
          <Tabs.Trigger value="prescriptions" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <Pill className="w-4 h-4" /> Prescriptions
          </Tabs.Trigger>
          <Tabs.Trigger value="consents" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <FileSignature className="w-4 h-4" /> Consent forms
          </Tabs.Trigger>
          <Tabs.Trigger value="billing" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <Wallet className="w-4 h-4" /> Billing
          </Tabs.Trigger>
          <Tabs.Trigger value="documents" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <Package className="w-4 h-4" /> Documents & X-Rays
          </Tabs.Trigger>
          <Tabs.Trigger value="communications" className="flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary whitespace-nowrap outline-none">
            <MessageSquare className="w-4 h-4" /> Communications
          </Tabs.Trigger>
        </Tabs.List>

        <div className="min-h-[400px]">
          <Tabs.Content value="overview" className="outline-none space-y-6">
            <FamilyCard patientId={patient.id} patientName={`${patient.firstName} ${patient.lastName}`.trim()} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Medical History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-text-muted mb-2">Allergies</h4>
                    {allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {allergies.map(a => <span key={a} className="px-2.5 py-1 bg-error/10 text-error rounded-md text-sm font-medium">{a}</span>)}
                      </div>
                    ) : <p className="text-sm text-text-muted">No known allergies</p>}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-text-muted mb-2">Chronic Conditions</h4>
                    {chronicConditions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {chronicConditions.map(c => <span key={c} className="px-2.5 py-1 bg-error/10 text-error rounded-md text-sm font-medium">{c}</span>)}
                      </div>
                    ) : <p className="text-sm text-text-muted">None reported</p>}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-text-muted mb-2">Current Medications</h4>
                    {medications.length > 0 ? (
                      <p className="text-sm text-text-main">{medications.join(', ')}</p>
                    ) : <p className="text-sm text-text-muted">None reported</p>}
                  </div>
                  {pastSurgeries && (
                    <div>
                      <h4 className="text-xs font-semibold text-text-muted mb-2">Past Surgeries / Notes</h4>
                      <p className="text-sm text-text-main">{pastSurgeries}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Emergency Contact</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {patient.emergencyContact ? (
                      <div className="space-y-2 text-sm">
                        <p><span className="text-text-muted w-24 inline-block">Name:</span> <span className="font-medium text-text-main">{patient.emergencyContact.name}</span></p>
                        <p><span className="text-text-muted w-24 inline-block">Relation:</span> <span className="font-medium text-text-main">{patient.emergencyContact.relationship}</span></p>
                        <p><span className="text-text-muted w-24 inline-block">Phone:</span> <span className="font-medium text-text-main">{patient.emergencyContact.phone}</span></p>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted">Not provided</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Dental Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {patient.dentalHistory ? (
                      <>
                        <div>
                          <h4 className="text-xs font-semibold text-text-muted mb-1">Reason for Visit</h4>
                          <p className="text-sm text-text-main">{patient.dentalHistory.reasonForVisit || 'Not specified'}</p>
                        </div>
                        <div className="flex gap-8">
                          <div>
                            <h4 className="text-xs font-semibold text-text-muted mb-1">Last Visit</h4>
                            <p className="text-sm text-text-main">{patient.dentalHistory.lastDentalVisit ? format(parseISO(patient.dentalHistory.lastDentalVisit), 'MMM d, yyyy') : 'Unknown'}</p>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-text-muted mb-1">Tobacco Use</h4>
                            <p className="text-sm text-text-main">{patient.dentalHistory.smokingTobaccoUse ? 'Yes' : 'No'}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-text-muted">Dental history not available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="appointments" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Patient Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                 {patientAppointments.length > 0 ? (
                   <div className="space-y-4">
                     {patientAppointments.map(appt => (
                       <div key={appt.id} className="flex justify-between items-center p-4 border border-line rounded-lg bg-base">
                         <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-lg bg-surface flex flex-col items-center justify-center shrink-0 border border-line">
                             <span className="text-[11px] uppercase font-bold text-text-muted">{format(parseISO(appt.startTime), 'MMM')}</span>
                             <span className="text-lg font-bold text-text-main leading-none">{format(parseISO(appt.startTime), 'd')}</span>
                           </div>
                           <div>
                             <h4 className="font-semibold text-sm text-text-main">{appt.procedureType}</h4>
                             <div className="flex items-center gap-2 text-xs text-text-muted mt-1">
                               <Clock className="w-3.5 h-3.5" /> 
                               {format(parseISO(appt.startTime), 'h:mm a')} - {format(parseISO(appt.endTime), 'h:mm a')}
                             </div>
                           </div>
                         </div>
                         <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              appt.status === 'scheduled' || appt.status === 'confirmed' ? 'bg-primary/10 text-primary' :
                              appt.status === 'completed' ? 'bg-teal-500/10 text-teal-800' :
                              'bg-text-muted/10 text-text-muted'
                            }`}>
                              {appt.status}
                            </span>
                         </div>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="text-sm text-text-muted py-8 text-center">No appointments found for this patient.</p>
                 )}
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="treatment" className="outline-none">
             <TreatmentPlansTab patientId={patient.id} prefillTooth={planTooth} onPrefillUsed={() => setPlanTooth(null)} />
             <section className="mt-8">
               <h3 className="text-[15px] font-semibold mb-3">Lab cases</h3>
               <LabOrdersList patientId={patient.id} />
             </section>
          </Tabs.Content>
          
          <Tabs.Content value="dental-chart" className="outline-none">
             <DentalChart
               patientId={patient.id}
               initialAge={typeof age === 'number' ? age : 'Unknown'}
               onAddToPlan={tooth => { setPlanTooth(tooth); setActiveTab('treatment'); }}
             />
          </Tabs.Content>
          
          <Tabs.Content value="notes" className="outline-none">
             <ClinicalNotesTab patientId={patient.id} />
          </Tabs.Content>

          <Tabs.Content value="prescriptions" className="outline-none">
             <PrescriptionsTab patientId={patient.id} allergies={patient.medicalHistory?.allergies || []} />
          </Tabs.Content>

          <Tabs.Content value="consents" className="outline-none">
             <ConsentsTab patientId={patient.id} patientName={`${patient.firstName} ${patient.lastName}`.trim()} dentists={dentists.filter(d => d.role === 'dentist')} />
          </Tabs.Content>

          <Tabs.Content value="billing" className="outline-none">
             <PatientInvoicesTab patientId={patient.id} />
          </Tabs.Content>
          
          <Tabs.Content value="documents" className="outline-none">
             <DocumentsTab patientId={patient.id} />
          </Tabs.Content>
          
          <Tabs.Content value="communications" className="outline-none">
            <Card>
              <CardHeader>
                <CardTitle>Communication Log</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[url('https://raw.githubusercontent.com/hassanrazadev/whatsapp-chat-background/master/bg.png')] bg-cover relative rounded-xl border border-line overflow-hidden min-h-[300px] flex flex-col justify-end p-6">
                   <div className="absolute inset-0 bg-[#EFEAE2]/90 mix-blend-overlay pointer-events-none"></div>
                   
                   <div className="relative z-10 space-y-4 max-w-lg mx-auto w-full">
                     <div className="text-center">
                       <span className="bg-surface/80 backdrop-blur text-xs text-text-muted px-3 py-1 rounded-full shadow-panel">Yesterday</span>
                     </div>
                     <div className="bg-[#E7FFDB] text-[#111B21] ml-auto rounded-lg rounded-tr-none p-3 shadow-panel text-sm w-4/5">
                        <p>Hi {patient.firstName}, your appointment with Dr. Smith is confirmed for tomorrow at 10:00 AM.</p>
                        <div className="flex justify-end items-center gap-1 mt-1 text-black/40 text-[11px]">
                          <span>10:30 AM</span>
                          <svg viewBox="0 0 16 15" width="16" height="15" className="text-[#53bdeb]"><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path></svg>
                        </div>
                     </div>
                     {!patient.communicationPrefs?.whatsappOptIn && (
                       <div className="text-center mt-4">
                         <span className="bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded shadow-panel border border-amber-200">Patient has opted out of WhatsApp messages.</span>
                       </div>
                     )}
                   </div>
                </div>
              </CardContent>
            </Card>
          </Tabs.Content>
        </div>
      </Tabs.Root>

      <PatientRegistrationForm 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        initialData={patient}
        mode="edit"
        onSaved={(saved) => {
          setPatient(saved);
          toast({
            title: "Patient profile updated successfully",
            variant: "success"
          });
        }}
      />

      <AppointmentFormModal 
        isOpen={isBookingModalOpen} 
        onClose={() => setIsBookingModalOpen(false)} 
        clinicId={selectedClinicId}
        initialPatientId={patient.id}
        patients={[patient]}
        dentists={dentists}
        onSuccess={() => {
          loadAppointments(patient.id);
          toast({
            title: "Appointment booked successfully",
            variant: "success"
          });
          setIsBookingModalOpen(false);
        }}
      />
    </div>
  );
}

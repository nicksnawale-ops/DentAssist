import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { useAuth } from '../../context/AuthContext';
import { DentalChart } from '../../components/dental-chart/DentalChart';
import { TreatmentPlansTab } from '../../components/treatment/TreatmentPlansTab';
import { DocumentsTab } from '../../components/documents/DocumentsTab';
import { FileText, Stethoscope, Paperclip, Pill, FileSignature } from 'lucide-react';
import { PrescriptionsTab } from '../../components/prescriptions/PrescriptionsTab';
import { ConsentsTab } from '../../components/consents/ConsentsTab';

export function PatientRecordsView() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'chart');

  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">My records</h1>
      </div>

      <p className="text-sm text-text-muted -mt-2">
        This is what your dentist has recorded. For questions about any treatment, please speak to your clinic.
      </p>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="bg-surface rounded-panel border border-line shadow-panel overflow-hidden flex flex-col">
        <Tabs.List className="flex border-b border-line bg-base px-2 pt-2 overflow-x-auto scrollbar-hide">
          <Tabs.Trigger 
            value="chart" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <Stethoscope className="w-4 h-4" /> Dental Chart
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="plans" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Treatment Plans
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="documents" 
            className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2"
          >
            <Paperclip className="w-4 h-4" /> Documents
          </Tabs.Trigger>
          <Tabs.Trigger value="prescriptions" className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2">
            <Pill className="w-4 h-4" /> Prescriptions
          </Tabs.Trigger>
          <Tabs.Trigger value="consents" className="whitespace-nowrap shrink-0 px-4 sm:px-6 py-3 border-b-2 border-transparent text-sm font-medium text-text-muted hover:text-text-main data-[state=active]:border-primary data-[state=active]:text-primary outline-none transition-colors flex items-center gap-2">
            <FileSignature className="w-4 h-4" /> Consent forms
          </Tabs.Trigger>
        </Tabs.List>
        
        <div className="p-4 sm:p-6 bg-surface min-h-[400px]">
          <Tabs.Content value="chart" className="outline-none h-full">
             <DentalChart patientId={user.patientId || user.id} initialAge="Unknown" readOnly />
          </Tabs.Content>
          <Tabs.Content value="plans" className="outline-none h-full">
             <TreatmentPlansTab patientId={user.patientId || user.id} readOnly />
          </Tabs.Content>
          <Tabs.Content value="documents" className="outline-none h-full">
            <DocumentsTab patientId={user.id} />
          </Tabs.Content>
          <Tabs.Content value="prescriptions" className="outline-none h-full">
            <PrescriptionsTab patientId={user.patientId || user.id} />
          </Tabs.Content>
          <Tabs.Content value="consents" className="outline-none h-full">
            <ConsentsTab patientId={user.patientId || user.id} patientName={`${user.firstName} ${user.lastName}`.trim()} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

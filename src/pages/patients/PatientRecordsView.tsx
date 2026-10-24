import React, { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useAuth } from '../../context/AuthContext';
import { DentalChart } from '../../components/dental-chart/DentalChart';
import { TreatmentPlansTab } from '../../components/treatment/TreatmentPlansTab';
import { DocumentsTab } from '../../components/documents/DocumentsTab';
import { FileText, Stethoscope, Paperclip } from 'lucide-react';

export function PatientRecordsView() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('chart');

  if (!user) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">My Dental Records</h1>
        <p className="text-sm text-text-muted">Review your chart, treatment plans, and uploaded documents.</p>
      </div>

      <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 text-sm text-blue-700 font-medium">
        This is a read-only view of your clinical records. If you have any questions about these documents or treatments, please contact your dentist.
      </div>

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
        </Tabs.List>
        
        <div className="p-6 bg-surface min-h-[500px]">
          <Tabs.Content value="chart" className="outline-none h-full">
             <div className="pointer-events-none">
               <DentalChart patientId={user.id} initialAge={35} />
             </div>
          </Tabs.Content>
          <Tabs.Content value="plans" className="outline-none h-full">
             <div className="pointer-events-none">
                {/* Wrap in pointer-events-none to prevent editing, but they can still read */}
                <TreatmentPlansTab patientId={user.id} />
             </div>
          </Tabs.Content>
          <Tabs.Content value="documents" className="outline-none h-full">
            <DocumentsTab patientId={user.id} />
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Info, MessageSquare, RotateCcw } from 'lucide-react';

const defaultTemplates = {
  booking_confirmation: 'Hi {patient_name}, your appointment with Dr. {dentist_name} at {clinic_name} is confirmed for {date} at {time}. Reply CONFIRM to confirm or CANCEL to cancel.',
  reminder_24h: 'Hi {patient_name}, reminder: you have an appointment tomorrow at {time} with Dr. {dentist_name}. See you soon!',
  reminder_2h: 'Hi {patient_name}, your appointment with Dr. {dentist_name} starts in 2 hours. See you at {time}.',
  reschedule_notice: 'Hi {patient_name}, your appointment has been rescheduled to {date} at {time}. Reply CONFIRM to confirm.',
  cancellation_notice: 'Hi {patient_name}, your appointment on {date} at {time} has been cancelled. Please contact us to rebook.',
  thank_you: 'Hi {patient_name}, thank you for visiting {clinic_name}. We hope you had a great experience! Please leave a review: {review_link}'
};

export function WhatsAppTemplates() {
  const [templates, setTemplates] = useState(defaultTemplates);
  const [activeTab, setActiveTab] = useState<keyof typeof defaultTemplates>('booking_confirmation');

  const handleTemplateChange = (val: string) => {
    setTemplates({ ...templates, [activeTab]: val });
  };

  const handleReset = () => {
    setTemplates({ ...templates, [activeTab]: defaultTemplates[activeTab] });
  };

  const getPreviewText = (text: string) => {
    return text
      .replace(/{patient_name}/g, 'Jane Doe')
      .replace(/{dentist_name}/g, 'Sarah Smith')
      .replace(/{clinic_name}/g, 'SmileCare Downtown')
      .replace(/{date}/g, 'Oct 24')
      .replace(/{time}/g, '10:00 AM')
      .replace(/{review_link}/g, 'https://g.page/r/123');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
           <MessageSquare className="w-5 h-5 text-[#25D366]" /> 
           WhatsApp Templates
        </CardTitle>
        <CardDescription>
          Configure message templates for automated notifications. 
          <br/>
          <span className="flex items-center gap-1.5 mt-2 text-amber-600 bg-amber-50 px-2 py-1.5 rounded text-xs">
            <Info className="w-4 h-4 shrink-0" />
            Note: WhatsApp Business API templates require pre-approval from Meta before they can be used in production. Ensure your edits comply with Meta's policies.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-6">
           <div className="w-full md:w-64 flex-shrink-0 flex flex-col gap-1 pr-2">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Message Types</h4>
              {(Object.keys(defaultTemplates) as Array<keyof typeof defaultTemplates>).map(key => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === key ? 'bg-primary/10 text-primary' : 'text-text-main hover:bg-base'
                  }`}
                >
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
           </div>
           
           <div className="flex-1 space-y-4">
              <div className="flex justify-between items-center">
                 <h3 className="text-sm font-semibold text-text-main">Edit Template</h3>
                 <Button variant="outline" size="sm" onClick={handleReset} className="h-8 text-xs gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
                 </Button>
              </div>
              
              <textarea 
                 value={templates[activeTab]}
                 onChange={(e) => handleTemplateChange(e.target.value)}
                 className="w-full h-32 p-3 bg-base border border-text-muted/20 rounded-lg text-sm text-text-main focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none transition-all resize-none"
              />
              
              <div className="pt-2">
                 <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Live Preview</h4>
                 <div className="bg-[url('https://raw.githubusercontent.com/hassanrazadev/whatsapp-chat-background/master/bg.png')] bg-cover relative rounded-lg border border-text-muted/10 overflow-hidden">
                   <div className="absolute inset-0 bg-[#EFEAE2]/90 mix-blend-overlay pointer-events-none"></div>
                   <div className="relative z-10 p-4">
                     <div className="bg-[#E7FFDB] text-[#111B21] ml-auto rounded-lg rounded-tr-none p-3 shadow-sm text-sm max-w-[85%] whitespace-pre-wrap">
                        {getPreviewText(templates[activeTab])}
                        <div className="flex justify-end items-center gap-1 mt-1">
                          <span className="text-[10px] text-black/40">10:00 AM</span>
                          <svg viewBox="0 0 16 15" width="16" height="15" className="text-[#53bdeb]"><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path></svg>
                        </div>
                     </div>
                   </div>
                 </div>
              </div>
              
              <div className="flex justify-end pt-4">
                 <Button>Save Template</Button>
              </div>
           </div>
        </div>
      </CardContent>
    </Card>
  );
}

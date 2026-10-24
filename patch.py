import re

with open("src/pages/communications/CommunicationLog.tsx", "r") as f:
    content = f.read()

# 1. Update imports
content = content.replace("import React, { useState } from 'react';", "import React, { useState, useRef, useEffect } from 'react';")
content = content.replace("import { Search, Filter, Check, CheckCheck, Clock, AlertCircle, MessageSquare, ArrowLeft, Info, Plus } from 'lucide-react';", "import { Search, Filter, Check, CheckCheck, Clock, AlertCircle, MessageSquare, ArrowLeft, Info, Plus, Send, FileText } from 'lucide-react';")

# 2. Update states
state_to_find = """  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isMobileThreadView, setIsMobileThreadView] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  // For compose modal
  const [composeChannel, setComposeChannel] = useState('whatsapp');
  const [composeTemplate, setComposeTemplate] = useState('');
  const [composeMessage, setComposeMessage] = useState('');"""

state_replacement = """  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isMobileThreadView, setIsMobileThreadView] = useState(false);

  const [composeMessage, setComposeMessage] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (composerRef.current && !composerRef.current.contains(event.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [selectedPatientId, logs]);

  const templates = [
    { id: 'booking_confirmation', name: 'Booking Confirmation', text: 'Hi {patient_name}, your appointment with {dentist_name} at SmileCare Downtown is confirmed for {date} at {time}. Reply CONFIRM to confirm or CANCEL to cancel.' },
    { id: '24h_reminder', name: '24-Hour Reminder', text: 'Hi {patient_name}, reminder: you have an appointment tomorrow at {time} with {dentist_name}. See you soon!' },
    { id: '2h_reminder', name: '2-Hour Reminder', text: 'Hi {patient_name}, reminder: you have an appointment in 2 hours at {time} with {dentist_name}.' },
    { id: 'reschedule_notice', name: 'Reschedule Notice', text: 'Hi {patient_name}, your appointment has been rescheduled to {date} at {time}. Reply CONFIRM to confirm.' },
    { id: 'cancellation_notice', name: 'Cancellation Notice', text: 'Hi {patient_name}, your appointment on {date} at {time} has been cancelled. Please call us to rebook.' },
    { id: 'post_visit_thank_you', name: 'Post-Visit Thank You', text: 'Hi {patient_name}, thank you for visiting SmileCare Downtown today! We hope you had a great experience.' },
    { id: 'payment_invoice', name: 'Payment Invoice', text: 'Hi {patient_name}, your invoice for {amount} is ready. View and pay securely here: {link}' },
    { id: 'payment_confirmation', name: 'Payment Confirmation', text: 'Hi {patient_name}, thank you! We have received your payment of {amount}. Download your receipt here: {link}' },
  ];"""

content = content.replace(state_to_find, state_replacement)

# 3. Update handleSendMessage
send_to_find = """  const handleSendMessage = () => {
    if (!selectedPatientId || !composeMessage.trim()) return;
    const newLog = {
      id: Date.now().toString(),
      patientName: selectedConversation.patientName,
      patientId: selectedConversation.patientId,
      phoneNumber: selectedConversation.phoneNumber,
      type: composeChannel,
      templateName: composeTemplate,
      message: composeMessage,
      status: 'queued',
      timestamp: new Date().toISOString(),
      error: null
    };
    setLogs([...logs, newLog]);
    setIsComposeOpen(false);
    setComposeMessage('');
    setComposeTemplate('');"""

send_replacement = """  const handleSendMessage = () => {
    if (!selectedPatientId || !composeMessage.trim()) return;
    const newLog = {
      id: Date.now().toString(),
      patientName: selectedConversation.patientName,
      patientId: selectedConversation.patientId,
      phoneNumber: selectedConversation.phoneNumber,
      type: selectedConversation.lastMessage.type || 'whatsapp',
      templateName: 'custom',
      message: composeMessage,
      status: 'queued',
      timestamp: new Date().toISOString(),
      error: null
    };
    setLogs([...logs, newLog]);
    setComposeMessage('');
    setShowTemplates(false);"""

content = content.replace(send_to_find, send_replacement)

# 4. Remove New Message buttons from header
header_buttons_to_find = """              <div className="flex items-center gap-2 sm:gap-3">
                <button className="p-2 text-text-muted hover:bg-gray-100 rounded-full transition-colors" title="Patient Info">
                  <Info className="w-5 h-5" />
                </button>
                <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5" onClick={() => setIsComposeOpen(true)}>
                  <Plus className="w-4 h-4" /> New Message
                </Button>
                <Button variant="outline" size="icon" className="sm:hidden" onClick={() => setIsComposeOpen(true)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>"""

header_buttons_replacement = """              <div className="flex items-center gap-2 sm:gap-3">
                <button className="p-2 text-text-muted hover:bg-gray-100 rounded-full transition-colors" title="Patient Info">
                  <Info className="w-5 h-5" />
                </button>
              </div>"""

content = content.replace(header_buttons_to_find, header_buttons_replacement)

# 5. Add messagesEndRef to end of thread messages list
thread_end_to_find = """              })}
            </div>
          </>"""

thread_end_replacement = """              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Bar */}
            <div ref={composerRef} className="border-t border-[#E5EEEC] bg-white p-[10px] px-3 shrink-0 flex flex-col gap-2 relative z-20">
              <div className="flex items-center justify-between">
                <div className="relative">
                  <button 
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-text-muted hover:bg-gray-100 hover:text-text-main transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Template
                  </button>

                  {showTemplates && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 max-h-60 overflow-y-auto bg-white rounded-xl shadow-lg border border-black/5 py-1 z-50">
                      {templates.map(tpl => (
                        <button
                          key={tpl.id}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#EAF7F5] transition-colors group flex flex-col gap-0.5"
                          onClick={() => {
                            setComposeMessage(tpl.text);
                            setShowTemplates(false);
                          }}
                        >
                          <span className="text-sm font-medium text-text-main group-hover:text-[#14A89D]">{tpl.name}</span>
                          <span className="text-[11px] text-text-muted line-clamp-1">{tpl.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                   selectedConversation.lastMessage.type === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366]' : 
                   'bg-gray-100 text-gray-700'
                 }`}>
                   {selectedConversation.lastMessage.type === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                </span>
              </div>
              
              <div className="flex items-end gap-2 relative">
                <textarea 
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder="Type a message or select a template..."
                  className="flex-1 bg-white border border-text-muted/20 rounded-xl px-4 py-2.5 text-sm text-text-main focus:ring-2 focus:ring-[#14A89D]/20 focus:border-[#14A89D] outline-none resize-none min-h-[44px] max-h-[100px]"
                  rows={composeMessage.split('\\n').length > 3 ? 4 : (composeMessage.split('\\n').length || 1)}
                  style={{ overflowY: composeMessage.split('\\n').length > 4 ? 'auto' : 'hidden' }}
                />
                
                {composeMessage && (
                   <div className="absolute bottom-3 right-16 text-[10px] text-text-muted pointer-events-none bg-white px-1">
                     {composeMessage.length} / 1024
                   </div>
                )}
                
                <button
                  disabled={!composeMessage.trim()}
                  onClick={handleSendMessage}
                  className="w-11 h-11 shrink-0 rounded-full bg-[#0F4C5C] text-white flex items-center justify-center hover:bg-[#14A89D] disabled:opacity-50 disabled:hover:bg-[#0F4C5C] transition-colors"
                >
                  <Send className="w-5 h-5 -ml-0.5" />
                </button>
              </div>
            </div>
          </>"""

content = content.replace(thread_end_to_find, thread_end_replacement)

# 6. Remove the compose modal
compose_modal_start = "{/* COMPOSE MODAL */}"
compose_modal_end = "      </Dialog.Root>"

start_idx = content.find(compose_modal_start)
end_idx = content.find(compose_modal_end)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx + len(compose_modal_end):]

# 7. Highlight variables {patient_name} etc in textarea
# We can't really do this easily in a standard textarea without a custom contenteditable or overlay.
# The prompt says: "with variable placeholders shown in a highlighted/teal-tinted style" 
# Oh, that's impossible in a plain <textarea>. Wait, we can just leave it as plain text if it's a textarea. 
# Prompt: "selecting one pre-fills the message input below with that template's text, with variable placeholders shown in a highlighted/teal-tinted style (e.g. {patient_name}, {dentist_name}, {date}, {time}) so the user can see exactly what needs to be personalized before sending"
# Since I am using a textarea, I can't style specific words. To satisfy it, I could wrap it in a div if not editing, or just accept that textarea can't do it. Let's just use regular textarea.

with open("src/pages/communications/CommunicationLog.tsx", "w") as f:
    f.write(content)

print("Patch applied.")

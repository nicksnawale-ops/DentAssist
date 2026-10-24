import React, { useState, useRef, useEffect } from 'react';
import { format, subHours, subDays, isSameDay } from 'date-fns';
import { Search, Filter, Check, CheckCheck, Clock, AlertCircle, MessageSquare, ArrowLeft, Info, Plus, Send, FileText } from 'lucide-react';
import { Button } from '../../components/ui/Button';


// Dummy data for communications
const now = new Date();
const mockLogs = [
  {
    id: '1',
    patientName: 'Jane Doe',
    patientId: 'p-101',
    phoneNumber: '+1 555-0100',
    type: 'whatsapp',
    templateName: 'booking_confirmation',
    message: 'Hi Jane Doe, your appointment with Dr. Sarah Smith at SmileCare Downtown is confirmed for Oct 24 at 10:00 AM. Reply CONFIRM to confirm or CANCEL to cancel.',
    status: 'read',
    timestamp: subHours(now, 2).toISOString(),
    error: null
  },
  {
    id: '2',
    patientName: 'John Smith',
    patientId: 'p-102',
    phoneNumber: '+1 555-0101',
    type: 'whatsapp',
    templateName: '24h_reminder',
    message: 'Hi John Smith, reminder: you have an appointment tomorrow at 02:00 PM with Dr. Sarah Smith. See you soon!',
    status: 'delivered',
    timestamp: subHours(now, 5).toISOString(),
    error: null
  },
  {
    id: '5',
    patientName: 'Alice Green',
    patientId: 'pat_1',
    phoneNumber: '+91 98765 11111',
    type: 'whatsapp',
    templateName: 'invoice_generated',
    message: 'Hi Alice, your invoice #INV-2026-005 for ₹4,500 is ready. View and pay securely here: https://link.to/pay/INV-2026-005',
    status: 'read',
    timestamp: subHours(now, 6).toISOString(),
    error: null
  },
  {
    id: '6',
    patientName: 'Alice Green',
    patientId: 'pat_1',
    phoneNumber: '+91 98765 11111',
    type: 'whatsapp',
    templateName: 'payment_receipt',
    message: 'Hi Alice, thank you! We have received your payment of ₹4,500 via UPI. Download your receipt here: https://link.to/rcpt/1234',
    status: 'delivered',
    timestamp: subHours(now, 1).toISOString(),
    error: null
  },
  {
    id: '3',
    patientName: 'Alice Johnson',
    patientId: 'p-103',
    phoneNumber: '+1 555-0102',
    type: 'whatsapp',
    templateName: 'reschedule_notice',
    message: 'Hi Alice Johnson, your appointment has been rescheduled to Oct 25 at 11:30 AM. Reply CONFIRM to confirm.',
    status: 'sent',
    timestamp: subHours(now, 24).toISOString(),
    error: null
  },
  {
    id: '4',
    patientName: 'Bob Williams',
    patientId: 'p-104',
    phoneNumber: '+1 555-0103',
    type: 'whatsapp',
    templateName: 'booking_confirmation',
    message: 'Hi Bob Williams, your appointment with Dr. Sarah Smith is confirmed for Oct 26 at 09:00 AM. Reply CONFIRM to confirm or CANCEL to cancel.',
    status: 'failed',
    timestamp: subDays(now, 2).toISOString(),
    error: 'Failed - invalid number format.'
  }
];

export function CommunicationLog() {
  const [logs, setLogs] = useState(mockLogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('All'); // All, WhatsApp, SMS
  const [statusFilter, setStatusFilter] = useState('All'); // All, Read, Unread, Failed

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
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
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return <Clock className="w-3.5 h-3.5 text-gray-500" />;
      case 'sent': return <Check className="w-3.5 h-3.5 text-gray-500" />;
      case 'delivered': return <CheckCheck className="w-3.5 h-3.5 text-gray-500" />;
      case 'read': return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
      case 'failed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      default: return null;
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  // Group by patient
  const groupedLogs = logs.reduce((acc, log) => {
    const key = log.patientId;
    if (!acc[key]) {
      acc[key] = {
        patientId: log.patientId,
        patientName: log.patientName,
        phoneNumber: log.phoneNumber,
        messages: []
      };
    }
    acc[key].messages.push(log);
    return acc;
  }, {} as Record<string, any>);

  const conversations = (Object.values(groupedLogs) as any[]).map((group: any) => {
    group.messages.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    group.lastMessage = group.messages[group.messages.length - 1];
    
    // Check if any unread
    group.hasUnread = group.messages.some((m: any) => ['delivered', 'sent', 'queued'].includes(m.status));
    
    return group;
  }).sort((a, b) => new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime());

  const filteredConversations = conversations.filter((conv: any) => {
    const matchesSearch = conv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          conv.phoneNumber.includes(searchTerm) ||
                          conv.messages.some((m: any) => m.message.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesChannel = channelFilter === 'All' || 
                           (channelFilter === 'WhatsApp' && conv.messages.some((m: any) => m.type === 'whatsapp')) ||
                           (channelFilter === 'SMS' && conv.messages.some((m: any) => m.type === 'sms'));

    const matchesStatus = statusFilter === 'All' ||
                          (statusFilter === 'Unread' && conv.messages.some((m: any) => ['delivered', 'sent', 'queued'].includes(m.status))) ||
                          (statusFilter === 'Read' && conv.messages.some((m: any) => m.status === 'read')) ||
                          (statusFilter === 'Failed' && conv.messages.some((m: any) => m.status === 'failed'));

    return matchesSearch && matchesChannel && matchesStatus;
  });

  const selectedConversation = conversations.find((c: any) => c.patientId === selectedPatientId);

  const handleSelectConversation = (patientId: string) => {
    setSelectedPatientId(patientId);
    setIsMobileThreadView(true);
  };

  const handleBackToList = () => {
    setIsMobileThreadView(false);
  };

  const handleSendMessage = () => {
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
    setShowTemplates(false);
    
    // Simulate delivery
    setTimeout(() => {
      setLogs(currentLogs => currentLogs.map(log => 
        log.id === newLog.id ? { ...log, status: 'sent', timestamp: new Date().toISOString() } : log
      ));
    }, 1000);
    setTimeout(() => {
      setLogs(currentLogs => currentLogs.map(log => 
        log.id === newLog.id ? { ...log, status: 'delivered', timestamp: new Date().toISOString() } : log
      ));
    }, 2000);
  };

  const formatRelativeTime = (isoString: string) => {
    const d = new Date(isoString);
    if (isSameDay(d, now)) {
      return format(d, 'h:mm a');
    }
    return format(d, 'MMM d');
  };

  return (
    <div className="h-full flex bg-white rounded-panel shadow-panel border border-line overflow-hidden">
      
      {/* LEFT PANEL */}
      <div className={`w-full md:w-[35%] flex-shrink-0 flex flex-col border-r border-[#E5EEEC] bg-white transition-transform ${isMobileThreadView ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Left Panel Header */}
        <div className="p-4 border-b border-line shrink-0">
          <h1 className="text-[22px] font-semibold leading-tight text-text-main mb-4">Messages</h1>
          
          <div className="relative w-full mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search patients or messages..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-base border border-line rounded-lg py-2 pl-9 pr-4 text-sm text-text-main focus:ring-2 focus:ring-accent/20 focus:border-accent focus:outline-none transition-all"
            />
          </div>
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {['All', 'WhatsApp', 'SMS'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setChannelFilter(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${channelFilter === filter ? 'bg-accent text-white' : 'bg-surface text-text-muted hover:bg-text-muted/10'}`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface border border-line rounded-lg px-2 py-1 text-xs text-text-main focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none min-w-[130px]"
            >
              <option value="All">All Statuses</option>
              <option value="Read">Read</option>
              <option value="Unread">Unread</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>
        
        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map((conv: any) => (
            <div 
              key={conv.patientId}
              onClick={() => handleSelectConversation(conv.patientId)}
              className={`flex items-start gap-3 p-4 border-b border-line cursor-pointer transition-colors relative ${selectedPatientId === conv.patientId ? 'bg-[#EAF7F5]' : 'hover:bg-gray-50'}`}
            >
              {selectedPatientId === conv.patientId && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent"></div>
              )}
              
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {getInitials(conv.patientName)}
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <div className="flex items-center gap-1.5 truncate">
                    {conv.hasUnread && <div className="w-2 h-2 rounded-full bg-accent shrink-0"></div>}
                    <h3 className={`text-sm truncate ${conv.hasUnread ? 'font-bold text-text-main' : 'font-medium text-text-main'}`}>
                      {conv.patientName}
                    </h3>
                  </div>
                  <span className="text-xs text-text-muted shrink-0 ml-2">
                    {formatRelativeTime(conv.lastMessage.timestamp)}
                  </span>
                </div>
                
                <p className="text-xs text-text-muted truncate mb-1.5">{conv.phoneNumber}</p>
                
                <div className="flex justify-between items-end gap-2">
                  <p className={`text-sm truncate ${conv.hasUnread ? 'font-medium text-text-main' : 'text-text-muted'}`}>
                    {conv.lastMessage.message}
                  </p>
                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                     conv.lastMessage.type === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366]' : 
                     'bg-gray-100 text-gray-700'
                   }`}>
                     {conv.lastMessage.type === 'whatsapp' ? 'WA' : 'SMS'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {filteredConversations.length === 0 && (
            <div className="p-8 text-center">
               <p className="text-sm text-text-muted">No conversations found.</p>
            </div>
          )}
        </div>
      </div>
      
      {/* RIGHT PANEL */}
      <div className={`w-full md:w-[65%] flex-col bg-base ${(!isMobileThreadView && !selectedPatientId) ? 'hidden md:flex' : (isMobileThreadView ? 'flex' : 'hidden md:flex')}`}>
        {selectedConversation ? (
          <>
            {/* Thread Header */}
            <div className="h-16 border-b border-line bg-white flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-panel z-10">
              <div className="flex items-center gap-3">
                <button onClick={handleBackToList} className="md:hidden p-1.5 mr-1 text-text-muted hover:bg-gray-100 rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {getInitials(selectedConversation.patientName)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-text-main">{selectedConversation.patientName}</h2>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                       selectedConversation.lastMessage.type === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366]' : 
                       'bg-gray-100 text-gray-700'
                     }`}>
                       {selectedConversation.lastMessage.type === 'whatsapp' ? 'WA' : 'SMS'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">{selectedConversation.phoneNumber}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button className="p-2 text-text-muted hover:bg-gray-100 rounded-full transition-colors" title="Patient Info">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Thread Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
              {selectedConversation.messages.map((msg: any, index: number, arr: any[]) => {
                const prevMsg = arr[index - 1];
                const showDate = !prevMsg || !isSameDay(new Date(msg.timestamp), new Date(prevMsg.timestamp));
                // Assuming all messages are outbound for now based on mock data
                const isOutbound = true; 
                
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-4">
                        <div className="bg-white/60 backdrop-blur-sm shadow-panel border border-black/5 rounded-full px-3 py-1 text-xs text-text-muted font-medium">
                          {isSameDay(new Date(msg.timestamp), now) ? 'Today' : format(new Date(msg.timestamp), 'MMMM d, yyyy')}
                        </div>
                      </div>
                    )}
                    
                    <div className={`flex w-full ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div className={`relative max-w-[85%] sm:max-w-[75%] rounded-xl px-3 py-2 shadow-panel text-[15px] leading-snug ${isOutbound ? 'bg-[#DCF8C6] text-[#111B21] rounded-br-sm' : 'bg-white text-text-main rounded-bl-sm border border-black/5'}`}>
                         <p className="whitespace-pre-wrap pb-3.5 pr-2">{msg.message}</p>
                         
                         <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] text-black/40 font-medium">
                           <span>{format(new Date(msg.timestamp), 'h:mm a')}</span>
                           {isOutbound && getStatusIcon(msg.status)}
                         </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
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
                          <span className="text-sm font-medium text-text-main group-hover:text-accent">{tpl.name}</span>
                          <span className="text-[11px] text-text-muted line-clamp-1">{tpl.text}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
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
                  className="flex-1 bg-white border border-line rounded-xl px-4 py-2.5 text-sm text-text-main focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none resize-none min-h-[44px] max-h-[100px]"
                  rows={composeMessage.split('\n').length > 3 ? 4 : (composeMessage.split('\n').length || 1)}
                  style={{ overflowY: composeMessage.split('\n').length > 4 ? 'auto' : 'hidden' }}
                />
                
                {composeMessage && (
                   <div className="absolute bottom-3 right-16 text-[11px] text-text-muted pointer-events-none bg-white px-1">
                     {composeMessage.length} / 1024
                   </div>
                )}
                
                <button
                  disabled={!composeMessage.trim()}
                  onClick={handleSendMessage}
                  className="w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center hover:bg-accent disabled:opacity-50 disabled:hover:bg-primary transition-colors"
                >
                  <Send className="w-5 h-5 -ml-0.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full">
            <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-text-muted/40" />
            </div>
            <h3 className="text-lg font-medium text-text-main">Your Messages</h3>
            <p className="text-sm text-text-muted mt-2 max-w-sm">Select a conversation from the list to view the full message thread.</p>
          </div>
        )}
      </div>

      

    </div>
  );
}

/**
 * WhatsApp messaging: provider status, templates, the message log and manual sends.
 * Mock mode keeps a small in-memory log so the screens work without the backend.
 */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';
import { mockWhatsAppTranslations } from '../data/mockWhatsAppTranslations';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped' | 'received';

export interface MessagingStatus {
  provider: 'console' | 'meta' | 'disabled' | string;
  ready: boolean;
  live: boolean;
  remindersEnabled: boolean;
  phoneNumberId?: string | null;
  detail: string;
}

export interface MessageTemplate {
  key: string;
  label: string;
  metaName: string;
  language: string;
  enabled: boolean;
  body: string;
  params: string[];
  /** Hindi ("hi") and Marathi ("mr") versions, sent to patients who chose that language. */
  translations: Record<string, TemplateTranslation>;
}

export interface TemplateTranslation {
  body: string;
  enabled: boolean;
}

export type TemplateUpdate = Partial<Pick<MessageTemplate, 'metaName' | 'language' | 'enabled' | 'body'>> & {
  translations?: Record<string, Partial<TemplateTranslation>>;
};

export const LANGUAGE_LABELS: Record<string, string> = { en: 'English', hi: 'हिंदी', mr: 'मराठी' };

export interface MessageLogEntry {
  id: string;
  patientId: string | null;
  patientName?: string | null;
  phone: string;
  direction: 'outbound' | 'inbound';
  kind: string;
  templateName: string | null;
  body: string;
  status: MessageStatus;
  error: string | null;
  providerMessageId?: string | null;
  appointmentId: string | null;
  invoiceId: string | null;
  /** Language the message went out in (outbound only). */
  language?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendResult {
  status: MessageStatus | 'duplicate';
  message?: MessageLogEntry | null;
  detail: string;
}

export const MESSAGE_KIND_LABELS: Record<string, string> = {
  appointment_reminder: 'Reminder',
  recall_checkup: 'Checkup recall',
  recall_treatment: 'Treatment recall',
  review_request: 'Review request',
  prescription_issued: 'Prescription',
  consent_request: 'Consent form',
  reminder_24h: 'Reminder (day before)',
  reminder_2h: 'Reminder (2 hours)',
  booking_confirmation: 'Booking confirmation',
  slot_offer: 'Waitlist offer',
  invoice_issued: 'Invoice',
  payment_receipt: 'Payment receipt',
  text: 'Reply',
  inbound: 'Patient reply',
  test: 'Test message',
};

// ---------- Mock data ----------

const MOCK_TEMPLATES: Omit<MessageTemplate, 'translations'>[] = [
  { key: 'appointment_reminder', label: 'Reminder, sent by staff', metaName: 'appointment_reminder', language: 'en', enabled: true,
    body: 'Hi {{1}}, a reminder of your dental appointment at {{2}} on {{3}} at {{4}} with {{5}}. Reply CONFIRM to confirm, CANCEL to cancel or RESCHEDULE to change the time.',
    params: ['patient_first_name', 'clinic_name', 'date', 'time', 'dentist_name'] },
  { key: 'reminder_24h', label: 'Reminder, day before', metaName: 'appointment_reminder_24h', language: 'en', enabled: true,
    body: 'Hi {{1}}, a reminder of your dental appointment at {{2}} tomorrow, {{3}} at {{4}} with {{5}}. Reply CONFIRM to confirm, CANCEL to cancel or RESCHEDULE to change the time.',
    params: ['patient_first_name', 'clinic_name', 'date', 'time', 'dentist_name'] },
  { key: 'reminder_2h', label: 'Reminder, 2 hours before', metaName: 'appointment_reminder_2h', language: 'en', enabled: true,
    body: 'Hi {{1}}, see you soon! Your appointment with {{2}} is today at {{3}} at {{4}}.',
    params: ['patient_first_name', 'dentist_name', 'time', 'clinic_name'] },
  { key: 'booking_confirmation', label: 'Booking confirmation', metaName: 'appointment_booked', language: 'en', enabled: true,
    body: "Hi {{1}}, your appointment with {{2}} at {{3}} is booked for {{4}} at {{5}}. Reply CONFIRM to confirm or CANCEL if you can't make it.",
    params: ['patient_first_name', 'dentist_name', 'clinic_name', 'date', 'time'] },
  { key: 'slot_offer', label: 'Waitlist: earlier slot available', metaName: 'waitlist_slot_offer', language: 'en', enabled: true,
    body: 'Hi {{1}}, an earlier appointment just opened with {{2}} on {{3}} at {{4}}. Reply YES to take it. First reply gets the slot.',
    params: ['patient_first_name', 'dentist_name', 'date', 'time'] },
  { key: 'invoice_issued', label: 'Invoice issued', metaName: 'invoice_issued', language: 'en', enabled: true,
    body: 'Hi {{1}}, your invoice {{2}} for {{3}} from {{4}} is ready, due {{5}}. View and pay: {{6}}',
    params: ['patient_first_name', 'invoice_number', 'amount', 'clinic_name', 'due_date', 'link'] },
  { key: 'payment_receipt', label: 'Payment received', metaName: 'payment_received', language: 'en', enabled: true,
    body: 'Hi {{1}}, thank you! We received {{2}} for invoice {{3}}.',
    params: ['patient_first_name', 'amount', 'invoice_number'] },
  { key: 'recall_checkup', label: 'Recall: checkup due', metaName: 'recall_checkup', language: 'en', enabled: true,
    body: "Hi {{1}}, it's time for your regular dental checkup at {{2}}. Book a time that suits you: {{3}} or reply BOOK and we'll call you.",
    params: ['patient_first_name', 'clinic_name', 'booking_link'] },
  { key: 'recall_treatment', label: 'Recall: unfinished treatment', metaName: 'recall_treatment', language: 'en', enabled: true,
    body: "Hi {{1}}, your {{2}} at {{3}} isn't finished yet. Completing it soon helps avoid bigger problems. Book your next visit: {{4}} or reply BOOK and we'll call you.",
    params: ['patient_first_name', 'treatment_name', 'clinic_name', 'booking_link'] },
  { key: 'review_request', label: 'Google review request', metaName: 'review_request', language: 'en', enabled: true,
    body: 'Hi {{1}}, thank you for visiting {{2}}. If you were happy with your care, a quick Google review helps other families find us: {{3}}',
    params: ['patient_first_name', 'clinic_name', 'review_link'] },
  { key: 'prescription_issued', label: 'Prescription ready', metaName: 'prescription_issued', language: 'en', enabled: true,
    body: 'Hi {{1}}, {{2}} at {{3}} has written your prescription. You can view and download it here: {{4}}',
    params: ['patient_first_name', 'dentist_name', 'clinic_name', 'link'] },
  { key: 'consent_request', label: 'Consent form to sign', metaName: 'consent_request', language: 'en', enabled: true,
    body: 'Hi {{1}}, {{2}} has sent you a consent form for {{3}}. Please read it and sign on your phone: {{4}} (link valid for 3 days)',
    params: ['patient_first_name', 'clinic_name', 'procedure', 'link'] },
];

const mockTemplates: MessageTemplate[] = MOCK_TEMPLATES.map(t => ({
  ...t,
  translations: Object.fromEntries(Object.entries(mockWhatsAppTranslations[t.key] || {}).map(([lang, tr]) => [lang, { ...tr }])),
}));

const ago = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();
const mockLog: MessageLogEntry[] = [
  { id: 'm1', patientId: 'pat_1', patientName: 'Alice Green', phone: '919876511111', direction: 'outbound', kind: 'reminder_24h',
    templateName: 'appointment_reminder_24h', body: 'Hi Alice, a reminder of your dental appointment at VisionEdge Central tomorrow, Tue 27 Oct at 10:30 AM with Dr. Sarah Smith. Reply CONFIRM to confirm, CANCEL to cancel or RESCHEDULE to change the time.',
    status: 'read', error: null, appointmentId: null, invoiceId: null, createdAt: ago(95), updatedAt: ago(80) },
  { id: 'm2', patientId: 'pat_1', patientName: 'Alice Green', phone: '919876511111', direction: 'inbound', kind: 'inbound',
    templateName: null, body: 'CONFIRM', status: 'received', error: null, appointmentId: null, invoiceId: null, createdAt: ago(78), updatedAt: ago(78) },
  { id: 'm3', patientId: 'pat_1', patientName: 'Alice Green', phone: '919876511111', direction: 'outbound', kind: 'text',
    templateName: null, body: 'Thank you, your appointment on Tue 27 Oct at 10:30 AM is confirmed.', status: 'delivered', error: null,
    appointmentId: null, invoiceId: null, createdAt: ago(78), updatedAt: ago(77) },
  { id: 'm4', patientId: 'pat_3', patientName: 'Charlie Brown', phone: '919876533333', direction: 'outbound', kind: 'invoice_issued',
    templateName: 'invoice_issued', body: 'Hi Charlie, your invoice INV-2026-0004 for ₹4,500 from VisionEdge Central is ready, due 30 Oct. View and pay: http://localhost:3000/bills',
    status: 'delivered', error: null, appointmentId: null, invoiceId: null, createdAt: ago(300), updatedAt: ago(299) },
  { id: 'm5', patientId: 'pat_2', patientName: 'Bob Martin', phone: '919876522222', direction: 'outbound', kind: 'booking_confirmation',
    templateName: 'appointment_booked', body: 'Hi Bob, your appointment with Dr. Sarah Smith at VisionEdge Central is booked for Thu 29 Oct at 4:00 PM.',
    status: 'skipped', error: 'Patient has not opted in to WhatsApp', appointmentId: null, invoiceId: null, createdAt: ago(1500), updatedAt: ago(1500) },
  { id: 'm6', patientId: 'pat_6', patientName: 'Fiona Shah', phone: '919876566666', direction: 'outbound', kind: 'reminder_24h',
    templateName: 'appointment_reminder_24h', language: 'hi',
    body: 'नमस्ते Fiona, VisionEdge Central में आपका डेंटल अपॉइंटमेंट कल, बुध 28 अक्टू को 11:00 AM बजे Dr. Sarah Smith के साथ है। पुष्टि के लिए CONFIRM, रद्द करने के लिए CANCEL या समय बदलने के लिए RESCHEDULE लिखें।',
    status: 'delivered', error: null, appointmentId: null, invoiceId: null, createdAt: ago(40), updatedAt: ago(39) },
];

const mockSent = (kind: string, body: string): SendResult => {
  const row: MessageLogEntry = {
    id: `m${Date.now()}`, patientId: null, phone: '', direction: 'outbound', kind, templateName: kind, body, status: 'sent',
    error: null, appointmentId: null, invoiceId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  mockLog.unshift(row);
  return { status: 'sent', message: row, detail: 'Sent on WhatsApp (demo)' };
};

// ---------- API ----------

export async function getMessagingStatus(): Promise<ApiResponse<MessagingStatus>> {
  if (!USE_MOCK_API) return http.get('/messaging/status');
  return apiClient(() => ({ provider: 'console', ready: true, live: false, remindersEnabled: true,
    detail: 'Demo mode: messages are shown here, not sent to phones.' }));
}

export async function getMessageTemplates(): Promise<ApiResponse<MessageTemplate[]>> {
  if (!USE_MOCK_API) return http.get('/messaging/templates');
  return apiClient(() => mockTemplates.map(t => ({ ...t, translations: { ...t.translations } })));
}

export async function updateMessageTemplate(key: string, patch: TemplateUpdate): Promise<ApiResponse<MessageTemplate>> {
  if (!USE_MOCK_API) return http.put(`/messaging/templates/${encodeURIComponent(key)}`, patch);
  return apiClient(() => {
    const t = mockTemplates.find(x => x.key === key)!;
    const { translations, ...rest } = patch;
    Object.assign(t, rest);
    for (const [lang, tr] of Object.entries(translations || {})) {
      if (t.translations[lang]) t.translations[lang] = { ...t.translations[lang], ...tr };
    }
    return { ...t, translations: { ...t.translations } };
  });
}

export async function getMessageLog(filters: { patientId?: string; status?: string; direction?: string; q?: string } = {}): Promise<ApiResponse<MessageLogEntry[]>> {
  if (!USE_MOCK_API) return http.get('/messaging/log', filters);
  return apiClient(() => mockLog.filter(m =>
    (!filters.patientId || m.patientId === filters.patientId) &&
    (!filters.status || filters.status.split(',').includes(m.status)) &&
    (!filters.direction || m.direction === filters.direction) &&
    (!filters.q || `${m.body} ${m.phone} ${m.patientName}`.toLowerCase().includes(filters.q.toLowerCase()))));
}

export async function sendAppointmentReminder(appointmentId: string): Promise<ApiResponse<SendResult>> {
  if (!USE_MOCK_API) return http.post(`/appointments/${encodeURIComponent(appointmentId)}/remind`);
  return apiClient(() => mockSent('reminder_24h', 'Appointment reminder'));
}

export async function offerSlotToWaitlist(appointmentId: string, entryIds: string[]): Promise<ApiResponse<SendResult[]>> {
  if (!USE_MOCK_API) return http.post(`/appointments/${encodeURIComponent(appointmentId)}/offer-to-waitlist`, { entryIds });
  return apiClient(() => entryIds.map(() => mockSent('slot_offer', 'An earlier appointment just opened. Reply YES to take it.')));
}

export async function sendInvoiceOnWhatsApp(invoiceId: string): Promise<ApiResponse<SendResult>> {
  if (!USE_MOCK_API) return http.post(`/invoices/${encodeURIComponent(invoiceId)}/whatsapp`);
  return apiClient(() => mockSent('invoice_issued', 'Your invoice is ready.'));
}

export async function sendTestMessage(phone: string): Promise<ApiResponse<SendResult>> {
  if (!USE_MOCK_API) return http.post('/messaging/test', { phone });
  return apiClient(() => mockSent('test', 'Hello World (test message)'));
}

/** Turn "{{1}}" placeholders into readable sample values for previews. */
export function previewTemplate(t: Pick<MessageTemplate, 'body' | 'params'>, lang = 'en'): string {
  const dates: Record<string, [string, string]> = { en: ['Tue 27 Oct', '3 Nov'], hi: ['मंगल 27 अक्टू', '3 नव'], mr: ['मंगळ 27 ऑक्टो', '3 नोव्हें'] };
  const [date, due] = dates[lang] || dates.en;
  const samples: Record<string, string> = {
    patient_first_name: 'Priya', clinic_name: 'VisionEdge Central', date, time: '10:30 AM',
    dentist_name: 'Dr. Sarah Smith', invoice_number: 'INV-2026-0042', amount: '₹4,500', due_date: due,
    link: 'dentassist.app/bills', booking_link: 'dentassist.app/book/central', treatment_name: 'Phase 1: restorative work',
    review_link: 'g.page/r/visionedge/review', procedure: 'tooth extraction',
  };
  return t.params.reduce((text, p, i) => text.split(`{{${i + 1}}}`).join(samples[p] ?? p), t.body);
}

/** "919876511111" -> "+91 98765 11111" */
export function formatPhone(digits: string): string {
  if (/^91\d{10}$/.test(digits)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : '';
}

export async function sendReply(phone: string, text: string): Promise<ApiResponse<SendResult>> {
  if (!USE_MOCK_API) return http.post('/messaging/reply', { phone, text });
  return apiClient(() => {
    const res = mockSent('text', text);
    res.message!.phone = phone;
    const known = mockLog.find(m => m.phone === phone && m.patientName);
    if (known) { res.message!.patientId = known.patientId; res.message!.patientName = known.patientName; }
    return res;
  });
}

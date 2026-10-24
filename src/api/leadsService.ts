/** Enquiries (leads): pipeline, follow-ups, conversion to patients, capture links. Mock mode keeps a small list in memory. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, request, USE_MOCK_API } from './http';

export type LeadStatus = 'new' | 'contacted' | 'consult_booked' | 'visited' | 'won' | 'lost';
export type LeadSource = 'website' | 'whatsapp' | 'instagram' | 'facebook' | 'google' | 'practo' | 'justdial' | 'referral' | 'walk_in' | 'phone' | 'other';
export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'wrong_number' | 'call_back';

export const OPEN_STATUSES: LeadStatus[] = ['new', 'contacted', 'consult_booked', 'visited'];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', consult_booked: 'Consult booked', visited: 'Visited', won: 'Won', lost: 'Lost',
};
export const SOURCE_LABEL: Record<LeadSource, string> = {
  website: 'Website', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', google: 'Google',
  practo: 'Practo', justdial: 'Justdial', referral: 'Referral', walk_in: 'Walk-in', phone: 'Phone call', other: 'Other',
};
export const LOST_LABEL: Record<string, string> = {
  price: 'Price too high', no_response: 'No response', chose_another_clinic: 'Chose another clinic', not_needed: 'Not needed now',
  distance: 'Too far', timing: 'Timing did not suit', wrong_number: 'Wrong number', other: 'Other',
};
export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  answered: 'Spoke to them', no_answer: 'No answer', busy: 'Busy', call_back: 'Asked to call back', wrong_number: 'Wrong number',
};

export interface Lead {
  id: string; clinicId: string; name: string; phone: string; email: string | null;
  source: LeadSource; interest: string | null; message: string | null; status: LeadStatus; lostReason: string | null;
  estimatedValue: number | null; assignedToId: string | null; assignedToName: string | null;
  nextFollowUpAt: string | null; isOverdue: boolean; firstContactedAt: string | null; lastContactedAt: string | null;
  contactCount: number; language: 'en' | 'hi' | 'mr'; whatsappConsent: boolean;
  patientId: string | null; patientName: string | null; appointmentId: string | null;
  convertedAt: string | null; closedAt: string | null; campaign: Record<string, string> | null;
  createdAt: string; updatedAt: string;
}
export interface LeadActivity {
  id: string; kind: string; body: string; outcome: string | null; data: Record<string, unknown> | null;
  createdByName: string | null; createdAt: string;
}
export interface LeadDetail extends Lead { activities: LeadActivity[] }

export interface LeadMeta {
  sources: LeadSource[]; statuses: LeadStatus[]; lostReasons: string[]; interests: string[];
  staff: { id: string; name: string; role: string }[];
}
export interface SourceRow { source: LeadSource; leads: number; booked: number; won: number; lost: number; revenue: number; bookingRate: number }
export interface LeadSummary {
  total: number; byStatus: Record<LeadStatus, number>; booked: number; won: number; bookingRate: number; revenue: number;
  medianFirstResponseMinutes: number | null; uncontacted: number; overdue: number; openValue: number;
  bySource: SourceRow[]; lostReasons: { reason: string; count: number }[];
}
export interface LeadSettings { autoAcknowledge: boolean; firstResponseMinutes: number; followUpDays: number; whatsappClinicId: string | null }
export interface CaptureLinks { formUrl: string; embedCode: string; webhookUrl: string; clinicName: string }

export interface NewLead {
  clinicId?: string; name: string; phone: string; email?: string; source: LeadSource; interest?: string; message?: string;
  estimatedValue?: number; assignedToId?: string; language?: 'en' | 'hi' | 'mr'; whatsappConsent?: boolean;
}
export interface LeadChange {
  name?: string; email?: string; interest?: string; estimatedValue?: number | null; assignedToId?: string | null;
  nextFollowUpAt?: string | null; status?: LeadStatus; lostReason?: string; language?: 'en' | 'hi' | 'mr';
  whatsappConsent?: boolean; note?: string;
}

// ---------- Mock ----------

const CENTRAL = 'c1b48b94-132d-41a4-8f77-e2307fbadd2f';
const INTERESTS = ['Checkup', 'Cleaning', 'Tooth pain', 'Root canal', 'Implants', 'Braces / aligners', 'Teeth whitening',
  'Crown / bridge', 'Dentures', 'Wisdom tooth', 'Kids dentistry', 'Smile makeover', 'Other'];
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function mockLead(id: string, name: string, source: LeadSource, interest: string, status: LeadStatus, hours: number, extra: Partial<Lead> = {}): Lead {
  const contacted = status !== 'new';
  return {
    id, clinicId: CENTRAL, name, phone: `91982201${id.replace(/\D/g, '').padStart(4, '0')}`, email: null, source, interest,
    message: null, status, lostReason: status === 'lost' ? 'price' : null, estimatedValue: 25000, assignedToId: contacted ? 's2' : null,
    assignedToName: contacted ? 'John Doe' : null, nextFollowUpAt: status === 'new' ? hoursAgo(hours - 0.25) : contacted && OPEN_STATUSES.includes(status) ? hoursAgo(-24) : null,
    isOverdue: status === 'new' && hours > 0.25, firstContactedAt: contacted ? hoursAgo(hours - 0.3) : null, lastContactedAt: contacted ? hoursAgo(hours - 0.3) : null,
    contactCount: contacted ? 1 : 0, language: 'en', whatsappConsent: true, patientId: null, patientName: null, appointmentId: null,
    convertedAt: null, closedAt: OPEN_STATUSES.includes(status) ? null : hoursAgo(hours - 48), campaign: null,
    createdAt: hoursAgo(hours), updatedAt: hoursAgo(hours), ...extra,
  };
}

let mockLeads: Lead[] = [
  mockLead('lead_1', 'Rohan Kulkarni', 'instagram', 'Braces / aligners', 'new', 0.2),
  mockLead('lead_2', 'Sneha Patil', 'website', 'Implants', 'new', 5, { message: 'Missing lower molar, what is the cost?' }),
  mockLead('lead_3', 'Amit Deshmukh', 'google', 'Root canal', 'contacted', 48),
  mockLead('lead_5', 'Vikram Shinde', 'facebook', 'Smile makeover', 'consult_booked', 140, { estimatedValue: 150000 }),
  mockLead('lead_6', 'Meera Iyer', 'referral', 'Kids dentistry', 'won', 290),
  mockLead('lead_7', 'Kunal Mehta', 'practo', 'Implants', 'lost', 360),
];
const mockActivities: Record<string, LeadActivity[]> = {};

function act(id: string, kind: string, body: string, outcome: string | null = null) {
  (mockActivities[id] ||= []).unshift({ id: `${Date.now()}${Math.random()}`, kind, body, outcome, data: null, createdByName: 'You', createdAt: new Date().toISOString() });
}
function patchMock(id: string, change: Partial<Lead>): Lead {
  mockLeads = mockLeads.map(l => (l.id === id ? { ...l, ...change, updatedAt: new Date().toISOString() } : l));
  return mockLeads.find(l => l.id === id)!;
}

// ---------- API ----------

export async function getLeadMeta(clinicId?: string): Promise<ApiResponse<LeadMeta>> {
  if (!USE_MOCK_API) return http.get('/leads/meta', { clinicId });
  return apiClient(() => ({
    sources: Object.keys(SOURCE_LABEL) as LeadSource[], statuses: Object.keys(STATUS_LABEL) as LeadStatus[],
    lostReasons: Object.keys(LOST_LABEL), interests: INTERESTS,
    staff: [{ id: 's2', name: 'John Doe', role: 'receptionist' }, { id: 's1', name: 'Sarah Smith', role: 'dentist' }],
  }));
}

export async function getLeads(params: { clinicId?: string; view?: 'open' | 'overdue' | 'closed' | 'all'; status?: LeadStatus; source?: string; assignedTo?: string; q?: string } = {}): Promise<ApiResponse<Lead[]>> {
  if (!USE_MOCK_API) return http.get('/leads', params);
  return apiClient(() => mockLeads.filter(l => {
    if (params.status && l.status !== params.status) return false;
    if (!params.status && (params.view ?? 'open') === 'open' && !OPEN_STATUSES.includes(l.status)) return false;
    if (params.view === 'overdue' && !l.isOverdue) return false;
    if (params.view === 'closed' && OPEN_STATUSES.includes(l.status)) return false;
    if (params.source && l.source !== params.source) return false;
    if (params.q && !`${l.name} ${l.phone} ${l.interest}`.toLowerCase().includes(params.q.toLowerCase())) return false;
    return true;
  }));
}

export async function getLeadSummary(clinicId?: string, from?: string, to?: string): Promise<ApiResponse<LeadSummary>> {
  if (!USE_MOCK_API) return http.get('/leads/summary', { clinicId, from, to });
  return apiClient(() => {
    const byStatus = Object.fromEntries((Object.keys(STATUS_LABEL) as LeadStatus[]).map(s => [s, mockLeads.filter(l => l.status === s).length])) as Record<LeadStatus, number>;
    const sources = [...new Set(mockLeads.map(l => l.source))];
    const booked = mockLeads.filter(l => ['consult_booked', 'visited', 'won'].includes(l.status)).length;
    return {
      total: mockLeads.length, byStatus, booked, won: byStatus.won, bookingRate: booked / mockLeads.length, revenue: 18500,
      medianFirstResponseMinutes: 18, uncontacted: byStatus.new, overdue: mockLeads.filter(l => l.isOverdue).length,
      openValue: mockLeads.filter(l => OPEN_STATUSES.includes(l.status)).reduce((s, l) => s + (l.estimatedValue || 0), 0),
      bySource: sources.map(s => {
        const ls = mockLeads.filter(l => l.source === s);
        const b = ls.filter(l => ['consult_booked', 'visited', 'won'].includes(l.status)).length;
        return { source: s, leads: ls.length, booked: b, won: ls.filter(l => l.status === 'won').length, lost: ls.filter(l => l.status === 'lost').length, revenue: s === 'referral' ? 18500 : 0, bookingRate: b / ls.length };
      }),
      lostReasons: [{ reason: 'price', count: 1 }],
    };
  });
}

export async function getLead(id: string): Promise<ApiResponse<LeadDetail>> {
  if (!USE_MOCK_API) return http.get(`/leads/${encodeURIComponent(id)}`);
  return apiClient(() => ({ ...mockLeads.find(l => l.id === id)!, activities: mockActivities[id] || [] }));
}

export async function createLead(body: NewLead): Promise<ApiResponse<{ lead: Lead; merged: boolean }>> {
  if (!USE_MOCK_API) return http.post('/leads', body);
  return apiClient(() => {
    const digits = body.phone.replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const existing = mockLeads.find(l => l.phone === phone && OPEN_STATUSES.includes(l.status));
    if (existing) { act(existing.id, 'enquired_again', body.message || 'Enquired again'); return { lead: existing, merged: true }; }
    const lead = mockLead(`lead_${Date.now()}`, body.name, body.source, body.interest || 'Other', 'new', 0, {
      phone, email: body.email || null, message: body.message || null, estimatedValue: body.estimatedValue ?? null,
      whatsappConsent: !!body.whatsappConsent, nextFollowUpAt: new Date(Date.now() + 15 * 60_000).toISOString(), isOverdue: false,
    });
    mockLeads = [lead, ...mockLeads];
    act(lead.id, 'created', body.message || '');
    return { lead, merged: false };
  });
}

export async function updateLead(id: string, change: LeadChange): Promise<ApiResponse<Lead>> {
  if (!USE_MOCK_API) return http.patch(`/leads/${encodeURIComponent(id)}`, change);
  return apiClient(() => {
    if (change.status) act(id, 'status', `→ ${STATUS_LABEL[change.status]}`);
    else if (change.note) act(id, 'note', change.note);
    const { note: _note, ...rest } = change;
    const closed = change.status === 'won' || change.status === 'lost';
    return patchMock(id, { ...(rest as Partial<Lead>), ...(change.status ? { closedAt: closed ? new Date().toISOString() : null, isOverdue: false } : {}),
      ...(change.status && change.status !== 'lost' ? { lostReason: null } : {}) });
  });
}

export async function logLeadActivity(id: string, body: { kind: 'note' | 'call'; body?: string; outcome?: CallOutcome; nextFollowUpAt?: string }): Promise<ApiResponse<Lead>> {
  if (!USE_MOCK_API) return http.post(`/leads/${encodeURIComponent(id)}/activities`, body);
  return apiClient(() => {
    act(id, body.kind, body.body || '', body.outcome || null);
    const l = mockLeads.find(x => x.id === id)!;
    if (body.kind !== 'call') return patchMock(id, body.nextFollowUpAt ? { nextFollowUpAt: body.nextFollowUpAt } : {});
    return patchMock(id, { contactCount: l.contactCount + 1, status: l.status === 'new' ? 'contacted' : l.status, isOverdue: false,
      firstContactedAt: l.firstContactedAt || new Date().toISOString(), lastContactedAt: new Date().toISOString(),
      nextFollowUpAt: body.nextFollowUpAt || new Date(Date.now() + 2 * 86400_000).toISOString() });
  });
}

export async function sendLeadWhatsApp(id: string): Promise<ApiResponse<{ status: string; detail: string; lead: Lead }>> {
  if (!USE_MOCK_API) return http.post(`/leads/${encodeURIComponent(id)}/whatsapp`);
  return apiClient(() => { act(id, 'whatsapp', 'Follow-up sent'); return { status: 'sent', detail: 'Sent', lead: patchMock(id, { status: 'contacted' }) }; });
}

export async function convertLead(id: string, patientId?: string): Promise<ApiResponse<{ patientId: string; lead: Lead }>> {
  if (!USE_MOCK_API) return http.post(`/leads/${encodeURIComponent(id)}/convert`, { patientId });
  return apiClient(() => { act(id, 'converted', 'Registered as patient'); return { patientId: patientId || 'pat_1', lead: patchMock(id, { patientId: patientId || 'pat_1', convertedAt: new Date().toISOString() }) }; });
}

export async function deleteLead(id: string): Promise<ApiResponse<null>> {
  if (!USE_MOCK_API) return http.delete(`/leads/${encodeURIComponent(id)}`);
  return apiClient(() => { mockLeads = mockLeads.filter(l => l.id !== id); return null; });
}

let mockSettings: LeadSettings = { autoAcknowledge: true, firstResponseMinutes: 15, followUpDays: 2, whatsappClinicId: CENTRAL };
export async function getLeadSettings(): Promise<ApiResponse<LeadSettings>> {
  if (!USE_MOCK_API) return http.get('/leads/settings');
  return apiClient(() => mockSettings);
}
export async function saveLeadSettings(change: Partial<LeadSettings>): Promise<ApiResponse<LeadSettings>> {
  if (!USE_MOCK_API) return http.put('/leads/settings', change);
  return apiClient(() => (mockSettings = { ...mockSettings, ...change }));
}

export async function getCaptureLinks(clinicId: string): Promise<ApiResponse<CaptureLinks>> {
  if (!USE_MOCK_API) return http.get(`/clinics/${encodeURIComponent(clinicId)}/lead-capture`);
  return apiClient(() => {
    const formUrl = `${window.location.origin}/enquire/${clinicId}`;
    return { formUrl, clinicName: 'VisionEdge Central Clinic', webhookUrl: `${window.location.origin}/api/v1/webhooks/leads/${clinicId}?key=demo-key`,
      embedCode: `<iframe src="${formUrl}?embed=1" title="Enquiry form" style="width:100%;max-width:480px;height:640px;border:0"></iframe>` };
  });
}
export async function regenerateCaptureKey(clinicId: string): Promise<ApiResponse<CaptureLinks>> {
  if (!USE_MOCK_API) return http.post(`/clinics/${encodeURIComponent(clinicId)}/lead-capture/regenerate`);
  return getCaptureLinks(clinicId);
}

// ---------- Public enquiry form ----------

export async function getEnquiryForm(clinicId: string): Promise<ApiResponse<{ clinicName: string; clinicPhone: string | null; interests: string[]; onlineBooking: boolean }>> {
  if (!USE_MOCK_API) return request('GET', `/public/enquiry/${encodeURIComponent(clinicId)}`, { anonymous: true });
  return apiClient(() => ({ clinicName: 'VisionEdge Central Clinic', clinicPhone: '+91 20 4000 1000', interests: INTERESTS, onlineBooking: true }));
}

export async function submitEnquiry(clinicId: string, body: {
  name: string; phone: string; email?: string; interest?: string; message?: string; whatsappConsent: boolean;
  language?: 'en' | 'hi' | 'mr'; utm?: Record<string, string>; website?: string;
}): Promise<ApiResponse<{ ok: boolean; firstName: string }>> {
  if (!USE_MOCK_API) return http.anonymousPost(`/public/enquiry/${encodeURIComponent(clinicId)}`, body);
  return apiClient(() => ({ ok: true, firstName: body.name.split(' ')[0] }));
}

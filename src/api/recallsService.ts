/**
 * Recalls (checkups due, unfinished treatment) and Google review requests.
 * Mock mode works on a small in-memory list.
 */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export type RecallStatus = 'due' | 'contacted' | 'booked' | 'dismissed';
export type RecallKind = 'checkup' | 'treatment';

export interface Recall {
  id: string;
  patientId: string;
  patientName: string;
  phone: string | null;
  whatsappOptIn: boolean;
  clinicId: string;
  kind: RecallKind;
  treatmentPlanId: string | null;
  treatmentPlanName?: string | null;
  dueDate: string; // yyyy-mm-dd
  status: RecallStatus;
  reason: string;
  lastVisitAt: string | null;
  contactCount: number;
  lastContactedAt: string | null;
  appointmentId: string | null;
  bookedAt: string | null;
  notes: string | null;
  isDue: boolean;
  createdAt: string;
}

export interface RecallSummary {
  due: number;
  contacted: number;
  bookedLast30Days: number;
  reviewRequestsLast30Days: number;
}

export interface RecallSettings {
  checkupIntervalMonths: number;
  treatmentFollowupDays: number;
  remindAgainDays: number;
  autoSendRecalls: boolean;
  reviewRequestsEnabled: boolean;
  reviewDelayHours: number;
  reviewCooldownDays: number;
}

export interface RecallSendResult {
  id: string;
  status: string;
  detail: string;
}

// ---------- Mock data ----------

const CENTRAL = 'c1b48b94-132d-41a4-8f77-e2307fbadd2f';
const daysFrom = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const dateFrom = (n: number) => daysFrom(n).slice(0, 10);

const mockRecalls: Recall[] = [
  { id: 'rc1', patientId: 'pat_5', patientName: 'Evan Wright', phone: '+91 98765 55555', whatsappOptIn: true, clinicId: CENTRAL,
    kind: 'checkup', treatmentPlanId: null, dueDate: dateFrom(-33), status: 'due', reason: 'Last checkup ' + new Date(Date.now() - 215 * 86400000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    lastVisitAt: daysFrom(-215), contactCount: 0, lastContactedAt: null, appointmentId: null, bookedAt: null, notes: null, isDue: true, createdAt: daysFrom(-2) },
  { id: 'rc2', patientId: 'pat_7', patientName: 'George Patel', phone: '+91 98765 77777', whatsappOptIn: false, clinicId: CENTRAL,
    kind: 'checkup', treatmentPlanId: null, dueDate: dateFrom(-78), status: 'due', reason: 'Last checkup 8 months ago',
    lastVisitAt: daysFrom(-260), contactCount: 0, lastContactedAt: null, appointmentId: null, bookedAt: null, notes: null, isDue: true, createdAt: daysFrom(-2) },
  { id: 'rc3', patientId: 'pat_1', patientName: 'Alice Green', phone: '+91 98765 11111', whatsappOptIn: true, clinicId: CENTRAL,
    kind: 'treatment', treatmentPlanId: 'plan_1', treatmentPlanName: 'Phase 1: restorative work', dueDate: dateFrom(-1), status: 'due',
    reason: '2 of 4 steps left in Phase 1: restorative work', lastVisitAt: null, contactCount: 0, lastContactedAt: null,
    appointmentId: null, bookedAt: null, notes: null, isDue: true, createdAt: daysFrom(-1) },
  { id: 'rc4', patientId: 'pat_8', patientName: 'Hannah Lee', phone: '+91 98765 88888', whatsappOptIn: true, clinicId: CENTRAL,
    kind: 'checkup', treatmentPlanId: null, dueDate: dateFrom(7), status: 'due', reason: 'Last checkup 6 months ago',
    lastVisitAt: daysFrom(-175), contactCount: 0, lastContactedAt: null, appointmentId: null, bookedAt: null, notes: null, isDue: false, createdAt: daysFrom(-1) },
  { id: 'rc5', patientId: 'pat_6', patientName: 'Fiona Shah', phone: '+91 98765 66666', whatsappOptIn: true, clinicId: CENTRAL,
    kind: 'checkup', treatmentPlanId: null, dueDate: dateFrom(-8), status: 'contacted', reason: 'Last checkup 6 months ago',
    lastVisitAt: daysFrom(-190), contactCount: 1, lastContactedAt: daysFrom(-3), appointmentId: null, bookedAt: null, notes: null, isDue: false, createdAt: daysFrom(-10) },
  { id: 'rc6', patientId: 'pat_3', patientName: 'Charlie Brown', phone: '+91 98765 33333', whatsappOptIn: true, clinicId: CENTRAL,
    kind: 'checkup', treatmentPlanId: null, dueDate: dateFrom(-12), status: 'booked', reason: 'Last checkup 6 months ago',
    lastVisitAt: daysFrom(-195), contactCount: 1, lastContactedAt: daysFrom(-9), appointmentId: 'appt_3', bookedAt: daysFrom(-8), notes: null, isDue: false, createdAt: daysFrom(-14) },
];

let mockSettings: RecallSettings = {
  checkupIntervalMonths: 6, treatmentFollowupDays: 14, remindAgainDays: 14, autoSendRecalls: false,
  reviewRequestsEnabled: true, reviewDelayHours: 2, reviewCooldownDays: 180,
};

const mockSend = (r: Recall): RecallSendResult => {
  if (!r.whatsappOptIn) return { id: r.id, status: 'skipped', detail: 'Patient has not opted in to WhatsApp' };
  r.status = 'contacted';
  r.contactCount += 1;
  r.lastContactedAt = new Date().toISOString();
  r.isDue = false;
  return { id: r.id, status: 'sent', detail: 'Sent on WhatsApp (demo)' };
};

// ---------- API ----------

export async function getRecalls(filters: { clinicId?: string; status?: string; kind?: string; patientId?: string } = {}): Promise<ApiResponse<Recall[]>> {
  if (!USE_MOCK_API) return http.get('/recalls', filters);
  return apiClient(() => mockRecalls.filter(r =>
    (!filters.status || filters.status.split(',').includes(r.status)) &&
    (!filters.kind || r.kind === filters.kind) &&
    (!filters.patientId || r.patientId === filters.patientId)).map(r => ({ ...r })));
}

export async function getRecallSummary(clinicId?: string): Promise<ApiResponse<RecallSummary>> {
  if (!USE_MOCK_API) return http.get('/recalls/summary', { clinicId });
  return apiClient(() => ({
    due: mockRecalls.filter(r => r.status === 'due').length,
    contacted: mockRecalls.filter(r => r.status === 'contacted').length,
    bookedLast30Days: mockRecalls.filter(r => r.status === 'booked').length,
    reviewRequestsLast30Days: 12,
  }));
}

export async function refreshRecalls(): Promise<ApiResponse<{ created: number; booked: number }>> {
  if (!USE_MOCK_API) return http.post('/recalls/refresh');
  return apiClient(() => ({ created: 0, booked: 0 }));
}

export async function sendRecall(id: string): Promise<ApiResponse<RecallSendResult>> {
  if (!USE_MOCK_API) return http.post(`/recalls/${encodeURIComponent(id)}/send`);
  return apiClient(() => mockSend(mockRecalls.find(r => r.id === id)!));
}

export async function sendRecalls(ids: string[]): Promise<ApiResponse<RecallSendResult[]>> {
  if (!USE_MOCK_API) return http.post('/recalls/send', { ids });
  return apiClient(() => ids.map(id => mockSend(mockRecalls.find(r => r.id === id)!)));
}

export async function updateRecall(id: string, patch: { status?: 'due' | 'dismissed'; dueDate?: string; notes?: string }): Promise<ApiResponse<Recall>> {
  if (!USE_MOCK_API) return http.patch(`/recalls/${encodeURIComponent(id)}`, patch);
  return apiClient(() => {
    const r = mockRecalls.find(x => x.id === id)!;
    if (patch.status) r.status = patch.status;
    if (patch.dueDate) { r.dueDate = patch.dueDate; if (r.status === 'contacted') r.status = 'due'; }
    if (patch.notes !== undefined) r.notes = patch.notes || null;
    r.isDue = r.status === 'due' && r.dueDate <= new Date().toISOString().slice(0, 10);
    return { ...r };
  });
}

export async function getRecallSettings(): Promise<ApiResponse<RecallSettings>> {
  if (!USE_MOCK_API) return http.get('/recalls/settings');
  return apiClient(() => ({ ...mockSettings }));
}

export async function saveRecallSettings(changes: Partial<RecallSettings>): Promise<ApiResponse<RecallSettings>> {
  if (!USE_MOCK_API) return http.put('/recalls/settings', changes);
  return apiClient(() => (mockSettings = { ...mockSettings, ...changes }));
}

export async function setGoogleReviewUrl(clinicId: string, googleReviewUrl: string): Promise<ApiResponse<{ googleReviewUrl: string | null }>> {
  if (!USE_MOCK_API) return http.put(`/clinics/${encodeURIComponent(clinicId)}/google-review-url`, { googleReviewUrl });
  return apiClient(() => ({ googleReviewUrl: googleReviewUrl || null }));
}

/** Families (one account holder for relatives) and QR self check-in. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, request, USE_MOCK_API } from './http';

export const RELATIONS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Other'] as const;

export interface FamilyMember {
  patientId: string; name: string; relation: string | null; isHead: boolean; phone: string | null; dob: string | null;
  balance: number; nextAppointment: string | null;
}
export interface Family { id: string; name: string; headPatientId: string; members: FamilyMember[]; totalBalance: number }
export interface FamilyStatement {
  familyId: string; name: string; totalDue: number;
  invoices: { invoiceId: string; invoiceNumber: string; patientId: string; patientName: string; dueDate: string; total: number; balanceDue: number; status: string }[];
}

// ---------- Mock ----------

let mockFamily: Family | null = null;

// ---------- Families ----------

export async function getFamily(patientId: string): Promise<ApiResponse<Family | null>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/family`);
  return apiClient(() => (mockFamily && mockFamily.members.some(m => m.patientId === patientId) ? mockFamily : null));
}

export async function getFamilySuggestions(patientId: string): Promise<ApiResponse<{ patientId: string; name: string; dob: string | null; inFamily: boolean }[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/family-suggestions`);
  return apiClient(() => []);
}

export async function linkFamily(patientId: string, withPatientId: string, relation: string): Promise<ApiResponse<Family>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/family`, { withPatientId, relation });
  return apiClient(() => {
    mockFamily = mockFamily || { id: 'fam_demo', name: 'Family', headPatientId: withPatientId, totalBalance: 0,
      members: [{ patientId: withPatientId, name: 'Account holder', relation: 'Self', isHead: true, phone: null, dob: null, balance: 0, nextAppointment: null }] };
    if (!mockFamily.members.some(m => m.patientId === patientId)) {
      mockFamily.members.push({ patientId, name: 'Family member', relation, isHead: false, phone: null, dob: null, balance: 0, nextAppointment: null });
    }
    return { ...mockFamily };
  });
}

export async function unlinkFamily(patientId: string): Promise<ApiResponse<Family | null>> {
  if (!USE_MOCK_API) return http.delete(`/patients/${encodeURIComponent(patientId)}/family`);
  return apiClient(() => {
    if (!mockFamily) return null;
    mockFamily.members = mockFamily.members.filter(m => m.patientId !== patientId);
    if (mockFamily.members.length <= 1) mockFamily = null;
    return mockFamily;
  });
}

export async function setFamilyHead(familyId: string, patientId: string): Promise<ApiResponse<Family>> {
  if (!USE_MOCK_API) return http.put(`/families/${encodeURIComponent(familyId)}/head`, { patientId });
  return apiClient(() => {
    mockFamily!.headPatientId = patientId;
    mockFamily!.members = mockFamily!.members.map(m => ({ ...m, isHead: m.patientId === patientId }));
    return { ...mockFamily! };
  });
}

export async function getFamilyStatement(familyId: string): Promise<ApiResponse<FamilyStatement>> {
  if (!USE_MOCK_API) return http.get(`/families/${encodeURIComponent(familyId)}/statement`);
  return apiClient(() => ({ familyId, name: mockFamily?.name || 'Family', totalDue: 0, invoices: [] }));
}

export async function payFamily(familyId: string, amount: number, method: string, referenceNumber?: string): Promise<ApiResponse<{ applied: { invoiceNumber: string; amount: number; status: string }[]; amount: number; remainingDue: number }>> {
  if (!USE_MOCK_API) return http.post(`/families/${encodeURIComponent(familyId)}/payments`, { amount, method, referenceNumber });
  return apiClient(() => ({ applied: [], amount, remainingDue: 0 }));
}

// ---------- Check-in ----------

export interface CheckinMatch { appointmentId: string; name: string; time: string; dentist: string | null; procedure: string; alreadyArrived: boolean }

export async function getCheckinLink(clinicId: string): Promise<ApiResponse<{ url: string; clinicName: string }>> {
  if (!USE_MOCK_API) return http.get(`/clinics/${encodeURIComponent(clinicId)}/checkin-link`);
  return apiClient(() => ({ url: `${window.location.origin}/checkin/${clinicId}?t=demo-checkin-key`, clinicName: 'VisionEdge Central Clinic' }));
}

export async function regenerateCheckinLink(clinicId: string): Promise<ApiResponse<{ url: string; clinicName: string }>> {
  if (!USE_MOCK_API) return http.post(`/clinics/${encodeURIComponent(clinicId)}/checkin-link/regenerate`);
  return getCheckinLink(clinicId);
}

export async function getCheckinClinic(clinicId: string, t: string): Promise<ApiResponse<{ clinicName: string; clinicPhone: string | null }>> {
  if (!USE_MOCK_API) return request('GET', `/public/checkin/${encodeURIComponent(clinicId)}`, { query: { t }, anonymous: true });
  return apiClient(() => ({ clinicName: 'VisionEdge Central Clinic', clinicPhone: '+91 20 4000 1000' }));
}

export async function checkinLookup(clinicId: string, t: string, phone: string): Promise<ApiResponse<CheckinMatch[]>> {
  if (!USE_MOCK_API) return http.anonymousPost(`/public/checkin/${encodeURIComponent(clinicId)}/lookup`, { t, phone });
  return apiClient(() => [{ appointmentId: 'appt_demo', name: 'A•••e G.', time: '10:30 AM', dentist: 'Dr. Smith', procedure: 'Checkup', alreadyArrived: false }]);
}

export async function checkinConfirm(clinicId: string, t: string, phone: string, appointmentId: string): Promise<ApiResponse<{ status: string; firstName: string; ahead: number; dentist: string | null; already: boolean }>> {
  if (!USE_MOCK_API) return http.anonymousPost(`/public/checkin/${encodeURIComponent(clinicId)}/confirm`, { t, phone, appointmentId });
  return apiClient(() => ({ status: 'arrived', firstName: 'Alice', ahead: 1, dentist: 'Dr. Smith', already: false }));
}

export async function markArrived(appointmentId: string): Promise<ApiResponse<{ id: string; arrivedAt: string }>> {
  if (!USE_MOCK_API) return http.post(`/appointments/${encodeURIComponent(appointmentId)}/arrived`);
  return apiClient(() => ({ id: appointmentId, arrivedAt: new Date().toISOString() }));
}

/**
 * Medicine catalogue, prescriptions and consent forms.
 * Mock mode keeps everything in memory so the screens can be tried without the backend.
 */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, request, USE_MOCK_API } from './http';

// ---------- Types ----------

export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  defaultDosage: string;
  defaultFrequency: string;
  defaultDurationDays: number;
  defaultTiming: string;
  defaultInstructions: string;
  drugClass: string;
  isActive: boolean;
}

export interface RxItem {
  medicineId?: string | null;
  name: string;
  genericName: string;
  form: string;
  strength: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  timing: string;
  instructions: string;
}

export interface RxWarning {
  type: 'allergy' | 'condition' | 'duplicate';
  medicine: string;
  message: string;
}

export interface Prescription {
  id: string;
  number: string;
  patientId: string;
  clinicId: string;
  dentistId: string;
  appointmentId: string | null;
  diagnosis: string;
  items: RxItem[];
  advice: string | null;
  followUpDate: string | null;
  acknowledgedWarnings: RxWarning[];
  status: 'issued' | 'cancelled';
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  patient: { name?: string; age?: number | null; gender?: string | null; phone?: string; allergies?: string[] };
  dentist: { name?: string; registrationNumber?: string | null; specializations?: string[] };
  clinic: { name?: string; address?: { street?: string; city?: string; state?: string; zipCode?: string } | string | null; phone?: string | null; email?: string | null; logoUrl?: string | null };
}

export interface NewPrescription {
  clinicId?: string;
  diagnosis: string;
  items: RxItem[];
  advice?: string;
  followUpDate?: string;
  acknowledgeWarnings?: boolean;
  sendWhatsapp?: boolean;
}

export interface ConsentTemplate {
  id: string;
  name: string;
  body: string;
  risks: string[];
  isActive: boolean;
  version: number;
  updatedAt: string;
}

export interface ConsentForm {
  id: string;
  patientId: string;
  patientName: string;
  clinicId: string;
  clinicName: string;
  templateId: string | null;
  templateVersion: number;
  title: string;
  body: string;
  risks: string[];
  procedure: string;
  teeth: string[];
  dentistName: string | null;
  treatmentPlanId: string | null;
  status: 'pending' | 'signed' | 'revoked';
  signature?: string | null;
  signedByName: string | null;
  signerRelationship: string | null;
  signedAt: string | null;
  signedVia: 'clinic_device' | 'remote_link' | 'patient_portal' | null;
  witnessName: string | null;
  contentHash: string | null;
  verified: boolean;
  linkExpiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface SignatureInput {
  signature: string;
  signedByName: string;
  relationship: string;
  agree: boolean;
}

export interface PublicConsent {
  title: string;
  body: string;
  risks: string[];
  clinicName: string;
  patientFirstName: string;
  patientFullName: string;
  status: string;
}

export const FREQUENCIES = ['1-0-0', '0-0-1', '1-0-1', '1-1-1', '0-1-0', '1-1-1-1', 'SOS', 'Once'];
export const TIMINGS = ['After food', 'Before food', 'With food', 'At bedtime', 'Any time'];

export function frequencyLabel(f: string): string {
  const map: Record<string, string> = {
    '1-0-0': 'Morning', '0-0-1': 'Night', '1-0-1': 'Morning and night', '1-1-1': '3 times a day',
    '0-1-0': 'Afternoon', SOS: 'Only when needed', Once: 'Single dose',
  };
  return map[f] || f;
}

// ---------- Mock data ----------

const mockMedicines: Medicine[] = [
  ['Amoxicillin', 'Amoxicillin', 'Capsule', '500 mg', '1 capsule', '1-1-1', 5, 'After food', 'Complete the full course', 'penicillin'],
  ['Augmentin', 'Amoxicillin + Clavulanic acid', 'Tablet', '625 mg', '1 tablet', '1-0-1', 5, 'After food', 'Complete the full course', 'penicillin'],
  ['Metronidazole', 'Metronidazole', 'Tablet', '400 mg', '1 tablet', '1-1-1', 5, 'After food', 'Avoid alcohol during and 2 days after', 'metronidazole'],
  ['Ibuprofen', 'Ibuprofen', 'Tablet', '400 mg', '1 tablet', '1-0-1', 3, 'After food', 'Only when in pain', 'nsaid'],
  ['Zerodol-P', 'Aceclofenac + Paracetamol', 'Tablet', '100/325 mg', '1 tablet', '1-0-1', 3, 'After food', 'Only when in pain', 'nsaid'],
  ['Paracetamol', 'Paracetamol', 'Tablet', '650 mg', '1 tablet', '1-1-1', 3, 'After food', 'Only when in pain or fever', ''],
  ['Pantoprazole', 'Pantoprazole', 'Tablet', '40 mg', '1 tablet', '1-0-0', 5, 'Before food', '30 minutes before breakfast', ''],
  ['Chlorhexidine mouthwash', 'Chlorhexidine gluconate', 'Mouthwash', '0.2%', '10 ml', '1-0-1', 7, 'After food', "Rinse for 30 seconds, don't swallow", 'chlorhexidine'],
].map(([name, genericName, form, strength, defaultDosage, defaultFrequency, days, defaultTiming, defaultInstructions, drugClass], i) => ({
  id: `med_${i + 1}`, name, genericName, form, strength, defaultDosage, defaultFrequency, defaultDurationDays: days as number,
  defaultTiming, defaultInstructions, drugClass, isActive: true,
} as Medicine));

const mockPrescriptions: Prescription[] = [];
const mockTemplates: ConsentTemplate[] = [
  { id: 'ct_1', name: 'General dental treatment', version: 1, isActive: true, updatedAt: new Date().toISOString(),
    body: 'I, {patient_name}, agree to examination, X-rays, cleaning and routine dental treatment at {clinic} by {dentist} and the clinic team. The treatment, other options and the costs have been explained to me and I have been able to ask questions.',
    risks: ['Sensitivity or discomfort after treatment', 'Bleeding or soreness of the gums', 'Reaction to local anaesthetic (rare)'] },
  { id: 'ct_2', name: 'Tooth extraction', version: 1, isActive: true, updatedAt: new Date().toISOString(),
    body: 'I, {patient_name}, agree to the removal of tooth/teeth {teeth} ({procedure}) by {dentist} at {clinic}. The reason for the extraction, other options and what to expect afterwards have been explained to me.',
    risks: ['Pain, swelling and bruising for a few days', 'Bleeding after the procedure', 'Dry socket (delayed healing)', 'Numbness of the lip, chin or tongue, usually temporary'] },
  { id: 'ct_3', name: 'Root canal treatment', version: 1, isActive: true, updatedAt: new Date().toISOString(),
    body: 'I, {patient_name}, agree to root canal treatment of tooth/teeth {teeth} by {dentist} at {clinic}. I understand that a crown is usually advised afterwards to protect the tooth.',
    risks: ['Discomfort for a few days after each visit', 'The tooth may still need extraction if treatment fails'] },
];
const mockConsents: ConsentForm[] = [];

const now = () => new Date().toISOString();

// ---------- Medicines ----------

export async function getMedicines(q?: string): Promise<ApiResponse<Medicine[]>> {
  if (!USE_MOCK_API) return http.get('/medicines', { q });
  const needle = (q || '').toLowerCase();
  return apiClient(() => mockMedicines.filter(m => !needle || `${m.name} ${m.genericName}`.toLowerCase().includes(needle)));
}

export async function addMedicine(m: Omit<Medicine, 'id' | 'isActive'>): Promise<ApiResponse<Medicine>> {
  if (!USE_MOCK_API) return http.post('/medicines', m);
  return apiClient(() => { const created = { ...m, id: `med_${Date.now()}`, isActive: true }; mockMedicines.push(created); return created; });
}

// ---------- Prescriptions ----------

export async function getPrescriptions(patientId: string): Promise<ApiResponse<Prescription[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/prescriptions`);
  return apiClient(() => mockPrescriptions.filter(p => p.patientId === patientId));
}

export async function getMyPrescriptions(): Promise<ApiResponse<Prescription[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/prescriptions');
  return apiClient(() => mockPrescriptions.filter(p => p.patientId === 'pat_1' && p.status === 'issued'));
}

export async function checkPrescription(patientId: string, items: RxItem[]): Promise<ApiResponse<RxWarning[]>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/prescriptions/check`, { items });
  return apiClient(() => {
    const out: RxWarning[] = [];
    if (patientId === 'pat_1') items.filter(i => /amox|augmentin|penicillin/i.test(`${i.name} ${i.genericName}`))
      .forEach(i => out.push({ type: 'allergy', medicine: i.name, message: `${i.name}: patient is allergic to Penicillin` }));
    return out;
  });
}

export async function createPrescription(patientId: string, body: NewPrescription): Promise<ApiResponse<Prescription>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/prescriptions`, body);
  return apiClient(() => {
    const rx: Prescription = {
      id: `rx_${Date.now()}`, number: `RX-${new Date().getFullYear()}-${String(mockPrescriptions.length + 1).padStart(4, '0')}`,
      patientId, clinicId: body.clinicId || 'c1b48b94-132d-41a4-8f77-e2307fbadd2f', dentistId: 's1', appointmentId: null,
      diagnosis: body.diagnosis, items: body.items, advice: body.advice || null, followUpDate: body.followUpDate || null,
      acknowledgedWarnings: [], status: 'issued', cancelledAt: null, cancelReason: null, createdAt: now(),
      patient: { name: 'Patient', age: 38, gender: 'Female' }, dentist: { name: 'Dr. Sarah Smith', registrationNumber: 'MDC-12345' },
      clinic: { name: 'VisionEdge Central Clinic', phone: '+91 20 4000 1000' },
    };
    mockPrescriptions.unshift(rx);
    return rx;
  });
}

export async function cancelPrescription(id: string, reason: string): Promise<ApiResponse<Prescription>> {
  if (!USE_MOCK_API) return http.post(`/prescriptions/${encodeURIComponent(id)}/cancel`, { reason });
  return apiClient(() => { const rx = mockPrescriptions.find(p => p.id === id)!; Object.assign(rx, { status: 'cancelled', cancelReason: reason, cancelledAt: now() }); return { ...rx }; });
}

export async function sendPrescriptionWhatsApp(id: string): Promise<ApiResponse<{ status: string; detail: string }>> {
  if (!USE_MOCK_API) return http.post(`/prescriptions/${encodeURIComponent(id)}/whatsapp`);
  return apiClient(() => ({ status: 'sent', detail: 'Sent on WhatsApp (demo)' }));
}

// ---------- Consent ----------

export async function getConsentTemplates(includeInactive = false): Promise<ApiResponse<ConsentTemplate[]>> {
  if (!USE_MOCK_API) return http.get('/consent-templates', includeInactive ? { include_inactive: 'true' } : undefined);
  return apiClient(() => mockTemplates.filter(t => includeInactive || t.isActive).map(t => ({ ...t })));
}

export async function saveConsentTemplate(t: Pick<ConsentTemplate, 'name' | 'body' | 'risks' | 'isActive'> & { id?: string }): Promise<ApiResponse<ConsentTemplate>> {
  const { id, ...body } = t;
  if (!USE_MOCK_API) return id ? http.put(`/consent-templates/${encodeURIComponent(id)}`, body) : http.post('/consent-templates', body);
  return apiClient(() => {
    if (id) { const existing = mockTemplates.find(x => x.id === id)!; Object.assign(existing, body, { version: existing.version + 1, updatedAt: now() }); return { ...existing }; }
    const created = { ...body, id: `ct_${Date.now()}`, version: 1, updatedAt: now() };
    mockTemplates.push(created);
    return created;
  });
}

export async function getConsents(patientId: string): Promise<ApiResponse<ConsentForm[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/consents`);
  return apiClient(() => mockConsents.filter(c => c.patientId === patientId).map(c => ({ ...c, signature: null })));
}

export async function getMyConsents(): Promise<ApiResponse<ConsentForm[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/consents');
  return getConsents('pat_1');
}

export async function getConsent(id: string): Promise<ApiResponse<ConsentForm>> {
  if (!USE_MOCK_API) return http.get(`/consents/${encodeURIComponent(id)}`);
  return apiClient(() => ({ ...mockConsents.find(c => c.id === id)! }));
}

export async function prepareConsent(patientId: string, body: { templateId: string; procedure?: string; teeth?: string[]; dentistId?: string }): Promise<ApiResponse<ConsentForm>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/consents`, body);
  return apiClient(() => {
    const t = mockTemplates.find(x => x.id === body.templateId)!;
    const teeth = body.teeth || [];
    const text = t.body.replace('{patient_name}', 'the patient').replace('{procedure}', body.procedure || 'the proposed treatment')
      .replace('{teeth}', teeth.join(', ') || 'as discussed').replace('{dentist}', 'Dr. Sarah Smith').replace('{clinic}', 'VisionEdge Central Clinic');
    const form: ConsentForm = {
      id: `cf_${Date.now()}`, patientId, patientName: 'Patient', clinicId: 'c1', clinicName: 'VisionEdge Central Clinic', templateId: t.id,
      templateVersion: t.version, title: t.name, body: text, risks: t.risks, procedure: body.procedure || '', teeth,
      dentistName: 'Dr. Sarah Smith', treatmentPlanId: null, status: 'pending', signature: null, signedByName: null,
      signerRelationship: null, signedAt: null, signedVia: null, witnessName: null, contentHash: null, verified: false,
      linkExpiresAt: null, revokedAt: null, revokeReason: null, createdAt: now(),
    };
    mockConsents.unshift(form);
    return { ...form };
  });
}

const mockSign = (id: string, s: SignatureInput, via: ConsentForm['signedVia']): ConsentForm => {
  const f = mockConsents.find(c => c.id === id)!;
  Object.assign(f, { status: 'signed', signature: s.signature, signedByName: s.signedByName, signerRelationship: s.relationship,
    signedAt: now(), signedVia: via, witnessName: via === 'clinic_device' ? 'John Doe' : null, verified: true,
    contentHash: Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('') });
  return { ...f };
};

export async function signConsentInClinic(id: string, s: SignatureInput): Promise<ApiResponse<ConsentForm>> {
  if (!USE_MOCK_API) return http.post(`/consents/${encodeURIComponent(id)}/sign`, s);
  return apiClient(() => mockSign(id, s, 'clinic_device'));
}

export async function signMyConsent(id: string, s: SignatureInput): Promise<ApiResponse<ConsentForm>> {
  if (!USE_MOCK_API) return http.post(`/patient-portal/consents/${encodeURIComponent(id)}/sign`, s);
  return apiClient(() => mockSign(id, s, 'patient_portal'));
}

export async function sendConsentLink(id: string): Promise<ApiResponse<{ url: string; expiresAt: string; whatsappStatus: string; detail: string }>> {
  if (!USE_MOCK_API) return http.post(`/consents/${encodeURIComponent(id)}/send-link`);
  return apiClient(() => ({ url: `${window.location.origin}/consent/demo-${id}`, expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(), whatsappStatus: 'sent', detail: 'Sent on WhatsApp (demo)' }));
}

export async function revokeConsent(id: string, reason: string): Promise<ApiResponse<ConsentForm>> {
  if (!USE_MOCK_API) return http.post(`/consents/${encodeURIComponent(id)}/revoke`, { reason });
  return apiClient(() => { const f = mockConsents.find(c => c.id === id)!; Object.assign(f, { status: 'revoked', revokedAt: now(), revokeReason: reason }); return { ...f }; });
}

export async function getPublicConsent(token: string): Promise<ApiResponse<PublicConsent>> {
  if (!USE_MOCK_API) return request('GET', `/public/consents/${encodeURIComponent(token)}`, { anonymous: true });
  return apiClient(() => {
    const t = mockTemplates[1];
    return { title: t.name, body: t.body.replace('{patient_name}', 'Alice Green').replace('{teeth}', '48').replace('{procedure}', 'surgical extraction').replace('{dentist}', 'Dr. Sarah Smith').replace('{clinic}', 'VisionEdge Central Clinic'),
      risks: t.risks, clinicName: 'VisionEdge Central Clinic', patientFirstName: 'Alice', patientFullName: 'Alice Green', status: 'pending' };
  });
}

export async function signPublicConsent(token: string, s: SignatureInput): Promise<ApiResponse<{ status: string; signedAt: string }>> {
  if (!USE_MOCK_API) return http.anonymousPost(`/public/consents/${encodeURIComponent(token)}/sign`, s);
  return apiClient(() => ({ status: 'signed', signedAt: now() }));
}

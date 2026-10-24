/** Sterilisation (cycles, packs, register) and patient data rights (requests, export, erasure, access log). */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { downloadFile, http, USE_MOCK_API } from './http';

// ---------- Types ----------

export type CycleKind = 'load' | 'bowie_dick' | 'helix' | 'vacuum_test' | 'bi_test';
export type PackStatus = 'awaiting_release' | 'sterile' | 'used' | 'expired' | 'recalled' | 'discarded';

export const CYCLE_KIND_LABEL: Record<CycleKind, string> = {
  load: 'Instrument load', bowie_dick: 'Bowie-Dick test', helix: 'Helix test', vacuum_test: 'Vacuum (leak) test', bi_test: 'Spore test (BI)',
};
export const PACK_STATUS_LABEL: Record<PackStatus, string> = {
  awaiting_release: 'Awaiting release', sterile: 'Ready to use', used: 'Used', expired: 'Expired', recalled: 'Recalled', discarded: 'Discarded',
};
export const STERILISER_KIND_LABEL: Record<string, string> = {
  autoclave_b: 'Class B autoclave', autoclave_n: 'Class N autoclave', autoclave_s: 'Class S autoclave', dry_heat: 'Dry heat', other: 'Other',
};

export interface SteriliserStatus {
  id: string; name: string; kind: string; clinicId: string; isActive: boolean; outOfServiceReason: string | null;
  serialNumber: string | null; lastServicedOn: string | null; serviceDueOn: string | null; serviceOverdue: boolean;
  serviceIntervalDays: number; validatedOn: string | null; needsDailyTest: boolean; dailyTestPassed: boolean;
  lastCycleAt: string | null; lastCycleResult: string | null; cycleCount: number;
  lastSporeTestAt: string | null; lastSporeResult: string | null; sporeTestDue: boolean;
}
export interface SterilisationOverview {
  sterilisers: SteriliserStatus[];
  packs: { sterile: number; expiringSoon: number; awaitingRelease: number; recalled: number };
  runningCycles: number; pendingSporeTests: number;
}
export interface Pack {
  id: string; code: string; contents: string; status: PackStatus; statusNote: string | null; expiresOn: string; isExpired: boolean;
  cycleId: string; clinicId: string; cycleNumber: number | null; cycleResult: string | null; sterilisedAt: string | null;
  steriliserName: string | null; usedAt: string | null; patientId: string | null; patientName: string | null;
  appointmentId: string | null; createdAt: string;
}
export interface Cycle {
  id: string; clinicId: string; steriliserId: string; steriliserName: string | null; cycleNumber: number; kind: CycleKind;
  program: string | null; startedAt: string; endedAt: string | null; temperatureC: number | null; pressureBar: number | null;
  holdMinutes: number | null; chemicalIndicatorOk: boolean | null; testOk: boolean | null;
  biStatus: 'none' | 'pending' | 'passed' | 'failed'; biLot: string | null; biReadAt: string | null;
  result: 'running' | 'passed' | 'failed'; failureReason: string | null; notes: string | null;
  operatorName: string | null; releasedByName: string | null; packCount: number; packsUsed: number;
  packs?: Pack[]; warnings?: string[];
}
export interface Exposure { packCode: string; contents: string; usedAt: string; patientId: string; patientName: string | null; phone: string | null; appointmentId: string | null }
export interface SterilisationSettings {
  shelfLifeDays: number; requireDailyTest: boolean; holdForSporeTest: boolean; sporeTestEveryDays: number;
  minTemperatureC: number; minHoldMinutes: number;
}

export type DataRequestKind = 'access' | 'correction' | 'erasure' | 'withdraw_consent' | 'grievance';
export const REQUEST_KIND_LABEL: Record<DataRequestKind, string> = {
  access: 'Copy of data', correction: 'Correction', erasure: 'Erasure', withdraw_consent: 'Stop messages', grievance: 'Complaint',
};
export interface DataRequest {
  id: string; patientId: string | null; patientName: string | null; clinicId: string | null; kind: DataRequestKind;
  status: 'received' | 'in_progress' | 'completed' | 'rejected'; source: 'portal' | 'staff'; details: string; requesterName: string;
  dueOn: string; isOverdue: boolean; resolution: string | null; completedAt: string | null; handledByName: string | null; createdAt: string;
}
export interface Retention {
  lastClinicalActivity: string | null; lastBill: string | null; clinicalUntil: string | null; billingUntil: string | null;
  keepUntil: string | null; canErase: boolean; anonymisedAt: string | null;
}
export interface PatientPrivacy { retention: Retention; consentWithdrawnAt: string | null; whatsappOptIn: boolean; requests: DataRequest[] }
export interface AccessLogRow { id: string; at: string; action: string; userId: string | null; userName: string; role: string | null; detail: Record<string, unknown> | null }
export interface PrivacySettings {
  clinicalRetentionYears: number; billingRetentionYears: number; responseDays: number; logRecordViews: boolean;
  grievanceOfficerName: string; grievanceOfficerEmail: string; grievanceOfficerPhone: string;
}
export interface PortalPrivacy {
  grievanceOfficer: { name: string; email: string; phone: string }; responseDays: number; whatsappOptIn: boolean;
  requests: { id: string; kind: DataRequestKind; status: string; details: string; dueOn: string; resolution: string | null; createdAt: string; completedAt: string | null }[];
}

// ---------- Mock ----------

const CENTRAL = 'c1b48b94-132d-41a4-8f77-e2307fbadd2f';
const iso = (hours = 0) => new Date(Date.now() - hours * 3600_000).toISOString();
const day = (days = 0) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
let mockCycles: Cycle[] = [
  { id: 'cyc_1', clinicId: CENTRAL, steriliserId: 'ster_1', steriliserName: 'Autoclave A (Class B)', cycleNumber: 42, kind: 'helix', program: null,
    startedAt: iso(3), endedAt: iso(2.7), temperatureC: null, pressureBar: null, holdMinutes: null, chemicalIndicatorOk: null, testOk: true,
    biStatus: 'none', biLot: null, biReadAt: null, result: 'passed', failureReason: null, notes: null, operatorName: 'John Doe',
    releasedByName: 'John Doe', packCount: 0, packsUsed: 0 },
  { id: 'cyc_2', clinicId: CENTRAL, steriliserId: 'ster_1', steriliserName: 'Autoclave A (Class B)', cycleNumber: 41, kind: 'load', program: '134°C wrapped',
    startedAt: iso(26), endedAt: iso(25), temperatureC: 134, pressureBar: 2.1, holdMinutes: 4, chemicalIndicatorOk: true, testOk: null,
    biStatus: 'none', biLot: null, biReadAt: null, result: 'passed', failureReason: null, notes: null, operatorName: 'John Doe',
    releasedByName: 'John Doe', packCount: 3, packsUsed: 2 },
];

// ---------- Sterilisation ----------

export async function getSterilisationOverview(clinicId?: string): Promise<ApiResponse<SterilisationOverview>> {
  if (!USE_MOCK_API) return http.get('/sterilisation/overview', { clinicId });
  return apiClient(() => ({
    sterilisers: [
      { id: 'ster_1', name: 'Autoclave A (Class B)', kind: 'autoclave_b', clinicId: CENTRAL, isActive: true, outOfServiceReason: null, serialNumber: 'WH-B22-04417',
        lastServicedOn: day(-150), serviceDueOn: day(30), serviceOverdue: false, serviceIntervalDays: 180, validatedOn: day(-150), needsDailyTest: true,
        dailyTestPassed: true, lastCycleAt: iso(3), lastCycleResult: 'passed', cycleCount: 42, lastSporeTestAt: iso(130), lastSporeResult: 'passed', sporeTestDue: false },
      { id: 'ster_2', name: 'Autoclave B (Class N)', kind: 'autoclave_n', clinicId: CENTRAL, isActive: true, outOfServiceReason: null, serialNumber: 'TN-17-88213',
        lastServicedOn: day(-200), serviceDueOn: day(-20), serviceOverdue: true, serviceIntervalDays: 180, validatedOn: null, needsDailyTest: false,
        dailyTestPassed: false, lastCycleAt: iso(22), lastCycleResult: 'passed', cycleCount: 18, lastSporeTestAt: null, lastSporeResult: null, sporeTestDue: true },
    ],
    packs: { sterile: 14, expiringSoon: 3, awaitingRelease: 0, recalled: 0 }, runningCycles: 0, pendingSporeTests: 0,
  }));
}

export async function getCycles(params: { clinicId?: string; steriliserId?: string; result?: string; from?: string; to?: string; limit?: number } = {}): Promise<ApiResponse<Cycle[]>> {
  if (!USE_MOCK_API) return http.get('/sterilisation/cycles', params);
  return apiClient(() => mockCycles);
}
export async function getCycle(id: string): Promise<ApiResponse<Cycle>> {
  if (!USE_MOCK_API) return http.get(`/sterilisation/cycles/${encodeURIComponent(id)}`);
  return apiClient(() => ({ ...mockCycles.find(c => c.id === id)!, packs: [] }));
}
export async function startCycle(body: { steriliserId: string; kind: CycleKind; program?: string; packs?: { contents: string; count: number }[]; notes?: string; biLot?: string }): Promise<ApiResponse<Cycle>> {
  if (!USE_MOCK_API) return http.post('/sterilisation/cycles', body);
  return apiClient(() => {
    const c: Cycle = { ...mockCycles[0], id: `cyc_${Date.now()}`, steriliserId: body.steriliserId, kind: body.kind, result: 'running', startedAt: iso(),
      endedAt: null, testOk: null, cycleNumber: mockCycles[0].cycleNumber + 1, packCount: (body.packs || []).reduce((s, p) => s + p.count, 0), packsUsed: 0,
      biStatus: body.kind === 'bi_test' || body.biLot ? 'pending' : 'none', warnings: [],
      packs: (body.packs || []).flatMap(p => Array.from({ length: p.count }, (_, i) => ({
        id: `pk_${Date.now()}_${i}`, code: `DEM-${String(Math.random()).slice(2, 5)}`, contents: p.contents, status: 'awaiting_release' as PackStatus,
        statusNote: null, expiresOn: day(30), isExpired: false, cycleId: '', clinicId: CENTRAL, cycleNumber: null, cycleResult: 'running',
        sterilisedAt: iso(), steriliserName: 'Autoclave', usedAt: null, patientId: null, patientName: null, appointmentId: null, createdAt: iso() }))) };
    mockCycles = [c, ...mockCycles];
    return c;
  });
}
export async function recordCycleResult(id: string, body: { passed: boolean; temperatureC?: number; pressureBar?: number; holdMinutes?: number; chemicalIndicatorOk?: boolean | null; failureReason?: string; biLot?: string; notes?: string }): Promise<ApiResponse<Cycle>> {
  if (!USE_MOCK_API) return http.post(`/sterilisation/cycles/${encodeURIComponent(id)}/result`, body);
  return apiClient(() => {
    mockCycles = mockCycles.map(c => (c.id === id ? { ...c, result: body.passed ? 'passed' : 'failed', endedAt: iso() } : c));
    return { ...mockCycles.find(c => c.id === id)!, warnings: [] };
  });
}
export async function recordSporeResult(id: string, passed: boolean, note?: string): Promise<ApiResponse<Cycle & { recalled: number; exposed: Exposure[] }>> {
  if (!USE_MOCK_API) return http.post(`/sterilisation/cycles/${encodeURIComponent(id)}/spore-result`, { passed, note });
  return apiClient(() => ({ ...mockCycles.find(c => c.id === id)!, biStatus: passed ? 'passed' : 'failed', recalled: 0, exposed: [] }));
}
export async function getExposure(id: string): Promise<ApiResponse<Exposure[]>> {
  if (!USE_MOCK_API) return http.get(`/sterilisation/cycles/${encodeURIComponent(id)}/exposure`);
  return apiClient(() => []);
}
export async function getPacks(params: { clinicId?: string; status?: string } = {}): Promise<ApiResponse<Pack[]>> {
  if (!USE_MOCK_API) return http.get('/sterilisation/packs', params);
  return apiClient(() => []);
}
export async function lookupPack(code: string): Promise<ApiResponse<Pack>> {
  if (!USE_MOCK_API) return http.get('/sterilisation/packs/lookup', { code });
  return apiClient(() => { throw new Error('No pack with this code. Check the label.'); });
}
export async function usePack(body: { code: string; appointmentId?: string; patientId?: string }): Promise<ApiResponse<Pack>> {
  if (!USE_MOCK_API) return http.post('/sterilisation/packs/use', body);
  return apiClient(() => ({ id: 'pk', code: body.code.toUpperCase(), contents: 'Examination kit', status: 'used', statusNote: null, expiresOn: day(20), isExpired: false,
    cycleId: 'cyc_2', clinicId: CENTRAL, cycleNumber: 41, cycleResult: 'passed', sterilisedAt: iso(26), steriliserName: 'Autoclave A (Class B)', usedAt: iso(),
    patientId: body.patientId || null, patientName: null, appointmentId: body.appointmentId || null, createdAt: iso(26) }));
}
export async function setPackStatus(id: string, status: 'discarded' | 'expired', note?: string): Promise<ApiResponse<{ id: string; status: string }>> {
  if (!USE_MOCK_API) return http.patch(`/sterilisation/packs/${encodeURIComponent(id)}`, { status, note });
  return apiClient(() => ({ id, status }));
}
export async function getPatientPacks(patientId: string): Promise<ApiResponse<Pack[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/instrument-packs`);
  return apiClient(() => []);
}
export async function addSteriliser(body: { clinicId?: string; name: string; kind: string; serialNumber?: string; lastServicedOn?: string; serviceIntervalDays?: number }): Promise<ApiResponse<{ id: string }>> {
  if (!USE_MOCK_API) return http.post('/sterilisers', body);
  return apiClient(() => ({ id: `ster_${Date.now()}` }));
}
export async function updateSteriliser(id: string, body: { name?: string; isActive?: boolean; lastServicedOn?: string; serviceIntervalDays?: number; validatedOn?: string; note?: string }): Promise<ApiResponse<{ id: string }>> {
  if (!USE_MOCK_API) return http.patch(`/sterilisers/${encodeURIComponent(id)}`, body);
  return apiClient(() => ({ id }));
}
let mockSterSettings: SterilisationSettings = { shelfLifeDays: 30, requireDailyTest: false, holdForSporeTest: false, sporeTestEveryDays: 7, minTemperatureC: 121, minHoldMinutes: 3 };
export async function getSterilisationSettings(): Promise<ApiResponse<SterilisationSettings>> {
  if (!USE_MOCK_API) return http.get('/sterilisation/settings');
  return apiClient(() => mockSterSettings);
}
export async function saveSterilisationSettings(s: Partial<SterilisationSettings>): Promise<ApiResponse<SterilisationSettings>> {
  if (!USE_MOCK_API) return http.put('/sterilisation/settings', s);
  return apiClient(() => (mockSterSettings = { ...mockSterSettings, ...s }));
}

/** Files (CSV, JSON) come from authenticated endpoints. Returns an error message, or null when saved. */
export async function download(path: string, query: Record<string, string | undefined>, fallbackName: string): Promise<string | null> {
  if (USE_MOCK_API) return 'Downloads need the live backend.';
  return downloadFile(path, query, fallbackName);
}

// ---------- Privacy ----------

export async function getDataRequests(status?: string, clinicId?: string): Promise<ApiResponse<DataRequest[]>> {
  if (!USE_MOCK_API) return http.get('/data-requests', { status, clinicId });
  return apiClient(() => [{ id: 'dr_1', patientId: 'pat_2', patientName: 'Bob Smith', clinicId: CENTRAL, kind: 'correction', status: 'received', source: 'portal',
    details: 'My date of birth is wrong, it should be 12 March 1988.', requesterName: 'Bob Smith', dueOn: day(26), isOverdue: false, resolution: null,
    completedAt: null, handledByName: null, createdAt: iso(96) }]);
}
export async function logDataRequest(patientId: string, kind: DataRequestKind, details: string): Promise<ApiResponse<DataRequest>> {
  if (!USE_MOCK_API) return http.post('/data-requests', { patientId, kind, details });
  return apiClient(() => ({ id: `dr_${Date.now()}`, patientId, patientName: null, clinicId: CENTRAL, kind, status: 'received', source: 'staff', details,
    requesterName: '', dueOn: day(30), isOverdue: false, resolution: null, completedAt: null, handledByName: null, createdAt: iso() }));
}
export async function updateDataRequest(id: string, status: 'in_progress' | 'completed' | 'rejected', resolution?: string): Promise<ApiResponse<DataRequest>> {
  if (!USE_MOCK_API) return http.patch(`/data-requests/${encodeURIComponent(id)}`, { status, resolution });
  return getDataRequests().then(r => ({ ...r, data: r.data ? { ...r.data[0], status, resolution: resolution || null } : null }));
}
export async function getPatientPrivacy(patientId: string): Promise<ApiResponse<PatientPrivacy>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/privacy`);
  return apiClient(() => ({ retention: { lastClinicalActivity: day(-200), lastBill: day(-12), clinicalUntil: day(895), billingUntil: day(2910), keepUntil: day(2910),
    canErase: false, anonymisedAt: null }, consentWithdrawnAt: null, whatsappOptIn: true, requests: [] }));
}
export async function getAccessLog(patientId: string): Promise<ApiResponse<AccessLogRow[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/access-log`);
  return apiClient(() => [{ id: 'a1', at: iso(1), action: 'view', userId: 's2', userName: 'John Doe', role: 'receptionist', detail: null }]);
}
export async function withdrawConsent(patientId: string): Promise<ApiResponse<{ recallsDismissed: number; enquiriesClosed: number }>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/withdraw-consent`);
  return apiClient(() => ({ recallsDismissed: 0, enquiriesClosed: 0 }));
}
export async function anonymisePatient(patientId: string, body: { confirm: string; overrideReason?: string; requestId?: string }): Promise<ApiResponse<{ files: number; messages: number; enquiries: number; message: string }>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/anonymise`, body);
  return apiClient(() => ({ files: 0, messages: 0, enquiries: 0, message: 'Anonymised (demo)' }));
}
let mockPrivSettings: PrivacySettings = { clinicalRetentionYears: 3, billingRetentionYears: 8, responseDays: 30, logRecordViews: true,
  grievanceOfficerName: 'Clinic Data Protection Desk', grievanceOfficerEmail: 'privacy@visionedge.example', grievanceOfficerPhone: '+91 20 4000 1000' };
export async function getPrivacySettings(): Promise<ApiResponse<PrivacySettings>> {
  if (!USE_MOCK_API) return http.get('/privacy/settings');
  return apiClient(() => mockPrivSettings);
}
export async function savePrivacySettings(s: Partial<PrivacySettings>): Promise<ApiResponse<PrivacySettings>> {
  if (!USE_MOCK_API) return http.put('/privacy/settings', s);
  return apiClient(() => (mockPrivSettings = { ...mockPrivSettings, ...s }));
}
export async function getPortalPrivacy(patientId?: string): Promise<ApiResponse<PortalPrivacy>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/privacy', { patientId });
  return apiClient(() => ({ grievanceOfficer: { name: mockPrivSettings.grievanceOfficerName, email: mockPrivSettings.grievanceOfficerEmail, phone: mockPrivSettings.grievanceOfficerPhone },
    responseDays: 30, whatsappOptIn: true, requests: [] }));
}
export async function makePortalRequest(kind: DataRequestKind, details: string, patientId?: string): Promise<ApiResponse<{ id: string; status: string; dueOn: string; resolution: string | null }>> {
  if (!USE_MOCK_API) return http.post('/patient-portal/data-requests', { kind, details, patientId });
  return apiClient(() => ({ id: `dr_${Date.now()}`, status: kind === 'withdraw_consent' ? 'completed' : 'received', dueOn: day(30), resolution: null }));
}

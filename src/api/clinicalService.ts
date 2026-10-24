/**
 * Dental chart, treatment plans and clinical notes. Mock mode keeps working
 * on the demo data in src/data.
 */
import { ApiResponse, ClinicalNote, InvoiceDetail, PeriodontalReading, ToothConditionType, ToothRecord, TreatmentPlan, TreatmentPlanItem } from '../types';
import { mockPeriodontalReadings, mockToothRecords } from '../data/mockDentalChart';
import { mockTreatmentPlans } from '../data/mockTreatmentPlans';
import { mockClinicalNotes } from '../data/mockClinicalNotes';
import { mockProcedureCatalog } from '../data/mockProcedureCatalog';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export interface DentalChartData {
  records: ToothRecord[];
  perio: PeriodontalReading[];
  examDates: string[];
}

// ---------- Mock helpers ----------

const mockPid = (patientId: string) => (patientId === 'pat_1' ? 'p-1' : patientId);

function mockPlan(p: TreatmentPlan): TreatmentPlan {
  const items = p.items.map(i => ({ ...i, procedureName: i.procedureName || mockProcedureCatalog.find(c => c.id === i.procedureId)?.name || 'Procedure' }));
  const subtotal = items.reduce((s, i) => s + i.cost, 0);
  const discountAmount = p.discountType === 'percentage' ? subtotal * p.discount / 100 : Math.min(p.discount, subtotal);
  return { ...p, items, subtotal, discountAmount, estimatedTax: 0, estimatedTotal: subtotal - discountAmount, completedCount: items.filter(i => i.status === 'Completed').length };
}

// ---------- Dental chart ----------

export async function getDentalChart(patientId: string, asOf?: string): Promise<ApiResponse<DentalChartData>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/dental-chart`, { asOf });
  return apiClient(() => ({
    records: mockToothRecords.filter(r => r.patientId === mockPid(patientId)),
    perio: mockPeriodontalReadings.filter(r => r.patientId === mockPid(patientId)),
    examDates: ['2024-03-01'],
  }));
}

export async function getMyDentalChart(): Promise<ApiResponse<DentalChartData>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/dental-chart');
  return getDentalChart('pat_1');
}

export async function saveTooth(patientId: string, tooth: string, conditions: ToothConditionType[], notes: string): Promise<ApiResponse<ToothRecord>> {
  if (!USE_MOCK_API) return http.put(`/patients/${encodeURIComponent(patientId)}/dental-chart/teeth/${tooth}`, { conditions, notes });
  return apiClient(() => {
    const pid = mockPid(patientId);
    let rec = mockToothRecords.find(r => r.patientId === pid && r.toothNumber === tooth);
    const entry = { id: `th_${Date.now()}`, date: new Date().toISOString(), action: `Marked ${conditions.join(', ')}`, dentist: 'You' };
    if (!rec) {
      rec = { id: `tr_${Date.now()}`, patientId: pid, toothNumber: tooth, conditions, notes, history: [], recordedByStaffId: 'mock', recordedAt: new Date().toISOString() };
      mockToothRecords.push(rec);
    }
    Object.assign(rec, { conditions, notes, history: [entry, ...rec.history] });
    return rec;
  });
}

export async function savePerioExam(patientId: string, readings: { toothNumber: string; buccal: number[]; lingual: number[]; bleedingOnProbing: boolean }[]): Promise<ApiResponse<PeriodontalReading[]>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/dental-chart/perio`, { readings });
  return apiClient(() => readings.map(r => {
    const row: PeriodontalReading = {
      id: `pr_${Date.now()}_${r.toothNumber}`, patientId: mockPid(patientId), toothNumber: r.toothNumber,
      measurementPoints: { buccal: r.buccal as [number, number, number], lingual: r.lingual as [number, number, number] },
      bleedingOnProbing: r.bleedingOnProbing, recordedAt: new Date().toISOString(),
    };
    const i = mockPeriodontalReadings.findIndex(x => x.patientId === row.patientId && x.toothNumber === row.toothNumber);
    if (i >= 0) mockPeriodontalReadings[i] = row; else mockPeriodontalReadings.push(row);
    return row;
  }));
}

// ---------- Treatment plans ----------

export interface PlanInput {
  name?: string;
  items?: Array<Pick<TreatmentPlanItem, 'procedureId' | 'procedureName' | 'toothNumber' | 'cost' | 'taxable' | 'status'> & { id?: string }>;
  discount?: number;
  discountType?: 'flat' | 'percentage';
  discountReason?: string;
  notes?: string;
  status?: TreatmentPlan['status'];
}

export async function getPatientPlans(patientId: string): Promise<ApiResponse<TreatmentPlan[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/treatment-plans`);
  return apiClient(() => mockTreatmentPlans.filter(p => p.patientId === patientId).map(mockPlan));
}

export async function getMyPlans(): Promise<ApiResponse<TreatmentPlan[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/treatment-plans');
  return apiClient(() => mockTreatmentPlans.filter(p => p.patientId === 'pat_1' && p.status !== 'Draft').map(mockPlan));
}

export async function getPlans(params: { status?: string; mine?: boolean; clinicId?: string } = {}): Promise<ApiResponse<TreatmentPlan[]>> {
  if (!USE_MOCK_API) return http.get('/treatment-plans', { status: params.status, mine: params.mine || undefined, clinicId: params.clinicId });
  return apiClient(() => mockTreatmentPlans.filter(p => !params.status || params.status.split(',').includes(p.status)).map(mockPlan));
}

export async function createPlan(patientId: string, input: PlanInput): Promise<ApiResponse<TreatmentPlan>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/treatment-plans`, input);
  return apiClient(() => {
    const plan: TreatmentPlan = {
      id: `tp_${Date.now()}`, patientId, name: input.name || 'Treatment plan', status: input.status || 'Draft',
      discount: input.discount || 0, discountType: input.discountType || 'flat', discountReason: input.discountReason,
      taxPercentage: 0, createdByStaffId: 'mock', createdAt: new Date().toISOString(),
      items: (input.items || []).map((i, n) => ({ id: `tpi_${Date.now()}_${n}`, status: 'Pending', ...i } as TreatmentPlanItem)),
    };
    mockTreatmentPlans.unshift(plan);
    return mockPlan(plan);
  });
}

export async function updatePlan(planId: string, input: PlanInput): Promise<ApiResponse<TreatmentPlan>> {
  if (!USE_MOCK_API) return http.patch(`/treatment-plans/${encodeURIComponent(planId)}`, input);
  return apiClient(() => {
    const plan = mockTreatmentPlans.find(p => p.id === planId)!;
    Object.assign(plan, {
      ...input,
      items: input.items ? input.items.map((i, n) => ({ id: i.id || `tpi_${Date.now()}_${n}`, status: 'Pending', ...i })) : plan.items,
      approvedAt: input.status === 'Approved' ? new Date().toISOString() : plan.approvedAt,
    });
    return mockPlan(plan);
  });
}

export async function setPlanItemStatus(planId: string, itemId: string, status: TreatmentPlanItem['status']): Promise<ApiResponse<TreatmentPlan>> {
  if (!USE_MOCK_API) return http.patch(`/treatment-plans/${encodeURIComponent(planId)}/items/${encodeURIComponent(itemId)}`, { status });
  return apiClient(() => {
    const plan = mockTreatmentPlans.find(p => p.id === planId)!;
    const item = plan.items.find(i => i.id === itemId)!;
    item.status = status;
    if (plan.items.every(i => i.status === 'Completed')) plan.status = 'Completed';
    else if (plan.status === 'Approved') plan.status = 'In Progress';
    return mockPlan(plan);
  });
}

export async function invoicePlan(planId: string): Promise<ApiResponse<InvoiceDetail>> {
  return http.post(`/treatment-plans/${encodeURIComponent(planId)}/invoice`);
}

// ---------- Clinical notes ----------

export interface NoteInput {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  appointmentId?: string;
}

export async function getNotes(patientId: string): Promise<ApiResponse<ClinicalNote[]>> {
  if (!USE_MOCK_API) return http.get(`/patients/${encodeURIComponent(patientId)}/clinical-notes`);
  return apiClient(() => mockClinicalNotes.filter(n => n.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(n => ({ ...n, authorName: 'Dr. Sarah Smith', editable: Date.now() - new Date(n.createdAt).getTime() < 86400000 })));
}

export async function addNote(patientId: string, input: NoteInput): Promise<ApiResponse<ClinicalNote>> {
  if (!USE_MOCK_API) return http.post(`/patients/${encodeURIComponent(patientId)}/clinical-notes`, input);
  return apiClient(() => {
    const note: ClinicalNote = { id: `cn_${Date.now()}`, patientId, authorStaffId: 'mock', createdAt: new Date().toISOString(), ...input };
    mockClinicalNotes.unshift(note);
    return { ...note, authorName: 'You', editable: true };
  });
}

export async function editNote(noteId: string, input: NoteInput): Promise<ApiResponse<ClinicalNote>> {
  if (!USE_MOCK_API) return http.patch(`/clinical-notes/${encodeURIComponent(noteId)}`, input);
  return apiClient(() => {
    const note = mockClinicalNotes.find(n => n.id === noteId)!;
    Object.assign(note, input);
    return { ...note, authorName: 'You', editable: true };
  });
}

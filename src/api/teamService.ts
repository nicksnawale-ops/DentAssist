/** Dentist pay rules, payout statements and staff attendance. */
import { ApiResponse } from '../types';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

export interface PayPlan {
  id?: string; staffId?: string; clinicId: string | null;
  arrangement: 'associate' | 'consultant' | 'salaried'; basis: 'collections' | 'billing';
  percent: number; labSharePercent: number; fixedMonthly: number; minimumGuarantee: number; tdsPercent: number;
  notes?: string | null; isActive: boolean;
}

export interface PayoutFigures {
  plan: { arrangement: string; basis: string; percent: number; labSharePercent: number; fixedMonthly: number; minimumGuarantee: number; tdsPercent: number };
  collections: number; billing: number; labCosts: number; labDeduction: number; base: number; commission: number;
  fixed: number; adjustments: number; guaranteeTopUp: number; gross: number; tds: number; net: number;
  payments: { date: string; invoiceNumber: string; patient: string; method: string; amount: number }[];
  labCases: { orderNumber: string; patient: string; item: string; cost: number }[];
  invoiceCount: number;
}

export interface Payout {
  id: string; staffId: string; staffName: string; clinicId: string | null; clinicName: string | null; period: string;
  status: 'draft' | 'approved' | 'paid'; figures: PayoutFigures; adjustments: { id: string; label: string; amount: number }[];
  netAmount: number; computedAt: string | null; approvedByName: string | null; approvedAt: string | null; paidAt: string | null;
  paymentMethod: string | null; paymentReference: string | null; notes: string | null;
}

export type AttendanceStatus = 'present' | 'half_day' | 'leave' | 'absent' | 'holiday';
export interface AttendanceDay {
  id?: string | null; staffId: string; clinicId: string | null; day: string; status: AttendanceStatus;
  checkInAt: string | null; checkOutAt: string | null; lateMinutes: number; hours: number | null; source: 'self' | 'admin'; note: string | null;
  staffName?: string | null; role?: string | null;
}
export interface AttendanceSummary { present: number; halfDay: number; leave: number; absent: number; holiday: number; lateDays: number; hours: number }
export interface StaffMonth { staffId: string; name: string; role: string; summary: AttendanceSummary; days: AttendanceDay[] }

// ---------- Mock ----------

const iso = (d: Date) => d.toISOString().slice(0, 10);
let mockToday: AttendanceDay | null = null;
const mockPlans: Record<string, PayPlan> = {
  s1: { id: 'cp1', staffId: 's1', clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f', arrangement: 'associate', basis: 'collections', percent: 40, labSharePercent: 50, fixedMonthly: 0, minimumGuarantee: 40000, tdsPercent: 10, isActive: true },
  s3: { id: 'cp2', staffId: 's3', clinicId: null, arrangement: 'consultant', basis: 'collections', percent: 50, labSharePercent: 100, fixedMonthly: 0, minimumGuarantee: 0, tdsPercent: 10, isActive: true },
};

function mockFigures(staffId: string, adjustments: number): PayoutFigures {
  const p = mockPlans[staffId] || mockPlans.s1;
  const collections = staffId === 's1' ? 168400 : 92500;
  const labCosts = staffId === 's1' ? 13000 : 15000;
  const labDeduction = labCosts * p.labSharePercent / 100;
  const base = Math.max(collections - labDeduction, 0);
  const commission = Math.round(base * p.percent) / 100;
  let gross = p.fixedMonthly + commission + adjustments;
  const top = Math.max(p.minimumGuarantee - gross, 0);
  gross += top;
  const tds = Math.round(gross * p.tdsPercent) / 100;
  return {
    plan: { arrangement: p.arrangement, basis: p.basis, percent: p.percent, labSharePercent: p.labSharePercent, fixedMonthly: p.fixedMonthly, minimumGuarantee: p.minimumGuarantee, tdsPercent: p.tdsPercent },
    collections, billing: collections * 1.06, labCosts, labDeduction, base, commission, fixed: p.fixedMonthly, adjustments, guaranteeTopUp: top,
    gross, tds, net: gross - tds, invoiceCount: 42,
    payments: [{ date: iso(new Date()), invoiceNumber: 'INV-2026-0101', patient: 'Alice Green', method: 'UPI', amount: 6500 }],
    labCases: [{ orderNumber: 'LAB-2026-0003', patient: 'Charlie Brown', item: 'Bridge', cost: labCosts }],
  };
}

let mockPayouts: Payout[] = [];

// ---------- Pay rules ----------

export async function getPayPlans(staffId: string): Promise<ApiResponse<PayPlan[]>> {
  if (!USE_MOCK_API) return http.get(`/staff/${encodeURIComponent(staffId)}/compensation`);
  return apiClient(() => (mockPlans[staffId] ? [mockPlans[staffId]] : []));
}

export async function savePayPlan(staffId: string, plan: PayPlan): Promise<ApiResponse<PayPlan>> {
  if (!USE_MOCK_API) return http.put(`/staff/${encodeURIComponent(staffId)}/compensation`, plan);
  return apiClient(() => (mockPlans[staffId] = { ...plan, staffId, id: mockPlans[staffId]?.id || `cp_${Date.now()}` }));
}

// ---------- Payouts ----------

export async function generatePayouts(period: string, clinicId?: string): Promise<ApiResponse<Payout[]>> {
  if (!USE_MOCK_API) return http.post('/payouts/generate', { period, clinicId });
  return apiClient(() => {
    Object.keys(mockPlans).forEach(sid => {
      let p = mockPayouts.find(x => x.staffId === sid && x.period === period);
      if (!p) {
        p = { id: `po_${sid}_${period}`, staffId: sid, staffName: sid === 's1' ? 'Dr. Sarah Smith' : 'Dr. Anil Kumar', clinicId: clinicId || null,
          clinicName: 'VisionEdge Central Clinic', period, status: 'draft', figures: mockFigures(sid, 0), adjustments: [], netAmount: 0,
          computedAt: new Date().toISOString(), approvedByName: null, approvedAt: null, paidAt: null, paymentMethod: null, paymentReference: null, notes: null };
        mockPayouts.push(p);
      }
      if (p.status === 'draft') { p.figures = mockFigures(sid, p.adjustments.reduce((s, a) => s + a.amount, 0)); p.netAmount = p.figures.net; }
    });
    return mockPayouts.filter(p => p.period === period).map(p => ({ ...p }));
  });
}

export async function getPayouts(period?: string, clinicId?: string): Promise<ApiResponse<Payout[]>> {
  if (!USE_MOCK_API) return http.get('/payouts', { period, clinicId });
  return apiClient(() => mockPayouts.filter(p => !period || p.period === period).map(p => ({ ...p })));
}

export async function getMyPayouts(): Promise<ApiResponse<Payout[]>> {
  if (!USE_MOCK_API) return http.get('/payouts/mine');
  return apiClient(() => mockPayouts.filter(p => p.staffId === 's1' && p.status !== 'draft'));
}

const mockAct = (id: string, fn: (p: Payout) => void) => apiClient(() => {
  const p = mockPayouts.find(x => x.id === id)!;
  fn(p);
  if (p.status === 'draft') { p.figures = mockFigures(p.staffId, p.adjustments.reduce((s, a) => s + a.amount, 0)); p.netAmount = p.figures.net; }
  return { ...p };
});

export async function addAdjustment(id: string, label: string, amount: number): Promise<ApiResponse<Payout>> {
  if (!USE_MOCK_API) return http.post(`/payouts/${encodeURIComponent(id)}/adjustments`, { label, amount });
  return mockAct(id, p => { p.adjustments = [...p.adjustments, { id: `a${Date.now()}`, label, amount }]; });
}

export async function removeAdjustment(id: string, adjustmentId: string): Promise<ApiResponse<Payout>> {
  if (!USE_MOCK_API) return http.delete(`/payouts/${encodeURIComponent(id)}/adjustments/${encodeURIComponent(adjustmentId)}`);
  return mockAct(id, p => { p.adjustments = p.adjustments.filter(a => a.id !== adjustmentId); });
}

export async function approvePayout(id: string): Promise<ApiResponse<Payout>> {
  if (!USE_MOCK_API) return http.post(`/payouts/${encodeURIComponent(id)}/approve`);
  return mockAct(id, p => { p.status = 'approved'; p.approvedByName = 'You'; p.approvedAt = new Date().toISOString(); });
}

export async function markPayoutPaid(id: string, method: string, reference?: string, paidOn?: string): Promise<ApiResponse<Payout>> {
  if (!USE_MOCK_API) return http.post(`/payouts/${encodeURIComponent(id)}/paid`, { method, reference, paidOn });
  return mockAct(id, p => { p.status = 'paid'; p.paymentMethod = method; p.paymentReference = reference || null; p.paidAt = new Date().toISOString(); });
}

export async function reopenPayout(id: string): Promise<ApiResponse<Payout>> {
  if (!USE_MOCK_API) return http.post(`/payouts/${encodeURIComponent(id)}/reopen`);
  return mockAct(id, p => { p.status = 'draft'; p.approvedAt = null; p.approvedByName = null; });
}

// ---------- Attendance ----------

export async function getMyToday(): Promise<ApiResponse<AttendanceDay | null>> {
  if (!USE_MOCK_API) return http.get('/attendance/today');
  return apiClient(() => mockToday);
}

export async function checkIn(): Promise<ApiResponse<AttendanceDay>> {
  if (!USE_MOCK_API) return http.post('/attendance/check-in', {});
  return apiClient(() => (mockToday = { staffId: 'me', clinicId: null, day: iso(new Date()), status: 'present', checkInAt: new Date().toISOString(), checkOutAt: null, lateMinutes: 0, hours: null, source: 'self', note: null }));
}

export async function checkOut(): Promise<ApiResponse<AttendanceDay>> {
  if (!USE_MOCK_API) return http.post('/attendance/check-out');
  return apiClient(() => (mockToday = { ...mockToday!, checkOutAt: new Date().toISOString(), hours: 8 }));
}

export async function getMonthAttendance(period: string, clinicId?: string): Promise<ApiResponse<StaffMonth[]>> {
  if (!USE_MOCK_API) return http.get('/attendance', { period, clinicId });
  return apiClient(() => {
    const [y, m] = period.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const people = [['s1', 'Sarah Smith', 'dentist'], ['s3', 'Anil Kumar', 'dentist'], ['s2', 'John Doe', 'receptionist']];
    return people.map(([id, name, role], k) => {
      const list: AttendanceDay[] = [];
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m - 1, d);
        if (date > new Date() || date.getDay() === 0) continue;
        const status: AttendanceStatus = (d + k) % 17 === 0 ? 'leave' : (d + k) % 11 === 0 ? 'half_day' : 'present';
        list.push({ staffId: id, clinicId: null, day: iso(date), status, checkInAt: status === 'leave' ? null : `${iso(date)}T03:${(d * 7) % 50 + 10}:00Z`,
          checkOutAt: status === 'leave' ? null : `${iso(date)}T12:00:00Z`, lateMinutes: (d * 7) % 50 > 25 ? (d * 7) % 50 - 20 : 0,
          hours: status === 'leave' ? null : status === 'half_day' ? 4 : 8.5, source: 'self', note: null });
      }
      const sum = (s: AttendanceStatus) => list.filter(x => x.status === s).length;
      return { staffId: id, name, role, days: list, summary: { present: sum('present'), halfDay: sum('half_day'), leave: sum('leave'), absent: sum('absent'),
        holiday: sum('holiday'), lateDays: list.filter(x => x.lateMinutes).length, hours: list.reduce((s, x) => s + (x.hours || 0), 0) } };
    });
  });
}

export async function getMyAttendance(period: string): Promise<ApiResponse<{ summary: AttendanceSummary; days: AttendanceDay[] }>> {
  if (!USE_MOCK_API) return http.get('/attendance/mine', { period });
  const all = await getMonthAttendance(period);
  return { ...all, data: all.data ? { summary: all.data[0].summary, days: all.data[0].days } : null };
}

export async function editAttendance(staffId: string, day: string, body: { status: AttendanceStatus; checkIn?: string; checkOut?: string; note?: string }): Promise<ApiResponse<AttendanceDay>> {
  if (!USE_MOCK_API) return http.put(`/attendance/${encodeURIComponent(staffId)}/${day}`, body);
  return apiClient(() => ({ staffId, clinicId: null, day, status: body.status, checkInAt: null, checkOutAt: null, lateMinutes: 0, hours: null, source: 'admin', note: body.note || null }));
}

/**
 * Billing API. In mock mode (VITE_USE_MOCK_API=true) the same functions work
 * on the in-memory demo data so the UI can be shown without a server.
 */
import {
  ApiResponse, InsuranceClaim, InstallmentPlan, Invoice, InvoiceDetail, InvoiceLineItem, Payment, PaymentMethod,
  Procedure,
} from '../types';
import { mockInstallments, mockInvoices } from '../data/mockInvoices';
import { mockPayments } from '../data/mockPayments';
import { mockInsuranceClaims } from '../data/mockInsuranceClaims';
import { mockProcedureCatalog } from '../data/mockProcedureCatalog';
import { mockPatients } from '../data/mockPatients';
import { apiClient } from './apiClient';
import { http, USE_MOCK_API } from './http';

// ---------------------------------------------------------------------------
// Shared maths (mirrors backend/app/services/billing.py so previews match)
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxBreakdown: { cgst: number; sgst: number; igst: number };
  totalTax: number;
  total: number;
}

export function computeTotals(
  lines: Pick<InvoiceLineItem, 'quantity' | 'unitCost' | 'taxable'>[],
  discount: number,
  discountType: 'flat' | 'percentage',
  taxRate: number,
  interState = false,
): InvoiceTotals {
  const lineTotals = lines.map(l => round2((l.quantity || 0) * (l.unitCost || 0)));
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
  const discountAmount = discountType === 'percentage'
    ? round2(subtotal * Math.min(Math.max(discount, 0), 100) / 100)
    : Math.min(Math.max(discount, 0), subtotal);
  const taxableSubtotal = lines.reduce((sum, l, i) => sum + (l.taxable ? lineTotals[i] : 0), 0);
  const share = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 0;
  const totalTax = round2(taxableSubtotal * share * taxRate / 100);
  const cgst = interState ? 0 : round2(totalTax / 2);
  return {
    subtotal,
    discountAmount,
    taxBreakdown: interState ? { cgst: 0, sgst: 0, igst: totalTax } : { cgst, sgst: round2(totalTax - cgst), igst: 0 },
    totalTax,
    total: round2(subtotal - discountAmount + totalTax),
  };
}

// ---------------------------------------------------------------------------
// Mock-mode helpers
// ---------------------------------------------------------------------------

function mockEnrich(inv: Invoice): Invoice {
  const paid = mockPayments.filter(p => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
  const patient = mockPatients.find(p => p.id === inv.patientId);
  return {
    ...inv,
    patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
    patientPhone: patient?.phone,
    amountPaid: paid,
    balanceDue: inv.status === 'Void' ? 0 : Math.max(0, inv.total - paid),
    hasInstallments: mockInstallments.some(i => i.invoiceId === inv.id),
  };
}

function mockDetail(id: string): InvoiceDetail {
  const inv = mockInvoices.find(i => i.id === id);
  if (!inv) throw new Error('Invoice not found');
  return {
    ...mockEnrich(inv),
    payments: mockPayments.filter(p => p.invoiceId === id),
    installments: mockInstallments.filter(i => i.invoiceId === id),
    claims: mockInsuranceClaims.filter(c => c.invoiceId === id),
  };
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export async function getProcedures(): Promise<ApiResponse<Procedure[]>> {
  if (!USE_MOCK_API) return http.get('/procedures');
  return apiClient(() => mockProcedureCatalog.map(p => ({ ...p, gstApplicable: p.category === 'Cosmetic' })));
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceQuery {
  status?: string;
  patientId?: string;
  clinicId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export async function getInvoices(q: InvoiceQuery = {}): Promise<ApiResponse<Invoice[]>> {
  if (!USE_MOCK_API) return http.get('/invoices', { ...q });
  return apiClient(() => mockInvoices
    .filter(i => !q.patientId || i.patientId === q.patientId)
    .filter(i => !q.status || q.status.split(',').includes(i.status))
    .map(mockEnrich));
}

export async function getInvoice(id: string): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.get(`/invoices/${encodeURIComponent(id)}`);
  return apiClient(() => mockDetail(id));
}

export interface InvoiceInput {
  patientId: string;
  clinicId?: string;
  treatmentPlanId?: string;
  lineItems: Array<Pick<InvoiceLineItem, 'procedureId' | 'procedureName' | 'toothNumber' | 'quantity' | 'unitCost' | 'taxable'>>;
  discount: number;
  discountType: 'flat' | 'percentage';
  taxRate?: number;
  interState?: boolean;
  dueDate: string;
  notes?: string;
  sendNow?: boolean;
}

export async function createInvoice(input: InvoiceInput): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.post('/invoices', input);
  return apiClient(() => {
    const totals = computeTotals(input.lineItems, input.discount, input.discountType, input.taxRate ?? 18, input.interState);
    const inv: Invoice = {
      id: `inv_${Date.now()}`,
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(mockInvoices.length + 1).padStart(4, '0')}`,
      patientId: input.patientId,
      clinicId: input.clinicId || 'c1',
      treatmentPlanId: input.treatmentPlanId,
      lineItems: input.lineItems.map((l, i) => ({ id: `li_${Date.now()}_${i}`, ...l, total: round2(l.quantity * l.unitCost) })),
      discount: input.discount,
      discountType: input.discountType,
      ...totals,
      status: input.sendNow ? 'Sent' : 'Draft',
      dueDate: input.dueDate,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    mockInvoices.unshift(inv);
    return mockDetail(inv.id);
  });
}

export async function updateInvoice(id: string, patch: Partial<InvoiceInput>): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.patch(`/invoices/${encodeURIComponent(id)}`, patch);
  return apiClient(() => {
    const inv = mockInvoices.find(i => i.id === id)!;
    Object.assign(inv, { dueDate: patch.dueDate ?? inv.dueDate, notes: patch.notes ?? inv.notes });
    return mockDetail(id);
  });
}

export async function sendInvoice(id: string): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.post(`/invoices/${encodeURIComponent(id)}/send`);
  return apiClient(() => {
    const inv = mockInvoices.find(i => i.id === id)!;
    if (inv.status === 'Draft') inv.status = 'Sent';
    inv.sentAt = new Date().toISOString();
    return mockDetail(id);
  });
}

export async function voidInvoice(id: string, reason: string): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.post(`/invoices/${encodeURIComponent(id)}/void`, { reason });
  return apiClient(() => {
    const inv = mockInvoices.find(i => i.id === id)!;
    inv.status = 'Void';
    return mockDetail(id);
  });
}

export async function recordPayment(
  invoiceId: string,
  payment: { amount: number; method: PaymentMethod; referenceNumber?: string; notes?: string },
): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.post(`/invoices/${encodeURIComponent(invoiceId)}/payments`, payment);
  return apiClient(() => {
    mockPayments.push({ id: `pay_${Date.now()}`, invoiceId, recordedByStaffId: 'mock', paidAt: new Date().toISOString(), ...payment });
    const inv = mockInvoices.find(i => i.id === invoiceId)!;
    const d = mockDetail(invoiceId);
    inv.status = (d.balanceDue ?? 0) <= 0 ? 'Paid' : 'Partially Paid';
    return mockDetail(invoiceId);
  });
}

export async function setInstallments(
  invoiceId: string,
  plan: { count: number; firstDueDate: string; intervalMonths?: number },
): Promise<ApiResponse<InvoiceDetail>> {
  if (!USE_MOCK_API) return http.put(`/invoices/${encodeURIComponent(invoiceId)}/installments`, plan);
  return apiClient(() => {
    const inv = mockInvoices.find(i => i.id === invoiceId)!;
    const each = round2(inv.total / plan.count);
    for (let i = mockInstallments.length - 1; i >= 0; i--) if (mockInstallments[i].invoiceId === invoiceId) mockInstallments.splice(i, 1);
    const first = new Date(plan.firstDueDate);
    for (let n = 0; n < plan.count; n++) {
      const due = new Date(first);
      due.setMonth(due.getMonth() + n * (plan.intervalMonths || 1));
      mockInstallments.push({
        id: `inst_${Date.now()}_${n}`, invoiceId, installmentNumber: n + 1,
        amount: n < plan.count - 1 ? each : round2(inv.total - each * (plan.count - 1)),
        dueDate: due.toISOString(), status: 'Pending',
      });
    }
    return mockDetail(invoiceId);
  });
}

// ---------------------------------------------------------------------------
// Insurance claims
// ---------------------------------------------------------------------------

export async function getClaims(status?: string): Promise<ApiResponse<InsuranceClaim[]>> {
  if (!USE_MOCK_API) return http.get('/insurance-claims', { status });
  return apiClient(() => mockInsuranceClaims.map(c => ({
    ...c,
    invoiceNumber: mockInvoices.find(i => i.id === c.invoiceId)?.invoiceNumber,
    patientName: (p => (p ? `${p.firstName} ${p.lastName}` : undefined))(mockPatients.find(p => p.id === c.patientId)),
  })));
}

export async function createClaim(input: { invoiceId: string; providerName: string; policyNumber?: string; claimAmount: number; notes?: string }): Promise<ApiResponse<InsuranceClaim>> {
  if (!USE_MOCK_API) return http.post('/insurance-claims', input);
  return apiClient(() => {
    const inv = mockInvoices.find(i => i.id === input.invoiceId)!;
    const claim: InsuranceClaim = { id: `claim_${Date.now()}`, patientId: inv.patientId, status: 'Submitted', submittedAt: new Date().toISOString(), ...input };
    mockInsuranceClaims.unshift(claim);
    return claim;
  });
}

export async function updateClaim(id: string, patch: { status?: InsuranceClaim['status']; approvedAmount?: number; notes?: string }): Promise<ApiResponse<InsuranceClaim>> {
  if (!USE_MOCK_API) return http.patch(`/insurance-claims/${encodeURIComponent(id)}`, patch);
  return apiClient(() => {
    const claim = mockInsuranceClaims.find(c => c.id === id)!;
    Object.assign(claim, patch);
    return claim;
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface RevenueReport {
  trend: { month: string; name: string; revenue: number; billed: number }[];
  totalCollected: number;
  totalBilled: number;
  byMethod: { method: string; amount: number }[];
  byClinic: { clinicId: string; name: string; amount: number }[];
}

export async function getRevenueReport(params: { clinicId?: string; months?: number } = {}): Promise<ApiResponse<RevenueReport>> {
  if (!USE_MOCK_API) return http.get('/reports/revenue', { ...params });
  return apiClient(() => {
    const byMethod: Record<string, number> = {};
    mockPayments.forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
    const total = mockPayments.reduce((s, p) => s + p.amount, 0);
    return {
      trend: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((name, i) => ({ month: name, name, revenue: [42, 51, 48, 63, 58, 70][i] * 1000, billed: [48, 55, 52, 66, 64, 78][i] * 1000 })),
      totalCollected: total,
      totalBilled: mockInvoices.reduce((s, i) => s + i.total, 0),
      byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
      byClinic: [],
    };
  });
}

export interface OutstandingReport {
  total: number;
  buckets: { bucket: string; amount: number }[];
  patients: { patientId: string; patientName: string; phone: string; balance: number; invoiceCount: number; oldestDueDate: string; maxDaysOverdue: number }[];
}

export async function getOutstandingReport(clinicId?: string): Promise<ApiResponse<OutstandingReport>> {
  if (!USE_MOCK_API) return http.get('/reports/outstanding', { clinicId });
  return apiClient(() => {
    const open = mockInvoices.map(mockEnrich).filter(i => ['Sent', 'Partially Paid', 'Overdue'].includes(i.status) && (i.balanceDue || 0) > 0);
    const patients = new Map<string, OutstandingReport['patients'][number]>();
    open.forEach(i => {
      const days = Math.max(0, Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000));
      const e = patients.get(i.patientId) || { patientId: i.patientId, patientName: i.patientName || '', phone: i.patientPhone || '', balance: 0, invoiceCount: 0, oldestDueDate: i.dueDate, maxDaysOverdue: 0 };
      e.balance += i.balanceDue || 0; e.invoiceCount += 1; e.maxDaysOverdue = Math.max(e.maxDaysOverdue, days);
      patients.set(i.patientId, e);
    });
    const total = open.reduce((s, i) => s + (i.balanceDue || 0), 0);
    return { total, buckets: [{ bucket: 'current', amount: total }, { bucket: '1-30', amount: 0 }, { bucket: '31-60', amount: 0 }, { bucket: '61-90', amount: 0 }, { bucket: '90+', amount: 0 }], patients: [...patients.values()] };
  });
}

// ---------------------------------------------------------------------------
// Online payments
// ---------------------------------------------------------------------------

export interface PaymentConfig {
  onlinePaymentsEnabled: boolean;
  keyId?: string;
  currency: string;
  defaultGstRate: number;
}

export async function getPaymentConfig(): Promise<ApiResponse<PaymentConfig>> {
  if (!USE_MOCK_API) return http.get('/payments/config');
  return apiClient(() => ({ onlinePaymentsEnabled: false, currency: 'INR', defaultGstRate: 18 }));
}

export interface PaymentOrder {
  orderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  clinicName: string;
}

export async function createPaymentOrder(invoiceId: string): Promise<ApiResponse<PaymentOrder>> {
  return http.post(`/invoices/${encodeURIComponent(invoiceId)}/create-payment-order`);
}

export async function verifyOnlinePayment(body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<ApiResponse<InvoiceDetail>> {
  return http.post('/payments/razorpay/verify', body);
}

export async function getMyInvoices(): Promise<ApiResponse<Invoice[]>> {
  if (!USE_MOCK_API) return http.get('/patient-portal/invoices');
  return apiClient(() => mockInvoices.filter(i => i.patientId === 'pat_1' && i.status !== 'Draft').map(mockEnrich));
}

export type { InstallmentPlan, Payment };

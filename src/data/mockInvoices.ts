import { Invoice, InstallmentPlan } from '../types';

export const mockInvoices: Invoice[] = [
  {
    id: 'inv_1',
    patientId: 'pat_1',
    clinicId: 'c1',
    invoiceNumber: 'INV-2026-001',
    treatmentPlanId: 'tp_1',
    lineItems: [
      { id: 'li_1', procedureName: 'Root Canal Treatment', toothNumber: '16', quantity: 1, unitCost: 8000, total: 8000 },
      { id: 'li_2', procedureName: 'PFM Crown', toothNumber: '16', quantity: 1, unitCost: 4000, total: 4000 }
    ],
    subtotal: 12000,
    discount: 1000,
    discountType: 'flat',
    taxBreakdown: { cgst: 990, sgst: 990, igst: 0 },
    totalTax: 1980,
    total: 12980,
    status: 'Paid',
    dueDate: '2026-06-15T00:00:00Z',
    createdAt: '2026-06-01T10:00:00Z',
    sentAt: '2026-06-01T10:05:00Z',
    notes: 'Payment received via UPI.'
  },
  {
    id: 'inv_2',
    patientId: 'pat_2',
    clinicId: 'c1',
    invoiceNumber: 'INV-2026-002',
    lineItems: [
      { id: 'li_3', procedureName: 'Dental Consultation', quantity: 1, unitCost: 500, total: 500 },
      { id: 'li_4', procedureName: 'Full Mouth Scaling', quantity: 1, unitCost: 1500, total: 1500 }
    ],
    subtotal: 2000,
    discount: 0,
    discountType: 'flat',
    taxBreakdown: { cgst: 180, sgst: 180, igst: 0 },
    totalTax: 360,
    total: 2360,
    status: 'Sent',
    dueDate: '2026-06-30T00:00:00Z',
    createdAt: '2026-06-20T14:30:00Z',
    sentAt: '2026-06-20T14:35:00Z'
  },
  {
    id: 'inv_3',
    patientId: 'pat_3',
    clinicId: 'c1',
    invoiceNumber: 'INV-2026-003',
    treatmentPlanId: 'tp_2',
    lineItems: [
      { id: 'li_5', procedureName: 'Orthodontic Braces - Metal', quantity: 1, unitCost: 40000, total: 40000 }
    ],
    subtotal: 40000,
    discount: 10,
    discountType: 'percentage',
    taxBreakdown: { cgst: 3240, sgst: 3240, igst: 0 },
    totalTax: 6480,
    total: 42480,
    status: 'Partially Paid',
    dueDate: '2026-07-15T00:00:00Z',
    createdAt: '2026-06-15T11:00:00Z',
    sentAt: '2026-06-15T11:05:00Z',
    notes: 'Paid first installment of 10,000 INR.'
  },
  {
    id: 'inv_4',
    patientId: 'pat_4',
    clinicId: 'c1',
    invoiceNumber: 'INV-2026-004',
    lineItems: [
      { id: 'li_6', procedureName: 'Tooth Extraction', toothNumber: '48', quantity: 1, unitCost: 3500, total: 3500 }
    ],
    subtotal: 3500,
    discount: 0,
    discountType: 'flat',
    taxBreakdown: { cgst: 315, sgst: 315, igst: 0 },
    totalTax: 630,
    total: 4130,
    status: 'Overdue',
    dueDate: '2026-06-10T00:00:00Z',
    createdAt: '2026-06-01T09:00:00Z',
    sentAt: '2026-06-01T09:10:00Z'
  },
  {
    id: 'inv_5',
    patientId: 'pat_1',
    clinicId: 'c1',
    invoiceNumber: 'INV-2026-005',
    lineItems: [
      { id: 'li_7', procedureName: 'Teeth Whitening', quantity: 1, unitCost: 8000, total: 8000 }
    ],
    subtotal: 8000,
    discount: 0,
    discountType: 'flat',
    taxBreakdown: { cgst: 720, sgst: 720, igst: 0 },
    totalTax: 1440,
    total: 9440,
    status: 'Draft',
    dueDate: '2026-07-05T00:00:00Z',
    createdAt: '2026-06-22T16:00:00Z'
  }
];

export const mockInstallments: InstallmentPlan[] = [
  {
    id: 'inst_1',
    invoiceId: 'inv_3',
    installmentNumber: 1,
    amount: 10000,
    dueDate: '2026-06-15T00:00:00Z',
    status: 'Paid'
  },
  {
    id: 'inst_2',
    invoiceId: 'inv_3',
    installmentNumber: 2,
    amount: 10000,
    dueDate: '2026-07-15T00:00:00Z',
    status: 'Pending'
  },
  {
    id: 'inst_3',
    invoiceId: 'inv_3',
    installmentNumber: 3,
    amount: 10000,
    dueDate: '2026-08-15T00:00:00Z',
    status: 'Pending'
  },
  {
    id: 'inst_4',
    invoiceId: 'inv_3',
    installmentNumber: 4,
    amount: 12480,
    dueDate: '2026-09-15T00:00:00Z',
    status: 'Pending'
  }
];

import { TreatmentPlan } from '../types';

export const mockTreatmentPlans: TreatmentPlan[] = [
  {
    id: 'tp-1',
    patientId: 'pat_1',
    name: 'Phase 1: Restorative Work',
    status: 'Approved',
    discount: 10,
    discountType: 'percentage',
    discountReason: 'Loyal patient',
    taxPercentage: 18,
    items: [
      { id: 'tpi-1', procedureId: 'proc-2', cost: 1500, status: 'Completed', linkedAppointmentId: 'appt-1' },
      { id: 'tpi-2', procedureId: 'proc-3', toothNumber: '16', cost: 2000, status: 'Scheduled', linkedAppointmentId: 'appt-2' },
      { id: 'tpi-3', procedureId: 'proc-5', toothNumber: '26', cost: 6000, status: 'Pending' },
      { id: 'tpi-4', procedureId: 'proc-6', toothNumber: '26', cost: 4000, status: 'Pending' }
    ],
    createdByStaffId: 'u-1',
    createdAt: '2024-03-01T10:00:00Z',
    approvedAt: '2024-03-02T14:30:00Z'
  },
  {
    id: 'tp-2',
    patientId: 'pat_1',
    name: 'Extraction & Implant (Lower Right)',
    status: 'Proposed',
    discount: 0,
    discountType: 'flat',
    taxPercentage: 18,
    items: [
      { id: 'tpi-5', procedureId: 'proc-9', toothNumber: '48', cost: 3500, status: 'Pending' },
      { id: 'tpi-6', procedureId: 'proc-10', toothNumber: '46', cost: 25000, status: 'Pending' },
      { id: 'tpi-7', procedureId: 'proc-11', toothNumber: '46', cost: 10000, status: 'Pending' }
    ],
    createdByStaffId: 'u-1',
    createdAt: '2024-03-10T11:00:00Z'
  },
  {
    id: 'tp-3',
    patientId: 'pat_3',
    name: 'Orthodontic Treatment',
    status: 'In Progress',
    discount: 5000,
    discountType: 'flat',
    discountReason: 'Upfront payment offer',
    taxPercentage: 18,
    items: [
      { id: 'tpi-8', procedureId: 'proc-12', cost: 800, status: 'Completed', linkedAppointmentId: 'appt-3' },
      { id: 'tpi-9', procedureId: 'proc-13', cost: 35000, status: 'Scheduled', linkedAppointmentId: 'appt-4' }
    ],
    createdByStaffId: 'u-2',
    createdAt: '2024-01-20T09:00:00Z',
    approvedAt: '2024-01-25T10:00:00Z'
  }
];

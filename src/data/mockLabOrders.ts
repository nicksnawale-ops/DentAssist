import { LabOrder } from '../types';
import { subDays, addDays } from 'date-fns';

const now = new Date();

export const mockLabOrders: LabOrder[] = [
  {
    id: 'lo_1',
    patientId: 'pat_1', // Alice Green
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    labId: 'lab_1',
    itemType: 'Crown',
    toothNumbers: ['16'],
    shadeMaterialSpec: 'A2, Zirconia',
    specialInstructions: 'Patient has a tight bite, ensure adequate clearance.',
    status: 'Ready for Pickup',
    orderDate: subDays(now, 6).toISOString(),
    expectedDeliveryDate: addDays(now, 1).toISOString(),
    linkedTreatmentPlanItemId: 'tpi_1',
    updates: [
      {
        id: 'lou_1',
        labOrderId: 'lo_1',
        status: 'Ordered',
        note: 'Impressions sent to lab.',
        updatedBy: 'u2-dentist',
        updatedAt: subDays(now, 6).toISOString()
      },
      {
        id: 'lou_2',
        labOrderId: 'lo_1',
        status: 'In Progress',
        note: 'Lab confirmed receipt.',
        updatedBy: 'u3-reception',
        updatedAt: subDays(now, 5).toISOString()
      },
      {
        id: 'lou_3',
        labOrderId: 'lo_1',
        status: 'Quality Check',
        note: 'Crown is being glazed.',
        updatedBy: 'u3-reception',
        updatedAt: subDays(now, 1).toISOString()
      },
      {
        id: 'lou_4',
        labOrderId: 'lo_1',
        status: 'Ready for Pickup',
        note: 'Ready for courier pickup.',
        updatedBy: 'u3-reception',
        updatedAt: subDays(now, 0).toISOString()
      }
    ]
  },
  {
    id: 'lo_2',
    patientId: 'pat_2', // Robert Fox
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    labId: 'lab_2',
    itemType: 'Aligner',
    toothNumbers: [], // All teeth
    shadeMaterialSpec: 'Standard Clear',
    specialInstructions: 'Upper and lower arches.',
    status: 'In Progress',
    orderDate: subDays(now, 10).toISOString(),
    expectedDeliveryDate: subDays(now, 1).toISOString(), // Overdue
    updates: [
      {
        id: 'lou_5',
        labOrderId: 'lo_2',
        status: 'Ordered',
        note: 'Digital scans sent.',
        updatedBy: 'u2-dentist',
        updatedAt: subDays(now, 10).toISOString()
      },
      {
        id: 'lou_6',
        labOrderId: 'lo_2',
        status: 'In Progress',
        note: 'Treatment plan approved, manufacturing started.',
        updatedBy: 'u2-dentist',
        updatedAt: subDays(now, 8).toISOString()
      }
    ]
  },
  {
    id: 'lo_3',
    patientId: 'pat_3', // Emily Chen
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    labId: 'lab_1',
    itemType: 'Bridge',
    toothNumbers: ['14', '15', '16'],
    shadeMaterialSpec: 'A1, PFM',
    status: 'Delivered to Clinic',
    orderDate: subDays(now, 12).toISOString(),
    expectedDeliveryDate: subDays(now, 2).toISOString(),
    deliveredDate: subDays(now, 2).toISOString(),
    updates: [
      {
        id: 'lou_7',
        labOrderId: 'lo_3',
        status: 'Delivered to Clinic',
        note: 'Received at reception.',
        updatedBy: 'u3-reception',
        updatedAt: subDays(now, 2).toISOString()
      }
    ]
  }
];

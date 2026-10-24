import { mockInventory } from './mockInventory';

export const mockSuperAdminStats = {
  totalClinics: 12,
  activePatients: 4230,
  todayAppointments: 145,
  revenueTrend: [
    { name: 'Jan', revenue: 40000 },
    { name: 'Feb', revenue: 45000 },
    { name: 'Mar', revenue: 42000 },
    { name: 'Apr', revenue: 50000 },
    { name: 'May', revenue: 55000 },
    { name: 'Jun', revenue: 58000 },
  ],
  topClinics: [
    { id: 'c1', name: 'Central Clinic', revenue: 120000, patients: 1200 },
    { id: 'c2', name: 'Westside Clinic', revenue: 85000, patients: 850 },
    { id: 'c3', name: 'North End Dental', revenue: 60000, patients: 620 },
  ],
  recentActivity: [
    { id: 'a1', text: 'Dr. Smith updated treatment plan for Patient #402', time: '10 mins ago' },
    { id: 'a2', text: 'New receptionist account created for Westside', time: '1 hour ago' },
  ]
};

export const mockDentistStats = {
  patientsSeenThisWeek: 45,
  pendingTreatmentPlans: 12,
  todayRevenue: 2400,
  lowInventoryItems: mockInventory.filter(i => i.currentStock <= i.reorderThreshold).length,
  todaySchedule: [
    { id: 'appt1', time: '09:00 AM', patientName: 'Alice Green', procedure: 'Routine Checkup' },
    { id: 'appt2', time: '10:30 AM', patientName: 'Robert Fox', procedure: 'Root Canal Phase 1' },
    { id: 'appt3', time: '01:00 PM', patientName: 'Jenny Wilson', procedure: 'Teeth Whitening' },
  ],
  nextPatient: {
    name: 'Alice Green',
    time: '09:00 AM',
    procedure: 'Routine Checkup',
    notes: 'Allergic to latex.'
  }
};

export const mockReceptionistStats = {
  pendingPayments: 8,
  lowInventoryItems: mockInventory.filter(i => i.currentStock <= i.reorderThreshold).length,
  queue: [
    { id: 'q1', patientName: 'Alice Green', time: '09:00 AM', status: 'checked-in' },
    { id: 'q2', patientName: 'Robert Fox', time: '10:30 AM', status: 'waiting' },
    { id: 'q3', patientName: 'Jenny Wilson', time: '01:00 PM', status: 'in-progress' },
    { id: 'q4', patientName: 'Wade Warren', time: '08:00 AM', status: 'completed' },
  ]
};

export const mockPatientStats = {
  nextAppointment: {
    clinicName: 'VisionEdge DentAssist Central',
    address: '123 Main St, Cityville, NY 10001',
    date: 'Oct 24, 2026',
    time: '10:00 AM',
    providerName: 'Dr. Sarah Smith'
  },
  recentTreatment: {
    procedure: 'Crown Preparation',
    date: 'Oct 10, 2026',
    notes: 'Tooth 16 prep completed. Temporary crown placed.'
  },
  outstandingBalance: 150.00,
  pendingLabOrder: 'Your crown is ready and will be fitted at your next visit.'
};

import { Clinic, User } from '../types';

export const mockClinics: Clinic[] = [
  {
    id: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Central Clinic',
    address: {
      street: '123 Main St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India'
    },
    phone: '+91 98765 43210',
    email: 'central@visionedge.com',
    timezone: 'Asia/Kolkata',
    status: 'active',
    createdAt: new Date('2023-01-15T08:00:00.000Z').toISOString(),
    activeStaffCount: 12,
    activePatientsCount: 1200,
    monthlyRevenue: 120000,
    operatingHours: [
      { day: 'Monday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Tuesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Wednesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Thursday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Friday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Saturday', isOpen: true, openTime: '09:00', closeTime: '14:00' },
      { day: 'Sunday', isOpen: false, openTime: '09:00', closeTime: '18:00' },
    ]
  },
  {
    id: 'dbbd4709-3224-4f01-b541-ef17621436dd',
    name: 'Westside Clinic',
    address: {
      street: '45 Lincoln Park',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      country: 'India'
    },
    phone: '+91 91234 56789',
    email: 'westside@visionedge.com',
    timezone: 'Asia/Kolkata',
    status: 'active',
    createdAt: new Date('2023-04-20T08:00:00.000Z').toISOString(),
    activeStaffCount: 8,
    activePatientsCount: 850,
    monthlyRevenue: 85000,
    operatingHours: [
      { day: 'Monday', isOpen: true, openTime: '10:00', closeTime: '19:00' },
      { day: 'Tuesday', isOpen: true, openTime: '10:00', closeTime: '19:00' },
      { day: 'Wednesday', isOpen: true, openTime: '10:00', closeTime: '19:00' },
      { day: 'Thursday', isOpen: true, openTime: '10:00', closeTime: '19:00' },
      { day: 'Friday', isOpen: true, openTime: '10:00', closeTime: '19:00' },
      { day: 'Saturday', isOpen: true, openTime: '10:00', closeTime: '15:00' },
      { day: 'Sunday', isOpen: false, openTime: '10:00', closeTime: '19:00' },
    ]
  },
  {
    id: 'c3',
    name: 'North End Dental',
    address: {
      street: '78 Sector 1',
      city: 'Noida',
      state: 'Uttar Pradesh',
      pincode: '201301',
      country: 'India'
    },
    phone: '+91 99887 76655',
    email: 'northend@visionedge.com',
    timezone: 'Asia/Kolkata',
    status: 'inactive',
    createdAt: new Date('2025-05-20T08:00:00.000Z').toISOString(),
    activeStaffCount: 0,
    activePatientsCount: 620,
    monthlyRevenue: 60000,
    operatingHours: [
      { day: 'Monday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Tuesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Wednesday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Thursday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Friday', isOpen: true, openTime: '09:00', closeTime: '18:00' },
      { day: 'Saturday', isOpen: false, openTime: '09:00', closeTime: '18:00' },
      { day: 'Sunday', isOpen: false, openTime: '09:00', closeTime: '18:00' },
    ]
  }
];

export const mockUsers: User[] = [
  {
    id: 'u1-super',
    email: 'admin@visionedge.com',
    firstName: 'System',
    lastName: 'Admin',
    role: 'super_admin',
    clinicId: null,
    createdAt: '2023-01-01T00:00:00.000Z',
  },
  {
    id: 'u2-dentist',
    email: 'dr.smith@visionedge.com',
    firstName: 'Sarah',
    lastName: 'Smith',
    role: 'dentist',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    createdAt: '2023-02-15T00:00:00.000Z',
  },
  {
    id: 'u3-reception',
    email: 'desk@visionedge.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'receptionist',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    createdAt: '2023-03-10T00:00:00.000Z',
  },
  {
    id: 'u4-patient',
    email: 'patient@example.com',
    firstName: 'Alice',
    lastName: 'Green',
    role: 'patient',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    createdAt: '2024-01-05T00:00:00.000Z',
  }
];

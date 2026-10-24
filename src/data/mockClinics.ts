import { Clinic } from '../types';

export const mockClinics: Clinic[] = [
  {
    id: 'c1',
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
    createdAt: new Date('2023-01-15').toISOString(),
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
    id: 'c2',
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
    createdAt: new Date('2024-03-10').toISOString(),
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
    createdAt: new Date('2025-05-20').toISOString(),
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

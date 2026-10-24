import { Supplier } from '../types';

export const mockSuppliers: Supplier[] = [
  {
    id: 'sup_1',
    name: 'Apex Dental Supplies',
    contactPerson: 'Rahul Sharma',
    phone: '+91 98765 11111',
    email: 'rahul@apexdental.in',
    address: '123 Industrial Area, Phase 1, Mumbai',
    notes: 'Primary supplier for consumables and PPE.',
    itemsSupplied: ['Consumables', 'PPE']
  },
  {
    id: 'sup_2',
    name: 'Mediquip Instruments',
    contactPerson: 'Priya Patel',
    phone: '+91 98765 22222',
    email: 'sales@mediquip.in',
    address: '45 Tech Park, Bangalore',
    notes: 'High-quality dental instruments and equipment parts.',
    itemsSupplied: ['Instruments', 'Equipment']
  },
  {
    id: 'sup_3',
    name: 'PharmaCare Solutions',
    contactPerson: 'Amit Kumar',
    phone: '+91 98765 33333',
    email: 'orders@pharmacare.in',
    address: '78 Pharma Hub, Hyderabad',
    notes: 'Local distributor for medications and anesthetics.',
    itemsSupplied: ['Medications']
  },
  {
    id: 'lab_1',
    name: 'Precision Dental Lab',
    contactPerson: 'Sanjay Gupta',
    phone: '+91 98765 44444',
    email: 'info@precisiondentallab.in',
    address: '12 Lab Street, Andheri, Mumbai',
    notes: 'Specializes in high-quality zirconia crowns and bridges.',
    itemsSupplied: ['Crowns', 'Bridges', 'Veneers'],
    isLab: true,
    averageTurnaroundDays: 5
  },
  {
    id: 'lab_2',
    name: 'Perfect Align Labs',
    contactPerson: 'Meera Reddy',
    phone: '+91 98765 55555',
    email: 'orders@perfectalign.in',
    address: '56 Ortho Avenue, Pune',
    notes: 'Best for clear aligners and night guards.',
    itemsSupplied: ['Aligners', 'Night Guards'],
    isLab: true,
    averageTurnaroundDays: 8
  }
];

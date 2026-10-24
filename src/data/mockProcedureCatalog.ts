import { Procedure } from '../types';

export const mockProcedureCatalog: Procedure[] = [
  { id: 'proc-1', name: 'Consultation', category: 'General', defaultCost: 500, defaultDurationMinutes: 15 },
  { id: 'proc-2', name: 'Scaling & Polishing', category: 'Preventive', defaultCost: 1500, defaultDurationMinutes: 30 },
  { id: 'proc-3', name: 'Composite Filling', category: 'Restorative', defaultCost: 2000, defaultDurationMinutes: 45 },
  { id: 'proc-4', name: 'Root Canal Treatment (Anterior)', category: 'Endodontics', defaultCost: 4500, defaultDurationMinutes: 60 },
  { id: 'proc-5', name: 'Root Canal Treatment (Posterior)', category: 'Endodontics', defaultCost: 6000, defaultDurationMinutes: 90 },
  { id: 'proc-6', name: 'PFM Crown', category: 'Prosthodontics', defaultCost: 4000, defaultDurationMinutes: 60 },
  { id: 'proc-7', name: 'Zirconia Crown', category: 'Prosthodontics', defaultCost: 8000, defaultDurationMinutes: 60 },
  { id: 'proc-8', name: 'Simple Extraction', category: 'Surgery', defaultCost: 1000, defaultDurationMinutes: 30 },
  { id: 'proc-9', name: 'Surgical Extraction', category: 'Surgery', defaultCost: 3500, defaultDurationMinutes: 60 },
  { id: 'proc-10', name: 'Implant Placement', category: 'Implantology', defaultCost: 25000, defaultDurationMinutes: 90 },
  { id: 'proc-11', name: 'Implant Crown', category: 'Implantology', defaultCost: 10000, defaultDurationMinutes: 60 },
  { id: 'proc-12', name: 'Orthodontic Consultation', category: 'Orthodontics', defaultCost: 800, defaultDurationMinutes: 30 },
  { id: 'proc-13', name: 'Braces (Metal)', category: 'Orthodontics', defaultCost: 35000, defaultDurationMinutes: 60 },
  { id: 'proc-14', name: 'Braces (Ceramic)', category: 'Orthodontics', defaultCost: 55000, defaultDurationMinutes: 60 },
  { id: 'proc-15', name: 'Clear Aligners', category: 'Orthodontics', defaultCost: 120000, defaultDurationMinutes: 45 },
  { id: 'proc-16', name: 'Teeth Whitening', category: 'Cosmetic', defaultCost: 8000, defaultDurationMinutes: 60 },
  { id: 'proc-17', name: 'Complete Dentures', category: 'Prosthodontics', defaultCost: 20000, defaultDurationMinutes: 60 },
  { id: 'proc-18', name: 'Partial Denture', category: 'Prosthodontics', defaultCost: 5000, defaultDurationMinutes: 45 },
  { id: 'proc-19', name: 'Dental Bridge (3-unit)', category: 'Prosthodontics', defaultCost: 15000, defaultDurationMinutes: 90 },
  { id: 'proc-20', name: 'Porcelain Veneer', category: 'Cosmetic', defaultCost: 10000, defaultDurationMinutes: 60 },
  { id: 'proc-21', name: 'Night Guard', category: 'Preventive', defaultCost: 3000, defaultDurationMinutes: 30 }
];

import { ToothRecord, PeriodontalReading } from '../types';

export const mockToothRecords: ToothRecord[] = [
  {
    id: 'tr-1',
    patientId: 'p-1',
    toothNumber: '11',
    conditions: ['Healthy'],
    notes: '',
    history: [
      { id: 'th-1', date: '2023-01-15', action: 'Routine Checkup', dentist: 'Dr. Smith' }
    ],
    recordedByStaffId: 'u-1',
    recordedAt: '2024-03-01T10:00:00Z'
  },
  {
    id: 'tr-2',
    patientId: 'p-1',
    toothNumber: '16',
    conditions: ['Filled'],
    notes: 'Composite filling, occusal',
    history: [
      { id: 'th-2', date: '2022-11-20', action: 'Filling placed', dentist: 'Dr. Smith' }
    ],
    recordedByStaffId: 'u-1',
    recordedAt: '2024-03-01T10:00:00Z'
  },
  {
    id: 'tr-3',
    patientId: 'p-1',
    toothNumber: '26',
    conditions: ['Crown', 'Root Canal'],
    notes: 'PFM Crown, margins look good',
    history: [
      { id: 'th-3', date: '2021-05-10', action: 'RCT completed', dentist: 'Dr. Jones' },
      { id: 'th-4', date: '2021-06-05', action: 'Crown seated', dentist: 'Dr. Jones' }
    ],
    recordedByStaffId: 'u-1',
    recordedAt: '2024-03-01T10:00:00Z'
  },
  {
    id: 'tr-4',
    patientId: 'p-1',
    toothNumber: '48',
    conditions: ['Extraction Planned'],
    notes: 'Impacted, causing discomfort',
    history: [
      { id: 'th-5', date: '2024-02-15', action: 'Evaluation for extraction', dentist: 'Dr. Smith' }
    ],
    recordedByStaffId: 'u-1',
    recordedAt: '2024-03-01T10:00:00Z'
  },
  {
    id: 'tr-5',
    patientId: 'p-2', // p-2 is a child (age 8 usually, check mockPatients)
    toothNumber: '54',
    conditions: ['Cavity'],
    notes: 'Small cavity, watch and wait',
    history: [],
    recordedByStaffId: 'u-1',
    recordedAt: '2024-02-10T09:00:00Z'
  }
];

export const mockPeriodontalReadings: PeriodontalReading[] = [
  {
    id: 'pr-1',
    patientId: 'p-1',
    toothNumber: '16',
    measurementPoints: {
      buccal: [3, 2, 3],
      lingual: [3, 3, 4]
    },
    bleedingOnProbing: true,
    recordedAt: '2024-03-01T10:15:00Z'
  },
  {
    id: 'pr-2',
    patientId: 'p-1',
    toothNumber: '11',
    measurementPoints: {
      buccal: [2, 1, 2],
      lingual: [2, 2, 2]
    },
    bleedingOnProbing: false,
    recordedAt: '2024-03-01T10:15:00Z'
  }
];

import { InsuranceClaim } from '../types';

export const mockInsuranceClaims: InsuranceClaim[] = [
  {
    id: 'claim_1',
    invoiceId: 'inv_2',
    patientId: 'pat_2',
    providerName: 'HDFC Ergo Health',
    claimAmount: 2360,
    approvedAmount: 2000,
    status: 'Approved',
    notes: 'Patient pays the remaining 360.',
    submittedAt: '2026-06-20T15:00:00Z'
  },
  {
    id: 'claim_2',
    invoiceId: 'inv_5',
    patientId: 'pat_1',
    providerName: 'Star Health',
    claimAmount: 9440,
    status: 'Submitted',
    submittedAt: '2026-06-22T16:30:00Z'
  }
];

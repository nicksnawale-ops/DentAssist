import { WaitlistEntry } from '../types';

export const mockWaitlist: WaitlistEntry[] = [
  {
    id: 'wl_1',
    patientId: 'pat_4',
    preferredDentistId: 's1',
    preferredDateRange: 'Next week (Mon-Wed)',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    status: 'waiting',
    createdAt: new Date().toISOString()
  }
];

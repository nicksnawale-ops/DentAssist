import { PlatformSubscription } from '../types';

export const mockPlatformSubscription: PlatformSubscription = {
  id: 'sub_123',
  planName: 'Growth Plan',
  status: 'active',
  clinicLimit: 10,
  monthlyFee: 4999,
  nextBillingDate: '2026-07-22T00:00:00.000Z',
  usageChartData: [
    { month: 'Jan', clinics: 1 },
    { month: 'Feb', clinics: 2 },
    { month: 'Mar', clinics: 2 },
    { month: 'Apr', clinics: 3 },
    { month: 'May', clinics: 3 },
    { month: 'Jun', clinics: 4 }
  ],
  invoiceHistory: [
    { id: 'INV-2026-006', date: '2026-06-22T00:00:00.000Z', amount: 4999, status: 'paid', pdfUrl: '#' },
    { id: 'INV-2026-005', date: '2026-05-22T00:00:00.000Z', amount: 4999, status: 'paid', pdfUrl: '#' },
    { id: 'INV-2026-004', date: '2026-04-22T00:00:00.000Z', amount: 4999, status: 'paid', pdfUrl: '#' },
  ]
};

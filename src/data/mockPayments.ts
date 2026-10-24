import { Payment } from '../types';

export const mockPayments: Payment[] = [
  {
    id: 'pay_1',
    invoiceId: 'inv_1',
    amount: 12980,
    method: 'UPI',
    referenceNumber: 'UPI987654321',
    recordedByStaffId: 'u-1',
    paidAt: '2026-06-05T10:30:00Z'
  },
  {
    id: 'pay_2',
    invoiceId: 'inv_3',
    amount: 10000,
    method: 'Card',
    referenceNumber: 'TXN-456789',
    notes: 'First installment paid.',
    recordedByStaffId: 'u-2',
    paidAt: '2026-06-15T11:15:00Z'
  }
];

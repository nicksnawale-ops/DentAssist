import { PurchaseOrder } from '../types';
import { subDays } from 'date-fns';

const now = new Date();

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: 'po_1',
    poNumber: 'PO-2026-001',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    supplierId: 'sup_1',
    status: 'Sent',
    items: [
      {
        itemId: 'inv_1',
        quantity: 50,
        unitPrice: 200,
        receivedQuantity: 0
      }
    ],
    totalAmount: 10000,
    notes: 'Urgent delivery required.',
    createdBy: 'u3-reception',
    createdAt: subDays(now, 2).toISOString(),
    updatedAt: subDays(now, 2).toISOString(),
  },
  {
    id: 'po_2',
    poNumber: 'PO-2026-002',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    supplierId: 'sup_3',
    status: 'Partially Received',
    items: [
      {
        itemId: 'inv_3',
        quantity: 20,
        unitPrice: 1500,
        receivedQuantity: 5
      },
      {
        itemId: 'inv_5',
        quantity: 30,
        unitPrice: 100,
        receivedQuantity: 30
      }
    ],
    totalAmount: 33000,
    createdBy: 'u3-reception',
    createdAt: subDays(now, 5).toISOString(),
    updatedAt: subDays(now, 3).toISOString(),
  }
];

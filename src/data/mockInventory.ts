import { InventoryItem } from '../types';
import { subDays, subMonths } from 'date-fns';

const now = new Date();

export const mockInventory: InventoryItem[] = [
  {
    id: 'inv_1',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Nitrile Gloves (Medium)',
    category: 'PPE',
    currentStock: 45,
    unit: 'boxes',
    reorderThreshold: 50, // Low stock
    supplierId: 'sup_1',
    lastRestockedDate: subMonths(now, 1).toISOString(),
    movements: [
      {
        id: 'mov_1',
        itemId: 'inv_1',
        changeAmount: 100,
        type: 'addition',
        reason: 'Received shipment',
        recordedBy: 'u3-reception',
        recordedAt: subMonths(now, 1).toISOString(),
      },
      {
        id: 'mov_2',
        itemId: 'inv_1',
        changeAmount: -55,
        type: 'usage',
        reason: 'Regular usage over month',
        recordedBy: 'u3-reception',
        recordedAt: subDays(now, 2).toISOString(),
      }
    ]
  },
  {
    id: 'inv_2',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Composite Resin (Shade A2)',
    category: 'Consumables',
    currentStock: 12,
    unit: 'syringes',
    reorderThreshold: 10,
    expiryDate: subDays(now, -180).toISOString(),
    supplierId: 'sup_1',
    lastRestockedDate: subMonths(now, 2).toISOString(),
    movements: []
  },
  {
    id: 'inv_3',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Lidocaine 2% Cartridges',
    category: 'Medications',
    currentStock: 5,
    unit: 'boxes (50 pcs)',
    reorderThreshold: 15, // Low stock
    expiryDate: subDays(now, 15).toISOString(), // Expiring soon (< 30 days)
    supplierId: 'sup_3',
    lastRestockedDate: subMonths(now, 4).toISOString(),
    movements: []
  },
  {
    id: 'inv_4',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Sterilization Pouches (Medium)',
    category: 'Consumables',
    currentStock: 150,
    unit: 'pouches',
    reorderThreshold: 100,
    supplierId: 'sup_1',
    lastRestockedDate: subDays(now, 5).toISOString(),
    movements: []
  },
  {
    id: 'inv_5',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'Amoxicillin 500mg',
    category: 'Medications',
    currentStock: 2,
    unit: 'strips',
    reorderThreshold: 20, // Low stock
    expiryDate: subDays(now, -5).toISOString(), // Expired!
    supplierId: 'sup_3',
    lastRestockedDate: subMonths(now, 8).toISOString(),
    movements: []
  },
  {
    id: 'inv_6',
    clinicId: 'c1b48b94-132d-41a4-8f77-e2307fbadd2f',
    name: 'High-Speed Handpiece Burs',
    category: 'Instruments',
    currentStock: 120,
    unit: 'pieces',
    reorderThreshold: 50,
    supplierId: 'sup_2',
    lastRestockedDate: subDays(now, 15).toISOString(),
    movements: []
  }
];

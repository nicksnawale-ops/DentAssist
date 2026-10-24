import { Notification } from '../types';

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'New appointment booked',
    message: 'Alice Green has booked an appointment for tomorrow at 10:00 AM.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
  },
  {
    id: 'n4',
    title: 'New Invoice Available',
    message: 'Invoice #INV-2026-005 for ₹4,500 has been generated for your recent visit.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(), // 6 hours ago
  },
  {
    id: 'n5',
    title: 'Payment Successful',
    message: 'We have received your payment of ₹4,500. A receipt has been generated.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
  },
  {
    id: 'n2',
    title: 'Payment received',
    message: 'Payment of ₹10,000 received from John Doe.',
    isRead: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
  },
  {
    id: 'n3',
    title: 'Low stock alert',
    message: 'Dental floss units are below minimum threshold in Westside Clinic.',
    isRead: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
  }
];

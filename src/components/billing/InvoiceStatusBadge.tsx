import React from 'react';
import { InvoiceStatus } from '../../types';
import { Badge } from '../ui/Badge';

const MAP: Record<InvoiceStatus, { label: string; variant: 'outline' | 'secondary' | 'warning' | 'success' | 'error' }> = {
  Draft: { label: 'Draft', variant: 'outline' },
  Sent: { label: 'Awaiting payment', variant: 'secondary' },
  'Partially Paid': { label: 'Part paid', variant: 'warning' },
  Paid: { label: 'Paid', variant: 'success' },
  Overdue: { label: 'Overdue', variant: 'error' },
  Void: { label: 'Void', variant: 'outline' },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const s = MAP[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant} className={status === 'Void' ? 'line-through text-text-muted' : undefined}>{s.label}</Badge>;
}

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, FlaskConical, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { getLabOrders, LAB_FLOW, LabOrder, LabStatus } from '../../api/inventoryService';
import { CreateLabOrderModal } from './CreateLabOrderModal';
import { LabOrderModal } from './LabOrderModal';

type View = 'open' | 'overdue' | 'ready' | 'done';
const VIEWS: { key: View; label: string }[] = [
  { key: 'open', label: 'At the lab' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'ready', label: 'Ready to fit' },
  { key: 'done', label: 'Done' },
];

export function LabStatusBadge({ status }: { status: LabStatus }) {
  if (status === 'Cancelled') return <Badge variant="outline">Cancelled</Badge>;
  if (status === 'Fitted/Completed') return <Badge variant="success">Fitted</Badge>;
  if (status === 'Delivered to Clinic') return <Badge variant="secondary">At clinic</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function LabProgress({ status }: { status: LabStatus }) {
  const step = LAB_FLOW.indexOf(status as typeof LAB_FLOW[number]);
  return (
    <div className="flex gap-0.5" aria-label={`Step ${step + 1} of ${LAB_FLOW.length}`}>
      {LAB_FLOW.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${status === 'Cancelled' ? 'bg-line' : i <= step ? 'bg-primary' : 'bg-line'}`} />)}
    </div>
  );
}

/** Lab cases for the clinic, or for one patient when patientId is given. */
export function LabOrdersList({ clinicId, patientId, onChanged }: { clinicId?: string; patientId?: string; onChanged?: () => void }) {
  const [view, setView] = useState<View>('open');
  const [rows, setRows] = useState<LabOrder[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<LabOrder | null>(null);

  const load = useCallback(async () => {
    const res = await getLabOrders({ clinicId, patientId, view: patientId ? undefined : view });
    setRows(res.data || []);
  }, [clinicId, patientId, view]);
  useEffect(() => { load(); }, [load]);

  const changed = () => { load(); onChanged?.(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!patientId && VIEWS.map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`px-3 h-8 rounded-full text-[12px] font-medium ${view === v.key ? 'bg-primary text-white' : 'text-text-muted border border-line hover:bg-surface-hover'}`}>
            {v.label}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New lab case</Button>
      </div>

      {rows === null ? <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div> :
        rows.length === 0 ? (
          <EmptyState icon={view === 'overdue' ? CheckCircle2 : FlaskConical}
            title={view === 'overdue' ? 'Nothing overdue' : 'No lab cases here'}
            description={view === 'ready' ? 'Work that arrives from the lab shows here until it is fitted.' : 'Send crowns, bridges, aligners and more to your labs and track them here.'} />
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {rows.map(o => (
              <li key={o.id}>
                <button onClick={() => setOpen(o)} className="w-full text-left px-4 py-3 hover:bg-surface-hover grid sm:grid-cols-[1fr_180px_150px] gap-x-4 gap-y-2 items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{o.itemType}{o.toothNumbers.length ? ` · ${o.toothNumbers.join(', ')}` : ''}</span>
                      <LabStatusBadge status={o.status} />
                      {o.remakeOfId && <Badge variant="warning">Remake</Badge>}
                    </div>
                    <div className="text-[13px] text-text-muted truncate">
                      {patientId ? o.labName : <Link to={`/patients/${o.patientId}`} onClick={e => e.stopPropagation()} className="hover:text-primary">{o.patientName}</Link>}
                      {!patientId && ` · ${o.labName}`}{[o.shade, o.material].filter(Boolean).length ? ` · ${[o.shade, o.material].filter(Boolean).join(', ')}` : ''}
                    </div>
                  </div>
                  <LabProgress status={o.status} />
                  <div className={`text-[13px] sm:text-right ${o.isOverdue ? 'text-error font-medium' : 'text-text-muted'}`}>
                    {o.isOverdue && <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />}
                    {o.status === 'Fitted/Completed' && o.fittedAt ? `Fitted ${format(parseISO(o.fittedAt), 'd MMM')}` :
                      o.status === 'Delivered to Clinic' && o.deliveredAt ? `Arrived ${format(parseISO(o.deliveredAt), 'd MMM')}` :
                      o.isOverdue ? `${o.daysLate} ${o.daysLate === 1 ? 'day' : 'days'} late` : `Due ${format(parseISO(o.expectedDate), 'EEE d MMM')}`}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

      {creating && <CreateLabOrderModal defaultPatientId={patientId} onClose={() => setCreating(false)} onCreated={o => { setCreating(false); changed(); setOpen(o); }} />}
      {open && <LabOrderModal order={open} onClose={() => setOpen(null)} onChanged={o => { setOpen(o); changed(); }} />}
    </div>
  );
}

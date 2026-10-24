import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { TreatmentPlan } from '../../types';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { getPlans } from '../../api/clinicalService';
import { formatCurrency } from '../../utils/currencyConfig';

const VIEWS = [
  { key: 'Proposed', label: 'Awaiting approval', empty: 'No plans are waiting for a patient decision.' },
  { key: 'Approved,In Progress', label: 'In progress', empty: 'No approved plans are underway.' },
  { key: 'Draft', label: 'Drafts', empty: 'No draft plans.' },
  { key: 'Completed', label: 'Completed', empty: 'No completed plans yet.' },
];

/** Dentist's plans across all patients, so nothing proposed gets forgotten. */
export function TreatmentPlansPage() {
  const { selectedClinicId } = useAuth();
  const [view, setView] = useState(VIEWS[0].key);
  const [mine, setMine] = useState(true);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getPlans({ status: view, mine, clinicId: selectedClinicId });
    setPlans(res.data || []);
    setError(res.error?.message || null);
    setLoading(false);
  }, [view, mine, selectedClinicId]);

  useEffect(() => { load(); }, [load]);

  const pipeline = plans.reduce((s, p) => s + (p.estimatedTotal ?? 0), 0);
  const current = VIEWS.find(v => v.key === view)!;

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Treatment plans" description="Follow up on proposals and track treatment in progress." />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist">
          {VIEWS.map(v => (
            <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
              className={`shrink-0 h-8 px-3 rounded-full text-[13px] font-medium border ${view === v.key ? 'bg-primary text-white border-primary' : 'bg-surface border-line text-text-main'}`}>
              {v.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} className="w-4 h-4 accent-[var(--color-primary)]" />
          Only my plans
        </label>
      </div>

      {plans.length > 0 && (
        <p className="text-sm text-text-muted mb-3">
          {plans.length} plan{plans.length > 1 ? 's' : ''} worth <span className="font-semibold text-text-main tabular">{formatCurrency(pipeline)}</span>
        </p>
      )}

      <Card className="overflow-hidden">
        {loading ? <p className="p-6 text-sm text-text-muted">Loading plans…</p> : error ? (
          <p className="p-6 text-sm text-error">{error}</p>
        ) : plans.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nothing here" description={current.empty} />
        ) : (
          <ul className="divide-y divide-line">
            {plans.map(p => (
              <li key={p.id}>
                <Link to={`/patients/${p.patientId}`} className="flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-surface-hover">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{p.patientName}</div>
                    <div className="text-[13px] text-text-muted truncate">
                      {p.name}, {p.items.length} item{p.items.length === 1 ? '' : 's'}, {format(parseISO(p.createdAt), 'd MMM')}
                    </div>
                  </div>
                  {(p.status === 'Approved' || p.status === 'In Progress') && p.items.length > 0 && (
                    <span className="hidden sm:block text-[13px] text-text-muted shrink-0">{p.completedCount ?? 0}/{p.items.length} done</span>
                  )}
                  <div className="text-right shrink-0">
                    <div className="text-[15px] font-semibold tabular">{formatCurrency(p.estimatedTotal ?? 0)}</div>
                    {p.status === 'Proposed' && <Badge variant="warning">Follow up</Badge>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted/60 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, FileText, Check, Receipt, Send, ThumbsUp, Pencil, MessageSquareText, ChevronDown } from 'lucide-react';
import { TreatmentPlan, TreatmentPlanItem } from '../../types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../ui/useToast';
import { TreatmentPlanBuilder } from './TreatmentPlanBuilder';
import { InvoicePreviewModal } from '../billing/InvoicePreviewModal';
import { useAuth } from '../../context/AuthContext';
import { getMyPlans, getPatientPlans, invoicePlan, setPlanItemStatus, updatePlan } from '../../api/clinicalService';
import { useCurrency } from '../../utils/currencyConfig';
import { getAiStatus } from '../../api/aiService';
import { PlanExplainer, PlanExplanationView } from '../ai/PlanExplainer';

const STATUS_VARIANT: Record<TreatmentPlan['status'], 'outline' | 'warning' | 'secondary' | 'success'> = {
  Draft: 'outline', Proposed: 'warning', Approved: 'secondary', 'In Progress': 'secondary', Completed: 'success',
};
const STATUS_LABEL: Record<TreatmentPlan['status'], string> = {
  Draft: 'Draft', Proposed: 'Awaiting approval', Approved: 'Approved', 'In Progress': 'In progress', Completed: 'Completed',
};

interface TreatmentPlansTabProps {
  patientId: string;
  /** Patient portal: view only. */
  readOnly?: boolean;
  /** Open a new plan with a line for this tooth (from the chart). */
  prefillTooth?: string | null;
  onPrefillUsed?: () => void;
}

export function TreatmentPlansTab({ patientId, readOnly = false, prefillTooth, onPrefillUsed }: TreatmentPlansTabProps) {
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const { user } = useAuth();
  const isClinician = !readOnly && (user?.role === 'dentist' || user?.role === 'admin');
  const canInvoice = !readOnly && user?.role !== 'patient';

  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TreatmentPlan | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<TreatmentPlan | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [openExplanation, setOpenExplanation] = useState<string | null>(null);
  useEffect(() => { if (isClinician) getAiStatus().then(r => setAiEnabled(!!r.data?.enabled)); }, [isClinician]);

  const load = useCallback(async () => {
    const res = readOnly ? await getMyPlans() : await getPatientPlans(patientId);
    setPlans(res.data || []);
    setLoading(false);
  }, [patientId, readOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (prefillTooth && isClinician) setEditing('new'); }, [prefillTooth, isClinician]);

  const replace = (p: TreatmentPlan) => setPlans(ps => ps.map(x => (x.id === p.id ? p : x)));

  const move = async (plan: TreatmentPlan, status: TreatmentPlan['status'], message: string) => {
    setBusy(plan.id + status);
    const res = await updatePlan(plan.id, { status });
    setBusy(null);
    if (res.data) { replace(res.data); toast({ title: message, variant: 'success' }); }
    else toast({ title: 'Not updated', description: res.error?.message, variant: 'error' });
  };

  const toggleItem = async (plan: TreatmentPlan, item: TreatmentPlanItem) => {
    setBusy(item.id);
    const res = await setPlanItemStatus(plan.id, item.id, item.status === 'Completed' ? 'Pending' : 'Completed');
    setBusy(null);
    if (res.data) replace(res.data);
    else toast({ title: 'Not updated', description: res.error?.message, variant: 'error' });
  };

  const makeInvoice = async (plan: TreatmentPlan) => {
    setBusy(plan.id + 'invoice');
    const res = await invoicePlan(plan.id);
    setBusy(null);
    if (res.data) {
      replace({ ...plan, invoiceId: res.data.id });
      setOpenInvoice(res.data.id);
    } else {
      toast({ title: 'Invoice not created', description: res.error?.message, variant: 'error' });
    }
  };

  if (editing) {
    return (
      <TreatmentPlanBuilder
        patientId={patientId}
        existingPlan={editing === 'new' ? null : editing}
        prefillTooth={editing === 'new' ? prefillTooth || undefined : undefined}
        onSaved={plan => {
          setEditing(null);
          onPrefillUsed?.();
          setPlans(ps => (ps.some(p => p.id === plan.id) ? ps.map(p => (p.id === plan.id ? plan : p)) : [plan, ...ps]));
        }}
        onCancel={() => { setEditing(null); onPrefillUsed?.(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {isClinician && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}><Plus className="w-4 h-4" /> New plan</Button>
        </div>
      )}

      {loading ? <p className="text-sm text-text-muted">Loading plans…</p> : plans.length === 0 ? (
        <Card>
          <EmptyState icon={FileText} title="No treatment plans"
            description={readOnly ? 'Plans your dentist proposes will appear here.' : 'Plan the treatment, share the estimate, and track each step to completion.'}
            actionLabel={isClinician ? 'New plan' : undefined} onAction={isClinician ? () => setEditing('new') : undefined} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {plans.map(plan => {
            const active = plan.status === 'Approved' || plan.status === 'In Progress' || plan.status === 'Completed';
            const total = plan.estimatedTotal ?? plan.items.reduce((s, i) => s + i.cost, 0);
            return (
              <Card key={plan.id} className="p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h4 className="text-[16px] font-semibold text-text-main">{plan.name}</h4>
                  <Badge variant={STATUS_VARIANT[plan.status]}>{STATUS_LABEL[plan.status]}</Badge>
                </div>
                <p className="text-[13px] text-text-muted mb-4">
                  {plan.createdByName ? `${plan.createdByName}, ` : ''}{format(parseISO(plan.createdAt), 'd MMM yyyy')}
                  {active && plan.items.length > 0 && `, ${plan.completedCount ?? 0} of ${plan.items.length} done`}
                </p>

                {active && plan.items.length > 0 && (
                  <div className="h-1.5 rounded-full bg-base overflow-hidden mb-4" aria-hidden="true">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${((plan.completedCount ?? 0) / plan.items.length) * 100}%` }} />
                  </div>
                )}

                <ul className="space-y-1.5 mb-4">
                  {plan.items.map(item => {
                    const done = item.status === 'Completed';
                    const canTick = isClinician && active;
                    return (
                      <li key={item.id} className="flex items-center gap-3 text-sm">
                        {canTick ? (
                          <button
                            onClick={() => toggleItem(plan, item)}
                            disabled={busy === item.id}
                            aria-label={done ? `Mark ${item.procedureName} not done` : `Mark ${item.procedureName} done`}
                            className={`w-5 h-5 shrink-0 rounded-[6px] border flex items-center justify-center ${done ? 'bg-accent border-accent text-white' : 'border-line hover:border-accent'}`}
                          >
                            {done && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className={`w-2 h-2 shrink-0 rounded-full ${done ? 'bg-accent' : item.status === 'Scheduled' ? 'bg-warning' : 'bg-line'}`} aria-hidden="true" />
                        )}
                        <span className={`flex-1 min-w-0 truncate ${done ? 'text-text-muted line-through' : 'text-text-main'}`}>
                          {item.procedureName}{item.toothNumber && <span className="text-text-muted">, tooth {item.toothNumber}</span>}
                        </span>
                        {item.status === 'Scheduled' && !done && <span className="text-xs text-warning">Booked</span>}
                        <span className="tabular text-text-muted">{formatCurrency(item.cost)}</span>
                      </li>
                    );
                  })}
                </ul>

                {readOnly && plan.patientExplanation && (
                  <div className="mb-4">
                    <button className="flex items-center gap-1 text-sm font-medium text-primary mb-2" onClick={() => setOpenExplanation(openExplanation === plan.id ? null : plan.id)} aria-expanded={openExplanation === plan.id}>
                      <MessageSquareText className="w-4 h-4" /> What this plan means for you
                      <ChevronDown className={`w-4 h-4 transition-transform ${openExplanation === plan.id ? 'rotate-180' : ''}`} />
                    </button>
                    {openExplanation === plan.id && <PlanExplanationView e={plan.patientExplanation} />}
                  </div>
                )}

                <div className="mt-auto pt-4 border-t border-line flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {isClinician && (plan.status === 'Draft' || plan.status === 'Proposed') && (
                      <Button size="sm" variant="outline" onClick={() => setEditing(plan)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                    )}
                    {isClinician && plan.status === 'Draft' && (
                      <Button size="sm" variant="outline" loading={busy === plan.id + 'Proposed'} onClick={() => move(plan, 'Proposed', 'Plan ready for the patient')}>
                        <Send className="w-3.5 h-3.5" /> Propose
                      </Button>
                    )}
                    {isClinician && (plan.status === 'Draft' || plan.status === 'Proposed') && (
                      <Button size="sm" loading={busy === plan.id + 'Approved'} onClick={() => move(plan, 'Approved', 'Plan approved')}>
                        <ThumbsUp className="w-3.5 h-3.5" /> Patient agreed
                      </Button>
                    )}
                    {isClinician && plan.items.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setExplaining(plan)}>
                        <MessageSquareText className="w-3.5 h-3.5" /> {plan.patientExplanation ? (plan.patientExplanation.shared ? 'Explanation shared' : 'Explanation draft') : 'Explain to patient'}
                      </Button>
                    )}
                    {canInvoice && active && !plan.invoiceId && (
                      <Button size="sm" variant="outline" loading={busy === plan.id + 'invoice'} onClick={() => makeInvoice(plan)}>
                        <Receipt className="w-3.5 h-3.5" /> Create invoice
                      </Button>
                    )}
                    {canInvoice && plan.invoiceId && (
                      <Button size="sm" variant="ghost" onClick={() => setOpenInvoice(plan.invoiceId!)}>
                        <Receipt className="w-3.5 h-3.5" /> View invoice
                      </Button>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-text-muted">{active ? 'Total' : 'Estimate'}</div>
                    <div className="text-lg font-semibold tabular">{formatCurrency(total)}</div>
                    {(plan.discountAmount ?? 0) > 0 && <div className="text-xs text-success">Includes {formatCurrency(plan.discountAmount!)} off</div>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {openInvoice && <InvoicePreviewModal invoiceId={openInvoice} onClose={() => setOpenInvoice(null)} />}
      {explaining && (
        <PlanExplainer planId={explaining.id} planName={explaining.name} existing={explaining.patientExplanation} aiEnabled={aiEnabled}
          onClose={() => setExplaining(null)} onSaved={e => { replace({ ...explaining, patientExplanation: e }); setExplaining(null); }} />
      )}
    </div>
  );
}

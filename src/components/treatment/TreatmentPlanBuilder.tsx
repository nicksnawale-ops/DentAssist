import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, FlaskConical, Search } from 'lucide-react';
import { Procedure, TreatmentPlan, TreatmentPlanItem } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CreateLabOrderModal } from '../../pages/lab/CreateLabOrderModal';
import { computeTotals, getPaymentConfig, getProcedures } from '../../api/billingService';
import { createPlan, updatePlan } from '../../api/clinicalService';
import { useCurrency } from '../../utils/currencyConfig';

type Item = Pick<TreatmentPlanItem, 'procedureId' | 'procedureName' | 'toothNumber' | 'cost' | 'taxable' | 'status'> & { id?: string; key: string; category?: string };

interface TreatmentPlanBuilderProps {
  patientId: string;
  existingPlan: TreatmentPlan | null;
  /** Start a new plan with this tooth filled in on the first line. */
  prefillTooth?: string;
  onSaved: (plan: TreatmentPlan) => void;
  onCancel: () => void;
}

const key = () => Math.random().toString(36).slice(2);

const isLabProcedure = (name: string, category?: string) => {
  const n = name.toLowerCase();
  return (['Prosthodontics', 'Orthodontics'].includes(category || '') && !n.includes('consultation'))
    || n.includes('night guard') || n.includes('veneer') || n.includes('aligner') || n.includes('crown');
};

export function TreatmentPlanBuilder({ patientId, existingPlan, prefillTooth, onSaved, onCancel }: TreatmentPlanBuilderProps) {
  const { symbol, formatCurrency } = useCurrency();
  const [catalog, setCatalog] = useState<Procedure[]>([]);
  const [taxRate, setTaxRate] = useState(18);
  const [name, setName] = useState(existingPlan?.name || (prefillTooth ? `Treatment for tooth ${prefillTooth}` : ''));
  const [discount, setDiscount] = useState(existingPlan?.discount || 0);
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>(existingPlan?.discountType || 'percentage');
  const [discountReason, setDiscountReason] = useState(existingPlan?.discountReason || '');
  const [items, setItems] = useState<Item[]>(
    existingPlan?.items.map(i => ({ ...i, procedureName: i.procedureName || '', key: key() })) || [],
  );
  const [picking, setPicking] = useState(items.length === 0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labFor, setLabFor] = useState<string[] | null>(null);

  useEffect(() => {
    getProcedures().then(r => setCatalog(r.data || []));
    getPaymentConfig().then(r => r.data && setTaxRate(r.data.defaultGstRate));
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(catalog.map(p => p.category)))], [catalog]);
  const shown = catalog.filter(p =>
    (category === 'All' || p.category === category) && p.name.toLowerCase().includes(query.trim().toLowerCase()));

  const add = (p: Procedure) => {
    setItems(it => [...it, {
      key: key(), procedureId: p.id, procedureName: p.name, category: p.category, cost: p.defaultCost,
      taxable: !!p.gstApplicable, status: 'Pending', toothNumber: prefillTooth && it.length === 0 ? prefillTooth : undefined,
    }]);
    setPicking(false);
    setQuery('');
  };
  const update = (k: string, patch: Partial<Item>) => setItems(it => it.map(i => (i.key === k ? { ...i, ...patch } : i)));

  const totals = computeTotals(items.map(i => ({ quantity: 1, unitCost: i.cost, taxable: i.taxable })), discount, discountType, taxRate);

  const save = async (status?: TreatmentPlan['status']) => {
    setError(null);
    if (!name.trim()) return setError('Give the plan a short name, e.g. "Upper left restorations".');
    if (status === 'Proposed' && items.length === 0) return setError('Add at least one procedure.');
    setSaving(status || 'save');
    const payload = {
      name: name.trim(),
      items: items.map(({ key: _k, category: _c, ...i }) => i),
      discount,
      discountType,
      discountReason: discountReason || undefined,
      ...(status ? { status } : {}),
    };
    const res = existingPlan ? await updatePlan(existingPlan.id, payload) : await createPlan(patientId, payload);
    setSaving(null);
    if (res.data) onSaved(res.data);
    else setError(res.error?.message || 'The plan could not be saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 -ml-2 rounded-control text-text-muted hover:bg-base" aria-label="Back to plans">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-[17px] font-semibold flex-1">{existingPlan ? 'Edit plan' : 'New treatment plan'}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="p-4 border-b border-line">
            <label className="sr-only" htmlFor="plan-name">Plan name</label>
            <input
              id="plan-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Plan name, e.g. Phase 1: restorations"
              className="w-full text-[17px] font-semibold bg-transparent outline-none placeholder:font-normal placeholder:text-text-muted/60"
            />
          </div>

          {items.length > 0 && (
            <ul className="divide-y divide-line">
              {items.map(item => (
                <li key={item.key} className="px-4 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_120px_auto] gap-2 sm:gap-3 items-center">
                  <div className="min-w-0">
                    <div className="text-[15px] font-medium flex items-center gap-2">
                      <span className="truncate">{item.procedureName}</span>
                      {isLabProcedure(item.procedureName || '', item.category) && (
                        <button
                          title="Order from lab"
                          onClick={() => setLabFor(item.toothNumber ? item.toothNumber.split(',').map(s => s.trim()) : [])}
                          className="p-1 rounded-[6px] text-info hover:bg-info/10"
                          aria-label="Create a lab order for this item"
                        >
                          <FlaskConical className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">{item.taxable ? `GST ${taxRate}% applies` : 'GST exempt'}</div>
                  </div>
                  <button onClick={() => setItems(it => it.filter(i => i.key !== item.key))} className="sm:order-last p-2 rounded-control text-text-muted hover:text-error hover:bg-error/5" aria-label={`Remove ${item.procedureName}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <label className="flex items-center gap-2 sm:block">
                    <span className="text-xs text-text-muted sm:sr-only">Tooth</span>
                    <input
                      value={item.toothNumber || ''}
                      onChange={e => update(item.key, { toothNumber: e.target.value })}
                      placeholder="Tooth"
                      inputMode="numeric"
                      className="w-full h-9 px-2 border border-line rounded-control text-sm text-center focus:outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex items-center gap-2 sm:block">
                    <span className="text-xs text-text-muted sm:sr-only">Fee ({symbol})</span>
                    <input
                      type="number" min={0}
                      value={item.cost}
                      onChange={e => update(item.key, { cost: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full h-9 px-2 border border-line rounded-control text-sm text-right focus:outline-none focus:border-accent"
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          {picking ? (
            <div className="p-4 border-t border-line bg-surface-hover">
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search procedures"
                  className="w-full h-10 pl-9 pr-3 bg-surface border border-line rounded-control text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
                {categories.map(c => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={`shrink-0 h-7 px-2.5 rounded-full text-xs font-medium border ${category === c ? 'bg-primary text-white border-primary' : 'bg-surface border-line text-text-main'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {shown.map(p => (
                  <li key={p.id}>
                    <button onClick={() => add(p)} className="w-full flex justify-between items-center gap-3 p-3 rounded-control border border-line bg-surface hover:border-accent text-left">
                      <span>
                        <span className="block text-sm font-medium">{p.name}</span>
                        <span className="block text-xs text-text-muted">{p.category}, {p.defaultDurationMinutes} min</span>
                      </span>
                      <span className="text-sm tabular">{formatCurrency(p.defaultCost)}</span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="text-sm text-text-muted p-2">No procedure matches “{query}”.</li>}
              </ul>
              {items.length > 0 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPicking(false)}>Done adding</Button>}
            </div>
          ) : (
            <div className="p-4 border-t border-line">
              <Button variant="outline" className="w-full border-dashed" onClick={() => setPicking(true)}>
                <Plus className="w-4 h-4" /> Add procedure
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3 h-fit lg:sticky lg:top-6">
          <h4 className="text-[15px] font-semibold">Estimate</h4>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Procedures</span><span className="tabular">{formatCurrency(totals.subtotal)}</span></div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm gap-2">
              <span className="text-text-muted">Discount</span>
              <div className="flex">
                <input type="number" min={0} value={discount} onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 h-8 px-2 border border-line rounded-l-control text-right text-sm" aria-label="Discount" />
                <select value={discountType} onChange={e => setDiscountType(e.target.value as 'flat' | 'percentage')}
                  className="h-8 px-1 border border-l-0 border-line rounded-r-control text-sm bg-base" aria-label="Discount type">
                  <option value="percentage">%</option>
                  <option value="flat">{symbol}</option>
                </select>
              </div>
            </div>
            {discount > 0 && (
              <input value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="Reason for the discount"
                className="w-full h-8 px-2 border border-line rounded-control text-sm" />
            )}
          </div>
          {totals.discountAmount > 0 && <div className="flex justify-between text-sm"><span className="text-text-muted">Less</span><span className="tabular text-success">−{formatCurrency(totals.discountAmount)}</span></div>}
          {totals.totalTax > 0 && <div className="flex justify-between text-sm"><span className="text-text-muted">GST on cosmetic items</span><span className="tabular">{formatCurrency(totals.totalTax)}</span></div>}
          <div className="flex justify-between items-baseline pt-3 border-t border-line">
            <span className="font-semibold">Estimated total</span>
            <span className="text-xl font-semibold tabular">{formatCurrency(totals.total)}</span>
          </div>

          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <div className="flex flex-col gap-2 pt-2">
            {(!existingPlan || existingPlan.status === 'Draft') && (
              <Button onClick={() => save('Proposed')} loading={saving === 'Proposed'} disabled={!!saving}>Save and propose to patient</Button>
            )}
            <Button variant="outline" onClick={() => save()} loading={saving === 'save'} disabled={!!saving}>
              {existingPlan ? 'Save changes' : 'Save as draft'}
            </Button>
          </div>
        </Card>
      </div>

      {labFor && <CreateLabOrderModal onClose={() => setLabFor(null)} defaultPatientId={patientId} defaultToothNumbers={labFor} />}
    </div>
  );
}

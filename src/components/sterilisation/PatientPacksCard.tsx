import React, { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ScanLine, ShieldCheck } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/useToast';
import { getPatientPacks, Pack, usePack as recordPackUse } from '../../api/complianceService';

/** Instruments used on this patient, each traced to its sterilisation cycle. Scan or type the pouch code. */
export function PatientPacksCard({ patientId, appointmentId }: { patientId: string; appointmentId?: string }) {
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => getPatientPacks(patientId).then(r => setPacks(r.data || []));
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const record = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await recordPackUse({ code: code.trim(), patientId, appointmentId });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message || 'Could not record'); return; }
    toast({ title: `${res.data.contents} (${res.data.code}) recorded`, variant: 'success' });
    setCode('');
    load();
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="text-[15px] font-semibold">Instruments used</h3>
      </div>
      <form onSubmit={record} className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Scan or type the pack code (e.g. K7Q-4M2)" className="pl-9 font-mono" aria-label="Pack code" />
        </div>
        <Button type="submit" loading={busy} disabled={!code.trim()}>Record</Button>
      </form>
      {error && <p role="alert" className="rounded-control bg-error/[0.07] text-error p-2.5 text-[13px] font-medium">{error}</p>}
      {packs && packs.length > 0 ? (
        <ul className="divide-y divide-line text-[13px]">
          {packs.slice(0, 8).map(p => (
            <li key={p.id} className="py-1.5 flex flex-wrap gap-x-3">
              <span className="font-mono">{p.code}</span><span>{p.contents}</span>
              <span className="text-text-muted">{p.steriliserName} cycle {p.cycleNumber}{p.sterilisedAt ? `, ${format(parseISO(p.sterilisedAt), 'd MMM')}` : ''}</span>
              {p.usedAt && <span className="text-text-muted ml-auto">used {format(parseISO(p.usedAt), 'd MMM yyyy')}</span>}
            </li>
          ))}
        </ul>
      ) : packs && <p className="text-[13px] text-text-muted">None recorded yet. Recording the pack links this visit to its sterilisation cycle.</p>}
    </Card>
  );
}

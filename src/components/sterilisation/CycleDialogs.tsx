import React, { useState } from 'react';
import QRCode from 'qrcode';
import { format, parseISO } from 'date-fns';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal, Field, selectClass, textareaClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import {
  Cycle, CycleKind, CYCLE_KIND_LABEL, Exposure, Pack, recordCycleResult, recordSporeResult, startCycle, SteriliserStatus,
} from '../../api/complianceService';

const KITS = ['Examination kit', 'Scaling kit', 'Restorative kit', 'Extraction kit', 'Endo kit', 'Surgical kit', 'Implant kit', 'Handpiece'];
const PROGRAMS = ['134°C wrapped', '134°C unwrapped', '121°C wrapped', 'Prion 134°C 18 min', 'Rubber / plastics 121°C'];

/** Start a load (with its packs) or a daily/weekly test. */
export function StartCycleDialog({ steriliser, initialKind, onClose, onStarted }: {
  steriliser: SteriliserStatus; initialKind: CycleKind; onClose: () => void; onStarted: (c: Cycle) => void;
}) {
  const [kind, setKind] = useState<CycleKind>(initialKind);
  const [program, setProgram] = useState(PROGRAMS[0]);
  const [lines, setLines] = useState<{ contents: string; count: number }[]>([{ contents: KITS[0], count: 4 }]);
  const [biLot, setBiLot] = useState('');
  const [withBi, setWithBi] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + (l.contents.trim() ? l.count : 0), 0);
  const set = (i: number, change: Partial<{ contents: string; count: number }>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...change } : l)));

  const start = async () => {
    setBusy(true);
    const res = await startCycle({
      steriliserId: steriliser.id, kind, program: kind === 'load' ? program : undefined,
      packs: kind === 'load' ? lines.filter(l => l.contents.trim() && l.count > 0) : undefined,
      biLot: (kind === 'bi_test' || withBi) && biLot.trim() ? biLot.trim() : undefined,
    });
    setBusy(false);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not start', variant: 'error' });
    res.data.warnings?.forEach(w => toast({ title: w, variant: 'error' }));
    onStarted(res.data);
  };

  return (
    <Modal title={`Start cycle · ${steriliser.name}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={start} loading={busy} disabled={kind === 'load' && total < 1}>
        {kind === 'load' ? `Start load (${total} ${total === 1 ? 'pack' : 'packs'})` : 'Start test'}</Button></>}>
      <div className="p-5 space-y-4">
        {steriliser.needsDailyTest && !steriliser.dailyTestPassed && kind === 'load' && (
          <p className="rounded-control bg-warning/[0.08] text-warning p-3 text-[13px]">No passed Bowie-Dick/helix test today. Run the test first for wrapped loads.</p>
        )}
        <Field label="Type">
          <select value={kind} onChange={e => setKind(e.target.value as CycleKind)} className={selectClass}>
            {(Object.keys(CYCLE_KIND_LABEL) as CycleKind[]).filter(k => steriliser.needsDailyTest || !['bowie_dick', 'helix', 'vacuum_test'].includes(k))
              .map(k => <option key={k} value={k}>{CYCLE_KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        {kind === 'load' && (
          <>
            <Field label="Program">
              <select value={program} onChange={e => setProgram(e.target.value)} className={selectClass}>{PROGRAMS.map(p => <option key={p}>{p}</option>)}</select>
            </Field>
            <div>
              <div className="text-[13px] font-medium mb-1.5">Packs in this load</div>
              <datalist id="kits">{KITS.map(k => <option key={k} value={k} />)}</datalist>
              <ul className="space-y-2">
                {lines.map((l, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input list="kits" value={l.contents} onChange={e => set(i, { contents: e.target.value })} className="flex-1" aria-label="Pack contents" />
                    <div className="flex items-center rounded-control border border-line">
                      <button type="button" className="p-2" aria-label="Fewer" onClick={() => set(i, { count: Math.max(1, l.count - 1) })}><Minus className="w-4 h-4" /></button>
                      <span className="w-8 text-center tabular-nums text-sm">{l.count}</span>
                      <button type="button" className="p-2" aria-label="More" onClick={() => set(i, { count: Math.min(100, l.count + 1) })}><Plus className="w-4 h-4" /></button>
                    </div>
                    <button type="button" className="p-2 text-text-muted hover:text-error" aria-label="Remove" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} disabled={lines.length === 1}><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setLines(ls => [...ls, { contents: KITS[(ls.length) % KITS.length], count: 1 }])}><Plus className="w-4 h-4" /> Add pack type</Button>
              <p className="text-[12px] text-text-muted mt-1">Each pack gets a code. Print the labels and stick one on each pouch before loading.</p>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={withBi} onChange={e => setWithBi(e.target.checked)} />
              A spore test (biological indicator) is in this load
            </label>
          </>
        )}
        {(kind === 'bi_test' || withBi) && (
          <Field label="Spore test lot number"><Input value={biLot} onChange={e => setBiLot(e.target.value)} placeholder="From the vial or strip" /></Field>
        )}
      </div>
    </Modal>
  );
}

/** Record the readings and result at the end of a cycle. */
export function CycleResultDialog({ cycle, onClose, onSaved }: { cycle: Cycle; onClose: () => void; onSaved: (c: Cycle) => void }) {
  const isLoad = cycle.kind === 'load';
  const [temp, setTemp] = useState('134');
  const [pressure, setPressure] = useState('2.1');
  const [hold, setHold] = useState('4');
  const [indicator, setIndicator] = useState<'ok' | 'fail' | ''>('');
  const [passed, setPassed] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const ok = isLoad ? indicator === 'ok' && passed !== false : passed === true;
    setBusy(true);
    const res = await recordCycleResult(cycle.id, {
      passed: ok, temperatureC: temp ? Number(temp) : undefined, pressureBar: pressure ? Number(pressure) : undefined,
      holdMinutes: hold ? Number(hold) : undefined, chemicalIndicatorOk: isLoad ? indicator === 'ok' : undefined,
      failureReason: reason.trim() || undefined, notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not save', variant: 'error' });
    const r = res.data;
    toast(r.result === 'passed'
      ? { title: isLoad ? `Released: ${r.packCount} packs ready to use` : 'Test passed', variant: 'success' }
      : { title: isLoad ? `Failed: ${r.packCount} packs recalled for reprocessing` : 'Test failed', description: r.failureReason || undefined, variant: 'error' });
    r.warnings?.forEach(w => toast({ title: w, variant: 'error' }));
    onSaved(r);
  };
  const ready = isLoad ? indicator !== '' : passed !== null;

  return (
    <Modal title={`Result · cycle ${cycle.cycleNumber}`} subtitle={`${cycle.steriliserName} · ${CYCLE_KIND_LABEL[cycle.kind]}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={!ready}>Save result</Button></>}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Temperature °C"><Input type="number" step="0.1" value={temp} onChange={e => setTemp(e.target.value)} /></Field>
          <Field label="Pressure bar"><Input type="number" step="0.01" value={pressure} onChange={e => setPressure(e.target.value)} /></Field>
          <Field label="Hold minutes"><Input type="number" step="0.5" value={hold} onChange={e => setHold(e.target.value)} /></Field>
        </div>
        {isLoad ? (
          <fieldset>
            <legend className="text-[13px] font-medium mb-1.5">Chemical indicator on the pouches</legend>
            <div className="flex gap-2">
              {([['ok', 'Changed colour fully'], ['fail', "Didn't change"]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setIndicator(v)}
                  className={`flex-1 h-11 rounded-control border text-[14px] ${indicator === v ? (v === 'ok' ? 'border-success bg-success/[0.08] text-success' : 'border-error bg-error/[0.07] text-error') : 'border-line'}`}>{label}</button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={passed === false} onChange={e => setPassed(e.target.checked ? false : null)} />
              The printout shows a fault or the cycle aborted
            </label>
          </fieldset>
        ) : (
          <fieldset>
            <legend className="text-[13px] font-medium mb-1.5">{cycle.kind === 'bi_test' ? 'Did the cycle complete?' : 'Test sheet result'}</legend>
            <div className="flex gap-2">
              {([[true, cycle.kind === 'bi_test' ? 'Completed' : 'Pass (even colour)'], [false, cycle.kind === 'bi_test' ? 'Aborted' : 'Fail']] as const).map(([v, label]) => (
                <button key={String(v)} type="button" onClick={() => setPassed(v)}
                  className={`flex-1 h-11 rounded-control border text-[14px] ${passed === v ? (v ? 'border-success bg-success/[0.08] text-success' : 'border-error bg-error/[0.07] text-error') : 'border-line'}`}>{label}</button>
              ))}
            </div>
            {cycle.kind === 'bi_test' && <p className="text-[12px] text-text-muted mt-2">Incubate the indicator, then record the spore result from the list (usually after 24–48 hours).</p>}
          </fieldset>
        )}
        {(indicator === 'fail' || passed === false) && (
          <Field label="What went wrong?"><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. door seal error, low pressure" /></Field>
        )}
        <Field label="Notes (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={textareaClass} /></Field>
      </div>
    </Modal>
  );
}

/** Read the incubated biological indicator. */
export function SporeResultDialog({ cycle, onClose, onSaved }: { cycle: Cycle; onClose: () => void; onSaved: (c: Cycle, exposed: Exposure[]) => void }) {
  const [busy, setBusy] = useState<boolean | null>(null);
  const [exposed, setExposed] = useState<Exposure[] | null>(null);
  const save = async (passed: boolean) => {
    if (!passed && !window.confirm('Record a FAILED spore test? Unused packs since the last good test are recalled and the steriliser is taken out of service.')) return;
    setBusy(passed);
    const res = await recordSporeResult(cycle.id, passed);
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not save', variant: 'error' });
    if (passed) { toast({ title: 'Spore test passed', variant: 'success' }); onSaved(res.data, []); return; }
    setExposed(res.data.exposed);
    onSaved(res.data, res.data.exposed);
  };
  return (
    <Modal title="Spore test result" subtitle={`${cycle.steriliserName} · cycle ${cycle.cycleNumber}${cycle.biLot ? ` · lot ${cycle.biLot}` : ''}`} onClose={onClose} size={exposed ? 'lg' : 'sm'}>
      <div className="p-5 space-y-4">
        {exposed === null ? (
          <>
            <p className="text-[14px]">Compare the test vial with the unprocessed control after incubation.</p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="outline" onClick={() => save(true)} loading={busy === true}>No growth (pass)</Button>
              <Button className="flex-1" variant="danger" onClick={() => save(false)} loading={busy === false}>Growth (fail)</Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-control bg-error/[0.07] text-error p-3 text-[14px]">Spore test failed. The steriliser is out of service until it is serviced and retested.</p>
            <h3 className="text-[14px] font-semibold">{exposed.length ? `Patients who had packs from suspect cycles (${exposed.length})` : 'No packs from suspect cycles were used on patients.'}</h3>
            {exposed.length > 0 && (
              <>
                <table className="w-full text-[13px]">
                  <thead className="text-left text-text-muted"><tr><th className="font-medium py-1">Patient</th><th className="font-medium">Phone</th><th className="font-medium">Pack</th><th className="font-medium">Used</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {exposed.map(e => <tr key={e.packCode}><td className="py-1.5">{e.patientName}</td><td>{e.phone}</td><td>{e.packCode} · {e.contents}</td><td>{format(parseISO(e.usedAt), 'd MMM')}</td></tr>)}
                  </tbody>
                </table>
                <p className="text-[12px] text-text-muted">Follow your infection-control policy for informing and reviewing these patients. This list is kept in the cycle record.</p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/** Print sticker labels: code, QR, contents, cycle and expiry. */
export async function printPackLabels(packs: Pack[], cycle: Pick<Cycle, 'cycleNumber' | 'steriliserName' | 'startedAt'>) {
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
  const items = await Promise.all(packs.map(async p => {
    const qr = await QRCode.toString(p.code, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).catch(() => '');
    return `<div class="l"><div class="q">${qr}</div><div><b>${esc(p.code)}</b><br>${esc(p.contents)}<br>
      Cycle ${cycle.cycleNumber} · ${esc(cycle.steriliserName || '')}<br>${format(parseISO(cycle.startedAt), 'd MMM yyyy')}<br>
      <b>Use by ${format(parseISO(p.expiresOn), 'd MMM yyyy')}</b></div></div>`;
  }));
  w.document.write(`<!doctype html><html><head><title>Pack labels</title><style>
    body{font-family:system-ui,sans-serif;margin:8mm;color:#000}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
    .l{border:1px dashed #999;padding:3mm;display:flex;gap:3mm;font-size:9pt;line-height:1.3;break-inside:avoid}.q{width:18mm;height:18mm;flex:none}.q svg{width:100%;height:100%}
    </style></head><body><div class="g">${items.join('')}</div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

export { KITS };

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { format, parseISO } from 'date-fns';
import {
  ArrowUpRight, Circle, Columns2, Contrast, Download, Hand, Minus, Plus, RotateCcw, Save, SunMedium, Trash2, Type, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { Annotation, deleteDocument, DOCUMENT_TYPES, DocumentType, formatBytes, PatientDoc, updateDocument, XRAY_KINDS } from '../../api/documentsService';

type Tool = 'pan' | 'circle' | 'arrow' | 'text';
interface View { zoom: number; x: number; y: number }
interface Filters { brightness: number; contrast: number; invert: boolean }
const COLORS = ['#ef4444', '#facc15', '#22c55e', '#38bdf8'];
const id = () => Math.random().toString(36).slice(2, 10);

/** Full-screen viewer: zoom and pan, X-ray brightness/contrast/invert, marks, before/after compare. */
export function DocumentViewer({ doc, compareWith, images, onClose, onChanged, onDeleted }: {
  doc: PatientDoc; compareWith?: PatientDoc; images: PatientDoc[]; onClose: () => void; onChanged: () => void; onDeleted: () => void;
}) {
  const { user } = useAuth();
  const isStaff = user?.role !== 'patient';
  const canDelete = isStaff ? !(user?.role === 'receptionist' && ['X-Ray', 'Intraoral Photo', 'Consent Form'].includes(doc.type))
    : doc.uploadedByPatient;
  const [current, setCurrent] = useState(doc);
  const [other, setOther] = useState<PatientDoc | undefined>(compareWith);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [filters, setFilters] = useState<Filters>({ brightness: 100, contrast: 100, invert: false });
  const [tool, setTool] = useState<Tool>('pan');
  const [color, setColor] = useState(COLORS[0]);
  const [label, setLabel] = useState('');
  const [marks, setMarks] = useState<Annotation[]>(doc.annotations);
  const [details, setDetails] = useState(() => pickDetails(doc));
  const [busy, setBusy] = useState<string | null>(null);
  const dirtyMarks = JSON.stringify(marks) !== JSON.stringify(current.annotations);
  const dirtyDetails = JSON.stringify(details) !== JSON.stringify(pickDetails(current));

  const filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%)${filters.invert ? ' invert(1)' : ''}`;

  const save = async () => {
    setBusy('save');
    const res = await updateDocument(current.id, { ...(dirtyDetails ? details : {}), ...(dirtyMarks ? { annotations: marks } : {}) });
    setBusy(null);
    if (res.error || !res.data) return toast({ title: res.error?.message || 'Could not save', variant: 'error' });
    setCurrent(res.data);
    setMarks(res.data.annotations);
    setDetails(pickDetails(res.data));
    onChanged();
    toast({ title: 'Saved', variant: 'success' });
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${current.title}" from the record?`)) return;
    const res = await deleteDocument(current.id);
    if (res.error) return toast({ title: res.error.message, variant: 'error' });
    toast({ title: 'Removed', variant: 'success' });
    onDeleted();
  };

  const comparable = images.filter(i => i.id !== current.id);

  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-[#0b0f12] text-white" aria-describedby={undefined}>
          {/* Top bar */}
          <div className="flex items-center gap-2 px-3 h-14 border-b border-white/10 flex-none">
            <Dialog.Title className="text-[15px] font-semibold truncate flex-1">
              {current.title}
              <span className="ml-2 text-[12px] font-normal text-white/60">
                {current.xrayKind || current.type}{current.teeth.length ? ` · ${current.teeth.join(', ')}` : ''}{current.takenAt ? ` · ${format(parseISO(current.takenAt), 'd MMM yyyy')}` : ''}
              </span>
            </Dialog.Title>
            <a href={current.fileUrl + (current.fileUrl.includes('?') ? '&download=true' : '')} download={current.fileName}
              className="p-2 rounded-control hover:bg-white/10" aria-label="Download"><Download className="w-5 h-5" /></a>
            {canDelete && <button onClick={remove} className="p-2 rounded-control hover:bg-white/10 text-red-300" aria-label="Remove"><Trash2 className="w-5 h-5" /></button>}
            <Dialog.Close className="p-2 rounded-control hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>

          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            <div className="flex-1 min-h-0 flex flex-col">
              {current.isImage && (
                <Toolbar view={view} setView={setView} filters={filters} setFilters={setFilters} tool={tool} setTool={setTool}
                  color={color} setColor={setColor} label={label} setLabel={setLabel} canMark={isStaff && !other}
                  onUndo={() => setMarks(m => m.slice(0, -1))} canUndo={marks.length > 0}
                  compare={comparable.length > 0 ? (
                    <select value={other?.id || ''} onChange={e => setOther(comparable.find(c => c.id === e.target.value))}
                      className="h-8 rounded-control bg-white/10 border border-white/15 text-[12px] px-2 max-w-[11rem]" aria-label="Compare with">
                      <option value="">Compare with…</option>
                      {comparable.map(c => <option key={c.id} value={c.id}>{c.title}{c.takenAt ? ` (${format(parseISO(c.takenAt), 'd MMM yy')})` : ''}</option>)}
                    </select>
                  ) : null} />
              )}
              <div className={`flex-1 min-h-0 grid ${other ? 'grid-rows-2 md:grid-rows-1 md:grid-cols-2' : ''} gap-px bg-white/10`}>
                <Stage doc={current} view={view} setView={setView} filter={filter} tool={other ? 'pan' : tool} color={color} label={label}
                  marks={marks} setMarks={isStaff && !other ? setMarks : undefined} caption={other ? 'Before' : undefined} />
                {other && <Stage doc={other} view={view} setView={setView} filter={filter} tool="pan" color={color} label="" marks={other.annotations} caption="After" onClear={() => setOther(undefined)} />}
              </div>
            </div>

            {/* Details */}
            <aside className="lg:w-80 flex-none border-t lg:border-t-0 lg:border-l border-white/10 overflow-y-auto max-h-[38vh] lg:max-h-none p-4 space-y-3 text-[13px]">
              {isStaff ? (
                <>
                  <Row label="Title"><Input value={details.title} onChange={e => setDetails({ ...details, title: e.target.value })} className="bg-white/5 border-white/15 text-white" /></Row>
                  <div className="grid grid-cols-2 gap-2">
                    <Row label="Type">
                      <select value={details.type} onChange={e => setDetails({ ...details, type: e.target.value as DocumentType })} className="w-full h-10 rounded-control bg-white/5 border border-white/15 px-2">
                        {DOCUMENT_TYPES.map(t => <option key={t} className="text-black">{t}</option>)}
                      </select>
                    </Row>
                    {details.type === 'X-Ray' && (
                      <Row label="View">
                        <select value={details.xrayKind || ''} onChange={e => setDetails({ ...details, xrayKind: e.target.value || null })} className="w-full h-10 rounded-control bg-white/5 border border-white/15 px-2">
                          <option value="" className="text-black">—</option>
                          {XRAY_KINDS.map(k => <option key={k} className="text-black">{k}</option>)}
                        </select>
                      </Row>
                    )}
                  </div>
                  <Row label="Teeth"><Input value={details.teeth.join(', ')} onChange={e => setDetails({ ...details, teeth: e.target.value.split(/[,\s]+/).filter(Boolean) })} className="bg-white/5 border-white/15 text-white" /></Row>
                  <Row label="Notes">
                    <textarea rows={3} value={details.notes || ''} onChange={e => setDetails({ ...details, notes: e.target.value })} className="w-full p-2 rounded-control bg-white/5 border border-white/15" />
                  </Row>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded" checked={details.sharedWithPatient} onChange={e => setDetails({ ...details, sharedWithPatient: e.target.checked })} />
                    Visible to the patient
                  </label>
                  <Button className="w-full" onClick={save} loading={busy === 'save'} disabled={!dirtyMarks && !dirtyDetails}>
                    <Save className="w-4 h-4" /> Save{dirtyMarks ? ` (${marks.length} marks)` : ''}
                  </Button>
                </>
              ) : (
                <>
                  {current.notes && <p>{current.notes}</p>}
                  {current.annotations.length > 0 && <p className="text-white/60">Your dentist marked {current.annotations.length} {current.annotations.length === 1 ? 'area' : 'areas'} on this image.</p>}
                </>
              )}
              <dl className="text-white/60 space-y-0.5 pt-2 border-t border-white/10">
                <div>{current.fileName} · {formatBytes(current.sizeBytes)}{current.width ? ` · ${current.width}×${current.height}` : ''}</div>
                <div>Added {format(parseISO(current.createdAt), 'd MMM yyyy')}{current.uploadedByName ? ` by ${current.uploadedByName}` : ''}{current.uploadedByPatient ? ' (patient)' : ''}</div>
              </dl>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function pickDetails(d: PatientDoc) {
  return { title: d.title, type: d.type, xrayKind: d.xrayKind, teeth: d.teeth, notes: d.notes, sharedWithPatient: d.sharedWithPatient };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[12px] text-white/60">{label}</span><div className="mt-1">{children}</div></label>;
}

function Toolbar({ view, setView, filters, setFilters, tool, setTool, color, setColor, label, setLabel, canMark, onUndo, canUndo, compare }: {
  view: View; setView: (v: View) => void; filters: Filters; setFilters: (f: Filters) => void; tool: Tool; setTool: (t: Tool) => void;
  color: string; setColor: (c: string) => void; label: string; setLabel: (l: string) => void; canMark: boolean;
  onUndo: () => void; canUndo: boolean; compare: React.ReactNode;
}) {
  const btn = (active: boolean) => `h-8 px-2 rounded-control flex items-center gap-1 text-[12px] ${active ? 'bg-white text-black' : 'hover:bg-white/10'}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-white/10 flex-none">
      <button className={btn(false)} onClick={() => setView({ ...view, zoom: Math.max(1, view.zoom / 1.25) })} aria-label="Zoom out"><Minus className="w-4 h-4" /></button>
      <span className="text-[12px] w-11 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
      <button className={btn(false)} onClick={() => setView({ ...view, zoom: Math.min(8, view.zoom * 1.25) })} aria-label="Zoom in"><Plus className="w-4 h-4" /></button>
      <button className={btn(false)} onClick={() => { setView({ zoom: 1, x: 0, y: 0 }); setFilters({ brightness: 100, contrast: 100, invert: false }); }} aria-label="Reset view"><RotateCcw className="w-4 h-4" /></button>
      <span className="w-px h-5 bg-white/15 mx-1" />
      <label className="flex items-center gap-1 text-[12px]" title="Brightness"><SunMedium className="w-4 h-4" />
        <input type="range" min={40} max={200} value={filters.brightness} onChange={e => setFilters({ ...filters, brightness: Number(e.target.value) })} className="w-20 accent-white" aria-label="Brightness" />
      </label>
      <label className="flex items-center gap-1 text-[12px]" title="Contrast"><Contrast className="w-4 h-4" />
        <input type="range" min={40} max={250} value={filters.contrast} onChange={e => setFilters({ ...filters, contrast: Number(e.target.value) })} className="w-20 accent-white" aria-label="Contrast" />
      </label>
      <button className={btn(filters.invert)} onClick={() => setFilters({ ...filters, invert: !filters.invert })}>Invert</button>
      {canMark && (
        <>
          <span className="w-px h-5 bg-white/15 mx-1" />
          <button className={btn(tool === 'pan')} onClick={() => setTool('pan')} aria-label="Move"><Hand className="w-4 h-4" /></button>
          <button className={btn(tool === 'circle')} onClick={() => setTool('circle')} aria-label="Circle"><Circle className="w-4 h-4" /></button>
          <button className={btn(tool === 'arrow')} onClick={() => setTool('arrow')} aria-label="Arrow"><ArrowUpRight className="w-4 h-4" /></button>
          <button className={btn(tool === 'text')} onClick={() => setTool('text')} aria-label="Label"><Type className="w-4 h-4" /></button>
          {COLORS.map(c => <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />)}
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={200}
            className="h-8 w-36 rounded-control bg-white/10 border border-white/15 px-2 text-[12px] placeholder:text-white/40" aria-label="Label for the next mark" />
          <button className={btn(false)} onClick={onUndo} disabled={!canUndo} aria-label="Undo last mark">Undo</button>
        </>
      )}
      {compare && <span className="ml-auto flex items-center gap-1"><Columns2 className="w-4 h-4" />{compare}</span>}
    </div>
  );
}

function Stage({ doc, view, setView, filter, tool, color, label, marks, setMarks, caption, onClear }: {
  doc: PatientDoc; view: View; setView: (v: View) => void; filter: string; tool: Tool; color: string; label: string;
  marks: Annotation[]; setMarks?: React.Dispatch<React.SetStateAction<Annotation[]>>; caption?: string; onClear?: () => void;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<Annotation | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => { setSize(null); }, [doc.id]);

  const norm = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'pan' || !setMarks || !svg.current) { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; return; }
    const p = norm(e);
    if (tool === 'text') {
      setMarks(m => [...m, { id: id(), kind: 'text', x: p.x, y: p.y, text: label || 'Note', color }]);
      return;
    }
    setDraft({ id: id(), kind: tool, x: p.x, y: p.y, x2: p.x, y2: p.y, r: 0, color, text: label || undefined });
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      setView({ ...view, x: drag.current.vx + (e.clientX - drag.current.x), y: drag.current.vy + (e.clientY - drag.current.y) });
      return;
    }
    if (!draft || !svg.current) return;
    const p = norm(e);
    if (draft.kind === 'circle' && size) {
      const dx = (p.x - draft.x) * size.w, dy = (p.y - draft.y) * size.h;
      setDraft({ ...draft, r: Math.min(1, Math.hypot(dx, dy) / size.w) });
    } else setDraft({ ...draft, x2: p.x, y2: p.y });
  };

  const up = () => {
    drag.current = null;
    if (draft && setMarks) {
      const big = draft.kind === 'circle' ? (draft.r || 0) > 0.005 : Math.hypot((draft.x2 || 0) - draft.x, (draft.y2 || 0) - draft.y) > 0.01;
      if (big) setMarks(m => [...m, draft]);
    }
    setDraft(null);
  };

  const wheel = (e: React.WheelEvent) => {
    if (!doc.isImage) return;
    const zoom = Math.min(8, Math.max(1, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setView({ ...view, zoom, ...(zoom === 1 ? { x: 0, y: 0 } : {}) });
  };

  if (!doc.isImage) {
    return doc.contentType === 'application/pdf' ? (
      <iframe src={doc.fileUrl} title={doc.title} className="w-full h-full bg-white" />
    ) : (
      <div className="flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
        <p>This file type can't be shown in the browser.</p>
        <a href={doc.fileUrl} download={doc.fileName} className="underline">Download {doc.fileName}</a>
      </div>
    );
  }

  const all = draft ? [...marks, draft] : marks;
  const W = size?.w || 1000, H = size?.h || 1000;
  return (
    <div className="relative overflow-hidden select-none touch-none bg-black" style={{ cursor: tool === 'pan' ? (drag.current ? 'grabbing' : 'grab') : 'crosshair' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
      {caption && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-[11px] bg-black/70 rounded px-2 py-1">
          <strong>{caption}</strong> {doc.takenAt && format(parseISO(doc.takenAt), 'd MMM yyyy')}
          {onClear && <button onClick={onClear} className="ml-1 opacity-70 hover:opacity-100" aria-label="Stop comparing"><X className="w-3 h-3" /></button>}
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: 'center' }}>
        <div className="relative max-w-full max-h-full">
          <img src={doc.fileUrl} alt={doc.title} draggable={false} className="block max-w-full max-h-[calc(100vh-9rem)] lg:max-h-[calc(100vh-7.5rem)] object-contain"
            style={{ filter }} onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <defs>
              {COLORS.map(c => (
                <marker key={c} id={`head-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
                </marker>
              ))}
            </defs>
            {all.map(m => {
              const fs = W * 0.028;
              const text = m.text ? <text x={m.x * W + (m.kind === 'circle' ? (m.r || 0) * W + fs * 0.3 : 6)} y={m.y * H - 6} fill={m.color} fontSize={fs} fontWeight={600} style={{ paintOrder: 'stroke', stroke: '#000', strokeWidth: fs * 0.12 }}>{m.text}</text> : null;
              if (m.kind === 'circle') return <g key={m.id}><circle cx={m.x * W} cy={m.y * H} r={(m.r || 0) * W} fill="none" stroke={m.color} strokeWidth={3} vectorEffect="non-scaling-stroke" />{text}</g>;
              if (m.kind === 'arrow' || m.kind === 'line') return (
                <g key={m.id}>
                  <line x1={m.x * W} y1={m.y * H} x2={(m.x2 ?? m.x) * W} y2={(m.y2 ?? m.y) * H} stroke={m.color} strokeWidth={3} vectorEffect="non-scaling-stroke"
                    markerEnd={m.kind === 'arrow' ? `url(#head-${m.color.slice(1)})` : undefined} />
                  {text}
                </g>
              );
              return <g key={m.id}>{text}</g>;
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

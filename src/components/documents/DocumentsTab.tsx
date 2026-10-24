import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Columns2, FileText, Image as ImageIcon, Lock, Plus, Search, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Modal, Field, selectClass } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import {
  DOCUMENT_TYPES, DocumentType, formatBytes, getDocuments, PATIENT_UPLOAD_TYPES, PatientDoc, uploadDocument, XRAY_KINDS,
} from '../../api/documentsService';
import { DocumentViewer } from './DocumentViewer';

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.dcm';
const MAX_MB = 25;

/** A patient's X-rays, photos and reports. Staff upload and annotate; patients see what's shared with them. */
export function DocumentsTab({ patientId, defaultTooth }: { patientId: string; defaultTooth?: string }) {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const [docs, setDocs] = useState<PatientDoc[] | null>(null);
  const [type, setType] = useState<string>('All');
  const [tooth, setTooth] = useState(defaultTooth || '');
  const [files, setFiles] = useState<File[] | null>(null);
  const [viewing, setViewing] = useState<{ doc: PatientDoc; compareWith?: PatientDoc } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await getDocuments(patientId, { type, tooth: tooth.trim() || undefined });
    setDocs(res.data || []);
  }, [patientId, type, tooth]);
  useEffect(() => { const t = setTimeout(load, tooth ? 250 : 0); return () => clearTimeout(t); }, [load, tooth]);

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const ok = Array.from(list).filter(f => f.size <= MAX_MB * 1024 * 1024);
    if (ok.length < list.length) toast({ title: `Files over ${MAX_MB} MB were skipped`, variant: 'error' });
    if (ok.length) setFiles(ok);
  };

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s.slice(-1), id]));
  const images = (docs || []).filter(d => d.isImage);
  const compare = () => {
    const [a, b] = selected.map(id => images.find(d => d.id === id)).filter(Boolean) as PatientDoc[];
    if (a && b) {
      const [older, newer] = [a, b].sort((x, y) => (x.takenAt || x.createdAt).localeCompare(y.takenAt || y.createdAt));
      setViewing({ doc: older, compareWith: newer });
    }
  };

  return (
    <div className="space-y-4"
      onDragOver={e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}>
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">X-rays & documents</h3>
          <p className="text-[13px] text-text-muted">{isPatient ? 'Images and reports your clinic has shared with you.' : 'Drop files here or upload. Tag teeth to find them from the dental chart.'}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          {selected.length === 2 && <Button size="sm" variant="outline" onClick={compare}><Columns2 className="w-4 h-4" /> Compare</Button>}
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { pick(e.target.files); e.target.value = ''; }} />
          <Button size="sm" onClick={() => input.current?.click()}><Upload className="w-4 h-4" /> Upload</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex flex-wrap gap-1">
          {['All', 'X-Ray', 'Intraoral Photo', 'Lab Report', 'Insurance Document', 'Other'].map(t => (
            <button key={t} onClick={() => setType(t)}
              className={`h-8 px-3 rounded-full text-[12px] font-medium ${type === t ? 'bg-primary text-white' : 'border border-line text-text-muted hover:bg-surface-hover'}`}>
              {t === 'All' ? 'All' : t === 'Intraoral Photo' ? 'Photos' : t === 'Insurance Document' ? 'Insurance' : t === 'X-Ray' ? 'X-rays' : t === 'Lab Report' ? 'Reports' : t}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-36">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input value={tooth} onChange={e => setTooth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Tooth no." className="pl-8 h-8 text-[13px]" inputMode="numeric" aria-label="Filter by tooth" />
        </div>
      </div>
      {images.length > 1 && !isPatient && <p className="text-[12px] text-text-muted -mt-2">Tip: tick two images to compare before and after.</p>}

      <div className={`rounded-control transition-colors ${dragging ? 'ring-2 ring-primary ring-offset-2 bg-primary/[0.03]' : ''}`}>
        {docs === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="aspect-[4/3]" />)}</div>
        ) : docs.length === 0 ? (
          <EmptyState icon={ImageIcon} title={tooth || type !== 'All' ? 'Nothing matches' : 'No files yet'}
            description={isPatient ? 'You can add insurance papers or reports from other clinics.' : 'Upload X-rays, intraoral photos and reports. JPEG, PNG, WebP, PDF or DICOM, up to 25 MB.'}
            actionLabel="Upload" onAction={() => input.current?.click()} />
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {docs.map(d => (
              <li key={d.id} className={`group relative rounded-control border bg-surface overflow-hidden ${selected.includes(d.id) ? 'border-primary ring-1 ring-primary' : 'border-line'}`}>
                <button className="block w-full text-left" onClick={() => setViewing({ doc: d })}>
                  <div className="aspect-[4/3] bg-gray-900/90 flex items-center justify-center overflow-hidden">
                    {d.thumbnailUrl ? <img src={d.thumbnailUrl} alt={d.title} loading="lazy" className="w-full h-full object-cover" />
                      : <FileText className="w-10 h-10 text-white/60" />}
                  </div>
                  <div className="p-2.5">
                    <div className="text-[13px] font-medium truncate">{d.title}</div>
                    <div className="text-[11px] text-text-muted truncate">
                      {d.xrayKind || d.type}{d.teeth.length ? ` · ${d.teeth.join(', ')}` : ''} · {d.takenAt ? format(parseISO(d.takenAt), 'd MMM yyyy') : ''}
                    </div>
                  </div>
                </button>
                <div className="absolute top-2 left-2 flex gap-1">
                  {!d.sharedWithPatient && !isPatient && <span className="bg-black/60 text-white rounded px-1.5 py-0.5 text-[10px] flex items-center gap-1"><Lock className="w-3 h-3" /> Staff only</span>}
                  {d.annotations.length > 0 && <span className="bg-black/60 text-white rounded px-1.5 py-0.5 text-[10px]">{d.annotations.length} marks</span>}
                </div>
                {d.isImage && !isPatient && (
                  <label className="absolute top-2 right-2 w-7 h-7 rounded bg-white/90 flex items-center justify-center cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 has-[:checked]:opacity-100">
                    <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title} to compare`} />
                  </label>
                )}
              </li>
            ))}
            {!isPatient && (
              <li>
                <button onClick={() => input.current?.click()} className="w-full h-full min-h-[160px] rounded-control border-2 border-dashed border-line text-text-muted hover:border-primary hover:text-primary flex flex-col items-center justify-center gap-1 text-[13px]">
                  <Plus className="w-5 h-5" /> Add files
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {files && <UploadDialog patientId={patientId} files={files} defaultTooth={tooth} onClose={() => setFiles(null)} onDone={n => { setFiles(null); load(); toast({ title: `${n} ${n === 1 ? 'file' : 'files'} added`, variant: 'success' }); }} />}
      {viewing && (
        <DocumentViewer doc={viewing.doc} compareWith={viewing.compareWith} images={images}
          onClose={() => setViewing(null)} onChanged={() => load()} onDeleted={() => { setViewing(null); load(); }} />
      )}
    </div>
  );
}

function guessType(f: File): DocumentType {
  if (f.type === 'application/pdf') return 'Lab Report';
  if (/x-?ray|opg|iopa|rvg|bitewing|ceph|cbct/i.test(f.name) || /\.dcm$/i.test(f.name)) return 'X-Ray';
  return f.type.startsWith('image/') ? 'Intraoral Photo' : 'Other';
}

function UploadDialog({ patientId, files, defaultTooth, onClose, onDone }: { patientId: string; files: File[]; defaultTooth?: string; onClose: () => void; onDone: (n: number) => void }) {
  const { user } = useAuth();
  const isPatient = user?.role === 'patient';
  const allowed: readonly DocumentType[] = isPatient ? PATIENT_UPLOAD_TYPES : DOCUMENT_TYPES;
  const first = guessType(files[0]);
  const [type, setType] = useState<DocumentType>(allowed.includes(first) ? first : allowed[0]);
  const [xrayKind, setXrayKind] = useState('IOPA');
  const [teeth, setTeeth] = useState(defaultTooth || '');
  const [takenAt, setTakenAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [shared, setShared] = useState(true);
  const [title, setTitle] = useState(files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : '');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useState(() => files.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)))[0];
  useEffect(() => () => previews.forEach(u => u && URL.revokeObjectURL(u)), [previews]);

  const submit = async () => {
    setError(null);
    let done = 0;
    const failed: string[] = [];
    for (const f of files) {
      setProgress(done);
      const res = await uploadDocument(patientId, f, {
        type, title: files.length === 1 ? title.trim() || undefined : undefined, xrayKind: type === 'X-Ray' ? xrayKind : undefined,
        teeth: teeth.split(/[,\s]+/).filter(Boolean), takenAt, notes: notes.trim() || undefined, sharedWithPatient: shared,
      });
      if (res.error) failed.push(`${f.name}: ${res.error.message}`);
      else done += 1;
    }
    setProgress(null);
    if (failed.length) setError(failed.join('\n'));
    else onDone(done);
  };

  return (
    <Modal title={`Add ${files.length} ${files.length === 1 ? 'file' : 'files'}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose} disabled={progress !== null}>Cancel</Button>
        <Button onClick={submit} loading={progress !== null}>{progress !== null ? `Uploading ${progress + 1} of ${files.length}` : 'Upload'}</Button></>}>
      <div className="p-5 space-y-4">
        <ul className="flex gap-2 overflow-x-auto scrollbar-hide">
          {files.map((f, i) => (
            <li key={i} className="flex-none w-24">
              <div className="w-24 h-20 rounded-control bg-gray-900/90 overflow-hidden flex items-center justify-center">
                {previews[i] ? <img src={previews[i]!} alt="" className="w-full h-full object-cover" /> : <FileText className="w-7 h-7 text-white/60" />}
              </div>
              <div className="text-[11px] truncate mt-1">{f.name}</div>
              <div className="text-[10px] text-text-muted">{formatBytes(f.size)}</div>
            </li>
          ))}
        </ul>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Type">
            <select value={type} onChange={e => setType(e.target.value as DocumentType)} className={selectClass}>{allowed.map(t => <option key={t}>{t}</option>)}</select>
          </Field>
          {type === 'X-Ray' ? (
            <Field label="X-ray view">
              <select value={xrayKind} onChange={e => setXrayKind(e.target.value)} className={selectClass}>{XRAY_KINDS.map(k => <option key={k}>{k}</option>)}</select>
            </Field>
          ) : <Field label="Date"><Input type="date" value={takenAt} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setTakenAt(e.target.value)} /></Field>}
          {files.length === 1 && <div className="sm:col-span-2"><Field label="Title"><Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></Field></div>}
          {!isPatient && <Field label="Teeth" hint="FDI numbers, e.g. 36, 37"><Input value={teeth} onChange={e => setTeeth(e.target.value)} /></Field>}
          {type === 'X-Ray' && <Field label="Taken on"><Input type="date" value={takenAt} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setTakenAt(e.target.value)} /></Field>}
          <div className="sm:col-span-2"><Field label="Notes"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={isPatient ? 'e.g. Policy renewed in April' : 'e.g. Pre-op, periapical radiolucency'} /></Field></div>
        </div>
        {!isPatient && (
          <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-line text-primary" checked={shared} onChange={e => setShared(e.target.checked)} />
            Show to the patient in their portal
          </label>
        )}
        {error && <p className="text-[13px] text-error whitespace-pre-wrap">{error}</p>}
        <p className="text-[12px] text-text-muted flex items-center gap-1"><Lock className="w-3 h-3" /> JPEG, PNG, WebP, PDF or DICOM, up to {MAX_MB} MB each. Files are checked and stored privately.</p>
      </div>
    </Modal>
  );
}

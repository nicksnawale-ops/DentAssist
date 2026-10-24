import React, { useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SignaturePad, SignaturePadHandle } from './SignaturePad';
import { SignatureInput } from '../../api/prescriptionsService';

const RELATIONSHIPS = ['Self', 'Parent', 'Guardian', 'Spouse', 'Child', 'Other'];

/** The consent text, its risks, and the signature block. Shared by the clinic tablet, portal and phone link. */
export function ConsentSignForm({
  title, body, risks, defaultName, onSubmit, submitLabel = 'Sign consent',
}: {
  title: string;
  body: string;
  risks: string[];
  defaultName: string;
  onSubmit: (s: SignatureInput) => Promise<string | null>; // returns an error message, or null when done
  submitLabel?: string;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(defaultName);
  const [relationship, setRelationship] = useState('Self');
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const signature = pad.current?.toDataUrl();
    if (!signature) { setError('Please sign in the box.'); return; }
    setBusy(true);
    setError(null);
    const err = await onSubmit({ signature, signedByName: name.trim(), relationship, agree });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <article className="space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{body}</p>
        {risks.length > 0 && (
          <div className="rounded-control border border-warning/20 bg-warning/[0.06] p-4">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2"><AlertTriangle className="w-4 h-4 text-warning" /> Possible risks explained to me</h3>
            <ul className="list-disc pl-5 space-y-1 text-[14px]">
              {risks.map(r => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
      </article>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[13px] font-medium">Name of person signing</span>
          <Input className="mt-1" value={name} onChange={e => setName(e.target.value)} required minLength={2} autoComplete="name" />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium">Signing as</span>
          <select value={relationship} onChange={e => setRelationship(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-control border border-line bg-surface text-sm">
            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r === 'Self' ? 'The patient' : r}</option>)}
          </select>
        </label>
      </div>

      <div>
        <span className="text-[13px] font-medium">Signature</span>
        <div className="mt-1"><SignaturePad ref={pad} onChange={setHasInk} /></div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input type="checkbox" className="h-5 w-5 mt-0.5 rounded border-line text-primary" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span className="text-[14px]">I have read this form, the risks have been explained to me, my questions were answered, and I agree to the treatment.</span>
      </label>

      {error && <p role="alert" className="text-[13px] text-error">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={!agree || !hasInk || name.trim().length < 2} loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

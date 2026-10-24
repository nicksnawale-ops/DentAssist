import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Field, selectClass, textareaClass } from '../../components/ui/Modal';
import { getEnquiryForm, submitEnquiry } from '../../api/leadsService';

/** Public enquiry form: shared as a link or QR, or embedded on the clinic's website (?embed=1). */
export function Enquire() {
  const { clinicId = '' } = useParams();
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const utm = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((v, k) => { if (k.startsWith('utm_')) out[k] = v.slice(0, 200); });
    return out;
  }, [params]);

  const [clinic, setClinic] = useState<{ clinicName: string; clinicPhone: string | null; interests: string[]; onlineBooking: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState(params.get('interest') || '');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(true);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getEnquiryForm(clinicId).then(r => (r.data ? setClinic(r.data) : setError(r.error?.message || 'This form is not available.')));
  }, [clinicId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Please enter your name';
    if (phone.replace(/\D/g, '').length < 10) errs.phone = 'Please enter your 10-digit mobile number';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    const res = await submitEnquiry(clinicId, {
      name: name.trim(), phone, interest: interest || undefined, message: message.trim() || undefined,
      whatsappConsent: consent, utm: Object.keys(utm).length ? utm : undefined, website: trap || undefined,
    });
    setBusy(false);
    if (res.error || !res.data) {
      setFieldErrors(res.error?.fieldErrors || {});
      setError(res.error?.message || 'Something went wrong. Please call us instead.');
      return;
    }
    setDone(res.data.firstName);
  };

  return (
    <div className={`min-h-[100dvh] ${embed ? 'bg-transparent' : 'bg-base'}`}>
      {!embed && (
        <div className="h-14 bg-ink flex items-center px-4 sm:px-6">
          <BrandMark small />
          <span className="ml-2.5 text-[15px] font-semibold text-white">{clinic?.clinicName || 'Enquiry'}</span>
        </div>
      )}
      <main className={`max-w-md mx-auto ${embed ? 'p-0' : 'px-4 py-8'}`}>
        <div className="bg-surface rounded-panel border border-line p-6">
          {done ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="w-14 h-14 text-success mx-auto" />
              <h1 className="text-xl font-semibold">Thank you, {done}!</h1>
              <p className="text-[15px] text-text-muted">We've received your enquiry and will call you shortly{consent ? ' (we may also message you on WhatsApp)' : ''}.</p>
              {clinic?.onlineBooking && (
                <Link to={`/book/${clinicId}`} target={embed ? '_top' : undefined} className="inline-block text-[14px] font-medium text-primary hover:underline">Or pick a time yourself</Link>
              )}
            </div>
          ) : clinic ? (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div>
                <h1 className="text-xl font-semibold">Ask us anything</h1>
                <p className="text-[14px] text-text-muted">Leave your number and our team will call you back, usually within 15 minutes during clinic hours.</p>
              </div>
              <Field label="Your name">
                <Input value={name} onChange={e => setName(e.target.value)} autoComplete="name" aria-invalid={!!fieldErrors.name} />
                {fieldErrors.name && <span className="text-[12px] text-error">{fieldErrors.name}</span>}
              </Field>
              <Field label="Mobile number">
                <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" aria-invalid={!!fieldErrors.phone} />
                {fieldErrors.phone && <span className="text-[12px] text-error">{fieldErrors.phone}</span>}
              </Field>
              <Field label="What can we help with?">
                <select value={interest} onChange={e => setInterest(e.target.value)} className={selectClass}>
                  <option value="">Choose one (optional)</option>
                  {clinic.interests.map(i => <option key={i}>{i}</option>)}
                </select>
              </Field>
              <Field label="Anything else? (optional)">
                <textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} className={textareaClass} placeholder="e.g. a tooth has been hurting for a week" />
              </Field>
              {/* Hidden from people; bots fill it in. */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} /></label>
              </div>
              <label className="flex items-start gap-2 text-[13px] text-text-muted">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line text-primary" checked={consent} onChange={e => setConsent(e.target.checked)} />
                You may contact me on WhatsApp about my enquiry
              </label>
              <Button type="submit" size="lg" className="w-full" loading={busy}>Request a call back</Button>
              <p className="text-[11px] text-text-muted">We use your details only to reply to this enquiry.</p>
            </form>
          ) : !error && <p className="text-sm text-text-muted">Loading…</p>}
          {error && <p role="alert" className="mt-3 text-[14px] text-error">{error}</p>}
        </div>
        {!embed && clinic?.clinicPhone && <p className="text-center text-[13px] text-text-muted mt-4">Prefer to talk? Call {clinic.clinicPhone}</p>}
      </main>
    </div>
  );
}

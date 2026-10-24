import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDays, format, isSameDay, parseISO } from 'date-fns';
import { MapPin, Phone, CheckCircle2, ChevronLeft } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { FreeSlot } from '../../api/apiService';
import { BookingConfirmation, bookPublic, getPublicClinic, getPublicSlots, PublicClinic } from '../../api/publicBooking';

type Step = 'visit' | 'time' | 'details' | 'done';

const inputCls = 'w-full h-11 px-3 bg-surface border border-line rounded-control text-[15px] focus:outline-none focus:border-accent focus:ring-4 focus:ring-accent/15';

/** Public page a clinic shares (website, Google profile, WhatsApp) so patients can book themselves. */
export function BookOnline() {
  const { clinicId = '' } = useParams<{ clinicId: string }>();
  const [clinic, setClinic] = useState<PublicClinic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('visit');
  const [visitType, setVisitType] = useState('');
  const [dentistId, setDentistId] = useState('');
  const [day, setDay] = useState<Date | null>(null);
  const [slots, setSlots] = useState<FreeSlot[] | null>(null);
  const [slot, setSlot] = useState<FreeSlot | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  useEffect(() => {
    getPublicClinic(clinicId).then(res => {
      if (res.data) {
        setClinic(res.data);
        document.title = `Book an appointment, ${res.data.name}`;
      } else {
        setLoadError(res.error?.message || 'This booking page is not available.');
      }
    });
  }, [clinicId]);

  // Load times: the next available ones, or a chosen day.
  useEffect(() => {
    if (step !== 'time' || !visitType) return;
    setSlots(null);
    getPublicSlots(clinicId, visitType, day ? format(day, 'yyyy-MM-dd') : undefined, dentistId || undefined)
      .then(res => setSlots(res.data || []));
  }, [step, visitType, day, dentistId, clinicId]);

  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(new Date(), i)), []);
  const closedDays = new Set((clinic?.operatingHours || []).filter(h => !h.isOpen).map(h => h.day));
  const visit = clinic?.visitTypes.find(v => v.key === visitType);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    const res = await bookPublic(clinicId, {
      name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, visitType,
      dentistId: dentistId || slot.dentistId, startTime: slot.startTime, notes: form.notes.trim() || undefined,
      website: form.website || undefined,
    });
    setSubmitting(false);
    if (res.data) {
      setConfirmation(res.data);
      setStep('done');
    } else if (res.error?.code === 'SLOT_TAKEN') {
      setError(res.error.message);
      setSlot(null);
      setStep('time');
    } else {
      setError(res.error?.message || 'The booking did not go through. Please try again or call the clinic.');
    }
  };

  if (loadError) {
    return (
      <Shell>
        <p className="text-[15px] text-text-muted">{loadError}</p>
      </Shell>
    );
  }
  if (!clinic) return <Shell><div className="h-40 rounded-panel bg-base animate-pulse" /></Shell>;

  const address = clinic.address ? [clinic.address.street, clinic.address.city].filter(Boolean).join(', ') : '';

  return (
    <Shell>
      <header className="mb-6">
        <h1 className="text-[24px] sm:text-[28px] font-semibold leading-tight">{clinic.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
          {address && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{address}</span>}
          {clinic.phone && <a href={`tel:${clinic.phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 hover:text-primary"><Phone className="w-4 h-4" />{clinic.phone}</a>}
        </div>
      </header>

      {step !== 'done' && (
        <ol className="flex gap-2 mb-6" aria-label="Booking steps">
          {(['visit', 'time', 'details'] as const).map((s, i) => (
            <li key={s} className={`h-1 flex-1 rounded-full ${['visit', 'time', 'details'].indexOf(step) >= i ? 'bg-accent' : 'bg-line'}`}>
              <span className="sr-only">{s}</span>
            </li>
          ))}
        </ol>
      )}

      {step === 'visit' && (
        <section>
          <h2 className="text-[17px] font-semibold mb-3">What would you like to come in for?</h2>
          <div className="grid gap-2">
            {clinic.visitTypes.map(v => (
              <button
                key={v.key}
                onClick={() => { setVisitType(v.key); setStep('time'); }}
                className={`text-left px-4 py-3.5 rounded-control border transition-colors ${visitType === v.key ? 'border-accent bg-accent/[0.06]' : 'border-line bg-surface hover:border-text-muted/40'}`}
              >
                <span className="block text-[15px] font-medium">{v.label}</span>
                <span className="block text-[13px] text-text-muted">About {v.minutes} minutes</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-text-muted">
            In severe pain, swelling or after an injury? Please call {clinic.phone ? <a className="text-primary" href={`tel:${clinic.phone.replace(/\s/g, '')}`}>{clinic.phone}</a> : 'the clinic'} instead.
          </p>
        </section>
      )}

      {step === 'time' && (
        <section>
          <BackLink onClick={() => { setStep('visit'); setDay(null); }} />
          <h2 className="text-[17px] font-semibold mb-1">Choose a time</h2>
          <p className="text-[13px] text-text-muted mb-4">{visit?.label}, about {visit?.minutes} minutes</p>

          {clinic.dentists.length > 1 && (
            <label className="block mb-4">
              <span className="block text-sm text-text-muted mb-1">Dentist</span>
              <select value={dentistId} onChange={e => setDentistId(e.target.value)} className={inputCls}>
                <option value="">Any available dentist</option>
                {clinic.dentists.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}

          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 mb-4" role="listbox" aria-label="Day">
            <button
              onClick={() => setDay(null)}
              className={`shrink-0 h-14 px-3 rounded-control border text-sm font-medium ${day === null ? 'bg-primary text-white border-primary' : 'bg-surface border-line'}`}
            >
              Soonest
            </button>
            {days.map(d => {
              const closed = closedDays.has(format(d, 'EEEE'));
              const selected = day && isSameDay(day, d);
              return (
                <button
                  key={d.toISOString()}
                  disabled={closed}
                  onClick={() => setDay(d)}
                  className={`shrink-0 w-14 h-14 rounded-control border flex flex-col items-center justify-center disabled:opacity-35 ${selected ? 'bg-primary text-white border-primary' : 'bg-surface border-line'}`}
                >
                  <span className="text-[11px]">{format(d, 'EEE')}</span>
                  <span className="text-[15px] font-semibold leading-tight">{format(d, 'd')}</span>
                </button>
              );
            })}
          </div>

          {error && <p role="alert" className="mb-3 text-sm text-error">{error}</p>}

          {slots === null ? (
            <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-11 rounded-control bg-base animate-pulse" />)}</div>
          ) : slots.length === 0 ? (
            <p className="text-[15px] text-text-muted">No free times {day ? 'on this day' : 'in the next three weeks'}. Try another day or call the clinic.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map(s => {
                const start = parseISO(s.startTime);
                const chosen = slot?.startTime === s.startTime && slot?.dentistId === s.dentistId;
                return (
                  <button
                    key={`${s.dentistId}${s.startTime}`}
                    onClick={() => { setSlot(s); setError(null); setStep('details'); }}
                    className={`h-auto min-h-11 py-1.5 rounded-control border text-sm font-medium ${chosen ? 'bg-primary text-white border-primary' : 'bg-surface border-line hover:border-accent'}`}
                  >
                    {!day && <span className="block text-[11px] font-normal text-text-muted">{format(start, 'EEE d MMM')}</span>}
                    {format(start, 'h:mm a')}
                    {!dentistId && clinic.dentists.length > 1 && <span className="block text-[11px] font-normal text-text-muted truncate px-1">{s.dentistName}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {step === 'details' && slot && (
        <section>
          <BackLink onClick={() => setStep('time')} />
          <div className="rounded-control bg-accent/[0.07] border border-accent/20 px-4 py-3 mb-5">
            <div className="text-[15px] font-semibold">{format(parseISO(slot.startTime), "EEEE d MMMM, h:mm a")}</div>
            <div className="text-[13px] text-text-muted">{visit?.label} with {slot.dentistName}</div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium mb-1">Full name</span>
              <input required minLength={2} autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium mb-1">Mobile number</span>
              <input required type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
              <span className="block text-[13px] text-text-muted mt-1">The clinic will confirm on this number.</span>
            </label>
            <label className="block">
              <span className="block text-sm font-medium mb-1">Email <span className="font-normal text-text-muted">(optional)</span></span>
              <input type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium mb-1">Anything the dentist should know? <span className="font-normal text-text-muted">(optional)</span></span>
              <textarea rows={2} maxLength={500} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`${inputCls} h-auto py-2`} />
            </label>
            {/* Hidden from people; bots fill it in. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="hidden" aria-hidden="true" />
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={submitting}>Book appointment</Button>
            <p className="text-[12px] text-text-muted">Your details are used only to manage your appointment at {clinic.name}.</p>
          </form>
        </section>
      )}

      {step === 'done' && confirmation && (
        <section className="text-center py-6">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
          <h2 className="text-[22px] font-semibold mb-1">You're booked</h2>
          {confirmation.startTime ? (
            <>
              <p className="text-[15px]">{format(parseISO(confirmation.startTime), "EEEE d MMMM, h:mm a")}</p>
              <p className="text-[15px] text-text-muted">{confirmation.visitType} with {confirmation.dentistName}</p>
            </>
          ) : (
            <p className="text-[15px] text-text-muted">We've received your request.</p>
          )}
          <p className="mt-4 text-sm text-text-muted max-w-sm mx-auto">
            The clinic will confirm shortly. To change or cancel, call {clinic.phone || 'the clinic'}.
          </p>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-base">
      <div className="h-14 bg-ink flex items-center px-4 sm:px-6">
        <BrandMark small />
        <span className="ml-2.5 text-[15px] font-semibold text-white">Book online</span>
      </div>
      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-primary mb-3 -ml-1">
      <ChevronLeft className="w-4 h-4" /> Back
    </button>
  );
}

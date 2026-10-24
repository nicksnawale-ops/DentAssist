import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Phone } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CheckinMatch, checkinConfirm, checkinLookup, getCheckinClinic } from '../../api/familyService';

/** Opened from the QR code at reception. No login: mobile number, pick the appointment, "I'm here". */
export function SelfCheckIn() {
  const { clinicId = '' } = useParams();
  const [params] = useSearchParams();
  const t = params.get('t') || '';
  const [clinic, setClinic] = useState<{ clinicName: string; clinicPhone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<CheckinMatch[] | null>(null);
  const [done, setDone] = useState<{ firstName: string; ahead: number; dentist: string | null; already: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getCheckinClinic(clinicId, t).then(r => (r.data ? setClinic(r.data) : setError(r.error?.message || 'This code is not valid.')));
  }, [clinicId, t]);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('find');
    setError(null);
    const res = await checkinLookup(clinicId, t, phone);
    setBusy(null);
    if (res.error) { setError(res.error.message); return; }
    setMatches(res.data || []);
  };

  const confirm = async (m: CheckinMatch) => {
    setBusy(m.appointmentId);
    setError(null);
    const res = await checkinConfirm(clinicId, t, phone, m.appointmentId);
    setBusy(null);
    if (res.error || !res.data) { setError(res.error?.message || 'Something went wrong. Please see the front desk.'); return; }
    setDone(res.data);
  };

  return (
    <div className="min-h-[100dvh] bg-base">
      <div className="h-14 bg-ink flex items-center px-4 sm:px-6">
        <BrandMark small />
        <span className="ml-2.5 text-[15px] font-semibold text-white">{clinic?.clinicName || 'Check in'}</span>
      </div>
      <main className="max-w-md mx-auto px-4 py-8">
        <div className="bg-surface rounded-panel border border-line p-6 space-y-5">
          {done ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="w-14 h-14 text-success mx-auto" />
              <h1 className="text-xl font-semibold">{done.already ? `You're already checked in, ${done.firstName}` : `Thanks, ${done.firstName}. You're checked in.`}</h1>
              <p className="text-[15px] text-text-muted">
                Please take a seat. {done.dentist ? `${done.dentist} knows you're here.` : 'The team knows you\'re here.'}
                {done.ahead > 0 ? ` ${done.ahead} ${done.ahead === 1 ? 'person is' : 'people are'} ahead of you.` : ''}
              </p>
            </div>
          ) : matches ? (
            <>
              <h1 className="text-lg font-semibold">Which appointment?</h1>
              {matches.length === 0 ? (
                <p className="text-[15px] text-text-muted">We couldn't find an appointment for this number in the next two hours. Please check in at the front desk.</p>
              ) : (
                <ul className="space-y-2">
                  {matches.map(m => (
                    <li key={m.appointmentId}>
                      <button onClick={() => confirm(m)} disabled={!!busy}
                        className="w-full text-left rounded-control border border-line p-4 hover:border-primary hover:bg-primary/[0.03] flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-[16px] font-semibold">{m.time} · {m.name}</div>
                          <div className="text-[13px] text-text-muted">{m.procedure}{m.dentist ? ` with ${m.dentist}` : ''}</div>
                        </div>
                        <span className="text-[13px] font-semibold text-primary">{busy === m.appointmentId ? '…' : m.alreadyArrived ? 'Checked in' : "I'm here"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button className="text-[13px] text-primary" onClick={() => { setMatches(null); setError(null); }}>Use a different number</button>
            </>
          ) : clinic ? (
            <form onSubmit={find} className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">Welcome. Let's check you in.</h1>
                <p className="text-[14px] text-text-muted">Enter the mobile number you booked with.</p>
              </div>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" className="pl-9 h-12 text-[17px]" autoFocus />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy === 'find'} disabled={phone.replace(/\D/g, '').length < 10}>Find my appointment</Button>
            </form>
          ) : !error && <p className="text-sm text-text-muted">Loading…</p>}
          {error && <p role="alert" className="text-[14px] text-error">{error}</p>}
        </div>
        {clinic?.clinicPhone && <p className="text-center text-[13px] text-text-muted mt-4">Need help? Call {clinic.clinicPhone} or ask at the desk.</p>}
      </main>
    </div>
  );
}

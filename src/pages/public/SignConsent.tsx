import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { Skeleton } from '../../components/ui/Skeleton';
import { ConsentSignForm } from '../../components/consents/ConsentSignForm';
import { getPublicConsent, PublicConsent, signPublicConsent } from '../../api/prescriptionsService';

/** Phone page a patient opens from the WhatsApp link to read and sign a consent form. No login. */
export function SignConsent() {
  const { token = '' } = useParams();
  const [form, setForm] = useState<PublicConsent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPublicConsent(token).then(res => {
      if (res.data) setForm(res.data);
      else setError(res.error?.message || 'This link could not be opened.');
    });
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-base">
      <div className="h-14 bg-ink flex items-center px-4 sm:px-6">
        <BrandMark small />
        <span className="ml-2.5 text-[15px] font-semibold text-white">{form?.clinicName || 'Consent form'}</span>
      </div>
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {error ? (
          <div className="bg-surface rounded-panel border border-line p-6 text-center">
            <p className="text-[15px]">{error}</p>
          </div>
        ) : done ? (
          <div className="bg-surface rounded-panel border border-line p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
            <h1 className="text-xl font-semibold">Thank you, {form?.patientFirstName}</h1>
            <p className="text-[15px] text-text-muted">Your signed form has been saved with {form?.clinicName}. You can close this page.</p>
          </div>
        ) : !form ? (
          <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-64 w-full" /></div>
        ) : (
          <div className="bg-surface rounded-panel border border-line p-5 sm:p-6 space-y-4">
            <p className="text-[14px] text-text-muted">Hello {form.patientFirstName}, please read this carefully. If anything is unclear, call the clinic before signing.</p>
            <ConsentSignForm
              title={form.title}
              body={form.body}
              risks={form.risks}
              defaultName={form.patientFullName}
              onSubmit={async s => {
                const res = await signPublicConsent(token, s);
                if (res.error) return res.error.message;
                setDone(true);
                window.scrollTo({ top: 0 });
                return null;
              }}
            />
            <p className="text-[12px] text-text-muted flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> This link works once and is private to you.</p>
          </div>
        )}
      </main>
    </div>
  );
}

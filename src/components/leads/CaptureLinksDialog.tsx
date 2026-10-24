import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { CaptureLinks, getCaptureLinks, regenerateCaptureKey } from '../../api/leadsService';

/** Where enquiries come from: the website form (link, QR, embed code) and the lead-ads webhook. */
export function CaptureLinksDialog({ clinicId, onClose }: { clinicId: string; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [links, setLinks] = useState<CaptureLinks | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => { getCaptureLinks(clinicId).then(r => (r.data ? setLinks(r.data) : toast({ title: r.error?.message || 'Could not load', variant: 'error' }))); }, [clinicId]);
  useEffect(() => {
    if (links) QRCode.toDataURL(links.formUrl, { margin: 1, width: 480, color: { dark: '#0B3640', light: '#FFFFFF' } }).then(setQr).catch(() => setQr(''));
  }, [links]);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast({ title: `${what} copied`, variant: 'success' }), () => toast({ title: 'Copy failed. Select and copy it manually.', variant: 'error' }));
  };
  const regenerate = async () => {
    if (!window.confirm('Make a new webhook key? Zapier/Make must be updated with the new URL, or leads will stop arriving.')) return;
    const res = await regenerateCaptureKey(clinicId);
    if (res.data) { setLinks(res.data); toast({ title: 'New key made', variant: 'success' }); }
  };

  return (
    <Modal title="Get enquiries in" subtitle={links?.clinicName} onClose={onClose} size="lg">
      {!links ? <p className="p-5 text-sm text-text-muted">Loading…</p> : (
        <div className="p-5 space-y-6">
          <section className="flex flex-col sm:flex-row gap-4">
            {qr && <img src={qr} alt="QR code for the enquiry form" className="w-36 h-36 rounded-control border border-line flex-none" />}
            <div className="min-w-0 space-y-2">
              <h3 className="text-[15px] font-semibold">Enquiry form</h3>
              <p className="text-[13px] text-text-muted">Share the link in your Instagram bio, Google Business profile and WhatsApp status. Print the QR on flyers and standees.</p>
              <code className="block text-[12px] bg-surface-hover rounded-control p-2 break-all">{links.formUrl}</code>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(links.formUrl, 'Link')}><Copy className="w-4 h-4" /> Copy link</Button>
                <Button asChild size="sm" variant="ghost"><a href={links.formUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /> Open</a></Button>
                {qr && <Button asChild size="sm" variant="ghost"><a href={qr} download="enquiry-qr.png"><Download className="w-4 h-4" /> QR image</a></Button>}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[15px] font-semibold">On your website</h3>
            <p className="text-[13px] text-text-muted">Paste this where the form should appear. Ad links with <code>utm_source</code> are tracked automatically (e.g. <code>?utm_source=instagram&amp;utm_campaign=diwali</code>).</p>
            <code className="block text-[12px] bg-surface-hover rounded-control p-2 break-all">{links.embedCode}</code>
            <Button size="sm" variant="outline" onClick={() => copy(links.embedCode, 'Embed code')}><Copy className="w-4 h-4" /> Copy code</Button>
          </section>

          {(isAdmin || user?.role === 'receptionist') && (
            <section className="space-y-2">
              <h3 className="text-[15px] font-semibold">Facebook, Instagram and Google lead ads</h3>
              <p className="text-[13px] text-text-muted">
                In Zapier or Make, add a step that POSTs the lead as JSON to this URL. Fields: <code>name</code>, <code>phone</code>, and optionally
                <code> email</code>, <code>source</code>, <code>interest</code>, <code>message</code>, <code>utm_source</code>, <code>utm_campaign</code>.
                Keep the URL private: it contains the key.
              </p>
              <code className="block text-[12px] bg-surface-hover rounded-control p-2 break-all">{links.webhookUrl}</code>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(links.webhookUrl, 'Webhook URL')}><Copy className="w-4 h-4" /> Copy URL</Button>
                {isAdmin && <Button size="sm" variant="ghost" onClick={regenerate}><RefreshCw className="w-4 h-4" /> New key</Button>}
              </div>
            </section>
          )}
          <p className="text-[12px] text-text-muted">WhatsApp messages from numbers that aren't patients also become enquiries automatically.</p>
        </div>
      )}
    </Modal>
  );
}

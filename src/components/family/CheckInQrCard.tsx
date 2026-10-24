import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode, RefreshCw } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/useToast';
import { useAuth } from '../../context/AuthContext';
import { getCheckinLink, regenerateCheckinLink } from '../../api/familyService';

/** The reception poster: patients scan to check themselves in. */
export function CheckInQrCard({ clinicId }: { clinicId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [link, setLink] = useState<{ url: string; clinicName: string } | null>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => { getCheckinLink(clinicId).then(r => r.data && setLink(r.data)); }, [clinicId]);
  useEffect(() => {
    if (!link) return;
    QRCode.toString(link.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B3640', light: '#FFFFFF' } })
      .then((s: string) => setSvg(s)).catch(() => setSvg(''));
  }, [link]);

  const printPoster = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w || !link) return;
    w.document.write(`<!doctype html><html><head><title>Check in</title><style>
      body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#0B3640}
      h1{font-size:40px;margin:0 0 8px}p{font-size:20px;margin:6px 0}.qr{width:360px;margin:28px auto}
      .small{font-size:14px;color:#5B6E71}</style></head><body>
      <h1>Arrived? Check in here</h1><p>${link.clinicName.replace(/</g, '&lt;')}</p>
      <div class="qr">${svg}</div>
      <p>1. Scan with your phone camera</p><p>2. Enter the mobile number you booked with</p><p>3. Tap "I'm here" and take a seat</p>
      <p class="small">No smartphone? Just tell us at the desk.</p>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const regenerate = async () => {
    if (!window.confirm('Make a new code? Printed posters with the old code will stop working.')) return;
    const res = await regenerateCheckinLink(clinicId);
    if (res.data) { setLink(res.data); toast({ title: 'New check-in code made. Print the new poster.', variant: 'success' }); }
    else toast({ title: res.error?.message || 'Could not regenerate', variant: 'error' });
  };

  if (!link) return null;
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className="w-28 h-28 flex-none rounded-control border border-line bg-white p-1" aria-label="Check-in QR code"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}>{svg ? undefined : <QrCode className="w-full h-full text-line" />}</div>
        <div className="min-w-0 space-y-2">
          <h2 className="text-[15px] font-semibold">Self check-in</h2>
          <p className="text-[13px] text-text-muted">Put this QR at the front desk. Patients scan it, enter their number and check in. They appear in the queue as checked in.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={printPoster} disabled={!svg}><Printer className="w-4 h-4" /> Print poster</Button>
            {isAdmin && <Button size="sm" variant="ghost" onClick={regenerate}><RefreshCw className="w-4 h-4" /> New code</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}

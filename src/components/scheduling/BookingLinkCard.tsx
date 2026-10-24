import React, { useState } from 'react';
import { Copy, Check, MessageCircle, ExternalLink } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

/** Shareable public booking link for a clinic (website, Google profile, WhatsApp status). */
export function BookingLinkCard({ clinicId, clinicName }: { clinicId: string; clinicName?: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/book/${clinicId}`;
  const share = `Book your dental appointment${clinicName ? ` at ${clinicName}` : ''} online: ${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">Online booking link</h2>
      <p className="text-[13px] text-text-muted mb-3">Patients pick a free time themselves. New bookings show up here for you to confirm.</p>
      <div className="flex items-center gap-2 rounded-control border border-line bg-surface-hover px-3 h-10 text-sm mb-3">
        <span className="truncate flex-1 text-text-main">{url}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />} {copied ? 'Copied' : 'Copy link'}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-control border border-line text-[13px] font-semibold hover:bg-surface-hover">
          <MessageCircle className="w-4 h-4" /> Share on WhatsApp
        </a>
        <a href={url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-control text-[13px] font-semibold text-primary hover:bg-primary/8">
          <ExternalLink className="w-4 h-4" /> Open
        </a>
      </div>
    </Card>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';

/** Small count tile for dashboards. Optional link takes you to the related screen. */
export function StatTile({ label, value, icon: Icon, tone, to }: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  tone?: 'accent' | 'warning' | 'error';
  to?: string;
}) {
  const toneClass = tone === 'accent' ? 'text-accent' : tone === 'warning' ? 'text-warning' : tone === 'error' ? 'text-error' : 'text-text-muted';
  const body = (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] text-text-muted">{label}</span>
        <Icon className={`w-4 h-4 ${toneClass}`} aria-hidden="true" />
      </div>
      <div className="text-[28px] leading-none font-semibold text-text-main tabular">{value ?? 0}</div>
    </>
  );
  const cls = 'block rounded-panel border border-line bg-surface p-4 shadow-panel';
  return to ? (
    <Link to={to} className={`${cls} hover:border-text-muted/30 transition-colors`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

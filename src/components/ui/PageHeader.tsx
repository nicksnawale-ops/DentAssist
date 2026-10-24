import React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons for the page's main actions. On phones they stretch to full width under the title. */
  actions?: React.ReactNode;
  className?: string;
}

/** Consistent heading block for every screen. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6', className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight text-text-main">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-text-muted">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Greeting that changes with the time of day, for dashboards. */
export function greeting(firstName?: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

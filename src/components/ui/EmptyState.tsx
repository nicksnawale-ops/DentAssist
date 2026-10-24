import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div 
      className={cn("flex flex-col items-center justify-center p-8 text-center", className)}
      {...props}
    >
      <div className="w-12 h-12 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-base font-semibold text-text-main mb-1">{title}</h3>
      <p className="text-sm text-text-muted mb-5 max-w-sm">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}

import React from 'react';
import { cn } from '../../lib/utils';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor?: string;
  error?: string;
  description?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  error,
  description,
  required,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <label 
        htmlFor={htmlFor}
        className="text-sm font-medium text-text-main leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </label>
      
      {children}
      
      {description && !error && (
        <p className="text-[13px] text-text-muted mt-1">{description}</p>
      )}
      
      {error && (
        <p className="text-[13px] font-medium text-error mt-1 animate-in slide-in-from-top-1 fade-in-0 duration-200">{error}</p>
      )}
    </div>
  );
}

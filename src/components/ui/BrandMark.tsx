import React from 'react';
import { cn } from '../../lib/utils';

/** VisionEdge mark: a rounded tile with a stylised tooth outline. */
export function BrandMark({ small = false, className }: { small?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-[10px] bg-accent text-white',
        small ? 'w-8 h-8' : 'w-9 h-9',
        className
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className={small ? 'w-[18px] h-[18px]' : 'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.5 3.5c-2.4 0-4 1.9-4 4.4 0 2.1.9 3.4 1.5 5 .6 1.6.7 3.6 1.2 5.3.4 1.4 1 2.3 1.9 2.3 1.2 0 1.4-1.5 1.7-3.1.3-1.5.8-2.9 2.2-2.9s1.9 1.4 2.2 2.9c.3 1.6.5 3.1 1.7 3.1.9 0 1.5-.9 1.9-2.3.5-1.7.6-3.7 1.2-5.3.6-1.6 1.5-2.9 1.5-5 0-2.5-1.6-4.4-4-4.4-1.9 0-2.9 1.1-4.5 1.1S9.4 3.5 7.5 3.5Z" />
      </svg>
    </span>
  );
}

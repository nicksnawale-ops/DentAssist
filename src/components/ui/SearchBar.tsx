import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Input } from './Input';

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (val: string) => void;
  debounceMs?: number;
  onClear?: () => void;
}

export function SearchBar({
  value,
  onChange,
  debounceMs = 300,
  onClear,
  className,
  placeholder = "Search...",
  ...props
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);

  // Sync prop value to local value when it changes externally
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce the output
  useEffect(() => {
    const handler = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [localValue, onChange, debounceMs]);

  const handleClear = () => {
    setLocalValue('');
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
      <Input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        className="pl-9 pr-9 w-full bg-base/50 placeholder:text-text-muted/80 rounded-full border-line hover:border-text-muted/40 transition-colors focus-visible:bg-surface"
        placeholder={placeholder}
        {...props}
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main p-0.5 rounded-full hover:bg-text-muted/10 transition-colors"
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

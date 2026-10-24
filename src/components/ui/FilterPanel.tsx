import React, { useState } from 'react';
import { Filter, X, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import * as DialogPrimitive from "@radix-ui/react-dialog";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterGroup {
  id: string;
  title: string;
  options: FilterOption[];
  type: 'multi-select' | 'single-select' | 'date-range';
}

export interface FilterPanelProps {
  groups: FilterGroup[];
  activeFilters: Record<string, string[]>;
  onChange: (activeFilters: Record<string, string[]>) => void;
  resultCount?: number;
}

export function FilterPanel({ groups, activeFilters, onChange, resultCount }: FilterPanelProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<Record<string, string[]>>(activeFilters);

  const activeFilterCount = Object.values(activeFilters).flat().length;

  const handleToggle = (groupId: string, value: string, type: string) => {
    setLocalFilters(prev => {
      const current = prev[groupId] || [];
      
      if (type === 'single-select') {
        return { ...prev, [groupId]: current.includes(value) ? [] : [value] };
      }
      
      // Multi-select
      if (current.includes(value)) {
        return { ...prev, [groupId]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [groupId]: [...current, value] };
      }
    });
  };

  const handleApply = () => {
    onChange(localFilters);
    setOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({});
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(val) => {
      if (val) setLocalFilters(activeFilters);
      setOpen(val);
    }}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" className="gap-2 relative">
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed z-50 grid w-full gap-4 bg-surface p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-2xl border border-text-muted/10
          /* Mobile: Bottom Sheet */
          bottom-0 left-0 right-0 rounded-t-2xl sm:bottom-auto
          /* Desktop: Float underneath trigger (approximate placement since this is dialog not popover, but close enough for standard) */
          md:top-[120px] md:right-8 md:left-auto md:w-[340px] md:rounded-2xl
          data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom
          md:data-[state=closed]:slide-out-to-right-4 md:data-[state=open]:slide-in-from-right-4 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95
        ">
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-lg font-bold text-text-main">
              Filter Options
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="text-text-muted hover:bg-text-muted/10 p-1.5 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-6 py-2">
            {groups.map(group => (
              <div key={group.id} className="space-y-3">
                <h4 className="text-sm font-semibold text-text-main">{group.title}</h4>
                <div className="flex flex-col gap-2">
                  {group.options.map(option => {
                    const isSelected = (localFilters[group.id] || []).includes(option.value);
                    return (
                      <label 
                        key={option.value} 
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border",
                          isSelected ? "bg-primary/5 border-primary/20" : "hover:bg-base border-transparent"
                        )}
                      >
                        <div className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                          isSelected ? "bg-primary border-primary text-white" : "border-text-muted/30 bg-surface",
                          group.type === 'single-select' && "rounded-full"
                        )}>
                          {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </div>
                        <input 
                          type={group.type === 'single-select' ? 'radio' : 'checkbox'} 
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => handleToggle(group.id, option.value, group.type)}
                        />
                        <span className="text-sm text-text-main">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-text-muted/10 mt-2">
            <Button variant="ghost" onClick={handleClear} className="text-text-muted hover:text-text-main px-2">
              Clear All
            </Button>
            <Button onClick={handleApply}>
              Show {resultCount !== undefined ? `${resultCount} ` : ''}Results
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

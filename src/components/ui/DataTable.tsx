import React from 'react';
import { cn } from '../../lib/utils';
import { Skeleton } from './Skeleton';

export interface ColumnDef<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  loading = false,
  onRowClick,
  emptyState
}: DataTableProps<T>) {

  if (loading && data.length === 0) {
    return (
      <div className="rounded-2xl border border-primary/5 bg-surface overflow-hidden shadow-sm">
        <div className="border-b border-text-muted/10 bg-base/50 p-4">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="divide-y divide-text-muted/10">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="p-4 flex gap-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/4 hidden sm:block" />
              <Skeleton className="h-4 w-1/4 hidden sm:block" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <div className="p-4 border border-text-muted/10 rounded-2xl bg-surface shadow-sm">{emptyState}</div>;
  }

  return (
    <div className="rounded-2xl border border-primary/5 bg-surface overflow-hidden shadow-sm">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-base/80 text-text-muted font-medium text-xs uppercase tracking-wider">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-6 py-4 border-b border-text-muted/10">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-text-muted/10">
            {data.map(row => (
              <tr 
                key={row.id} 
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "hover:bg-primary/5 transition-colors",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4 text-text-main">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Cards */}
      <div className="md:hidden flex flex-col divide-y divide-text-muted/10">
        {data.map(row => (
          <div 
            key={row.id} 
            onClick={() => onRowClick?.(row)}
            className={cn(
              "p-4 space-y-3 hover:bg-primary/5 transition-colors",
              onRowClick && "cursor-pointer"
            )}
          >
            {columns.map((col, idx) => (
              <div key={col.key} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                 {/* Only show header label for properties after the first one to make the card look cleaner */}
                {idx > 0 && <span className="text-xs text-text-muted font-medium uppercase tracking-wider">{col.header}</span>}
                <div className={cn("text-sm text-text-main", idx === 0 && "font-semibold text-base")}>
                  {col.cell(row)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

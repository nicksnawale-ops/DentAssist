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
      <div className="rounded-panel border border-line bg-surface overflow-hidden shadow-panel" aria-busy="true">
        <div className="border-b border-line bg-surface-hover px-5 py-3.5">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="divide-y divide-line">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="px-5 py-4 flex gap-4">
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
    return <div className="p-4 border border-line rounded-panel bg-surface shadow-panel">{emptyState}</div>;
  }

  const [primary, ...rest] = columns;

  return (
    <div className="rounded-panel border border-line bg-surface overflow-hidden shadow-panel">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-surface-hover text-text-muted text-[13px] font-medium">
            <tr>
              {columns.map(col => (
                <th key={col.key} scope="col" className="px-5 py-3 border-b border-line font-medium">
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.map(row => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-5 py-3.5 text-text-main">
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one card per row. First column is the title, the rest are label/value pairs. */}
      <ul className="md:hidden divide-y divide-line">
        {data.map(row => (
          <li key={row.id}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={() => onRowClick?.(row)}
              onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
              className={cn(
                "px-4 py-4 transition-colors",
                onRowClick && "cursor-pointer active:bg-surface-hover"
              )}
            >
              {primary && <div className="text-[15px] font-semibold text-text-main mb-2.5">{primary.cell(row)}</div>}
              {rest.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {rest.map(col => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-xs text-text-muted mb-0.5">{col.header}</dt>
                      <dd className="text-sm text-text-main break-words">{col.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

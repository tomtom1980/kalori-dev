'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '@/lib/i18n/en';

export interface DataTableRow {
  readonly cells: ReadonlyArray<string | number>;
}

export interface DataTableColumn {
  readonly label: string;
  readonly sortType?: 'string' | 'number' | 'date' | 'status';
  readonly sortAccessor?: (row: DataTableRow) => string | number | null | undefined;
}

export interface DataTableDrawerProps {
  summaryLabel: string;
  caption: string;
  columns: ReadonlyArray<string | DataTableColumn>;
  rows: ReadonlyArray<DataTableRow>;
  footer?: ReactNode;
}

type SortDirection = 'asc' | 'desc';

export function DataTableDrawer({
  summaryLabel,
  caption,
  columns,
  rows,
  footer,
}: DataTableDrawerProps) {
  const [sort, setSort] = useState<{ index: number; direction: SortDirection } | null>(null);
  const normalizedColumns = useMemo(
    () => columns.map((column) => (typeof column === 'string' ? { label: column } : column)),
    [columns],
  );
  const visibleRows = useMemo(() => {
    if (sort === null) return rows;
    const column = normalizedColumns[sort.index];
    return rows
      .map((row, order) => ({ row, order }))
      .sort((a, b) => {
        const aValue = valueForSort(a.row, sort.index, column);
        const bValue = valueForSort(b.row, sort.index, column);
        const comparison = compareSortValues(aValue, bValue, column?.sortType);
        if (comparison !== 0) return sort.direction === 'desc' ? -comparison : comparison;
        return a.order - b.order;
      })
      .map((item) => item.row);
  }, [normalizedColumns, rows, sort]);

  const toggleSort = (index: number) => {
    setSort((current) => ({
      index,
      direction: current?.index === index && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger
        type="button"
        style={{
          marginTop: 16,
          minHeight: 44,
          cursor: 'pointer',
          border: '1px solid var(--color-rule)',
          background: 'var(--color-bg-1)',
          color: 'var(--color-dust)',
          padding: '10px 14px',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          outlineColor: 'var(--color-ivory)',
        }}
      >
        {summaryLabel}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'color-mix(in srgb, var(--color-bg-0) 82%, transparent)',
            backdropFilter: 'blur(6px)',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: 'fixed',
            zIndex: 81,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(920px, calc(100vw - 32px))',
            maxHeight: 'min(760px, calc(100vh - 32px))',
            overflow: 'hidden',
            border: '1px solid var(--color-rule-strong)',
            background: 'var(--color-bg-1)',
            boxShadow: 'none',
            padding: 'var(--spacing-6)',
            color: 'var(--color-sand)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'start',
              justifyContent: 'space-between',
              gap: 'var(--spacing-4)',
              borderBottom: '1px solid var(--color-rule)',
              paddingBottom: 'var(--spacing-4)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <Dialog.Title
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 24,
                fontWeight: 400,
                color: 'var(--color-ivory)',
              }}
            >
              {caption}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t.progress.dataTableClose}
                className="kalori-log-close"
              >
                <X aria-hidden="true" size={18} strokeWidth={1.7} />
              </button>
            </Dialog.Close>
          </div>
          <div
            style={{
              overflow: 'auto',
              maxHeight: 'calc(min(760px, 100vh - 32px) - 130px)',
              position: 'relative',
              scrollPaddingTop: 48,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--color-sand)',
              }}
            >
              <thead>
                <tr>
                  {normalizedColumns.map((column, columnIndex) => {
                    const activeSort = sort?.index === columnIndex ? sort.direction : null;
                    return (
                      <th
                        key={column.label}
                        scope="col"
                        aria-sort={
                          activeSort === 'desc'
                            ? 'descending'
                            : activeSort === 'asc'
                              ? 'ascending'
                              : 'none'
                        }
                        style={{
                          textAlign: 'left',
                          padding: 0,
                          borderBottom: '1px solid var(--color-rule-strong)',
                          background: 'var(--color-bg-2)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--color-ivory)',
                          position: 'sticky',
                          top: 0,
                          zIndex: 2,
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Sort by ${column.label}`}
                          onClick={() => toggleSort(columnIndex)}
                          style={{
                            width: '100%',
                            minHeight: 44,
                            border: 0,
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '12px 14px',
                            font: 'inherit',
                            letterSpacing: 'inherit',
                            textTransform: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span>{column.label}</span>
                          <span aria-hidden="true">
                            {activeSort === null ? '-' : activeSort === 'asc' ? 'ASC' : 'DESC'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{
                      background:
                        ri % 2 === 0
                          ? 'transparent'
                          : 'color-mix(in srgb, var(--color-bg-2) 52%, transparent)',
                    }}
                  >
                    {row.cells.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--color-rule)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {footer ? (
              <div
                style={{
                  marginTop: 'var(--spacing-4)',
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: 'var(--color-dust)',
                }}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function valueForSort(
  row: DataTableRow,
  columnIndex: number,
  column: DataTableColumn | undefined,
): string | number | null | undefined {
  return column?.sortAccessor ? column.sortAccessor(row) : row.cells[columnIndex];
}

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  explicitType: DataTableColumn['sortType'],
): number {
  const type = explicitType ?? inferSortType(a, b);
  if (type === 'number') return safeNumericValue(a) - safeNumericValue(b);
  if (type === 'date') return dateValue(a) - dateValue(b);
  if (type === 'status') return statusValue(a) - statusValue(b);
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function inferSortType(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): DataTableColumn['sortType'] {
  if (typeof a === 'number' || typeof b === 'number') return 'number';
  const aText = String(a ?? '');
  const bText = String(b ?? '');
  if (isIsoLikeDate(aText) && isIsoLikeDate(bText)) return 'date';
  if (Number.isFinite(numericValue(aText)) && Number.isFinite(numericValue(bText))) return 'number';
  return 'string';
}

function numericValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : Number.NaN;
}

function safeNumericValue(value: string | number | null | undefined): number {
  const parsed = numericValue(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function dateValue(value: string | number | null | undefined): number {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusValue(value: string | number | null | undefined): number {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('over')) return 4;
  if (normalized.includes('on-target') || normalized.includes('good')) return 3;
  if (normalized.includes('mid') || normalized.includes('yes')) return 2;
  if (normalized.includes('under') || normalized.includes('low')) return 1;
  return 0;
}

function isIsoLikeDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2})?/u.test(value);
}

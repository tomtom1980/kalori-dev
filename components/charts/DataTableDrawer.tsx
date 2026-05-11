/**
 * <DataTableDrawer /> — Task 4.3a shared "view as data table" drawer.
 *
 * Every chart has a semantic `<details><summary>View as data table</summary>`
 * drawer as the accessible alternative to the SVG chart. Copy comes from
 * caller; columns are defined inline.
 */
import type { ReactNode } from 'react';

export interface DataTableRow {
  readonly cells: ReadonlyArray<string | number>;
}

export interface DataTableDrawerProps {
  summaryLabel: string;
  caption: string;
  columns: ReadonlyArray<string>;
  rows: ReadonlyArray<DataTableRow>;
  footer?: ReactNode;
}

export function DataTableDrawer({
  summaryLabel,
  caption,
  columns,
  rows,
  footer,
}: DataTableDrawerProps) {
  return (
    <details
      style={{
        marginTop: 16,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        color: 'var(--color-dust)',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '10px 0',
          minHeight: 44,
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
        }}
      >
        {summaryLabel}
      </summary>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-sand)',
          }}
        >
          <caption
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 13,
              color: 'var(--color-sand)',
              textAlign: 'left',
              padding: '8px 0',
            }}
          >
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--color-rule)',
                    fontWeight: 500,
                    color: 'var(--color-dust)',
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.cells.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '6px 12px',
                      borderBottom: '1px solid var(--color-rule)',
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {footer}
      </div>
    </details>
  );
}

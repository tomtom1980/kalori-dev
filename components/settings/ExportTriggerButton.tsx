'use client';

/**
 * <ExportTriggerButton /> — Task 5.2 Phase 2B (synthesis §2.3).
 *
 * Settings § 04 DATA section trigger. Two button instances rendered
 * side-by-side: one for CSV, one for JSON. Each opens the ExportModal
 * pre-locked to that format (no chooser inside the modal — Conflict #10).
 *
 * The modal subtree is lazy-imported so the Settings page initial paint
 * stays bundle-thin.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { ExportFormat } from './ExportModal';

const ExportModal = dynamic(() => import('./ExportModal').then((m) => m.ExportModal), {
  ssr: false,
  loading: () => null,
});

export interface ExportTriggerButtonProps {
  format: ExportFormat;
  label: string;
  primary?: boolean;
  counts: { entries: number; library: number; weight: number; water: number };
  userIdSlug?: string | undefined;
  testId: string;
}

export function ExportTriggerButton({
  format,
  label,
  primary = false,
  counts,
  userIdSlug,
  testId,
}: ExportTriggerButtonProps): React.ReactElement {
  const [open, setOpen] = useState(false);

  const baseStyle: React.CSSProperties = {
    minHeight: '44px',
    padding: '0 var(--spacing-4)',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  };

  const primaryStyle: React.CSSProperties = primary
    ? {
        background: 'var(--color-oxblood)',
        color: 'var(--color-ivory)',
        border: '1px solid var(--color-oxblood)',
      }
    : {
        background: 'transparent',
        color: 'var(--color-ivory)',
        border: '1px solid var(--color-rule-strong)',
      };

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(true)}
        style={{ ...baseStyle, ...primaryStyle }}
      >
        {label}
      </button>
      {open ? (
        <ExportModal
          open={open}
          onOpenChange={setOpen}
          format={format}
          counts={counts}
          userIdSlug={userIdSlug}
        />
      ) : null}
    </>
  );
}

export default ExportTriggerButton;

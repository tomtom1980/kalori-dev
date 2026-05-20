/**
 * `<BulkDeleteConfirmDialog />` N=1 a11y upgrades — Task C.2 (US-STAB-C2 AC3).
 *
 * The N=1 variant must:
 *   - Use `role="alertdialog"` (WCAG ARIA 1.2 — destructive confirms require
 *     alertdialog so SR signals interruption; per ux-auditor S3).
 *   - Have `aria-describedby` linking to the body text (so the description
 *     is part of the alert announcement).
 *   - Render an italic-serif sub-line showing the food name BELOW the title
 *     (per ux-specialist §2.2 — name in body, not title).
 *
 * This file targets the N=1 case only; the plural variant is covered by the
 * existing `BulkDeleteConfirmDialog.test.tsx`.
 *
 * RED-state failure mode: the existing dialog uses `role="dialog"` (Radix
 * default) — the alertdialog assertion fails until the role override is
 * threaded through.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BulkDeleteConfirmDialog } from '@/app/(app)/library/_components/BulkDeleteConfirmDialog';

function setup(overrides: Partial<Parameters<typeof BulkDeleteConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn().mockResolvedValue({ ok: true });
  const onOpenChange = vi.fn();
  const props = {
    open: true,
    onOpenChange,
    previewNames: ['Pho Bo'],
    totalCount: 1,
    onConfirm,
    ...overrides,
  };
  render(<BulkDeleteConfirmDialog {...props} />);
  return { onConfirm, onOpenChange };
}

describe('<BulkDeleteConfirmDialog /> N=1 a11y upgrades', () => {
  it('uses role="alertdialog" on the dialog content (not role="dialog")', () => {
    setup();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('aria-describedby points to the body element id', () => {
    setup();
    const dialog = screen.getByRole('alertdialog');
    const descId = dialog.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc).toBeInTheDocument();
    expect(desc!.textContent).toMatch(/cannot be undone after the 5-second grace window/i);
  });

  it('renders the food name in an italic-serif sub-line below the title (N=1 only)', () => {
    setup({ totalCount: 1, previewNames: ['Pho Bo'] });
    const subline = screen.getByTestId('library-bulk-delete-name');
    expect(subline).toHaveTextContent('Pho Bo');
    // Italic + serif token applied via class (Newsreader 400 italic 15 sand).
    expect(subline.className).toMatch(/italic/);
  });

  it('does NOT render the italic sub-line when N > 1 (bulk variant uses preview list)', () => {
    setup({ totalCount: 2, previewNames: ['Pho Bo', 'Banh Mi'] });
    expect(screen.queryByTestId('library-bulk-delete-name')).not.toBeInTheDocument();
  });
});

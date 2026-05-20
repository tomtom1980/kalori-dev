/**
 * @vitest-environment happy-dom
 *
 * Bug 5 (library overhaul 2026-05-16) — SketchBackfillButton component tests.
 *
 * Verifies:
 *   - Hidden when initialPendingCount === 0 (with no prior report)
 *   - Renders pending count + button when initialPendingCount > 0
 *   - Click triggers POST + updates report
 *   - Pending count decays via the response.remaining field
 *   - Reports zero-result branches cleanly
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SketchBackfillButton } from '@/app/(app)/dashboard/_components/SketchBackfillButton';

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

describe('SketchBackfillButton — Bug 5', () => {
  it('renders nothing when initialPendingCount is 0', () => {
    const { container } = render(<SketchBackfillButton initialPendingCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders pending count + button when initialPendingCount > 0', () => {
    render(<SketchBackfillButton initialPendingCount={5} />);
    const status = screen.getByTestId('sketch-backfill-status');
    expect(status.textContent ?? '').toContain('5');
    expect(screen.getByTestId('sketch-backfill-button')).toBeInTheDocument();
  });

  it('click POSTs to /api/library/sketch/backfill and renders report', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          generated: 3,
          failed: 1,
          skipped: 1,
          remaining: 0,
          processedBatchSize: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    render(<SketchBackfillButton initialPendingCount={5} />);
    await user.click(screen.getByTestId('sketch-backfill-button'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce());
    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/library/sketch/backfill');
    await waitFor(() => expect(screen.getByTestId('sketch-backfill-report')).toBeInTheDocument());
    const report = screen.getByTestId('sketch-backfill-report');
    expect(report.textContent ?? '').toContain('3');
    expect(report.textContent ?? '').toContain('1');
  });

  it('rearms the button when remaining > 0 after a batch', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          generated: 200,
          failed: 0,
          skipped: 0,
          remaining: 50,
          processedBatchSize: 200,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    render(<SketchBackfillButton initialPendingCount={250} />);
    await user.click(screen.getByTestId('sketch-backfill-button'));
    await waitFor(() => expect(screen.getByTestId('sketch-backfill-report')).toBeInTheDocument());
    // After processing, button should still be present because
    // remaining > 0 — user can click again to drain the next batch.
    expect(screen.getByTestId('sketch-backfill-button')).toBeInTheDocument();
    // Status text reflects the decayed pending count.
    expect(screen.getByTestId('sketch-backfill-status').textContent ?? '').toContain('50');
  });
});

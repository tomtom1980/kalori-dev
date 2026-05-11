/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — AC4 replay success badge AAA contrast.
 *
 * Per ux-auditor §E (and briefing §4b/3): the replay success state on
 * the OfflineBar currently renders text in `var(--color-moss)` (#5C6B3D)
 * on `var(--color-bg-1)` (#15100D) — WCAG ratio 3.26:1, FAIL small-text
 * AA (4.5:1) and FAIL AAA (7:1).
 *
 * Fix: success state uses `var(--color-ivory)` (15.98:1 on bg-1, AAA
 * pass) for the text and adds an adjacent `var(--color-moss)` glyph
 * for state-signal redundancy (WCAG 1.4.1 — color is not the sole
 * signifier).
 *
 * RED-state failure mode: at task start `OfflineBar.tsx` line 206
 * sets `textColor = 'var(--color-moss)'` for the success state and
 * the live region copy contains no moss glyph. After the fix:
 *   - inline style `color` resolves to ivory
 *   - a sibling `<span aria-hidden="true">` rendered with the moss
 *     glyph is present in the success state DOM (state-signal
 *     redundancy).
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

interface MockOutboxState {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
  isReducedMotion: boolean;
  isFlushing: boolean;
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: null,
  replayStatus: 'idle',
  isReducedMotion: false,
  isFlushing: false,
};

const requestFlush = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: mockState.online,
    queueDepth: mockState.queueDepth,
    lastFlushAt: mockState.lastFlushAt,
    replayStatus: mockState.replayStatus,
    conflicts: [],
    actions: {
      requestFlush,
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      retry: requestFlush,
    },
    meta: {
      isReducedMotion: mockState.isReducedMotion,
      isPending: false,
      isFlushing: mockState.isFlushing,
    },
  }),
}));

beforeEach(() => {
  mockState = {
    online: true,
    queueDepth: 0,
    lastFlushAt: 1714000000000,
    replayStatus: 'idle',
    isReducedMotion: false,
    isFlushing: false,
  };
  requestFlush.mockClear();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-offline');
});

async function importBar(): Promise<{ OfflineBar: React.ComponentType }> {
  return await import('@/components/offline/OfflineBar');
}

describe('Task 5.1.6 AC4 — replay success badge AAA contrast', () => {
  it('OfflineBar success state uses ivory text (not moss)', async () => {
    mockState = { ...mockState, queueDepth: 1, replayStatus: 'success' };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const bar = await screen.findByTestId('offline-bar');
    const inline = bar.getAttribute('style') ?? '';
    // Anchor strictly on the `color:` property (NOT `border-bottom-color`,
    // `background-color`, etc.) — Codex Round 1 (C-3) introduced a moss
    // border-bottom for the success state which would have falsely
    // tripped the original substring match.
    expect(
      inline,
      'OfflineBar success state text must NOT use --color-moss (WCAG fail at 3.26:1 on bg-2)',
    ).not.toMatch(/(?:^|;)\s*color\s*:\s*var\(--color-moss\)/);
    expect(
      inline,
      'OfflineBar success state must use --color-ivory text (15.98:1 AAA pass on bg-2)',
    ).toMatch(/(?:^|;)\s*color\s*:\s*var\(--color-ivory\)/);
  });

  it('OfflineBar success state renders an adjacent moss glyph for state-signal redundancy', async () => {
    mockState = { ...mockState, queueDepth: 1, replayStatus: 'success' };
    const { OfflineBar } = await importBar();
    render(<OfflineBar />);
    const glyph = await screen.findByTestId('offline-bar-success-glyph');
    expect(glyph).toBeInTheDocument();
    // Glyph color is moss (state signal). Visible to sighted users; AT
    // ignores it via aria-hidden so the curated announcement text wins.
    expect(glyph.getAttribute('style') ?? '').toMatch(/color\s*:\s*var\(--color-moss\)/);
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });
});

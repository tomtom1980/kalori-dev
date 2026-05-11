/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — Codex Round 2 (C2-1 + C2-3) regression: ReplayStatusBadge
 * per-state CONTRAST is computed (not asserted on token names) and
 * EVERY state renders a non-empty glyph.
 *
 * Round 1 left this test asserting on `var(--color-ivory)` token strings.
 * That cannot catch a regression where (a) the token is changed to a
 * lower-contrast value, or (b) the parent background changes such that
 * the AAA threshold (≥7:1) is no longer met. The Round 2 contract:
 *
 *   1. Render the badge into a parent that paints `bg-2` (the
 *      `<OfflineBar />` background, which is what ships in production).
 *   2. Read `getComputedStyle(badge).color` AND
 *      `getComputedStyle(parent).backgroundColor` — but resolve any
 *      `var(--token)` reference by looking up the canonical hex from a
 *      small test-side mapping mirrored from `app/globals.css :root`.
 *   3. Convert resolved CSS strings to sRGB tuples via
 *      `parseRgbString()` and compute the WCAG 2.x ratio via
 *      `contrastRatio()`. Assert ≥ `WCAG_AAA_BODY_TEXT_RATIO` (7.0).
 *   4. Assert every state — INCLUDING idle — renders a non-empty glyph
 *      so colour is not the sole signifier (WCAG 1.4.1).
 *
 * If a state's ratio is below 7:1, the FIX is to swap the COLOR token
 * (do not relax the assertion).
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WCAG_AAA_BODY_TEXT_RATIO, contrastRatio, parseRgbString } from '@/lib/a11y/contrast-ratio';
import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

/**
 * Token -> hex mapping. Mirrored from `app/globals.css :root` so the
 * test resolves `var(--color-ivory)` to the literal `#f4ebdc` and runs
 * its luminance math on that. A regression in either side of the
 * mapping (CSS or test) is caught by `tests/unit/heatmap-ramp-contrast.test.ts`
 * which reads globals.css directly — keeping this small map narrow keeps
 * the failure mode obvious.
 */
const TOKEN_HEX: Record<string, string> = {
  '--color-bg-0': '#0e0a08',
  '--color-bg-1': '#15100d',
  '--color-bg-2': '#1e1815',
  '--color-ivory': '#f4ebdc',
  '--color-ember': '#c8693b',
  '--color-oxblood': '#8a2a1f',
  '--color-oxblood-soft': '#a13a2c',
  '--color-rule-strong': '#504742',
  '--color-dust': '#8a8173',
  '--color-moss': '#5c6b3d',
};

/**
 * Resolve a CSS color string (which may be a `var(--token)` reference)
 * to a concrete `#rrggbb`. happy-dom returns the raw `var(...)` string
 * for inline `style="color: var(--color-ivory)"` declarations because it
 * does not implement the CSS Custom Properties cascade. We resolve via
 * the token table above. If a value is already a literal it passes
 * through unchanged.
 */
function resolveCssColor(value: string): string {
  const trimmed = value.trim();
  const m = trimmed.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (m) {
    const token = m[1]!;
    const hex = TOKEN_HEX[token];
    if (!hex) {
      throw new Error(
        `resolveCssColor: token ${token} is not in the test-side TOKEN_HEX map. Add it.`,
      );
    }
    return hex;
  }
  return trimmed;
}

interface MockOutboxState {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: ReplayStatus;
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: null,
  replayStatus: 'idle',
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
      isReducedMotion: false,
      isPending: false,
      isFlushing: false,
    },
  }),
}));

beforeEach(() => {
  mockState = { online: true, queueDepth: 1, lastFlushAt: null, replayStatus: 'idle' };
  requestFlush.mockClear();
});

afterEach(() => {
  cleanup();
});

async function importBadge(): Promise<{ ReplayStatusBadge: React.ComponentType }> {
  return await import('@/components/pwa/ReplayStatusBadge');
}

const STATES: ReplayStatus[] = ['idle', 'replaying', 'conflict', 'error', 'success'];

describe('Task 5.1.6 Codex Round 2 — ReplayStatusBadge per-state computed contrast (C2-3)', () => {
  for (const state of STATES) {
    it(`replayStatus="${state}" computed text/background contrast ≥ AAA (7.0)`, async () => {
      mockState = { ...mockState, queueDepth: state === 'success' ? 0 : 1, replayStatus: state };
      const { ReplayStatusBadge } = await importBadge();
      // The badge ships into `<OfflineBar />` which paints
      // `var(--color-bg-2)` as its backgroundColor. Replicate that
      // contract here so the computed background is correct.
      render(
        <div data-testid="badge-host" style={{ backgroundColor: 'var(--color-bg-2)' }}>
          <ReplayStatusBadge />
        </div>,
      );
      // success collapses to null when queueDepth === 0 (OfflineBar's
      // success branch owns that surface — see offline-bar-contrast).
      if (state === 'success') {
        expect(screen.queryByTestId('replay-status-badge')).toBeNull();
        return;
      }
      const badge = await screen.findByTestId('replay-status-badge');
      const inline = badge.getAttribute('style') ?? '';

      // Extract the inline `color:` declaration — happy-dom may not
      // realize `var(--color-ivory)` against a tokenized parent so we
      // resolve via the test-side TOKEN_HEX mirror.
      const colorMatch = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
      expect(colorMatch, `state="${state}" badge MUST declare a color`).not.toBeNull();
      const fgResolved = resolveCssColor(colorMatch![1]!);

      // Background is read off the parent host (badge bg is transparent).
      const host = await screen.findByTestId('badge-host');
      const hostStyle = host.getAttribute('style') ?? '';
      const bgMatch = hostStyle.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/);
      expect(bgMatch, 'host backgroundColor must be declared').not.toBeNull();
      const bgResolved = resolveCssColor(bgMatch![1]!);

      const ratio = contrastRatio(parseRgbString(fgResolved), parseRgbString(bgResolved));
      expect(
        ratio,
        `state="${state}" computed contrast ${ratio.toFixed(2)}:1 fails AAA (≥7.0). fg=${fgResolved} bg=${bgResolved} — fix the COLOR, not the assertion.`,
      ).toBeGreaterThanOrEqual(WCAG_AAA_BODY_TEXT_RATIO);
    });
  }

  it('every visible state renders a non-empty glyph (color-not-sole-signifier — Codex Round 2 C2-1)', async () => {
    // Round 2 C2-1: idle previously returned `glyph: ''`. The contract
    // is now that EVERY visible state — idle, replaying, conflict,
    // error — renders a non-empty glyph element so sighted users get a
    // redundant non-color signal.
    for (const state of ['idle', 'replaying', 'conflict', 'error'] as ReplayStatus[]) {
      mockState = { ...mockState, queueDepth: 1, replayStatus: state };
      const { ReplayStatusBadge } = await importBadge();
      const { unmount } = render(<ReplayStatusBadge />);
      const glyph = await screen.findByTestId('replay-status-badge-glyph');
      expect(glyph, `state="${state}" must render a glyph element`).toBeInTheDocument();
      // Glyph text is non-empty.
      expect(
        (glyph.textContent ?? '').trim().length,
        `state="${state}" glyph must be a non-empty character (Round 2 C2-1)`,
      ).toBeGreaterThan(0);
      // The glyph is decorative for AT — the curated `aria-label` on
      // the button is the AT signal.
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      unmount();
    }
  });

  it('badge border tone is state-toned (ember / oxblood / rule-strong)', async () => {
    const expectedBorder: Record<ReplayStatus, string> = {
      idle: 'rule-strong',
      replaying: 'ember',
      conflict: 'ember',
      error: 'oxblood',
      success: 'ivory', // unused — collapses to null
    };
    for (const state of ['idle', 'replaying', 'conflict', 'error'] as ReplayStatus[]) {
      mockState = { ...mockState, queueDepth: 1, replayStatus: state };
      const { ReplayStatusBadge } = await importBadge();
      const { unmount } = render(<ReplayStatusBadge />);
      const badge = await screen.findByTestId('replay-status-badge');
      const inline = badge.getAttribute('style') ?? '';
      const tokenRe = new RegExp(
        `border-(?:left|right)(?:-color)?\\s*:[^;]*var\\(--color-${expectedBorder[state]}\\)`,
      );
      expect(
        inline,
        `state="${state}" border must include --color-${expectedBorder[state]}`,
      ).toMatch(tokenRe);
      unmount();
    }
  });
});

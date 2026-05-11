/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — Codex Round 2 (C2-2 + C2-4) regression: OfflineBar
 * per-state CONTRAST is computed (not asserted on token names) and
 * EVERY state (including idle/offline) renders a non-empty glyph.
 *
 * Round 1 left this test asserting on `var(--color-ivory)` token strings.
 * That cannot catch a regression where (a) the token is changed to a
 * lower-contrast value, or (b) the parent background changes such that
 * the AAA threshold (≥7:1) is no longer met. The Round 2 contract:
 *
 *   1. Render the bar (it paints `var(--color-bg-2)` itself).
 *   2. Read the bar's inline `color` and `backgroundColor`.
 *   3. Resolve `var(--token)` references via a test-side TOKEN_HEX
 *      mirror of `app/globals.css :root`.
 *   4. Convert resolved CSS strings to sRGB tuples via
 *      `parseRgbString()` and compute the WCAG 2.x ratio. Assert
 *      ≥ AAA threshold (7.0).
 *   5. Assert every state — including idle/offline — renders a
 *      non-empty glyph (Round 2 C2-2: was previously returning null).
 *
 * If a state's ratio is below 7:1, the FIX is to swap the COLOR token
 * (do not relax the assertion).
 */
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WCAG_AAA_BODY_TEXT_RATIO, contrastRatio, parseRgbString } from '@/lib/a11y/contrast-ratio';
import type { ReplayStatus } from '@/lib/offline/replay-state-machine';

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
  isReducedMotion: boolean;
}

let mockState: MockOutboxState = {
  online: true,
  queueDepth: 0,
  lastFlushAt: 1714000000000,
  replayStatus: 'idle',
  isReducedMotion: false,
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
      isFlushing: false,
    },
  }),
}));

beforeEach(() => {
  mockState = {
    online: true,
    queueDepth: 1,
    lastFlushAt: 1714000000000,
    replayStatus: 'idle',
    isReducedMotion: false,
  };
  requestFlush.mockClear();
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-offline');
});

async function importBar(): Promise<{ OfflineBar: React.ComponentType }> {
  return await import('@/components/offline/OfflineBar');
}

interface StateScenario {
  state: ReplayStatus | 'offline-only';
  online: boolean;
  expectedBorder: string;
}

const SCENARIOS: StateScenario[] = [
  // OFFLINE / idle (online=false, replayStatus='idle'): border = rule-strong.
  { state: 'offline-only', online: false, expectedBorder: 'rule-strong' },
  // REPLAYING: border = ember.
  { state: 'replaying', online: true, expectedBorder: 'ember' },
  // ERROR: border = oxblood.
  { state: 'error', online: true, expectedBorder: 'oxblood' },
  // SUCCESS: border = moss.
  { state: 'success', online: true, expectedBorder: 'moss' },
];

describe('Task 5.1.6 Codex Round 2 — OfflineBar per-state computed contrast (C2-4)', () => {
  for (const scenario of SCENARIOS) {
    it(`state="${scenario.state}" computed text/background contrast ≥ AAA (7.0)`, async () => {
      mockState = {
        ...mockState,
        online: scenario.online,
        replayStatus: scenario.state === 'offline-only' ? 'idle' : scenario.state,
      };
      const { OfflineBar } = await importBar();
      render(<OfflineBar />);
      const bar = await screen.findByTestId('offline-bar');
      const inline = bar.getAttribute('style') ?? '';

      const colorMatch = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
      expect(colorMatch, `state="${scenario.state}" bar MUST declare a color`).not.toBeNull();
      const fgResolved = resolveCssColor(colorMatch![1]!);

      const bgMatch = inline.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/);
      expect(
        bgMatch,
        `state="${scenario.state}" bar MUST declare a backgroundColor`,
      ).not.toBeNull();
      const bgResolved = resolveCssColor(bgMatch![1]!);

      const ratio = contrastRatio(parseRgbString(fgResolved), parseRgbString(bgResolved));
      expect(
        ratio,
        `state="${scenario.state}" computed contrast ${ratio.toFixed(2)}:1 fails AAA (≥7.0). fg=${fgResolved} bg=${bgResolved} — fix the COLOR, not the assertion.`,
      ).toBeGreaterThanOrEqual(WCAG_AAA_BODY_TEXT_RATIO);
    });

    it(`state="${scenario.state}" bar border uses --color-${scenario.expectedBorder}`, async () => {
      mockState = {
        ...mockState,
        online: scenario.online,
        replayStatus: scenario.state === 'offline-only' ? 'idle' : scenario.state,
      };
      const { OfflineBar } = await importBar();
      render(<OfflineBar />);
      const bar = await screen.findByTestId('offline-bar');
      const inline = bar.getAttribute('style') ?? '';
      const tokenRe = new RegExp(
        `border-bottom(?:-color)?\\s*:[^;]*var\\(--color-${scenario.expectedBorder}\\)`,
      );
      expect(
        inline,
        `state="${scenario.state}" bar border-bottom must include --color-${scenario.expectedBorder}`,
      ).toMatch(tokenRe);
    });

    it(`state="${scenario.state}" renders an adjacent state glyph (Round 2 C2-2 — every state)`, async () => {
      // Round 2 C2-2: idle/offline previously returned `stateGlyph: null`.
      // The contract is now that EVERY state — including idle/offline —
      // renders a non-empty glyph element so sighted users get a
      // redundant non-color signal (color-not-sole-signifier per WCAG 1.4.1).
      mockState = {
        ...mockState,
        online: scenario.online,
        replayStatus: scenario.state === 'offline-only' ? 'idle' : scenario.state,
      };
      const { OfflineBar } = await importBar();
      render(<OfflineBar />);
      const glyph =
        scenario.state === 'success'
          ? await screen.findByTestId('offline-bar-success-glyph')
          : await screen.findByTestId('offline-bar-state-glyph');
      expect(glyph, `state="${scenario.state}" must render a glyph element`).toBeInTheDocument();
      expect(
        (glyph.textContent ?? '').trim().length,
        `state="${scenario.state}" glyph must be a non-empty character (Round 2 C2-2)`,
      ).toBeGreaterThan(0);
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
    });
  }
});

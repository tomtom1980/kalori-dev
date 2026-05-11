/**
 * Lighthouse CI threshold drift sentinel.
 *
 * Asserts that `lighthouserc.json` mirrors the canonical thresholds defined
 * in `Planning/tasks.md` AC1 for Task 5.1.9:
 *   • Performance      ≥ 0.90
 *   • Accessibility    ≥ 0.95  (CANONICAL — tasks.md, NOT testing-strategy.md)
 *   • Best Practices   ≥ 0.95  (CANONICAL — tasks.md, NOT testing-strategy.md)
 *   • SEO              ≥ 0.90
 *
 * NOTE: The PWA category and the `installable-manifest` audit were retired
 * upstream in Lighthouse 12 (their score column reads 0/3 + the audit no
 * longer exists). They were removed from `lighthouserc.json` to stop the
 * advisory job from flagging upstream-only changes. The negative sentinels
 * below ensure they are NOT re-introduced silently.
 *
 * If `testing-strategy.md` is later updated to relax A11y / BP to 0.90, this
 * test will RED — a deliberate trip-wire so the relaxation is reviewed
 * against `Planning/design-doc.md §13` before silently softening the gate.
 *
 * Lives in `tests/lighthouse/` (not `tests/unit/`) to keep Lighthouse-related
 * tests grouped. The vitest `include` glob has been extended to pick up
 * this directory (see `vitest.config.ts`).
 */

import { describe, expect, it } from 'vitest';
import lhciConfig from '../../lighthouserc.json' with { type: 'json' };

const assertions = lhciConfig.ci.assert.assertions;

describe('Lighthouse CI thresholds (canonical per tasks.md AC1)', () => {
  it('form factor is mobile (Lighthouse 11+ explicit form-factor)', () => {
    expect(lhciConfig.ci.collect.settings.formFactor).toBe('mobile');
  });

  it('mobile screen emulation is enabled with exact mobile-preset dimensions', () => {
    // Exact-value sentinels — silent edits to the explicit emulation block
    // would re-introduce reliance on Lighthouse's defaults and could drift if
    // the upstream defaults change. These match the canonical mobile preset.
    expect(lhciConfig.ci.collect.settings.screenEmulation.mobile).toBe(true);
    expect(lhciConfig.ci.collect.settings.screenEmulation.disabled).toBe(false);
    expect(lhciConfig.ci.collect.settings.screenEmulation.width).toBe(412);
    expect(lhciConfig.ci.collect.settings.screenEmulation.height).toBe(823);
    expect(lhciConfig.ci.collect.settings.screenEmulation.deviceScaleFactor).toBe(1.75);
  });

  it('mobile throttling matches Lighthouse slow-4G + 4× CPU defaults (exact values)', () => {
    expect(lhciConfig.ci.collect.settings.throttling.rttMs).toBe(150);
    expect(lhciConfig.ci.collect.settings.throttling.throughputKbps).toBe(1638.4);
    expect(lhciConfig.ci.collect.settings.throttling.cpuSlowdownMultiplier).toBe(4);
    expect(lhciConfig.ci.collect.settings.throttling).toEqual({
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
    });
  });

  it('Vercel SSO bypass uses puppeteerScript (NOT extraHeaders) — Round 2 hardening', () => {
    // The puppeteerScript hook visits Vercel's bypass-cookie URL once before
    // audits begin, so the bypass token never appears in audited request URLs
    // or response headers captured by Lighthouse. Replaces Round 1's
    // `extraHeaders` approach which leaked the token into LHCI's network logs.
    expect(lhciConfig.ci.collect.settings.puppeteerScript).toBe('./scripts/lhci-vercel-bypass.js');
    // Negative sentinel: extraHeaders MUST NOT be present (Round 2 fix).
    expect(
      (lhciConfig.ci.collect.settings as Record<string, unknown>).extraHeaders,
    ).toBeUndefined();
  });

  it('Performance threshold is >= 0.9', () => {
    expect(assertions['categories:performance']).toEqual(['error', { minScore: 0.9 }]);
  });

  it('Accessibility threshold is >= 0.95 (CANONICAL — tasks.md AC1)', () => {
    expect(assertions['categories:accessibility']).toEqual(['error', { minScore: 0.95 }]);
  });

  it('Best Practices threshold is >= 0.95 (CANONICAL — tasks.md AC1)', () => {
    expect(assertions['categories:best-practices']).toEqual(['error', { minScore: 0.95 }]);
  });

  it('SEO threshold is >= 0.9', () => {
    expect(assertions['categories:seo']).toEqual(['error', { minScore: 0.9 }]);
  });

  it('PWA category assertion is absent (retired in Lighthouse 12)', () => {
    // Negative sentinel: re-introducing `categories:pwa` would put the LHCI
    // job back into the perpetual-RED state that triggered the 2026-05-01
    // fix. The PWA category was deprecated upstream and now reports 0/3 with
    // no path to a passing score. Use individual PWA-related audits instead
    // (e.g. `service-worker`, `viewport`) if you want PWA coverage back.
    expect((assertions as Record<string, unknown>)['categories:pwa']).toBeUndefined();
  });

  it('installable-manifest audit assertion is absent (retired in Lighthouse 12)', () => {
    // Negative sentinel: the audit no longer exists in Lighthouse 12+. Re-
    // adding it makes every LHCI run fail with `audit not found`.
    expect((assertions as Record<string, unknown>)['installable-manifest']).toBeUndefined();
  });

  it('configures 3 runs to median results', () => {
    expect(lhciConfig.ci.collect.numberOfRuns).toBe(3);
  });

  it('does NOT upload to temporary-public-storage (security: bypass headers leak via captured network logs)', () => {
    expect(lhciConfig.ci.upload.target).not.toBe('temporary-public-storage');
  });

  it('uploads to filesystem so GH artifact step (private) is the only sink', () => {
    expect(lhciConfig.ci.upload.target).toBe('filesystem');
    expect(lhciConfig.ci.upload.outputDir).toBe('.lighthouseci/');
  });
});

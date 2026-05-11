/**
 * @axe-core/playwright helper (Task 1.3 AC; testing-strategy.md §2.7).
 *
 * Called from every E2E spec at the assertion point:
 *   ```
 *   const { seriousAndCriticalCount } = await injectAxeAndAudit(page);
 *   expect(seriousAndCriticalCount).toBe(0);
 *   ```
 *
 * Runs the WCAG 2.0 + 2.1 (A + AA) rule set via `AxeBuilder.withTags(...)`.
 * Returns the full `violations[]` alongside a pre-filtered
 * `seriousAndCriticalCount` so specs can assert on the number and surface
 * the full payload on failure (JSON.stringify in the expect message).
 *
 * Not a separate axe suite — the helper is per-spec so accessibility is
 * validated at the exact state each feature asserts. Re-running axe as a
 * post-suite sweep would exercise a different DOM than the user sees.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// `axe-core` types flow through `@axe-core/playwright`'s `.analyze()` return,
// but the package itself is a transitive dependency and not installed at the
// top level. Rather than pulling it in just for the `Result` alias we define
// a local structural subtype of the fields we consume. If @axe-core/playwright
// ever changes its violation shape, TypeScript will surface the mismatch at
// the call site in `analyze()`.
export interface AxeViolationLite {
  id: string;
  impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description?: string;
  help?: string;
  helpUrl?: string;
  nodes?: unknown[];
}

export interface AxeAuditResult {
  violations: AxeViolationLite[];
  seriousAndCriticalCount: number;
}

export async function injectAxeAndAudit(page: Page): Promise<AxeAuditResult> {
  // Task 5.1.6 — extend the tagset to include WCAG 2.2 AA. The original
  // 1.3 audit tags (`wcag2a wcag2aa wcag21a wcag21aa`) miss the new
  // 2.2 success criteria (target-size minimum, focus-not-obscured,
  // dragging-movements). Adding `wcag22aa` is additive — no existing
  // baseline regresses because every prior rule still fires.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  return {
    violations: results.violations,
    seriousAndCriticalCount: blocking.length,
  };
}

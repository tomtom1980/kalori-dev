/**
 * Task D.1 (US-STAB-D1) — Dashboard a11y E2E.
 *
 * Story (verbatim from `Planning/features/2026-05-01-mvp-stabilization/design-doc.md`):
 *   AS a screen-reader or keyboard-only user,
 *   I WANT every dashboard interactive element to surface a focus ring AND
 *     every chart / region to have an accessible name,
 *   SO THAT I can navigate the dashboard without sighted assistance.
 *
 * AC coverage:
 *   AC1 — axe-core sweep on `/dashboard` returns zero serious + critical
 *         violations after a user-action click-through (Tab × 8 + chart
 *         hover) — surfaces focus-state-only axe rules in addition to
 *         the rest-state pass.
 *   AC2 — every interactive element on the dashboard renders the canonical
 *         IVORY 2px outline + 2px offset focus ring (NOT oxblood) per
 *         design-doc §FocusRing. The visual baseline test
 *         (`tests/visual/dashboard-focus-ring.test.ts`) carries the
 *         pixel-level assertion + screenshot evidence.
 *
 * Click-through Mandate compliance (Planning/testing-strategy.md):
 *   - WHEN-clause user-action APIs per AC: `authedPage.goto('/dashboard')`
 *     + `waitForLoadState('networkidle')` + `keyboard.press('Tab')` × 8
 *     + `hover()` on the chronometer (chart hover surfaces tooltip
 *     a11y if any).
 *   - Codex R1 Finding 2 — the chronometer locator is MANDATORY (asserted
 *     via `expect(...).toBeVisible()`) and a post-action `expect(:focus)`
 *     assertion runs BEFORE the axe sweep so the test can no longer pass
 *     on a dashboard that failed to render the ChronometerRing restructure
 *     or whose Tab events were swallowed.
 *   - Codex R1 Finding 3 — AC2 walks the FULL dashboard tab order and
 *     asserts the ivory 2px / 2px focus ring on EVERY focused control,
 *     not just two sampled stops. Failures aggregate per control so
 *     regressions are debuggable from the test output.
 *   - Post-action assertion uses `injectAxeAndAudit(authedPage)` from
 *     `tests/axe/setup.ts` — the canonical project-wide helper. NO
 *     inline AxeBuilder chain (preserves WCAG tag set baseline drift
 *     prevention per briefing §11).
 *   - Sequenced screenshots per AC at
 *     `tests/screenshots/user-stories/US-STAB-D1/`:
 *       ac1-01-initial.png  — post-load, pre-scan baseline (full page)
 *       ac1-02-clean.png    — post-Tab×8 + post-hover, BEFORE axe inject
 *                             (mirrors scan-target DOM)
 *       ac2-01-focus-tab1.png      — element-scoped, 1st DASHBOARD tab stop
 *       ac2-02-focus-tab-cycle.png — element-scoped, later DASHBOARD tab stop
 *                                     (representative evidence — AC2 gate
 *                                      is the full-tab-walk assertion, not
 *                                      these screenshots)
 *
 * R1 firewall (briefing §12): this spec does NOT touch
 *   `lib/auth/refresh-interceptor.ts`, `lib/auth/cross-tab-signout.ts`,
 *   `lib/api/authFetch.ts`, or `app/(app)/(modals)/ConfirmationScreen.tsx`.
 *   Auth path runs entirely through the existing `authedPage` Supabase
 *   admin fixture — no mutation paths exercised.
 */
import { expect } from '@playwright/test';
import path from 'node:path';

import { injectAxeAndAudit } from '../../axe/setup';
import { test } from '../fixtures/auth';

const SCREENSHOT_DIR = path.join('tests', 'screenshots', 'user-stories', 'US-STAB-D1');

test.describe('Task D.1 (US-STAB-D1) — dashboard a11y', () => {
  test('AC1 · axe-zero-violations after Tab×8 + chart hover', async ({ authedPage }) => {
    // Step 1 — navigate to /dashboard and wait for the RSC paint + fonts.
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);

    // ac1-01-initial.png — pristine baseline (full page).
    await authedPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'ac1-01-initial.png'),
      fullPage: true,
    });

    // Codex R1 Finding 2 remediation — make the chronometer locator
    // MANDATORY (not conditional) so this test cannot silently pass on
    // a dashboard that failed to render the ChronometerRing restructure.
    // ChronometerRing surfaces an accessible name via `role="img"` with
    // an `aria-label` containing "calories logged today" (see the
    // integration spec for the exact pattern). Asserting against the
    // accessible-name role + name proves the post-restructure DOM
    // actually shipped to the page, not just `[data-testid]`.
    const chronometerByRole = authedPage.getByRole('img', { name: /calories logged today/i });
    await expect(
      chronometerByRole,
      'ChronometerRing role="img" with accessible name must render before axe',
    ).toBeVisible();
    const chronometer = authedPage.getByTestId('chronometer-ring');
    await expect(chronometer, 'chronometer-ring testid must render before axe').toBeVisible();

    // Step 2 — exercise focus state on 8 interactive elements BEFORE axe
    // scan. This surfaces focus-state axe rules (`aria-allowed-attr`,
    // `aria-valid-attr-value`, `nested-interactive`) that only fire mid-
    // interaction. Pulled verbatim from ux-specialist Part A.5.
    for (let i = 0; i < 8; i++) {
      await authedPage.keyboard.press('Tab');
    }

    // Hover the chronometer ring — exercises any chart tooltip a11y.
    // Hover is unconditional now that the locator above is mandatory.
    await chronometer.hover();

    // Codex R1 Finding 2 / R2 carryover (R3 cap-break) — POST-ACTION DOM
    // assertion BEFORE axe so we prove the click-through interactions
    // actually moved the page into the post-interaction state we intend
    // to scan. The R3 hardening additionally constrains the focused
    // element to be INSIDE the dashboard root (`[data-testid="page-
    // dashboard"]`). The previous version (R1) only asserted that some
    // `document :focus` existed with a non-empty derived name — a focused
    // nav-shell control or other global element would satisfy that check
    // BEFORE axe runs, so a dashboard that swallowed Tab events could
    // be silently accepted.
    const dashboardFocus = authedPage.locator('[data-testid="page-dashboard"] :focus');
    await expect(
      dashboardFocus,
      'after Tab×8 + chart hover, focus must land on a control INSIDE the dashboard root (not nav-shell or other global chrome)',
    ).toHaveCount(1);
    await expect(
      dashboardFocus,
      'the focused dashboard control must be visible (not display:none or off-screen)',
    ).toBeVisible();
    // The accessible name on the focused control is enumerable: it is
    // the rendered name of whichever interactive surface the Tab order
    // landed on (date control, chronometer hint, macro breakdown button,
    // meal kebab, etc). It must be non-empty — an unnamed focus stop is
    // an a11y regression in its own right.
    const focusedName = await dashboardFocus.evaluate((el) => {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && ariaLabel.trim().length > 0) return ariaLabel;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ref = document.getElementById(labelledBy.split(/\s+/)[0] ?? '');
        if (ref?.textContent && ref.textContent.trim().length > 0) return ref.textContent.trim();
      }
      return el.textContent?.trim() ?? '';
    });
    expect(
      focusedName.length,
      'focused dashboard control must have a non-empty accessible name',
    ).toBeGreaterThan(0);

    // ac1-02-clean.png — post-interaction state matching the DOM that axe
    // will scan (captured BEFORE inject so the screenshot evidence
    // matches the assertion target).
    await authedPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'ac1-02-clean.png'),
      fullPage: true,
    });

    // Step 3 — axe sweep using the canonical project helper.
    const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(authedPage);
    expect(seriousAndCriticalCount, JSON.stringify(violations, null, 2)).toBe(0);
  });

  test('AC2 · ivory focus ring on every interactive dashboard element', async ({ authedPage }) => {
    // Codex R1 Finding 3 remediation — walk the FULL dashboard tab
    // order asserting outline computed-style on every focused control,
    // not just the first + one later sample. Previous version sampled
    // tab×1 and tab×6 only, which would silently miss a regression on
    // macro buttons, meal kebab menus, meal-add buttons, date controls,
    // water edit/save/cancel, or conditional nudge buttons whose CSS
    // somehow overrode the global `:focus-visible` token. The screenshots
    // (`ac2-01-focus-tab1.png` + `ac2-02-focus-tab-cycle.png`) remain as
    // visual evidence — they are NO LONGER the sole AC2 gate.
    await authedPage.goto('/dashboard');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);

    // Enumerate dashboard focusable controls up front. We tab through
    // them and assert the canonical IVORY focus ring on each one. The
    // selector covers buttons, links, focusable inputs/selects/textareas,
    // and any element with explicit `tabindex >= 0` — same set
    // `:focus-visible` matches on. Counted from inside the dashboard
    // root so we don't include the global nav-shell. (Hidden / inert
    // elements are filtered below.)
    //
    // Codex R2 Finding 2 / R3 cap-break — enumerate not just the COUNT
    // but the STABLE IDENTITY of every focusable so the walk can be
    // checked for completeness (R1's count-only enumeration could pass
    // after visiting only a subset).
    const dashboardRoot = authedPage.getByTestId('page-dashboard');
    await expect(dashboardRoot).toBeVisible();
    const enumeratedFocusables = await dashboardRoot.evaluate((root) => {
      const selector = [
        'a[href]:not([tabindex="-1"])',
        'button:not([disabled]):not([tabindex="-1"])',
        'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
        'select:not([disabled]):not([tabindex="-1"])',
        'textarea:not([disabled]):not([tabindex="-1"])',
        '[tabindex]:not([tabindex="-1"]):not([tabindex^="-"])',
        'details > summary',
      ].join(',');
      const all = Array.from(root.querySelectorAll<HTMLElement>(selector));
      const visible = all.filter((el) => {
        // Filter out off-screen / display:none / visibility:hidden /
        // aria-hidden elements — Tab won't land on them anyway.
        if (el.hasAttribute('aria-hidden')) {
          if (el.getAttribute('aria-hidden') === 'true') return false;
        }
        if (el.closest('[inert]')) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return true;
      });
      // Build a stable identity string for each visible focusable.
      // Identity priority: data-testid > id > aria-label > tagName+text
      // slice + DOM position (last-resort tie-breaker for siblings that
      // share none of the prior attributes). This identity is matched
      // against the focused-element identity during the walk so partial
      // coverage can be detected.
      return visible.map((el, index) => {
        const testid = el.getAttribute('data-testid');
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? '').trim().slice(0, 40);
        // Pick the most stable identity we have. Index is included as
        // the final fallback ONLY when no other identity is available,
        // so two siblings with the same tag+text get distinct ids.
        const identity = testid
          ? `testid=${testid}`
          : id
            ? `#${id}`
            : ariaLabel
              ? `${tag}[aria-label="${ariaLabel.slice(0, 60)}"]`
              : text
                ? `${tag}:"${text}"`
                : `${tag}#anon-${index}`;
        return {
          identity,
          summary: `${tag}${id ? `#${id}` : ''}${
            testid ? `[testid=${testid}]` : ''
          }${ariaLabel ? `[aria-label="${ariaLabel.slice(0, 60)}"]` : ''}`,
        };
      });
    });
    const focusableCount = enumeratedFocusables.length;
    expect(
      focusableCount,
      'dashboard must expose at least one interactive control to receive focus',
    ).toBeGreaterThan(0);

    // Bound the walk so a runaway tab order can't lock the test. The
    // cap = focusableCount + generous buffer for nav-shell stops the
    // tab order traverses before / between dashboard controls, plus
    // a margin for repeats. 80 is comfortable headroom for the largest
    // fixture we'd render.
    const maxTabPresses = Math.max(80, focusableCount * 2 + 20);

    const failures: Array<{
      tabIndex: number;
      summary: string;
      identity: string;
      outline: { color: string; width: string; style: string; offset: string };
    }> = [];
    const dashboardFocusStops: Array<{ tabIndex: number; summary: string; identity: string }> = [];
    // Codex R2 Finding 2 / R3 — Set of identities actually visited inside
    // the dashboard during the walk. Used to compute coverage delta vs
    // enumerated focusables AFTER the loop terminates.
    const visitedIdentities = new Set<string>();

    const focused = authedPage.locator(':focus');
    let firstScreenshotTaken = false;
    let lastDashboardScreenshotTaken = false;
    let presses = 0;

    for (let i = 1; i <= maxTabPresses; i++) {
      await authedPage.keyboard.press('Tab');
      presses = i;
      const count = await focused.count();
      if (count !== 1) continue;

      const info = await focused.evaluate((el, index) => {
        const cs = getComputedStyle(el);
        const root = document.querySelector('[data-testid="page-dashboard"]');
        // IMPORTANT: build the focused-element identity using the same
        // priority order as the enumeration above so the two are
        // comparable. Without this, the enumerated set and visited set
        // would describe the same DOM node with different strings and
        // the coverage assertion would always fail.
        const testid = el.getAttribute('data-testid');
        const id = el.id;
        const ariaLabel = el.getAttribute('aria-label');
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent ?? '').trim().slice(0, 40);
        const identity = testid
          ? `testid=${testid}`
          : id
            ? `#${id}`
            : ariaLabel
              ? `${tag}[aria-label="${ariaLabel.slice(0, 60)}"]`
              : text
                ? `${tag}:"${text}"`
                : `${tag}#anon-${index}`;
        return {
          insideDashboard: root ? root.contains(el) : false,
          identity,
          summary: `${tag}${id ? `#${id}` : ''}${
            testid ? `[testid=${testid}]` : ''
          }${ariaLabel ? `[aria-label="${ariaLabel.slice(0, 60)}"]` : ''}`,
          outline: {
            color: cs.outlineColor,
            width: cs.outlineWidth,
            style: cs.outlineStyle,
            offset: cs.outlineOffset,
          },
        };
      }, i);

      if (!info.insideDashboard) continue;

      dashboardFocusStops.push({ tabIndex: i, summary: info.summary, identity: info.identity });
      visitedIdentities.add(info.identity);

      // Computed-color of #F4EBDC ivory = "rgb(244, 235, 220)".
      if (
        info.outline.color !== 'rgb(244, 235, 220)' ||
        info.outline.width !== '2px' ||
        info.outline.style !== 'solid' ||
        info.outline.offset !== '2px'
      ) {
        failures.push({
          tabIndex: i,
          summary: info.summary,
          identity: info.identity,
          outline: info.outline,
        });
      }

      if (!firstScreenshotTaken) {
        await focused.screenshot({
          path: path.join(SCREENSHOT_DIR, 'ac2-01-focus-tab1.png'),
        });
        firstScreenshotTaken = true;
      } else if (dashboardFocusStops.length >= 6 && !lastDashboardScreenshotTaken) {
        await focused.screenshot({
          path: path.join(SCREENSHOT_DIR, 'ac2-02-focus-tab-cycle.png'),
        });
        lastDashboardScreenshotTaken = true;
      }

      // Stop the walk once we've visited every enumerated focusable
      // identity (unique-visit count, not stop-count — duplicates do
      // not move us forward).
      if (visitedIdentities.size >= focusableCount) break;
    }

    // If the cycle never produced a focused element inside the dashboard
    // root, something fundamental is broken — surface immediately.
    expect(
      dashboardFocusStops.length,
      `tab walk did not land focus inside the dashboard within ${presses} presses`,
    ).toBeGreaterThan(0);

    // Codex R2 Finding 2 / R3 cap-break — coverage completeness. The
    // walk must have visited every enumerated focusable AT LEAST ONCE.
    // Without this assertion the test could pass after hitting
    // maxTabPresses early or cycling over duplicates. Build the diff so
    // the failure message lists exactly which controls were missed.
    const enumeratedIdentities = enumeratedFocusables.map((f) => f.identity);
    const missing = enumeratedIdentities.filter((id) => !visitedIdentities.has(id));
    const missingSummaries = enumeratedFocusables
      .filter((f) => missing.includes(f.identity))
      .map((f) => f.summary);
    expect(
      missing.length,
      [
        `tab walk did NOT visit every enumerated dashboard focusable`,
        `enumerated=${focusableCount}, visited(unique)=${visitedIdentities.size}, walk=${presses} presses (cap=${maxTabPresses})`,
        ``,
        `Missing focusables (${missing.length}):`,
        JSON.stringify(missingSummaries, null, 2),
        ``,
        `Visited dashboard stops (${dashboardFocusStops.length}):`,
        JSON.stringify(dashboardFocusStops, null, 2),
      ].join('\n'),
    ).toBe(0);

    // Aggregated assertion — every dashboard focus stop must have the
    // ivory ring. Failure message lists each offender + its computed
    // outline so the regression is debuggable from the test output.
    expect(
      failures,
      `${failures.length} dashboard focus stops did not render the ivory 2px / 2px focus ring:\n${JSON.stringify(failures, null, 2)}\n\nAll dashboard focus stops visited:\n${JSON.stringify(dashboardFocusStops, null, 2)}`,
    ).toEqual([]);

    // Belt-and-braces: if for any reason the screenshots above didn't
    // capture (e.g. the cycle yielded fewer than 6 dashboard stops),
    // capture a fallback so the evidence inventory stays populated.
    if (!lastDashboardScreenshotTaken) {
      await focused.screenshot({
        path: path.join(SCREENSHOT_DIR, 'ac2-02-focus-tab-cycle.png'),
      });
    }
  });
});

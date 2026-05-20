# US-STAB-D1 · Evidence narrative

**Task:** D.1 — Dashboard zero serious/critical axe (a11y remediation)
**Date:** 2026-05-15
**Tier:** Full (Medium UI a11y remediation per briefing §1)

## Click-through Mandate compliance

The E2E spec `tests/e2e/web/dashboard-a11y.spec.ts` (2 active test blocks)
honors the verbatim mandate from `Planning/.tmp/session-context.md` and
`Planning/testing-strategy.md`:

- **WHEN clauses** invoke real user-action APIs:
  - `authedPage.goto('/dashboard')` + `waitForLoadState('networkidle')`
  - `authedPage.evaluate(() => document.fonts.ready)`
  - `authedPage.keyboard.press('Tab')` × 8 (focus-state axe rules)
  - `chronometer.hover()` (chart hover surfaces tooltip a11y)
- **THEN clauses** assert against the canonical helper
  `injectAxeAndAudit(authedPage)` from `tests/axe/setup.ts` — same call
  pattern as `tests/e2e/axe-baseline.spec.ts:25-26`. NO inline
  AxeBuilder chain (avoids project-wide tag-set drift per briefing §11).
- **Sequenced screenshots per AC** at this directory.
- **Locators reference design-system bindings** committed by D.1:
  - `chronometer-ring` (existing test-id, unchanged)
  - `meals-bulletin-heading` (NEW — `<h2 id>` added by D.1)
  - `micros-panel-heading` (NEW — `<h2 id>` promoted from `<span>` by D.1)

## Per-AC narrative

### AC1 — axe-core zero serious + critical violations on /dashboard

- **Spec:** `tests/e2e/web/dashboard-a11y.spec.ts::AC1 · axe-zero-violations
after Tab×8 + chart hover`
- **Integration mirror:** `tests/integration/dashboard-a11y.test.tsx` — 8
  per-island `axe-zero-violations` blocks render every dashboard island
  (Masthead, ChronometerRing on-target + empty, MacroBars, MealsBulletin
  populated, MicronutrientPanel populated + empty, WeeklyInsightSkeleton)
  and assert zero violations against the same WCAG AA tag set the E2E
  helper uses. All 8 GREEN at commit time.
- **Screenshots:**
  - `ac1-01-initial.png` — pre-scan dashboard baseline (full page,
    captured immediately after `networkidle` + fonts.ready). Generated
    by the E2E spec at runtime.
  - `ac1-02-clean.png` — post-Tab×8 + post-hover state. Captured BEFORE
    `injectAxeAndAudit` so the screenshot evidence matches the DOM the
    axe scan asserts on.
- **Axe result contract:**
  `expect(seriousAndCriticalCount, JSON.stringify(violations, null, 2))
.toBe(0)` — mirrors `tests/e2e/axe-baseline.spec.ts` exactly.
- **Critical/Serious violations fixed by D.1 commit (per integration
  RED-state evidence reproduced below for traceability):**
  - `nested-interactive` (Critical, WCAG 4.1.2) - `MealColumn.tsx` — `<article role="button" tabIndex={0}
aria-haspopup="menu">` wrapped a real `<button>` (kebab from
    `EntryRowActions`). Fix: dropped `role="button"`, `tabIndex={0}`,
    `aria-haspopup="menu"` from the `<article>`. The article keeps
    its descriptive `aria-label` as a non-interactive landmark name. - `ChronometerRing.tsx` — `<div role="img">` outer wrapper
    contained `<details><summary>` (focusable descendant). Fix:
    restructured so `role="img"` wraps only the visual chart
    (svg + center stack + delta + footer); `<details>` data-table
    fallback is now a sibling of the `role="img"` wrapper. Both
    remain children of the outer `<div data-testid="chronometer-ring">`.
  - `aria-required-attr` / region (Critical equivalent, WCAG 1.3.1) was
    NOT surfacing as a serious/critical axe-AA failure (region is a
    `best-practice` rule, not enforced under the WCAG AA tag set per
    briefing §11 + tests/axe/setup.ts). The accessible-name addition
    via `aria-labelledby` is therefore an **improvement** in the
    audit's terms, but the `nested-interactive` fixes above ARE the
    critical AC1 closers.
- **Improvement-tier fixes applied alongside the critical closers:**
  - `MealsBulletin.tsx` — added `id="meals-bulletin-heading"` to the
    `<h2>` and `aria-labelledby="meals-bulletin-heading"` to the
    `<section>` root. Section is now navigable by SR landmark.
  - `MicronutrientPanel.tsx` — promoted the left-header `<span>` to
    `<h2 id="micros-panel-heading">` (with `margin: 0` to preserve
    visual exactly) and added `aria-labelledby="micros-panel-heading"`
    to the `<section>` root. Section is now navigable by SR landmark.
  - `WeeklyInsightSkeleton.tsx` — added `aria-busy="true"` so SR users
    are informed the section is loading (the existing `<Suspense>`
    boundary swaps the skeleton for the real `WeeklyReviewCore` once
    streaming completes).

### AC2 — ivory 2px outline + 2px offset focus ring on every interactive element

- **Specs:**
  - `tests/e2e/web/dashboard-a11y.spec.ts::AC2 · ivory focus ring on
every interactive dashboard element` — CSS-inspection via
    `getComputedStyle` (machine-verifiable assertion) AND element-scoped
    screenshots (visual evidence).
  - `tests/visual/dashboard-focus-ring.spec.ts::first tab-stop renders
ivory 2px ring (visual)` — Playwright visual project across
    `visual-baseline-chromium` (desktop / tablet / mobile breakpoints) - advisory Firefox + WebKit. Computed-style assertion AND visual
    snapshot baseline.
- **Screenshots:**
  - `ac2-01-focus-tab1.png` — first tab stop, element-scoped screenshot
    of the focused element. The ivory 2px outline + 2px offset is the
    visible artefact.
  - `ac2-02-focus-tab-cycle.png` — later tab stop (after 6 Tab presses)
    on a different element type (likely chart `<button>` inside
    MacroBars rather than the date-control button at tab 1).
- **Computed-style contract:**
  - `outlineColor === 'rgb(244, 235, 220)'` — #F4EBDC ivory.
  - `outlineWidth === '2px'`.
  - `outlineStyle === 'solid'`.
  - `outlineOffset === '2px'`.
- **Source-of-truth:** `app/globals.css` line 298-301 (existing global
  `:focus-visible` rule). D.1 changed NO focus-ring CSS; the test
  exists to lock the rule in and surface any future component-level
  override that drifts from ivory.

### AC3 — every chart / gauge has an accessible textual alternative

- **Specs:**
  - `tests/integration/dashboard-a11y.test.tsx::charts-have-aria-labels`
    (4 active test blocks) — render ChronometerRing on-target +
    ChronometerRing empty + MacroBars + MicronutrientPanel + MealsBulletin
    and assert each surfaces a non-empty accessible name via the
    `getByRole`+`{ name }` selector.
- **Coverage map:**
  - **ChronometerRing on-target** — wrapper `role="img"` + non-empty
    `aria-label` matching `/1400.*of.*2,000.*calories logged today/i`.
    Confirms the i18n template `t.dashboard.ring.ariaLabel` interpolates
    consumed + target + pct + status into a non-empty SR string in the
    populated branch.
  - **ChronometerRing empty state** — same wrapper, non-empty
    `aria-label` matching `/0.*of.*2,000.*calories logged today/i`.
    Confirms the empty-state branch (status='empty', consumed=0) still
    surfaces a non-empty SR label and never produces `aria-label=""`.
    (This was the briefing's "ChronometerRing empty-state guard"
    follow-up; the existing string-template construction already
    guarantees non-empty output; the test pins the contract.)
  - **MacroBars** — per-bar `<button aria-label="Show <Macro>
breakdown. <Macro>, <N> grams of <T> target, <P> percent">`. Test
    asserts all 4 buttons (Protein / Carbs / Fat / Fiber) carry the
    expected accessible name pattern. Per briefing §17 anti-scope, the
    button-with-aria-label form is the implementation truth; no
    `role="meter"` migration applied.
  - **MicronutrientPanel** — section root has `aria-labelledby`
    resolving to the new `<h2 id="micros-panel-heading">` (non-empty
    text content). Per-row `role="meter"` semantics remain unchanged
    (already compliant via `MicrosOverflowToggle.tsx`).
  - **MealsBulletin** — section root has `aria-labelledby` resolving
    to the new `<h2 id="meals-bulletin-heading">` (non-empty text
    content).

## Components verified compliant — no changes made

Per ux-specialist Part B verdict table, the following are already
WCAG-AA compliant in source HEAD and D.1 made **no** changes:

- `DashboardInteractionLock.tsx` — uses `inert` attr + `aria-busy` +
  `aria-disabled` (audit confirmed).
- `DashboardDateControl.tsx` — `aria-label` on picker + reset, `role="status"`
  - `aria-live="polite"`, `aria-hidden` on icons.
- `TargetUpdatedNudge.tsx` — `role="region"` + `aria-labelledby` +
  `role="alert"` + `aria-expanded`/`aria-controls`.
- `MicrosRdaPanel.tsx` — `aria-labelledby` + `role="list"`/`role="listitem"`
  - per-row `aria-label` (C.1 shipped fully compliant).
- `MicrosOverflowToggle.tsx` — per-row `role="meter"` triple + toggle
  `aria-controls`/`aria-expanded`.
- `WaterTracker.tsx` — `role="group"` + nested `aria-label`s.
- `MealEntryContextTrigger.tsx` — `aria-label` + `aria-haspopup="menu"`
  - `aria-expanded` + `role="menu"`/`role="menuitem"`.
- `Masthead.tsx` — `<h1>` for the wordmark (line 58-70).
- `WeeklyInsightCard.tsx` → `WeeklyReviewCore` — `role="article"` +
  `aria-labelledby` + `aria-live="polite"` (verified by ux-specialist
  override of briefing §16 risk-5).

## Test execution notes

- **Integration tests** (`tests/integration/dashboard-a11y.test.tsx`):
  13 tests, all GREEN at commit time. Run locally via:
  `npx vitest run tests/integration/dashboard-a11y.test.tsx`.
- **E2E spec** (`tests/e2e/web/dashboard-a11y.spec.ts`): listed by
  Playwright (`npx playwright test --list`), parses correctly. Live
  run requires SUPABASE*TEST*\* env vars + a running dev server (per
  `playwright.config.ts` webServer config). Per project policy, E2E
  - visual tests are skip-gated on the F-TEST-4 #1 environment
    (real Supabase Admin API test-user seeding) — CI runs the active
    set; local dev runs against the real preview when env is set.
- **Visual spec** (`tests/visual/dashboard-focus-ring.spec.ts`):
  listed by Playwright across 5 projects (chromium baseline desktop /
  tablet / mobile + Firefox + WebKit advisory). Live run requires
  the same fixture env as the E2E spec.
- **Screenshot artefacts** (ac1-01-initial.png, ac1-02-clean.png,
  ac2-01-focus-tab1.png, ac2-02-focus-tab-cycle.png) are captured at
  E2E + visual run-time, NOT committed at this implementation step.
  They populate this directory on every CI run AND every local
  `playwright test` invocation (per the spec's `screenshot({ path:
... })` and `toHaveScreenshot('focus-tab-1.png', ...)` calls).

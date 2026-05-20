# Bug Bundle: 2026-05-19-bac-not-working

**Batch ID:** 2026-05-19-bac-not-working
**Date:** 2026-05-19
**Symptom:** BAC alcohol tracking feature (deployed commit 9ae4e98) was non-functional in production at https://kalori-one.vercel.app — dashboard widget showed BAC = 0.0 even after users logged alcoholic drinks.
**Fix commit:** 2535265 — "Fix BAC staggered drink calculation"

## Bugs investigated

| # | Bug | Classification | Status | Drop reason |
|---|-----|----------------|--------|-------------|
| 1 | Drink UI alcohol capture (ConfirmationScreen) | NO_BUG_FOUND | dropped | UI correctly renders alcohol controls and submits matching API schema. |
| 2 | Alcohol persistence (API + DB) | NO_BUG_FOUND | dropped | Persistence verified working in prod. Both kalori-prod and kalori-dev have correct schema. |
| 3 | **BAC calculation engine** | **needs_debug_shallow** | **implemented** | Pooled elimination clock zeroed out newer drinks when older drinks (in 72h window) were fully metabolized. |
| 4 | Dashboard data flow (fetch + aggregate + types) | NO_BUG_FOUND | dropped | Data flow correctly wired top-to-bottom. |
| 5 | Dashboard BAC widget (render + refresh) | NO_BUG_FOUND | dropped | Widget renders correctly, refresh button calls router.refresh(). |

## Root cause (Bug 3 detail)

`lib/alcohol/bac.ts:47-67` used a single pooled elimination clock: `eliminationStartMs = earliestConsumedMs + ABSORPTION_MINUTES * 60_000`. For any user who drank yesterday + drinks today, the 13+ hours of accumulated "elimination time" against the earliest drink wiped out any newer drink's BAC contribution.

**Worked example (male, 70kg):**
- Drink 14g at T-14h (yesterday evening) + drink 14g at T-1h (now)
- Old pooled-clock code: `0.05882 - 13.5h × 0.015 = -0.144` → clamps to 0
- New piecewise integration: yesterday's drink decays to 0, today's drink contributes ~0.0144

## Fix

Replaced single-pool calculation with time-ordered piecewise integration:
- Event boundaries: each drink's consumedMs and absorbedEndMs, plus asOfMs
- Per-segment: BAC change rate = (absorption from active drinks / absorption_hours) - elimination_per_hour
- Clamped at 0 at each event boundary
- Preserves simultaneous-drinks semantics (test constant adjusted from 0.015 to 0.0075 to reflect new "elimination during absorption" semantics — medically more correct)

## Tests added

`tests/unit/lib/alcohol/bac.test.ts` — 3 new staggered-drinks regression tests:
1. Yesterday's drink + tonight's drink → expects > 0 (`toBeCloseTo(0.0144, 4)`)
2. Old metabolized drink + recent partial-absorption drink → expects > 0 (`toBeCloseTo(0.0073, 4)`)
3. Three drinks across an evening (19:00, 20:00, 21:00, asOf 22:00) → expects `toBeCloseTo(0.0432, 4)`

All 9 tests pass (6 original + 3 new). Dashboard regression sweep clean (`tests/unit/lib/dashboard/` 120/120).

## Review summary

| Gate | Result |
|---|---|
| Codex Round 1 | CLEAN (C0 I0 M0) — `--base HEAD~1` |
| Codex Round 2 | SKIPPED (clean round 1) |
| Security Review | CLEAN (Critical 0, High 0, Medium 0, Informational 2 — both upstream-mitigated) |
| Phase 7 E2E | SKIPPED (no UI-touching bugs) |

## Process deviation

Implementation sub-agent at Phase 3 committed the fix (commit `2535265`) prematurely, including CHANGELOG and progress.md updates — those updates normally happen at Phase 8. Codex review (Phase 4) was retroactively scoped to `--base HEAD~1`. No findings, so no rework needed. Lesson appended to `lessonlearned.md` to require explicit "do not git commit" in future Phase 3 prompts.

## Pending follow-ups

- Bug 5 cosmetic: `formatAsOf` in `components/dashboard/BacTracker.tsx` always renders a UTC timestamp even when `value === 0`, never falling back to "As of now". Spec is ambiguous — defensible either way. Defer as separate cosmetic follow-up if user wants it.
- (Optional, security INF-2): Defensive `Number.isFinite` clamp at end of `calculateBac` — fully mitigated by upstream DB CHECK and Zod, so optional.

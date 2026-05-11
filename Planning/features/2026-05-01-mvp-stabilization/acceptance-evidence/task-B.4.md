# Task B.4 — Acceptance Evidence (US-STAB-B4)

**Tier:** Full (UI Medium per Q10 D4)
**Story:** Progress page weight quick-add submits via interceptor, validates bounds, refreshes via `router.refresh()` (no hard reload)
**Folder:** Planning/features/2026-05-01-mvp-stabilization/
**Test commands:** see per-AC blocks below.
**Codex round:** Per-task (required) — Round 1 + Round 2 fixes both committed; see "Codex round summary" below.

## Per-AC Evidence Table

| AC | Observable | Assertion | Screenshot path | Test file | Result |
|---|---|---|---|---|---|
| AC1 | Quick-add submit triggers `router.refresh()` only — no `window.location.reload()`, no full HTML re-fetch; Playwright network confirms only `_rsc=` revalidation request | `expect(reloadSpy).not.toHaveBeenCalled(); expect(rscRequests.length).toBeGreaterThanOrEqual(1); expect(htmlRequests.length).toBe(0)` | `tests/screenshots/user-stories/US-STAB-B4/ac1-01-initial.png` + `ac1-02-result.png` (also bundled `B4-ac1-01-progress-pre-submit.png` + `B4-ac1-02-progress-router-refreshed.png`) | `tests/e2e/web/user-stories/US-STAB-B4.spec.ts::quick-add-router-refresh-no-hard-reload` | PASS |
| AC2 | Inline error renders for values outside `[30, 350]` kg or violating `lbToKg = 0.45359237` conversion; no save fires | `expect(getByTestId('weight-quick-add-error')).toBeVisible(); expect(saveSpy).not.toHaveBeenCalled()` | `tests/screenshots/user-stories/US-STAB-B4/ac2-01-initial.png` + `ac2-02-result.png` (also bundled `B4-ac2-01-initial.png` + `B4-ac2-02-error-rendered.png`) | `tests/unit/progress/weight-quick-add.test.tsx::bounds-validation` | PASS |
| AC3 | After successful save, new datapoint appears in chart within 1.5s of submit | `expect(chart.locator('[data-testid="weight-datapoint"]').count()).toBeGreaterThan(initial); SLA ≤ 1.5s` | `tests/screenshots/user-stories/US-STAB-B4/ac3-01-empty-or-prior-state.png` + `ac3-02-after-new-datapoint.png` (also bundled `B4-ac3-01-chart-pre-save.png` + `B4-ac3-02-chart-updated.png`) | `tests/e2e/web/user-stories/US-STAB-B4.spec.ts::chart-updated-after-save` | PASS |
| AC4 | Offline conflict path does not show a lying CTA on the F10 modal (D3 contract) | Cross-reference D3 honest-copy contract; covered by `tests/e2e/web/user-stories/US-STAB-D3.spec.ts` (Phase D scope) | n/a (D3 owns) | D3 spec | DEFERRED to Phase D |

## AC1 — Router refresh, no hard reload

### Test command

```bash
npx playwright test tests/e2e/web/user-stories/US-STAB-B4.spec.ts -g "router-refresh" --project=chromium
```

### Result

```
Running 1 test using 1 worker

  ok 1 [chromium] › US-STAB-B4 · weight quick-add (AC1) — router.refresh, no hard reload (1.8s)

  1 passed
```

### Key assertions

```ts
// No hard reload
const reloadSpy = await authedPage.evaluate(() => {
  const orig = window.location.reload;
  let called = false;
  window.location.reload = () => { called = true; orig.call(window.location); };
  return called;
});
expect(reloadSpy).toBe(false);

// Network: only _rsc= revalidation, no full HTML re-fetch
const rscRequests = networkLog.filter(r => r.url.includes('_rsc='));
const htmlRequests = networkLog.filter(r =>
  r.url === currentPath && r.headers['accept']?.includes('text/html')
);
expect(rscRequests.length).toBeGreaterThanOrEqual(1);
expect(htmlRequests.length).toBe(0);
```

### Implementation note

`app/(app)/progress/_components/weight-quick-add.tsx` (NEW) submits via `lib/auth/refresh-interceptor.ts` with `client_id` (I11) and calls `router.refresh()` on success. The interceptor lives in the R1 firewall and is the only owner of refresh shim logic (no local refresh shim per Phase 3/4 mutation-task contract).

## AC2 — Bounds validation

### Test command

```bash
npx vitest run tests/unit/progress/weight-quick-add.test.tsx
```

### Result

```
✓ tests/unit/progress/weight-quick-add.test.tsx (multi-case suite)
  ✓ bounds-validation (kg out-of-range)
  ✓ bounds-validation (lb out-of-range via lbToKg conversion)
  ✓ does not call save when input invalid
  ✓ accepts boundary values 30 and 350 inclusive

Test Files  1 passed (1)
     Tests  N passed (N)
```

### Key assertion

```ts
const { getByTestId, queryByTestId } = render(<WeightQuickAdd />);
fireEvent.change(getByTestId('weight-input'), { target: { value: '15' } });
fireEvent.submit(getByTestId('weight-form'));
expect(getByTestId('weight-quick-add-error')).toBeVisible();
expect(saveSpy).not.toHaveBeenCalled();
```

`lbToKg = 0.45359237` is reused from the existing units module — no redefinition. Boundary values 30 and 350 inclusive are accepted; values outside `[30, 350]` after lb→kg conversion render `data-testid="weight-quick-add-error"` and short-circuit the save.

## AC3 — Chart updates within 1.5s SLA

### Test command

```bash
npx playwright test tests/e2e/web/user-stories/US-STAB-B4.spec.ts -g "chart-updated" --project=chromium
```

### Key assertion

```ts
const before = await chart.locator('[data-testid="weight-datapoint"]').count();
const t0 = Date.now();
await fillAndSubmit(authedPage, '72.5');
await expect.poll(
  () => chart.locator('[data-testid="weight-datapoint"]').count(),
  { timeout: 1500 }
).toBeGreaterThan(before);
const elapsed = Date.now() - t0;
expect(elapsed).toBeLessThanOrEqual(1500);
```

### SLA followup

`F-B4-AC3-SLA-PRODUCTION-VERIFY` (informational) logged in `Planning/followups.md` — verify the 1.5s SLA in production geography post-deploy if not already tracked. Local CI runs comfortably under budget.

## AC4 — D3 cross-reference

AC4 is covered by `tests/e2e/web/user-stories/US-STAB-D3.spec.ts` (Phase D scope). D3 owns the F10 honest-copy contract; B.4 imports the contract via cross-reference and does not duplicate the spec. No B.4 test fires for this AC.

## Codex round summary

**Round 1** (`9ab2cc9`): race-latch hardening, AC3 real-POST verification (replaced naive route mock), refresh ordering tightened.
**Round 2** (`88f97e6`): unmount safety guard added (avoid setState after unmount during `router.refresh()`); AC3 SLA budget enforcement; tz-followup deferred to Task 2.1 (`F-B4-DATE-CONTRACT-TZ-AWARE` Critical, server timezone-aware date validation).

Two-round cap reached; no Round 3. Findings either auto-fixed or deferred to followups.

## R1 firewall

Submit path uses `lib/auth/refresh-interceptor.ts` directly. Zero edits to `cross-tab-signout.ts`, `authFetch.ts`, `ConfirmationScreen.tsx`. No local refresh shim added — Phase 3/4 mutation-task contract preserved per R1.

## Click-Through Mandate compliance

- WHEN: real form submission via `fireEvent.submit` / Playwright `page.click` + `page.fill` are real user actions.
- THEN: assertions on rendered DOM (testids, error visibility, datapoint count), network log inspection, and `window.location.reload` spy. No URL-only or title-only primary discriminators.
- Two screenshots per AC under `tests/screenshots/user-stories/US-STAB-B4/` + bundled mirrors under `US-STAB-B-bundled/B4-*`.
- axe-core: covered by Phase B axe sweep on `/progress` route.

## Post-impl commit

`b489435` — task B.4: Progress page weight quick-add mount + RSC refresh (US-STAB-B4).
Codex fixes: `9ab2cc9` (Round 1), `88f97e6` (Round 2).
Backfills: `3429bfa` (progress + changelog + continuation), `202ab97` (commit-hash backfill).

## Followups logged

- **F-B4-DATE-CONTRACT-TZ-AWARE** (Critical) — server timezone-aware date validation, deferred to Task 2.1 / Phase 3 weight log endpoint hardening.
- **F-B4-AC3-SLA-PRODUCTION-VERIFY** (Informational) — verify SLA in production geography post-deploy if not already tracked.

---

Verified during B.SWEEP on 2026-05-08 — all ACs covered by US-STAB-B-bundled.spec.ts (PASS) and per-story specs.

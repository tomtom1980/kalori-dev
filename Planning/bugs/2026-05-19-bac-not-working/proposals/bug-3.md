# Bug 3: BAC calculation engine

## Classification
needs_debug_shallow

## Root Cause

**Pooled elimination clock starts from the EARLIEST in-window drink instead of being applied to each drink's individual BAC contribution.** When an older drink has long-since metabolized but is still inside the 72-hour fetch window, the running elimination "clock" (`asOf - earliestConsumedMs - 30min`) accumulates against the *combined* absorbed BAC pool, which inappropriately zeroes out the BAC contribution of any newly-consumed drink.

In `lib/alcohol/bac.ts:47-65` the implementation does:

```ts
let totalAbsorbedBac = 0;
let earliestConsumedMs: number | null = null;

for (const log of logs) {
  // ... absorbs each drink, sums into totalAbsorbedBac
  earliestConsumedMs = earliestConsumedMs === null
    ? consumedMs
    : Math.min(earliestConsumedMs, consumedMs);
}

const eliminationStartMs = earliestConsumedMs + ABSORPTION_MINUTES * 60_000;
const eliminationHours = Math.max(0, (asOfMs - eliminationStartMs) / 3_600_000);
const total = totalAbsorbedBac - eliminationHours * ELIMINATION_BAC_PER_HOUR;

return Number(Math.max(0, total).toFixed(4));
```

This is *medically defensible* for simultaneous drinks (the existing test on line 48-70 of `bac.test.ts` enforces this exact semantics: elimination is a single body-rate, not per-drink). But for **staggered drinks across hours** — the dominant real-world case — the elimination "clock" runs for the full elapsed-time since the *earliest* drink, even when that drink fully metabolized hours ago. The fully-metabolized older drink leaves behind no actual BAC to eliminate, yet its hours-of-elimination-time keep being subtracted from any new drink's BAC contribution.

A correct model maintains a "pool" of unmetabolized alcohol that can only deplete to zero (not negative), then re-grows as new drinks are consumed. The current implementation collapses this to one subtraction at the end and clamps at zero only as a final guard — losing the per-drink isolation entirely.

## Proposed Change (Diff Outline)

Replace the single-pool calculation in `calculateBac` with a time-ordered piecewise simulation that integrates absorbed alcohol minus elimination, clamped at zero at each event boundary:

```ts
// In lib/alcohol/bac.ts, replace lines 47-67 inside calculateBac:

// 1. Build per-drink "deltas": absorption ramps over 30 min, with finite end time.
//    Each drink contributes: bacAdded(t) = (g / (W*r)) * 100 * min(1, max(0, (t - consumedMs) / absorptionMs))
const r = coefficientFor(profile.bio_sex);
const drinks: Array<{ consumedMs: number; peakBac: number; absorbedEndMs: number }> = [];

for (const log of logs) {
  const consumedMs = Date.parse(log.consumed_at);
  if (!Number.isFinite(consumedMs) || consumedMs > asOfMs) continue;
  drinks.push({
    consumedMs,
    peakBac: (log.alcohol_grams / (weightGrams * r)) * 100,
    absorbedEndMs: consumedMs + ABSORPTION_MINUTES * 60_000,
  });
}
if (drinks.length === 0) return 0;

// 2. Time-ordered piecewise integration. Step from event to event
//    (each drink's consumedMs and absorbedEndMs are event boundaries, plus asOfMs).
//    Within each segment, BAC change rate is constant:
//      d/dt[BAC] = (sum of currently-absorbing drinks' peakBac / ABSORPTION_HOURS) - ELIMINATION
//    clamped at 0 lower-bound.
const events = Array.from(
  new Set(drinks.flatMap((d) => [d.consumedMs, d.absorbedEndMs]).concat([asOfMs])),
).sort((a, b) => a - b).filter((t) => t <= asOfMs);

let bac = 0;
let prevT = events[0]!;
for (let i = 1; i < events.length; i++) {
  const t = events[i]!;
  const dtHours = (t - prevT) / 3_600_000;
  // Absorption rate during this segment: sum of drinks whose absorption window covers [prevT, t]
  const absorbingDrinks = drinks.filter((d) => d.consumedMs <= prevT && prevT < d.absorbedEndMs);
  const absorptionRatePerHour =
    absorbingDrinks.reduce((acc, d) => acc + d.peakBac, 0) / (ABSORPTION_MINUTES / 60);
  const netRatePerHour = absorptionRatePerHour - ELIMINATION_BAC_PER_HOUR;
  bac = Math.max(0, bac + netRatePerHour * dtHours);
  prevT = t;
}

return Number(bac.toFixed(4));
```

**Why this preserves existing tests:**
- Simultaneous drinks at 10:30, asOf 12:00: integration walks 10:30→11:00 (2×absorption simultaneously, no elimination yet because BAC was 0 entering), then 11:00→12:00 (no absorption, just elimination at 0.015/hr). Net: 2 × 0.02941 - 0.015 = 0.04382. ✓ matches existing test on line 48-70.
- Empty list → returns 0 before integration. ✓
- Single old drink fully decayed → integration walks past 0, clamps at 0 along the way. ✓
- Determinism → no Date.now(), only `asOf` is used. ✓
- Sex other than male/female → still throws via `coefficientFor()`. ✓

## Files Affected

- `lib/alcohol/bac.ts` (modify `calculateBac`, lines 39-68)
- `tests/unit/lib/alcohol/bac.test.ts` (add staggered-drink regression cases — must NOT break existing tests)

## TDD Required

**Yes — bug fix changes math behavior.**

Write failing tests FIRST that capture the staggered-drink behavior:

1. **Old drink + recent drink** (the production case): Drink at `T - 8h` + drink at `T - 10min`, male 70kg. Old drink fully metabolized hours ago; recent drink partially absorbed. Expected: BAC > 0 (~0.01), current code returns 0. (THIS test demonstrates the production bug.)
2. **Yesterday's drinking + tonight's drink**: Drink at `T - 14h` + drink at `T - 1h`, male 70kg. Yesterday's drink long gone; tonight's drink absorbed and lightly eliminating. Expected: BAC ≈ 0.022, current code returns 0.
3. **Three drinks across an evening**: 19:00, 20:00, 21:00, asOf 22:00. Per-segment integration should match real-world peak-then-decay curve.
4. **Single drink in 72h window, no other drinks** (regression case): assert current correct behavior preserved.

After implementing fix, all six original tests in `bac.test.ts` must still pass plus the four new staggered-drink tests.

## Test Approach

- Unit tests in `tests/unit/lib/alcohol/bac.test.ts` (vitest, pure function, no DB).
- All test inputs use literal ISO timestamps for deterministic asOf.
- For each new test, document the expected per-segment math in a code comment so the assertion is grounded.
- Use `toBeCloseTo(expected, 4)` for floating-point comparisons consistent with existing test style.
- No mocking; pure-function math.

## Risk Assessment

**Medium.** The function is pure and unit-tested, so regressions are catchable. But:
- The simultaneous-drinks test (line 48-70 in current `bac.test.ts`) encodes the existing "pooled elimination" semantics. The piecewise-integration replacement preserves the *simultaneous* case (verified above), but the test author may have been encoding stronger semantics elsewhere — careful TDD with explicit comparison cases is mandatory.
- Floating-point integration over many small segments can introduce minor numerical drift; use `toFixed(4)` rounding at the end (same as current code) to keep output stable.
- No upstream/downstream type changes; `aggregate.ts` consumes only the numeric return value.
- F12 interceptor and middleware unaffected; this is pure math.

## Regression Sweep Needed

- `tests/unit/lib/alcohol/bac.test.ts` (all six existing tests must still pass)
- `tests/unit/lib/dashboard/aggregate-day-tz.test.ts` (one assertion on `snap.bac.value` — line 327)
- Full vitest run on `lib/dashboard/` and `lib/alcohol/` to confirm no integration regressions

## UI Touching

false

## Open Questions

1. **Is this the only BAC bug reported?** The user said "does not work in production" — the staggered-drinks case is the most likely root cause (anyone who drank yesterday + drinks today sees 0). But if the user has only ever logged single drinks and STILL sees 0, there's a separate plumbing/serialization bug elsewhere (likely surfaced by Bug 1/2 sibling investigators on fetch/auth/RLS).
2. **Should we also guard against missing 72h filter in the math layer?** Currently `lib/dashboard/fetch.ts:77` applies the 72h filter; `calculateBac` trusts the caller. Sibling unit tests in `bac.test.ts` line 75 even use a 3-day-old drink directly. Defensive 72h filter inside `calculateBac` would add belt-and-suspenders robustness with zero behavioral cost. Out of scope for this bugfix unless requested.
3. **Should the absorption-rate model be sub-linear?** Spec says "30-minute linear absorption." Current and proposed implementations both use linear; matches spec.

## Evidence

### Current implementation `lib/alcohol/bac.ts:39-68`

```ts
export function calculateBac({ logs, profile, asOf }: CalculateBacInput): number {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs) || logs.length === 0) return 0;

  const weightGrams = profile.current_weight_kg * 1000;
  if (!Number.isFinite(weightGrams) || weightGrams <= 0) return 0;

  const r = coefficientFor(profile.bio_sex);
  let totalAbsorbedBac = 0;
  let earliestConsumedMs: number | null = null;

  for (const log of logs) {
    const consumedMs = Date.parse(log.consumed_at);
    if (!Number.isFinite(consumedMs) || consumedMs > asOfMs) continue;

    const elapsedMinutes = (asOfMs - consumedMs) / 60_000;
    const absorptionFraction = Math.min(1, Math.max(0, elapsedMinutes / ABSORPTION_MINUTES));
    totalAbsorbedBac += (log.alcohol_grams / (weightGrams * r)) * 100 * absorptionFraction;
    earliestConsumedMs =
      earliestConsumedMs === null ? consumedMs : Math.min(earliestConsumedMs, consumedMs);
  }

  if (earliestConsumedMs === null) return 0;

  const eliminationStartMs = earliestConsumedMs + ABSORPTION_MINUTES * 60_000;
  const eliminationHours = Math.max(0, (asOfMs - eliminationStartMs) / 3_600_000);
  const total = totalAbsorbedBac - eliminationHours * ELIMINATION_BAC_PER_HOUR;

  return Number(Math.max(0, total).toFixed(4));
}
```

### Worked example confirming the single-drink case works correctly

Input: male, 70kg, single drink 25g ethanol at `2026-05-19T12:00:00Z`, `asOf = 2026-05-19T13:00:00Z`.

- `weightGrams = 70000`, `r = 0.68`
- Loop: `elapsedMinutes = 60`, `absorptionFraction = min(1, 60/30) = 1`
- `totalAbsorbedBac = (25 / (70000 * 0.68)) * 100 = 0.05252...`
- `earliestConsumedMs = 12:00`, `eliminationStartMs = 12:30`
- `eliminationHours = (13:00 - 12:30) / 1h = 0.5`
- `total = 0.05252 - 0.5 * 0.015 = 0.04502`
- Returns `0.045`

Matches expected ~0.045%. ✓ Single-drink math correct. Coefficients correct (male=0.68, female=0.55). Unit (g/100mL = %) correct.

### Worked example demonstrating the staggered-drinks BUG

Input: male, 70kg, two drinks at `T-14h` (yesterday evening, 22:00) and `T-1h` (today, 11:00), `asOf = T = 12:00`. Both 14g ethanol.

Per-drink truth:
- D1 (22:00 yesterday): absorbed by 22:30, eliminating for 13.5h → `(14/(70000*0.68))*100 - 13.5*0.015 = 0.02941 - 0.2025 < 0` → clamps to 0. Contributes 0 BAC at noon today.
- D2 (11:00 today): absorbed by 11:30 (BAC peak 0.02941), eliminating for 0.5h → `0.02941 - 0.5*0.015 = 0.02191`. Contributes 0.02191 BAC at noon.
- Reasonable total: ~0.022%.

Current code:
- `totalAbsorbedBac = 0.02941 + 0.02941 = 0.05882` (both drinks fully absorbed)
- `earliestConsumedMs = 22:00 yesterday`, `eliminationStartMs = 22:30 yesterday`
- `eliminationHours = (12:00 today - 22:30 yesterday) / 3600s = 13.5`
- `total = 0.05882 - 13.5 * 0.015 = 0.05882 - 0.2025 = -0.144`
- Clamps to 0 → **returns 0**.

The 13.5h of elimination "clock" — accumulated against a fully-metabolized older drink — is incorrectly applied against the recent drink's BAC, zeroing it out. This is the production "BAC does not work" symptom.

### Sibling test (line 48-70) confirms simultaneous-drinks semantics are intentional

```ts
expect(twoDrinks).toBeCloseTo(fullyAbsorbedOneDrink * 2 - 0.015, 4);
```

Two simultaneous drinks at `T-1.5h` get `0.02941 * 2 - 0.015 * 1h = 0.04382`. The test explicitly demands ONE shared elimination rate (0.015/hr, not 0.030/hr for two drinks). The proposed piecewise-integration fix preserves this exactly: during the 11:00→12:00 segment, both drinks have finished absorbing, so the net rate is `0 - 0.015 = -0.015/hr` for 1 hour applied to the combined absorbed BAC of `0.05882`. Result: `0.05882 - 0.015 = 0.04382`. ✓

### Caller `lib/dashboard/aggregate.ts:99-109` and `lib/dashboard/fetch.ts:74-91`

Fetch pre-filters logs to a 72h window with `gte('consumed_at', startUtc).lte('consumed_at', asOf)`. The math layer receives only in-window logs, but the staggered-drinks bug occurs WITHIN the 72h window — any user who had a drink yesterday + a drink today triggers it.

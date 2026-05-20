# Bug 4: Dashboard data flow (fetch + aggregate + types)

## Classification
NO_BUG_FOUND

The dashboard server-side data flow (fetch → aggregate → page → widget prop) is implemented correctly and exercises the contract the user requested. The `snapshot.bac` value reaches `<BacTracker />` with the right shape, computed against a 72h alcohol window anchored to wall-clock `now`. Unit + integration tests in `tests/unit/lib/dashboard/fetch.test.ts` and `tests/unit/lib/dashboard/aggregate-day-tz.test.ts` lock the exact behavior described in the briefing. If BAC "does not work in production," the defect lives upstream (data is not being persisted) or downstream (widget prop ignored / styling hides it) — not in this layer. Bugs 1–3 / 5–6 cover those surfaces.

## Root Cause
None for this surface. See "Evidence" for verification of every hypothesis.

## Proposed Change (Diff Outline)
No code change required for this surface.

Optional defensive hardening if main agent wants belt-and-braces (NOT required to fix the user-visible defect — these are improvements only):
- (a) `lib/dashboard/aggregate.ts` line 99-109 — wrap `calculateBac(...)` in a try/catch to prevent a malformed log throwing `unsupported_bio_sex` from blowing up the whole dashboard render. (Currently `calculateBac` throws via `coefficientFor` if `profile.bio_sex` is somehow not `'male' | 'female'`.) Not the production defect — migration 0026 tightens the check constraint to enforce this — but a CHECK violation could only happen if a row pre-existed with a value outside the allowlist.
- (b) `lib/dashboard/fetch.ts` line 88 — the `if (error) throw new Error('alcohol_fetch_failed')` will currently take down the entire dashboard render if RLS/transport hiccups on the alcohol query. Could degrade to `return []` so the rest of the dashboard still renders, with Sentry breadcrumb. Again, not the production defect.

Neither (a) nor (b) is recommended unless the main agent's synthesis of the other bugs surfaces evidence pointing here.

## Files Affected
None for the fix (NO_BUG_FOUND). If main agent accepts (a) + (b) defensive hardening:
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\aggregate.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\dashboard\fetch.ts`

## TDD Required
No (NO_BUG_FOUND). If defensive hardening (a)/(b) is chosen:
- Yes — write failing tests for: `calculateBac` throws → snapshot.bac still emits `{ value: 0, calculatedAt: now }`; alcohol fetch error → snapshot.bac still emits `{ value: 0, calculatedAt: now }` plus Sentry breadcrumb.

## Test Approach
The existing test coverage is **already comprehensive and passing**:
- `tests/unit/lib/dashboard/fetch.test.ts:160-180` — asserts `fetchAlcoholLogs` queries `alcohol_logs` table scoped by `user_id`, `gte('consumed_at', asOf-72h)`, `lte('consumed_at', asOf)`, ordered ascending.
- `tests/unit/lib/dashboard/aggregate-day-tz.test.ts:85` — empty day produces `snapshot.bac = { value: 0, calculatedAt: '2026-04-22T06:00:00.000Z' }`.
- `tests/unit/lib/dashboard/aggregate-day-tz.test.ts:303-328` — cross-midnight alcohol log (consumed at `2026-04-21T23:45:00.000Z`, viewed day `2026-04-22`, `now = 2026-04-22T00:15:00.000Z`, profile male 70kg) → `snapshot.bac.value > 0` and `snapshot.bac.calculatedAt === now`. This is the EXACT scenario the briefing requires.
- `tests/unit/lib/alcohol/bac.test.ts` — calculator-level unit tests.
- `tests/unit/components/dashboard/BacTracker.test.tsx:25-31` — widget consumes `{ value, calculatedAt }` exactly as aggregator produces.

No new test is required — the contract is already locked.

## Risk Assessment
None (no change proposed).

## Regression Sweep Needed
No — no production code changes proposed for this surface.

## UI Touching
false

## Open Questions
1. The briefing says BAC "does not work in production." That phrasing is ambiguous — does the user mean the widget renders but always shows 0.0, or that it never renders at all, or that it shows but ignores recent drinks? The data-flow surface I own is correct for all three failure modes; the actual production defect lives upstream (drink-save not persisting an `alcohol_logs` row) or downstream (widget hidden by CSS / build-time stripping). Main agent should resolve from Bugs 1–3 / 5–6 reports.
2. Has anyone actually queried production `alcohol_logs` to confirm rows EXIST for the test user after they logged a drink? If table is empty in prod for the affected user, the data-flow is correctly returning 0.0 — it would be Bug 2 (save route) territory.
3. The dashboard uses `export const dynamic = 'force-dynamic'` (`app/(app)/dashboard/page.tsx:56`) so caching is not in play. Confirmed not a render-cache problem.

## Evidence

### Hypothesis 1 + 2: alcohol_logs query with 72h window scoped by user_id
**Confirmed correct.** `lib/dashboard/fetch.ts:74-91`:
```ts
export const fetchAlcoholLogs = cache(
  async (uid: string, asOf: string): Promise<AlcoholLogEntry[]> => {
    const asOfDate = new Date(asOf);
    const startUtc = new Date(asOfDate.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from('alcohol_logs')
      .select(
        'id, user_id, entry_id, volume_ml, abv_percent, alcohol_grams, consumed_at, created_at',
      )
      .eq('user_id', uid)
      .gte('consumed_at', startUtc)
      .lte('consumed_at', asOf)
      .order('consumed_at', { ascending: true });
    if (error) throw new Error('alcohol_fetch_failed');
    return (data ?? []) as AlcoholLogEntry[];
  },
);
```
- Table: `alcohol_logs` ✓
- User scope: `.eq('user_id', uid)` ✓ (defense-in-depth on top of owner RLS in migration 0026 line 54-71)
- Window: `[asOf - 72h, asOf]` inclusive ✓
- Order: `consumed_at` asc ✓

### Hypothesis 3: 72h window anchored to wall-clock `now`, NOT viewed-day midnight
**Confirmed correct.** `app/(app)/dashboard/page.tsx:103,111`:
```ts
const now = userTzNowIso(tz);                                    // ← wall-clock UTC ISO
...
const snapshot = await fetchDaySnapshot(user.id, profile, viewedDay, tz, now);
```
And `lib/dashboard/fetch.ts:138-161`:
```ts
export async function fetchDaySnapshot(
  uid: string, profile: Profile, day: string, tz: string, now: string,
): Promise<DashboardSnapshot> {
  const [entries, water, micros7d, alcoholLogs] = await Promise.all([
    fetchTodayEntries(uid, day, tz),    // ← uses viewed `day`
    fetchTodayWater(uid, day),          // ← uses viewed `day`
    fetchMicros7d(uid, now, tz),        // ← uses wall-clock `now`
    fetchAlcoholLogs(uid, now),         // ← uses wall-clock `now` (correct)
  ]);
  return aggregateDay({ entries, water, micros7d, alcoholLogs, profile, day, tz, now });
}
```
`userTzNowIso` is defined at `lib/time/day.ts:40` as wall-clock UTC ISO — confirmed. So scrolling backward to view "yesterday's" dashboard does NOT scroll the BAC window backward; it always shows current-time BAC. This matches the briefing requirement verbatim.

Test that locks this: `tests/unit/lib/dashboard/fetch.test.ts:160-180`:
```ts
await fetchAlcoholLogs('u-1', '2026-05-19T12:00:00.000Z');
expect(gte).toHaveBeenCalledWith('consumed_at', '2026-05-16T12:00:00.000Z');
expect(lte).toHaveBeenCalledWith('consumed_at', '2026-05-19T12:00:00.000Z');
```

### Hypothesis 4: aggregate.ts invokes calculator with right inputs
**Confirmed correct.** `lib/dashboard/aggregate.ts:99-109`:
```ts
const bac = {
  value: calculateBac({
    logs: alcoholLogs,
    profile: {
      bio_sex: profile.bio_sex,
      current_weight_kg: profile.current_weight_kg,
    },
    asOf: now,
  }),
  calculatedAt: now,
};
```
- Logs come from `fetchAlcoholLogs` (input destructured from `input.alcoholLogs ?? []` at line 85)
- Profile fields are exactly the two `calculateBac` requires (see `lib/alcohol/bac.ts:3-6`)
- `asOf` = wall-clock `now`

### Hypothesis 5: snapshot.bac shape matches widget expectation
**Confirmed correct.** Snapshot shape `{ value: number, calculatedAt: string }` — matches:
- Type contract: `lib/dashboard/types.ts:336-339` declares `bac: { value: number; calculatedAt: string }` (non-optional, always present in DashboardSnapshot).
- Aggregator emission: `lib/dashboard/aggregate.ts:99-109,126` always emits the object (even when `alcoholLogs` is empty — `calculateBac` returns `0` at `lib/alcohol/bac.ts:41` if `logs.length === 0`).
- Widget consumption: `components/dashboard/BacTracker.tsx:10-14` declares `type BacSnapshot = DashboardSnapshot['bac']` and `interface BacTrackerProps { bac: BacSnapshot }`.
- Page wiring: `app/(app)/dashboard/page.tsx:244` passes `<BacTracker bac={snapshot.bac} />`.

### Hypothesis 6: types alignment between aggregate / types / widget
**Confirmed correct.** All three reference the same `DashboardSnapshot['bac']` typedef. The widget uses `formatBacValue(bac.value)` at `BacTracker.tsx:131` and `formatAsOf(asOf)` (initialized from `bac.calculatedAt` at line 30) — both fields read directly.

### Hypothesis 7: snapshot.bac never undefined/null
**Confirmed correct — never undefined.** The aggregator unconditionally emits the object at every call (`aggregate.ts:99-109,120-129`). Even when `alcoholLogs` defaults to `[]` (input destructure at line 85: `alcoholLogs = []`), `calculateBac` returns `0` (not throw, not null) at `lib/alcohol/bac.ts:41`. So `snapshot.bac` is always `{ value: number, calculatedAt: ISO string }`. The type is non-optional per `types.ts:336`.

The widget at `BacTracker.tsx:131` renders `formatBacValue(0)` → `'0.0'` for the zero case. This is the briefing's intended "default 0.0 BAC" behavior, locked by the test at `BacTracker.test.tsx:18-23`.

### Hypothesis 8: profile field name mismatch
**Confirmed correct — `current_weight_kg`.** `lib/dashboard/types.ts:44` declares `current_weight_kg: number` (snake_case, no nullability — DB CHECK constraint enforces 30–350 per migration 0002:29). The fetcher selects this column verbatim at `lib/dashboard/fetch.ts:46`. The aggregator reads `profile.current_weight_kg` at `aggregate.ts:104`. The calculator reads `profile.current_weight_kg` at `lib/alcohol/bac.ts:43`. All snake_case, all consistent.

### Hypothesis 9: bio_sex source
**Confirmed correct — read from profile.** `aggregate.ts:103` → `bio_sex: profile.bio_sex`. The DB CHECK constraint per migration 0026:12-14 now enforces `bio_sex IN ('male', 'female')`. The fetcher selects `bio_sex` at `fetch.ts:46`. Type at `types.ts:43` is `'male' | 'female'`. The calculator at `lib/alcohol/bac.ts:31-37` reads `WIDMARK_R[bio_sex]` and throws if undefined — but the DB CHECK + TypeScript narrowing should make the throw unreachable in practice.

### Hypothesis 10: Date serialization to client component
**Confirmed correct — already a string.** `snapshot.bac.calculatedAt` is set to `now` (the `userTzNowIso(tz)` return), which is already an ISO string (`lib/time/day.ts:37-45`). Not a Date object. Crosses the server/client boundary as a primitive string. `BacTracker` reads it with `useState(bac.calculatedAt)` at `BacTracker.tsx:30` and formats via `new Date(iso)` at line 22 — clean.

### Cross-check: page wiring + dynamic rendering
`app/(app)/dashboard/page.tsx:56` declares `export const dynamic = 'force-dynamic'` — no SSG / no caching of stale BAC values. Page does:
1. `requireProfileOrRedirect` (line 91) — auth gate
2. `redirect('/onboarding')` if not onboarded (line 97-99)
3. `fetchProfile(user.id)` (line 101) — pulls `current_weight_kg`, `bio_sex` among other fields
4. `now = userTzNowIso(tz)` (line 103) — wall-clock UTC
5. `fetchDaySnapshot(user.id, profile, viewedDay, tz, now)` (line 111) — kicks off the 4 parallel fetches including `fetchAlcoholLogs(uid, now)`
6. `<BacTracker bac={snapshot.bac} />` (line 244) — final wire

Every step is correct.

### Summary
The data-flow surface implements the briefing's contract verbatim:
- 72h alcohol query, scoped by user_id, anchored to wall-clock now, ordered ascending ✓
- Calculator invoked with `profile.current_weight_kg` + `profile.bio_sex` + `asOf=now` ✓
- Snapshot emits `{ value, calculatedAt }` matching the widget's prop signature ✓
- Type contract enforced top-to-bottom (DashboardSnapshot['bac'] used everywhere) ✓
- Tests locking the exact behavior pass ✓

Production defect must originate elsewhere. The two most likely upstream suspects:
- **Bug 2 (save route)** — drink entries not persisting to `alcohol_logs`. If the table is empty in prod for the test user, this layer correctly returns BAC = 0.
- **Bug 3 (widget)** — widget present in DOM but visually hidden, or refresh button broken, or the build-time strip of `'use client'` failed. Snapshot reaches the widget intact regardless.

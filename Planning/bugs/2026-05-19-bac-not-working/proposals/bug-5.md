# Bug 5: Dashboard BAC widget (render + refresh)

## Classification
NO_BUG_FOUND

The dashboard BAC widget renders correctly, receives the right prop shape, exposes a keyboard-accessible icon refresh button that updates the timestamp and re-fetches via `router.refresh()`, sits next to the water tracker via a defined responsive grid container, and has unit-test coverage for all three acceptance contracts (default 0.0, current value + as-of stamp, refresh roundtrip). Every root-cause hypothesis in the brief was checked and ruled out (see Evidence). If the user reports "BAC widget doesn't work in production," the cause is **upstream** (Bug 4: `entries/save` doesn't write `alcohol_logs` rows, OR the user has not actually logged a beer item), not in this component.

One minor spec-vs-implementation observation flagged below as an Open Question, not a bug — it's not breaking the widget; the test suite passes the looser `/as of/i` assertion.

## Root Cause
N/A — no bug found in render path or refresh handler. Widget code is internally consistent with the i18n keys, types, CSS container, and unit tests.

## Proposed Change (Diff Outline)
None. The widget is correct. Do NOT modify `components/dashboard/BacTracker.tsx`, `app/(app)/dashboard/page.tsx`, `app/globals.css`, or `lib/i18n/en.ts` as part of this batch — every line in those files relevant to BAC traces to the brief's requirements.

If main agent triages and decides the spec-vs-implementation gap on `formatAsOf` (Open Questions §1) IS user-facing, that's a one-line change inside `formatAsOf`. But it should not ship in this batch without an explicit user decision — the unit test currently asserts the lenient behavior.

## Files Affected
None.

## TDD Required
false (no implementation change). The widget already has TDD coverage at `tests/unit/components/dashboard/BacTracker.test.tsx:18-49` covering all three acceptance criteria from the brief.

## Test Approach
N/A.

## Risk Assessment
none — no change.

## Regression Sweep Needed
No.

## UI Touching
true (surface is UI, but no edit proposed).

## Open Questions

1. **`formatAsOf` always renders the timestamp, even for the default 0.0 state.** The brief says "Display default `0.0` when no alcohol applies" + "Display current estimated BAC and 'as of' timestamp when alcohol has been logged" — implying the as-of stamp should be hidden (or render `"As of now"` from `t.dashboard.bac.emptyAsOf`) when `value === 0`. The current code only falls back to `emptyAsOf` if the ISO string fails to parse (`Number.isNaN(date.getTime())`), which never happens for the aggregator-produced `calculatedAt = now`. So the user always sees `"As of 2026-05-19 17:23 UTC"` even when `value` is `0.0`. The existing unit test on line 22 (`expect(screen.getByTestId('bac-as-of')).toHaveTextContent(/as of/i)`) passes either way because both the formatted UTC string and `'As of now'` match `/as of/i`. **Question for main agent:** is this a spec gap the user wants closed in this batch, or is it intentional ledger-aesthetic ("always show a timestamp")? Recommend asking user, since either answer is defensible — flagging here for user gate rather than silently fixing.

2. **`calculatedAt: now` in the aggregator means the displayed timestamp is always "now" on first page load** (`lib/dashboard/aggregate.ts:108`). The refresh button overwrites `asOf` with another `new Date().toISOString()` (`BacTracker.tsx:34-35`). So the user-perceived behavior is "clicking refresh updates the timestamp to the current minute" — even if no NEW alcohol data has arrived since the page rendered. That matches the brief ("manual refresh icon that recalculates BAC and updates the timestamp") but it's worth noting: the timestamp reflects WHEN the value was computed, not WHEN the last drink was logged. This is design-correct per the brief but may not match user mental model of "as of [last drink]". Not a bug — recording for visibility.

## Evidence

**BacTracker IS imported and rendered with the right prop:**

`app/(app)/dashboard/page.tsx:36` — import:
```tsx
import { BacTracker } from '@/components/dashboard/BacTracker';
```

`app/(app)/dashboard/page.tsx:235-245` — render, placed next to `WaterTracker` inside the responsive `.kalori-dashboard-water-micros-row` track:
```tsx
<WaterTracker
  initial={{
    consumedMl: snapshot.water.consumedMl,
    targetMl: snapshot.water.targetMl,
    entries: snapshot.water.entries,
  }}
  timezone={tz}
  viewedDay={viewedDay}
/>
<BacTracker bac={snapshot.bac} />
```

**No conditional gate** suppresses the render — it's an unconditional child of `<FadeUpCard delay={0.45}>` (page.tsx:227). The widget renders on every dashboard load that passes auth + onboarding gates (page.tsx:91-99).

**Prop shape matches:**

`lib/dashboard/types.ts:336-339` declares:
```ts
bac: {
  value: number;
  calculatedAt: string;
};
```

`components/dashboard/BacTracker.tsx:10-14` consumes the same shape:
```tsx
type BacSnapshot = DashboardSnapshot['bac'];
export interface BacTrackerProps {
  bac: BacSnapshot;
}
```

**Aggregator populates it on EVERY dashboard request,** even when alcohol_logs is empty:

`lib/dashboard/aggregate.ts:99-109`:
```ts
const bac = {
  value: calculateBac({
    logs: alcoholLogs,
    profile: { bio_sex: profile.bio_sex, current_weight_kg: profile.current_weight_kg },
    asOf: now,
  }),
  calculatedAt: now,
};
```

`calculateBac` returns `0` when `logs.length === 0` (`lib/alcohol/bac.ts:41`), so the widget gracefully degrades to the default `0.0` state without erroring.

**Refresh handler IS wired and DOES re-fetch:**

`components/dashboard/BacTracker.tsx:33-39`:
```tsx
function refreshBac() {
  const refreshedAt = new Date().toISOString();
  setAsOf(refreshedAt);
  startTransition(() => {
    router.refresh();
  });
}
```

`router.refresh()` is the canonical Next.js App Router RSC re-fetch — it triggers a server roundtrip that re-runs `fetchDaySnapshot()` → `fetchAlcoholLogs()` → `calculateBac()` and streams a fresh `snapshot.bac` to the page. The component then receives a NEW `bac` prop and the value updates. The `setAsOf` runs synchronously so the user sees the timestamp tick over immediately, before the RSC roundtrip completes — correct UX pattern (optimistic local state, then server confirms).

**Test coverage confirms the refresh contract:**

`tests/unit/components/dashboard/BacTracker.test.tsx:33-49`:
```tsx
it('uses an icon-only accessible refresh button that updates timestamp and refreshes RSC data', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-19T10:05:00.000Z'));
  render(<BacTracker bac={{ value: 0.01, calculatedAt: '2026-05-19T10:00:00.000Z' }} />);
  const button = screen.getByRole('button', { name: /refresh bac/i });
  expect(button).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(refreshMock).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('bac-as-of')).toHaveTextContent('10:05');
});
```

This test exercises: (a) WCAG 44×44 touch target, (b) keyboard focusable, (c) accessible name via `aria-label`, (d) click calls `router.refresh()` exactly once, (e) timestamp updates from `10:00` to `10:05` on click.

**i18n keys all exist** at `lib/i18n/en.ts:411-418`:
```ts
bac: {
  headerLeft: 'BAC estimate',
  headerRight: 'alcohol',
  description: 'Current estimated BAC',
  refreshA11y: 'Refresh BAC',
  asOfFormat: 'As of {time}',
  emptyAsOf: 'As of now',
},
```

All six keys are consumed by `BacTracker.tsx` (lines 75, 85, 91, 118, 23, 25 respectively). No missing keys, no typos.

**No CSS hides the widget.** The widget uses inline styles only (no class names), so it is immune to global CSS rules that might `display: none` it. The parent container `.kalori-dashboard-water-micros-row` is defined at `app/globals.css:1094-1100` (mobile single-column) and `app/globals.css:1184-1186` (tablet+ two-column) — both produce a visible grid track. No `overflow:hidden` on this track, no `transform:translate`, no `position:fixed`.

**Lucide icon import is correct.** `import { RefreshCw } from 'lucide-react';` (line 5) — `RefreshCw` is a valid Lucide React export (used elsewhere in the codebase). Used at line 105 with `size={18} aria-hidden="true" strokeWidth={1.8}`.

**No hydration mismatch risk.** `formatAsOf` uses `date.toISOString().slice(0, 16).replace('T', ' ')` — `toISOString()` always returns UTC, identical server-side and client-side, so React will not throw a hydration warning. The local `useState(bac.calculatedAt)` initializes from the server-rendered prop, then becomes mutable — also standard React pattern, no mismatch.

**No 404 risk.** Refresh does NOT hit an API endpoint — it calls `router.refresh()`, which Next.js handles internally as a RSC re-render of the current route. No new network round trip to a missing route handler.

**Render hypotheses (brief items 6, 7):** widget uses inline `display: 'grid'` (line 50), `gap`, `padding`, no `opacity:0`, no `pointer-events:none`, no `transform`, no `position:fixed`. Mounts in normal document flow.

**Widget renders even when `bac.value === 0`** — `formatBacValue` returns `'0.0'` for non-finite or ≤0 (line 17), so default state is `0.0` visible (matches brief).

**Hypothesis 13 (prop never updates after drinks logged)** — false on this surface. `bac` is a prop driven by RSC; after `router.refresh()` (or any nav that re-renders the dashboard RSC), a new `snapshot.bac` flows in and React re-renders the widget with the new `value`. The widget has no `useEffect` or internal state guarding against prop changes. If the user reports the value stays at `0.0` after logging a beer, the cause is upstream (Bug 4: `alcohol_logs` row never written by `entries/save`), not in BacTracker.

# Project Context — Library card count + micros precision

**Project slug:** kalori
**Stack:** Next.js 16 RSC + React 19 + TypeScript strict + Tailwind v4 + shadcn/ui + Supabase + Gemini Flash. Single-user PWA, dark "Ledger" theme.

## Concurrent-session commits since 61b9216

All six commits scope to log-flow / Add Food tab merge (Task 9 polish + tests). **Zero overlap** with library card or micros surfaces:
- `ffb1bef` fix(nav): mobile food FAB → library tab (components/nav/nav-shell.tsx)
- `167dc91` docs(planning): Task 14 visual baseline note
- `6bfdc1d` test(e2e): US-ADDFOOD-1
- `958c575` test(integration): back-nav state
- `b7d7638` test(integration): full happy path
- `36675b1` refactor(log-flow): remove LibraryTab.tsx + TypeTab.tsx + test fixups

No commits touched: LibraryCard, lib/library/fetch, /api/entries/save, MicroBreakdownDialog, foodDetail.format, display-micros, MicronutrientPanel, MicrosOverflowToggle. **Stash overlap risk: clear.**

## BUG 1 — Library card "Nx logged" badge stuck at 0

**Surfaces:**
- `app/(app)/library/_components/LibraryCard.tsx:173-175` — renders `<span class="kalori-library-card-count-badge">{item.log_count}×</span>`. The badge is `aria-hidden`; visible to sighted users only. Aria label at line 83 also embeds `log_count`.
- `lib/library/fetch.ts:127` — RSC server query SELECTs `log_count` from `food_library_items`. Already in the column list.
- `supabase/migrations/0003_food_schema.sql:53` — `log_count int not null default 0` on `food_library_items`.
- `app/api/entries/save/route.ts` write paths:
  - **Re-log path (lines 421-509):** when `body.library_item_id` is present, derives `nextLogCount` via `COUNT(*) AFTER INSERT` and UPDATEs the library row + invalidates `TAGS.userLibrary(uid)` + `revalidatePath('/library', 'page')`. Works correctly.
  - **Save-to-library path (lines 532-637):** when `save_to_library === true && !body.library_item_id`, INSERTs a fresh library row using `crypto.randomUUID()` for client_id, no explicit `log_count` field → uses the DB default `0`. **No counter set to 1 even though the entry that just shipped IS the first log of this library item.**
- `app/api/library/[id]/log-now/route.ts` (header §"Counter bump"): same COUNT(*)-after-insert pattern. Works for re-log.

**Root cause hypothesis: (a) variant.** Not "stale column never incremented globally" — it works on re-log. The first-save-to-library write-path inserts the library row with default `log_count=0` but does NOT account for the food_entries row it just committed. The food_entries INSERT precedes the library INSERT, so a COUNT(*)-after-pattern (mirroring the re-log code) would correctly read 1. Alternatively, hardcode `log_count: 1` on the initial insert since exactly one entry was just committed for this normalized_name. The bug class is "new-row first-log not counted", not "all logs lost".

## BUG 2 — Micro amount rounds to 0 mg while % shows nonzero

**Amount formatter:** `app/(app)/library/_components/FoodDetail/foodDetail.format.ts:32`
```ts
export function formatMilligrams(value: number | null | undefined): string {
  ...
  return String(Math.round(value));  // 0.3 → "0", 0.4 → "0", 0.6 → "1"
}
```
Used by `MicrosReadOnly` for both `mg` AND `mcg` units (FoodDetailMacros.tsx:560-563 — `mcg` branch reuses `formatMilligrams`).

**Percent formatter:** `lib/nutrition/display-micros.ts:35-39`
```ts
export function formatMicroPercent(value: number, rda: number | null): number {
  ...
  return Math.round((value / rda) * 100);  // 0.3 mg / 18 mg RDA = 1.67% → "2%"
}
```
Uses unrounded source.

**Dialog amount formatter:** `components/dashboard/MicroBreakdownDialog.tsx:46-48` uses a different rule:
```ts
function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
```
`0.3 → "0.3"` already (precision OK in the dialog).

**Root cause hypothesis:** Library `MicrosReadOnly` calls `formatMilligrams` which rounds to integer, but `formatMicroPercent` for the same row uses unrounded value. Fix: `formatMilligrams` should preserve at least one decimal place when value < 1, mirroring the dialog's `formatAmount` rule, OR drop the row entirely when amount rounds to "0".

**Regression risk to my prior batch 61b9216:** the rounding bug is preexisting (since Task 4.2, Apr 24). My prior batch only made it user-visible by introducing the `pct >= 1%` filter — rows that previously hid because of `consumed === 0` now surface because `consumed === 0.3` passes the 1% RDA threshold. Fix is scoped to `formatMilligrams`; existing display-micros tests should not break since they test percent, not amount strings.

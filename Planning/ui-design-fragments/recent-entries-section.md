# Recent Entries Section — UI Design Fragment

**Surface:** New section on `/library` route, sibling-below the existing My Library grid.
**Owner:** Task C.2 (US-STAB-C2) — closes AC1 (two sections visible).
**Status:** Canonical spec authored at Phase 1 by `ux-specialist`. Halt-blocker for impl sub-agent until landed.

---

## 1. Intent

Show the last 14 days of `food_entries` (cap at 20 rows, most-recent-first), grouped by date with day headers, as a sibling section below the My Library grid. Together the two sections satisfy AC1 ("I see two sections: My Library AND Recent Entries"). Read-only in MVP — clicking a row does NOT drill in (`/entries/[id]` does not exist; deferred to post-MVP per briefing Open Question #2). Pure RSC with no client island. Uses the same Ledger language as the Library Masthead — kicker, serif title, hairline rules, mono numerics, italic empty-state copy — so the two sections read as siblings, not a bolt-on.

Cited authority: `ui-ux-pro-max` §4 `consistency` (same style across all pages), §6 `text-styles-system` + `weight-hierarchy`, §9 `nav-hierarchy` (primary vs secondary surfaces); `web-design-guidelines` accessibility audit covers section headings + list semantics.

---

## 2. Layout Structure

```
[ existing LibraryClient grid ends ]
─────────── 32px vertical spacer (page-padding step) ───────────

§ 04 · RECENT ENTRIES                                 ← kicker, Inter 500 10.5 UPPER 0.22em dust
RECENT ENTRIES                                        ← serif title, Newsreader 300 28 ivory
1px solid rule-strong  · · ·  1px solid rule
─────────── 16px ───────────
TODAY                                                 ← date group header
  one-row entry · time · kcal · macros
  one-row entry · time · kcal · macros
─────────── 16px ───────────
YESTERDAY
  one-row entry · time · kcal · macros
─────────── 16px ───────────
MON, MAY 12
  one-row entry · time · kcal · macros
  ...
```

- **Section kicker:** `§ 04 · RECENT ENTRIES` — Inter 500 / 10.5px / UPPERCASE / tracking 0.22em / `dust`.
- **Serif title:** `RECENT ENTRIES` — Newsreader 300 / 28px (desktop/tablet) / 24px (mobile) / `ivory` / tracking -0.01em.
- **Double hairline beneath title:** `1px solid rule-strong` + `1px solid rule` with `4px` gap (lighter sibling of the Masthead's signature double-rule — see `agent-3` Dashboard Masthead pattern; the Library Masthead already uses the heavier `6px-gap` variant, so the Recent Entries divider is a deliberately quieter visual peer).
- **Container:** Full-width within the existing `kalori-library-main` page padding (no nested card frame; section breathes inside the same column ruling).
- **Top spacer (above kicker):** `32px` desktop/tablet, `24px` mobile — separates from the grid below the masthead.
- **Date-group spacing:** `16px` between groups; `0` inter-row gap (rows share hairlines).

---

## 3. Row Anatomy (one row per entry)

```
┌────────────────────────────────────────────────────────────────────────┐
│ italic-serif food name           ·  21:14   ·  P 28 · C 12 · F 9  · 240│
│ Inter 12 dust meal_category badge                                  KCAL│
└────────────────────────────────────────────────────────────────────────┘
1px rule hairline beneath
```

| Region | Content | Token |
|---|---|---|
| **Food name** (flex-grow left) | `display_name` (or `items[0].name` fallback) — italic serif | Newsreader 400 / italic / 16px / `ivory` / line-height 1.4 / clamp 1 line ellipsis |
| **Meal-category badge** (under name on desktop; inline-right of name on mobile) | `BREAKFAST` · `LUNCH` · `DINNER` · `SNACK` | Inter 500 / 9.5px / UPPERCASE / tracking 0.18em / `dust` / no border (text-only badge) |
| **Logged-at time** (mono, right-of-name on desktop; hidden on mobile — moves to badge row) | `21:14` (24h, user TZ via `profiles.timezone`) | JetBrains Mono 400 / 11px / `dust` / tabular-nums |
| **Macro micro-strip** (desktop/tablet only) | `P 28 · C 12 · F 9` (grams, whole numbers) | JetBrains Mono 400 / 10.5px / `dust` / tabular-nums |
| **Calories** (rightmost) | `240` + sub `KCAL` | Newsreader 400 / 18px / `ivory` / tabular-nums + Inter 500 / 9.5px / UPPER 0.18em / `dust` |

**Row container:**
- `min-height: 44px` (touch target floor per `ui-ux-pro-max` §2 `touch-target-size`).
- `padding: 12px 0` (vertical), no horizontal padding (rows align flush with masthead).
- `border-bottom: 1px solid rule` (hairline separator; last-of-type clears border).
- `display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px;` desktop/tablet — name flexes, then time / macros / kcal right-anchored.
- Per `ui-ux-pro-max` §6 `number-tabular`: every numeric column uses tabular-nums to prevent visual jitter row-to-row.
- **Hover (desktop/tablet, non-clickable):** background `bg-1` tonal shift via `ink-fade` (motion-micro 120ms). Hover present even though rows are non-interactive in MVP — signals readability + future clickability without overcommitting. Subtle: NOT oxblood-tinted (oxblood reserved for destructive + primary CTA per design tokens).

---

## 4. Date Grouping

Group rows by **calendar date in user's `profiles.timezone`** (per `F5` — TZ-aware date math). Headers:

| Day | Header label | Token |
|---|---|---|
| Same date as `now()` | `TODAY` | Inter 500 / 10.5px / UPPERCASE / tracking 0.22em / `dust` |
| `now() - 1 day` | `YESTERDAY` | same |
| Older | `MON, MAY 12` (`EEE, MMM d`, en-US format via `Intl.DateTimeFormat`) | same |

- **Header treatment:** Identical kicker styling (`dust` UPPERCASE 10.5px 0.22em) — reinforces "this is a section subdivision, not a row." Padding-top `16px` (8-scale + editorial breathing per `agent-3` dashboard rhythm). Padding-bottom `8px`. No bottom border (the first row's top is empty; the last row of the previous group already drew a hairline).
- **No header for empty days** — only days with ≥1 entry render a header.
- **Locale:** `'en-US'` hard-coded for MVP (i18n locale switching is post-MVP; consistent with `lib/i18n/en.ts` strategy).

---

## 5. Empty State

```
─── kicker + title + double-rule ───

(no rows)

         "No entries logged yet."

         Log a food to see it here.    →  LOG A FOOD
```

| Element | Content | Token |
|---|---|---|
| Headline | `No entries logged yet.` | Newsreader 400 / italic / 22px / `sand` / centered |
| Sub-copy | `Log a food to see it here.` | Inter 400 / 14px / `dust` / centered / max-width 320px |
| CTA link | `→ LOG A FOOD` | Inter 500 / 10.5px / UPPERCASE / tracking 0.22em / `oxblood` / hover `oxblood-soft` underline / 44×44 tap target via padding |

- **CTA target:** `href="/log"` — opens the Log Flow modal route (matches `agent-4` log-flow precedent for the existing library-empty CTA `"OPEN THE LOG FLOW"`).
- **Container:** vertical center within section, `padding: 48px 0` desktop / `32px 0` mobile. No border, no card frame — empty space carries the editorial silence.
- **Region tone:** Quiet not stark — copy "logged yet" preserves the warm voice from existing empty states (`No titles yet filed.`).
- **i18n keys:** see §11.

Cited authority: `ui-ux-pro-max` §8 `empty-states` (helpful message + action when no content) — empty state must include recovery path (the CTA), not just a message.

---

## 6. Loading State

When `fetchRecentEntries` is in-flight (RSC suspense fallback OR initial mount before data hydrates):

- **5 skeleton rows** stacked, each `min-height: 44px`, separated by `1px rule` hairlines (matches loaded layout).
- **Skeleton anatomy:** A `bg-2` rectangular block at name-column width (`60% of row width`, `14px height`) + a `40px × 11px` block at time-column + a `60px × 11px` block at kcal-column. No macro-strip skeleton (it's the most fragile column visually; safer to omit during shimmer).
- **Animation:** Per `enrichment-ux-specialist` §3.2 fix — use the to-be-added `motion-shimmer: 1600ms` token. Shimmer pattern: opacity `0.5 → 0.9 → 0.5` ease-in-out, NOT a gradient slide (gradient slides read SaaS-default per `frontend-design` "AI-slop" check). Reduced-motion: opacity static at `0.7` (no animation).
- **Group header skeleton:** A single `bg-2` block at `48px × 10.5px` top-left, kicker-styled, mimicking the `TODAY` header.

Cited authority: `web-design-guidelines` accessibility — skeleton container has `aria-busy="true"` and `aria-live="polite"`; once loaded, both attributes flip.

---

## 7. Error State

Inline within section (NOT a global toast — error is section-scoped, not page-scoped):

```
─── kicker + title + double-rule ───

  ⚠ Couldn't load recent entries.

  → RETRY
```

- **Headline:** `Couldn't load recent entries.` — Newsreader 400 / italic / 18px / `sand` (matches the warm-fail tone of existing library `bulkDeleteErrorBanner`).
- **Sub-copy:** Inter 400 / 13px / `dust` / `"Refresh the page or try again in a moment."`.
- **Retry link:** `→ RETRY` — Inter 500 / 10.5px / UPPERCASE / tracking 0.22em / `oxblood` / 44×44 tap target. Server Component error path: link is `<a href="/library">` (full-page refresh — the cheapest correct retry for an RSC fetch failure). NO client-side retry handler since the section is a pure RSC.
- **Sentry capture:** Per lesson #9 — `fetchRecentEntries` on caught error calls `Sentry.captureException(err)` BEFORE returning the empty/error fallback. Never swallow.
- **Container:** Same padding as Empty state. Subtle `2px oxblood` left border on the headline block (signature error-treatment device — matches `enrichment-design-lead` §2.7 left-rule convention).

Cited authority: `ui-ux-pro-max` §8 `error-recovery` — every error must include a clear recovery path.

---

## 8. Interaction States (read-only in MVP)

| State | Trigger | Visual |
|---|---|---|
| **Idle** | default | `bg-0` row, hairline beneath |
| **Hover** (desktop/tablet) | pointer over row | `bg-1` tonal shift via `ink-fade` (motion-micro 120ms). NOT oxblood-tinted — oxblood is reserved for destructive + primary CTA. |
| **Focus** (keyboard) | `Tab` to row — but rows are non-interactive in MVP, so they SHOULD NOT be in tab order. Skip until post-MVP `/entries/[id]` exists. | n/a |
| **Press** | n/a (no tap action MVP) | n/a |

**Why no focus ring in MVP:** Rows are not buttons or links — they're presentational list items. Per `ui-ux-pro-max` §1 `keyboard-nav`, only interactive elements receive tab focus. The hover state is purely decorative readability and degrades correctly on touch (where hover doesn't fire).

**Future-proofing:** When clickable rows ship (post-MVP `/entries/[id]`), wrap row content in `<Link>` and add `2px ivory outline + 2px offset` focus ring per project convention (`session-context.md` §1 — ivory ring, not oxblood, per WCAG 2.5.8 correction).

Cited authority: `web-design-guidelines` focus-states + `ui-ux-pro-max` §2 `hover-vs-tap`.

---

## 9. Design Tokens Used

All tokens referenced live in `app/globals.css` per Agent 1 foundation spec; this section uses NO new tokens (per Task C.2 constraint "No new design token").

| Token name | Value | Used for |
|---|---|---|
| `--bg-0` | `#0E0A08` | Section background |
| `--bg-1` | `#170F0C` | Row hover background |
| `--bg-2` | `#1A1310` | Skeleton block fill |
| `--ivory` | `#F4EBDC` | Food name + kcal hero |
| `--sand` | `#C9B79A` (approx) | Empty-state headline + error headline |
| `--dust` | `#7E705C` (approx) | Kickers + sub-copy + meal-category badge + mono numerics |
| `--oxblood` | `#8A2A1F` | CTA `→ LOG A FOOD` + retry link |
| `--oxblood-soft` | `#A13A2C` (approx) | CTA hover |
| `--rule` | `1px / rgba(...)` | Inter-row hairlines + grouping rules |
| `--rule-strong` | `1px / rgba(...)` (denser) | Section divider top rule |
| Font: Newsreader 300 / 400 / italic | — | Title + food name + empty/error headlines + kcal hero |
| Font: Inter 500 | — | Kicker + meal-category badge + kcal suffix + CTA |
| Font: JetBrains Mono 400 (tabular-nums) | — | Time + macro micro-strip + numeric values |
| Motion: `motion-micro` | 120ms ease-editorial | Hover background swap |
| Motion: `motion-shimmer` | 1600ms ease-in-out (new — added by Agent 1 sweep per enrichment-ux-specialist §3.2) | Skeleton shimmer |

---

## 10. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| **Mobile 375–767** | Single column. Row grid collapses to 2 rows: row 1 = name + kcal (right); row 2 = meal-category badge + time + (macros HIDDEN). Macro-strip omitted to preserve readability — kcal is the load-bearing scalar. Date headers padding-top `12px` / padding-bottom `6px`. Section top spacer `24px`. |
| **Tablet 768–1279** | Full grid columns visible — name (flex) + time + macros + kcal. Section top spacer `28px`. Macro-strip shown at full 10.5px mono. |
| **Desktop 1280+** | Same as tablet but section breathes inside same `kalori-library-main` width as the My Library grid above — no nested side-by-side split (per Open Question #1 recommendation: stack-below for AC1 simplicity + mobile parity). |

**Page-padding inheritance:** Section consumes the existing `kalori-library-main` horizontal padding; does NOT introduce its own gutter. Vertical rhythm: `32px` (desktop/tablet) or `24px` (mobile) between sections — adds to the 8-base scale at desktop, mirrors the existing dashboard kicker-to-content spacing (`agent-3` §Masthead).

**No horizontal scroll** at any breakpoint per `ui-ux-pro-max` §5 `horizontal-scroll`. Row macros + time + kcal columns auto-collapse on narrow widths via `grid-template-columns: 1fr auto auto`.

Cited authority: `ui-ux-pro-max` §5 `mobile-first` + `content-priority` — primary content (food name + kcal) preserved on mobile; secondary (macros) folds.

---

## 11. Accessibility

- **List semantics:** Section is a `<section aria-labelledby="recent-entries-heading">`. Inside, group headers are `<h3>` (under the section's `<h2>` title `RECENT ENTRIES`). Each date-group's rows are a `<ul role="list">` (explicit `role="list"` ensures Safari preserves list semantics even with `list-style: none`). Each row is `<li>`.
- **Heading hierarchy:** Library Masthead title `THE LIBRARY` is `<h1>` (page-level). My Library section uses `<h2>` (already present via existing LibraryClient). Recent Entries title `RECENT ENTRIES` is **`<h2>`** (sibling of My Library). Date groups are **`<h3>`** under it. Sequential — no level skipping per `web-design-guidelines` and `ui-ux-pro-max` §1 `heading-hierarchy`.
- **Screen reader text for time-of-day:** The `<time datetime="2026-05-15T21:14:00">21:14</time>` element renders `21:14` visibly but the parent `<li>` includes a visually-hidden `<span class="sr-only">logged at {full readable timestamp} in {meal category}</span>` for assistive-tech context. Reasoning: `21:14` alone reads as "twenty-one fourteen" to a screen reader — meaningless without context.
- **Screen reader text for kcal:** `<span aria-label="{kcal} calories">{kcal}<span aria-hidden="true">KCAL</span></span>` — the "KCAL" sub-text is decorative; the aria-label provides the readable form. (Matches the project's existing `cardAriaLabel` pattern in `lib/i18n/en.ts`.)
- **ARIA-live for empty → populated transition:** Section wraps in `aria-live="polite"` ONLY during loading (skeleton state). Once populated, `aria-live` is removed to prevent the screen reader announcing every page refresh. Per WCAG SC 4.1.3 Status Messages + `enrichment-ux-specialist` §9 audit. Implementation: an `aria-busy` flip on the section container; the live region is the heading-and-empty-state container, not the row list.
- **Color-not-sole-signal:** Meal-category badges use TEXT (`BREAKFAST` etc.), not color-only. Macros use mono text + tabular-nums, not bars. Kcal value carries its own KCAL suffix text. Per `ui-ux-pro-max` §1 `color-not-only` ✓.
- **Reduced motion:** Hover background swap respects `prefers-reduced-motion: reduce` → opacity-only crossfade (no transition). Skeleton shimmer becomes a static `opacity: 0.7` block. Per Agent 1 §6.4 reduced-motion contract.
- **Tabular numerics:** Time + macros + kcal all use `font-variant-numeric: tabular-nums` so column edges don't jitter row-to-row. Per `ui-ux-pro-max` §6 `number-tabular`.
- **Contrast:** All token pairs verified — `ivory on bg-0` ≥15:1 (food name), `dust on bg-0` ≥4.5:1 (meta), `oxblood-soft on bg-0` ≥3.7:1 (CTA hover). Per Agent 1 token contrast table.

---

## 12. Component API Sketch

**File:** `app/(app)/library/_components/RecentEntriesSection.tsx` (Server Component — no `'use client'`).

```ts
import type { FoodEntry } from '@/lib/types/food';

type RecentEntriesSectionProps = {
  /**
   * Pre-fetched entries from `fetchRecentEntries(userId, { limit, days })`.
   * Server Component owns the fetch; this component is pure render.
   * Ordered by `logged_at DESC` (newest first). Server has already capped
   * to the contracted limit (20) within the 14-day window.
   */
  entries: ReadonlyArray<RecentEntryRow>;
  /**
   * User's profile timezone (from `profiles.timezone`) for client-stable
   * date-group computation (TODAY / YESTERDAY / MMM D). Defaults to UTC
   * if the profile field is null (compensates for first-day users).
   */
  timezone: string;
  /**
   * Render an error fallback instead of the list. Used when the parent
   * fetcher caught + Sentry-captured a failure and is providing a
   * graceful section-scoped error path.
   */
  errored?: boolean;
};

type RecentEntryRow = {
  id: string;
  logged_at: string;          // ISO 8601
  display_name: string;       // resolved upstream: items[0].name OR library_item join
  meal_category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  kcal: number;
  macros: { protein: number; carbs: number; fat: number };
};

export function RecentEntriesSection(props: RecentEntriesSectionProps): JSX.Element;
```

**Contract:**
- Pure RSC — no `useEffect`, no Zustand, no client island. Parent (`app/(app)/library/page.tsx`) is responsible for the fetch.
- Errors propagate via the `errored` prop, NOT via thrown exceptions inside the component (the page-level fetcher is the error boundary owner — it Sentry-captures and renders the section in error mode).
- Empty array → empty state automatic; `errored: true` → error state automatic; otherwise → grouped list.
- Locale hard-coded `'en-US'` for date formatting (matches `lib/i18n/en.ts` MVP strategy).

**Test IDs (referenced by E2E spec `tests/e2e/web/user-stories/US-STAB-C2.spec.ts::two-sections-visible`):**
- `data-testid="section-recent-entries"` on the `<section>` element.
- `data-testid="recent-entries-empty"` on the empty-state container.
- `data-testid="recent-entries-error"` on the error container.
- `data-testid="recent-entries-row"` on each `<li>` (with `data-entry-id="{id}"` for AC4 verification that a newly-logged entry shows up).

Cited authority: `vercel-react-best-practices` `server-cache-react` + `server-parallel-fetching` — parent page fetches My Library AND Recent Entries in parallel via `Promise.all` (NOT sequential), then passes both as props.

---

## 13. Data Fetch Contract

**File:** `lib/library/fetchRecentEntries.ts` (NEW per task briefing §Files-to-touch).

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type FetchRecentEntriesOptions = {
  /** Cap on rows returned. Default 20. UI shows at most this many. */
  limit?: number;
  /** Day-window lookback. Default 14. Entries logged_at older than
   *  `now() - days` are excluded even if `limit` would allow them. */
  days?: number;
};

/**
 * Fetch the last-N `food_entries` rows for a user, sorted by
 * `logged_at DESC, id DESC` (id tiebreaker ensures pagination cursor
 * stability per Codex risk #4 in task briefing).
 *
 * RLS-scoped — uses the authed Supabase client. Server-side; never
 * called from a client component.
 *
 * On caught error: calls Sentry.captureException(err) BEFORE returning
 * `{ entries: [], errored: true }` per lesson #9 (never swallow).
 *
 * @throws Never — failures are encoded in the return shape.
 */
export async function fetchRecentEntries(
  supabase: SupabaseClient,
  userId: string,
  options?: FetchRecentEntriesOptions
): Promise<{
  entries: ReadonlyArray<RecentEntryRow>;
  errored: boolean;
}>;
```

**Query (PostgREST):**

```sql
SELECT id, logged_at, items, meal_category, library_item_id,
       (items->0->>'kcal')::numeric AS kcal,
       (items->0->'macros'->>'protein')::numeric AS p,
       (items->0->'macros'->>'carbs')::numeric AS c,
       (items->0->'macros'->>'fat')::numeric AS f
FROM food_entries
WHERE user_id = auth.uid()
  AND logged_at >= now() - interval '14 days'
ORDER BY logged_at DESC, id DESC
LIMIT 20;
```

**Pagination cursor stability:** Use `.range(0, 19)` NOT `.select('*')` (which truncates at 1000 silently per lesson #5). The `id` tiebreaker on the `ORDER BY` ensures that if two entries share a `logged_at` timestamp, ordering is deterministic across renders.

**`display_name` resolution:** Prefer joined `food_library_items.display_name` via `library_item_id` FK (when non-null and the library row is not tombstoned); fall back to `items[0].name` from the entry's own snapshot. This matches the existing meals-bulletin pattern and survives library-item deletion (the FK uses `ON DELETE SET NULL`).

**No cache tag on this fetch.** The fetch runs at page-render time on every visit. Server-side `revalidateTag(TAGS.userEntries(uid, today))` (fired by `/api/library/[id]/log-now` per AC4) will invalidate the parent page's render and re-fetch on next request. Per project frozen cache-tag set — NO new tag.

Cited authority: `vercel-react-best-practices` `async-parallel` (parallel My Library + Recent Entries fetch in `page.tsx`); `supabase-postgres-best-practices` PostgREST range patterns.

---

## 14. Acceptance Against AC1 (explicit)

**AC1 verbatim:** "GIVEN I am on `/library`, WHEN it renders, THEN I see two sections: **'My Library'** (`food_library_items`) AND **'Recent Entries'** (`food_entries`)."

**How this design satisfies AC1:**

1. **Two distinct, visually separated sections** — My Library (existing, untouched) keeps its masthead-title-then-grid pattern. Recent Entries adds a *peer-level* serif heading `RECENT ENTRIES` below the grid, with its own kicker (`§ 04`), its own double-hairline divider, and its own content body. Both sections are siblings of `<section data-testid="page-library">` (the existing page wrapper).
2. **`food_library_items` source for My Library** — unchanged. Existing `fetchLibraryPage` continues to drive `<LibraryClient>` and `<LibraryEmptyState>`.
3. **`food_entries` source for Recent Entries** — new `fetchRecentEntries(supabase, userId)` selector returns rows from the `food_entries` table, scoped by RLS.
4. **Both sections render in the same RSC tree** — `page.tsx` fetches both in parallel (`Promise.all`) and renders `<LibraryMasthead /> <LibraryClient initial={...} /> <RecentEntriesSection entries={...} />` in order. AC1's "two sections visible" is satisfied on any non-empty library OR non-empty entries set; on the dual-empty case, both sections render their respective empty states, which still counts as two sections visible per AC1's literal wording.
5. **E2E selector contract** — the spec `two-sections-visible` asserts:
   - `await expect(page.getByTestId('page-library')).toBeVisible()` (existing wrapper)
   - `await expect(page.getByRole('heading', { name: /The Library/i, level: 1 })).toBeVisible()` (My Library title — existing)
   - `await expect(page.getByTestId('section-recent-entries')).toBeVisible()` (Recent Entries section — new)
   - `await expect(page.getByRole('heading', { name: /Recent Entries/i, level: 2 })).toBeVisible()` (Recent Entries title — new)
   - Either at least one `getByTestId('recent-entries-row')` OR `getByTestId('recent-entries-empty')` is visible. Per `session-context.md` §8 E2E mandate — sequenced screenshots `ac1-01-initial.png` + `ac1-02-result.png` capture this.

**Open Question #1 resolution (briefing line 432):** Section is **stacked below** the My Library grid (not side-by-side responsive split). Reasons: (a) AC1 simpler — single visible-test contract; (b) mobile parity — no breakpoint flip; (c) preserves Library Masthead's centerpiece without competing focal point; (d) future-proof — Recent Entries can become its own scrollable infinite-list post-MVP without layout rework.

---

*End of Recent Entries section spec.*

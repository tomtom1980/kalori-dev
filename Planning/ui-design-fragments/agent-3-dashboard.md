## Dashboard Masthead

**Purpose.** Editorial header for every authenticated page on the Dashboard surface. Establishes "The Ledger" identity (wordmark + edition line + day/date + greeting), anchors the page in calendar context, and separates masthead from content with a signature double-hairline rule. Never ships marketing copy — this is personal nightstand typography.

**Variants.**
- `first-visit` — first session after onboarding completes. Shows extended welcome copy beneath the greeting (`"Welcome to your ledger. Each entry is kept like a journal page."`). Single-session, dismissible via close affordance on mobile; auto-dismisses after 24h.
- `returning` — default. Compact. Greeting only.
- `recalc-nudge` — returning + an auto-recalc fired since `last_dashboard_visit_at`. Adds a `TargetUpdatedBanner` inline between greeting and the double-hairline rule (owned by this component; click routes to `/settings` goals).
- `offline` — mono `OFFLINE · QUEUE N` chip appended to wordmark eyebrow; no other layout change.

**States.** `default`, `loading` (skeleton hairlines only — masthead is server-rendered and should not normally render a loading skeleton, but is reserved for first-paint edge), `error` (wordmark only; greeting + date swapped for `—`; masthead does not block dashboard render).

**Props interface.**

```ts
interface DashboardMastheadProps {
  displayName: string;                     // profiles.display_name
  editionNumber: number;                   // days since profiles.created_at in user TZ, inclusive of today
  todayISO: string;                        // 'YYYY-MM-DD' in user TZ (server-computed)
  todayLabel: {                            // pre-formatted server-side to avoid client-locale drift
    weekday: string;                       // 'Saturday'
    dayOrdinal: string;                    // 'the eighteenth'
    monthYear: string;                     // 'April 2026'
  };
  volume: number;                          // Roman-numeral volume; derived server-side: Math.floor((editionNumber - 1) / 365) + 1
  greeting: 'morning' | 'afternoon' | 'evening' | 'night'; // server-computed from user TZ hour
  variant: 'first-visit' | 'returning' | 'recalc-nudge';
  recalcNudge?: { newTargetKcal: number; oldTargetKcal: number; deltaPct: number } | null;
  offlineQueueSize?: number;               // undefined when online
}
```

**Visual spec.**
- Line 1 (kicker, Inter `label-caps`): `THE LEDGER · KALORI · VOL. [Roman(volume)] · EDITION [editionNumber]` — `color-text-dust`, tracking `tracking-caps-loose` (0.22em).
- Line 2 (wordmark + edition line): `<h1>` Newsreader 300 at `text-wordmark` (104px desktop / 72px tablet / 56px mobile, per Agent 1 scale); color `color-text-ivory`. Edition line right-aligned on desktop, stacks below wordmark on tablet/mobile (Newsreader 300 italic `text-section-title` scale, `color-text-sand`): `"No. {editionNumber} · {weekday}, {day} {monthYear}"`.
- Double hairline: 1px `color-rule` + 4px gap + 1px `color-rule-strong`, full page width.
- Greeting: Newsreader 400 italic 22px `color-text-sand`, format `"Good {greeting}, {displayName}."`. Period is deliberate.
- `first-visit` welcome copy: Newsreader 400 italic 16px `color-text-sand`, max-width `measure-short` (48ch), line-height 1.55.

All tokens reference Agent 1's dictionary. No hex literals appear in implementation.

**Responsive behavior.**
- **375px (mobile).** Stack vertically. Kicker line (full width, 10.5 UPPERCASE). Wordmark scales to 56px `-0.03em`. Edition line below wordmark (16px italic). Day label wraps to 2 lines. Greeting on its own row. Double-hairline full width. `first-visit` welcome copy allowed 3 lines max before truncation. `TargetUpdatedBanner` stacks below greeting.
- **768px (tablet).** Same stack order as mobile but wordmark 72px and edition line right-aligned on same row as wordmark via `flex-wrap`. Greeting single row.
- **1280px (desktop).** Full editorial spread: kicker row (two-column: left `THE LEDGER · KALORI`, right `VOL. · EDITION` mono form). Wordmark 104px with edition line right-aligned on same row. Greeting on row below in 48ch column left-aligned. Double-hairline spans full content column.

**Motion spec.**
- Masthead renders static RSC — no entrance motion on steady-state navigation.
- On first-visit: welcome copy fades in after wordmark using `motion-fade-ink` (220ms, `ease-ledger`) staggered 80ms after wordmark mount.
- `TargetUpdatedBanner` uses `motion-rule-draw` (400ms) on mount so the underline hairline draws left-to-right.
- `prefers-reduced-motion` → skip stagger; banner mounts without rule-draw.

**Accessibility notes.**
- `<h1>` is the wordmark. Edition line is a `<p>` with `aria-label="Edition {n}, {weekday} {day} {month} {year}"` to flatten for screen readers.
- `TargetUpdatedBanner` has `role="status"` + `aria-live="polite"` so the recalc announces without stealing focus.
- Focus ring on `TargetUpdatedBanner` click area: 2px `color-text-ivory` offset-2 (Agent 1 `focus-ring` token).
- Roman numeral in kicker has `aria-label` with the decimal equivalent (`"Volume 1"`).

**Data contract.**

```ts
// Server-computed in app/(app)/page.tsx; consumed as a prop bag.
// editionNumber: SELECT (DATE(NOW() AT TIME ZONE profile.timezone) - DATE(created_at AT TIME ZONE profile.timezone)) + 1
// volume: Math.floor((editionNumber - 1) / 365) + 1
// greeting: derived from current hour in user TZ — morning 5–11, afternoon 12–17, evening 18–21, night 22–4
// todayLabel: Intl.DateTimeFormat with user locale fallback to 'en-US'
```

---

## Chronometer Ring

**Purpose.** Signature component. Circular SVG chronometer (the visual replacement for stacked activity rings) showing today's consumed calories against the target. Dual-arc — oxblood consumed arc + dashed ember projection arc — plus an inner ochre fiber arc. Center reads calorie sum in 82px Newsreader. This is the dashboard's hero element.

**Variants.**
- `default` — under 80% of target; consumed arc in `color-oxblood`.
- `approaching` — 80–100%; consumed arc stays `color-oxblood`; projection arc `color-ember` carries 80% opacity.
- `on-target` — within ±5% of target at end of day; consumed arc `color-moss`; center label changes to `"ON TARGET"`.
- `over-target` — 100–130%; consumed arc `color-oxblood`; center frac reads `"OVER BY {n} kcal"`.
- `way-over` — >130%; consumed arc `color-oxblood`; subtle `motion-ember-pulse` on the arc end-cap (once every 4s, opacity 0.55→1.0); center frac `color-oxblood`.

**States.** `default`, `loading` (single hairline-strong circle, center `—`), `error` (dust ring, center `—`, inline error per design-doc §8 — oxblood `!` glyph + single-line copy `"COULDN'T LOAD TODAY'S SUM"`), `empty` (no entries yet today; center text `"LOG SOMETHING"` in `color-oxblood`, Inter 10.5 UPPERCASE, acts as button that triggers log flow).

**Props interface.**

```ts
interface ChronometerRingProps {
  consumed: number;                        // total kcal consumed today
  target: number;                          // profile daily target (manual or auto-recalc)
  fiberConsumed: number;                   // inner-arc: fiber grams consumed
  fiberTarget: number;                     // inner-arc: fiber grams target (default 30g)
  nowIndicatorAngle: number;               // 0–360 — triangle position, computed from current hour in user TZ (server-passed, not client-derived to avoid timezone drift)
  status: 'default' | 'approaching' | 'on-target' | 'over-target' | 'way-over';
  entryCount: number;                      // "5 entries" footer
  lastLoggedAt: string | null;             // 'HH:MM' in user TZ, or null if no entries
  onEmptyCTA?: () => void;                 // only when entryCount === 0
  state?: 'default' | 'loading' | 'error' | 'empty';
}
```

**Visual spec.**
- Dimensions: 280×280 px desktop, 240×240 tablet, 200×200 mobile. Container is square; SVG is `viewBox="0 0 360 360"` scaled via CSS.
- Outer compass circle: 1px `color-rule` stroke, r=164 viewBox units.
- Hour tick marks at I/IV/VII/X + minor ticks every 30°: 1px `color-rule-strong` for cardinal, 0.75px `color-rule` for minor.
- Hour numerals: Newsreader 11px italic, `color-text-dust`.
- Bg-ring: 10px stroke `color-rule`, r=132.
- Consumed arc: 10px stroke, color per variant, `stroke-linecap="butt"`, `transform="rotate(-90 180 180)"`.
- Projection arc: 10px stroke `color-ember`, `stroke-dasharray="4 6"`, opacity 0.55.
- Inner fiber arc: 2px stroke `color-ochre` on 2px `color-rule` track at r=112.
- Now-indicator: filled triangle, `color-text-ivory`, 12px wide × 12px tall, rotates around center by `nowIndicatorAngle`.
- Center block (stacked):
  - Calorie value: Newsreader 300 at `text-cal-hero` (82px desktop / 64px tablet / 48px mobile), `color-text-ivory`, `font-variant-numeric: tabular-nums lining-nums`. Comma separator via `toLocaleString('en-US')`.
  - Fraction label: Newsreader 400 italic 14px `color-text-sand`: `"of {target.toLocaleString()} kcal"`.
  - Sub-label: Inter 500 10.5px UPPERCASE `color-text-dust` tracking `tracking-caps-loose`: `"calories, logged today"`.
  - Delta line: Newsreader 400 italic 13px `color-text-sand`: `"{remain} remain · {remainCopy}"` where `remainCopy` is one of `plenty of room` / `a measured margin` / `past the mark`.
- Footer annotations (below ring, not inside SVG): Inter 500 10.5px UPPERCASE `color-text-dust`; 3 items separated by `color-rule` hairline: `{entryCount} entries` · `{pctOfTarget}% of daily target` · `{lastLoggedAt} last logged`. Hides `lastLoggedAt` when null.

**Responsive behavior.**
- **375px.** Ring 200×200. Stroke 10px. Hour numerals render but at 9.5px. Center cal-hero 48px. Footer annotations wrap to 2 rows.
- **768px.** Ring 240×240. Stroke 10px. Center cal-hero 64px. Footer single row.
- **1280px.** Ring 280×280. Stroke 10px. Center cal-hero 82px. Footer single row with hairline rules between annotations.

**Motion spec.**
- On mount / on consumed update: consumed arc `stroke-dashoffset` animates from full circumference to the computed offset using `motion-chrono-draw` (600ms, `ease-ledger`). This is the named "ink settling" motion.
- On center-value change: cross-fade old number → new number via `motion-fade-ink` (220ms), never a count-up (per §8 brief).
- `way-over` variant: `motion-ember-pulse` on arc end-cap — opacity 0.55→1.0 on 4s loop; pulse uses `ease-ledger`.
- Now-indicator triangle: no animation; position changes on re-render only.
- `prefers-reduced-motion` → instant final state (no arc draw, no cross-fade on number change, no ember pulse). Matches Agent 1 reduced-motion contract.

**Accessibility notes.**
- Ring wrapper has `role="img"` and `aria-label` summarizing the state: `"{consumed} of {target} calories logged today, {pctOfTarget} percent of target, status {status}"`.
- SVG decorative elements (compass circles, tick marks) have `aria-hidden="true"`.
- `state="empty"` CTA is an actual `<button>` overlaying the ring center with visible focus ring; keyboard users can Tab to it. Activating it opens log flow (same as FAB).
- Status color is never the only signal — center delta copy changes per variant.
- Inner fiber arc status is exposed via title in the aria-label only if fiberTarget > 0: `"Fiber {fiberConsumed} of {fiberTarget} grams"`.

**Data contract.**

```ts
// Server-computed in Dashboard RSC from today's food_entries aggregation.
// consumed: SUM(items.kcal) across all entries for today in user TZ
// fiberConsumed: SUM(items.fiber_g)
// nowIndicatorAngle: (currentHourInUserTZ * 30) - 90  // 12 hours mapped to 360deg, rotated so hour 0 is top
// status: derived from consumed/target ratio; match §8 brief thresholds
// lastLoggedAt: formatted at server using user TZ
```

---

## Macro Bars

**Purpose.** Three horizontal bars stacked below the chronometer (desktop column-1 stack, mobile single column) showing today's Protein / Carbs / Fat consumed-vs-target. Each bar reuses The Ledger's ruled newspaper-column vocabulary — a track hairline with an inked fill that "bleeds" over the boundary.

**Variants.**
- `default` — fill color per macro: Protein `color-text-ivory`, Carbs `color-ochre`, Fat `color-ember`.
- `on-target` — within ±5% of target for that macro; 2px `color-moss` outline around the bar track.
- `over` — >105% of target; fill color for that bar swaps to `color-oxblood`; `m-pct` label in `color-oxblood`.
- `under` — <50% of target at end of day; fill stays macro-color but at 50% opacity (evening-only signal; hidden during the day).

**States.** `default`, `loading` (skeleton bars — 8px `color-rule-strong` tracks with no fill, mono `—` in the value slot), `error` (one line error under the stack; bars render as tracks only with values in `—`).

**Props interface.**

```ts
interface MacroBarsProps {
  protein: { consumedG: number; targetG: number };
  carbs:   { consumedG: number; targetG: number };
  fat:     { consumedG: number; targetG: number };
  showUnderFlag: boolean;                  // server-passed — true only after user's local 18:00
  state?: 'default' | 'loading' | 'error';
}
```

**Visual spec.**
- Three rows, `gap: 14px` between rows.
- Per row — three columns (label+pct head, value, bar):
  - `m-head`: flex row, space-between.
    - `m-name`: Inter 500 10.5px UPPERCASE `color-text-dust` tracking `tracking-caps-loose`. Copy: `Protein` / `Carb.` / `Fat`.
    - `m-pct`: Inter 500 10.5px UPPERCASE `color-text-sand` tracking 0.14em, mono-like feel via `font-variant-numeric: tabular-nums`. `{pct}%`.
  - `m-val`: Newsreader 300 at 28px `color-text-ivory`, tabular lining, with trailing `tg` span (Newsreader 400 italic 14px `color-text-sand`) for `/ {target}g`.
  - `m-bar`: 8px track, `color-rule-strong` bg. Inner `<span>` fill at computed width%, color per variant. Track has 1px `color-rule` top border to produce the "ink bleed" effect where fill meets track boundary.
- Row divider: dotted 1px `color-rule` between rows (optional — off by default per `default` variant; on for `--editorial-strict` styling flag).

**Responsive behavior.**
- **375px.** Stack rows full width. `m-head` and `m-val` on separate lines above bar. Bar always full content-width. `m-name` wraps if extremely long (shouldn't).
- **768px.** Two-column inside each row: left column = `m-head` + `m-val` stacked; right column = bar occupying 60% width. Same 8px bar height.
- **1280px.** Single-row-per-macro: `m-head` (fixed 140px) + `m-val` (fixed 120px) + `m-bar` (flex-grow). Bar height 8px.

**Motion spec.**
- On mount / on value change: fill `width` transitions via `motion-rule-draw` (320ms, `ease-ledger`) — the bar appears to "ink in" from left.
- On variant change `default → over`: fill color cross-fades via `motion-fade-ink` (220ms).
- On variant change `default → on-target`: outline fades in via `motion-fade-ink` (180ms).
- `prefers-reduced-motion` → width transition is instant; color swap is instant.

**Accessibility notes.**
- Each bar is a `<div>` with `role="meter"` + `aria-valuenow={consumedG}` + `aria-valuemin={0}` + `aria-valuemax={targetG}` + `aria-label="Protein, 103 grams of 140 target, 74 percent"`.
- Variant-driven color is never the only signal: `on-target` has outline, `over` has color + `!` glyph prefix on `m-pct` (design-doc §8 error convention reused for "over" warning), `under` has 50% opacity + `"low"` sr-only suffix.
- Focus not applicable — bars are non-interactive.

**Data contract.**

```ts
// Aggregated server-side from today's food_entries.items[]
// per macro: SUM(portion_g * per_100g_macro / 100) across all items
// showUnderFlag: currentHourInUserTZ >= 18
```

---

## Meals Bulletin

**Purpose.** The day's entries, rendered as a five-column newspaper bulletin (Breakfast / Lunch / Dinner / Snacks / Drinks). Each column has a kicker section header, a time-range label, and a stack of entry rows. Entry rows show food name (italic serif), portion (mono), macro breakdown + kcal. Empty columns prompt for a log action. This is the dashboard's primary reading surface.

**Variants.**
- `default` — 5 columns all populated.
- `dinner-pending` — the pending meal column renders empty-state entry (`"No entry yet."` + suggested kcal italic) instead of the add-entry CTA alone.
- `compact` — tablet breakpoint: 2 columns per row, 3 rows total (Snacks + Drinks combine on last row).
- `stacked` — mobile: single column, all 5 meal sections stacked vertically with collapsible empty sections.

**States.** `default`, `loading` (5 column skeletons with 2–3 ghost entries each), `error` (inline error at bulletin-head; columns show `"COULDN'T LOAD ENTRIES"` placeholder), `empty` (onboarding edge — no entries at all today; single full-width card with `"NO ENTRIES YET"` kicker + `"LOG FIRST MEAL"` oxblood button inside the bulletin region).

**Props interface.**

```ts
type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'drinks';

interface MealsBulletinEntry {
  id: string;                              // food_entries.id
  clientId: string;                        // food_entries.client_id (for undo idempotency)
  displayName: string;                     // food name, rendered italic serif
  portionLabel: string;                    // e.g. "280 g · bowl" or "240 ml · no sugar"
  kcal: number;
  macrosShort: { p: number; c: number; f: number };  // grams, integer-rounded
  loggedAtHHmm: string;                    // 'HH:MM' in user TZ
  thumbnailUrl: string | null;             // photo-sourced entries only
}

interface MealsBulletinColumn {
  category: MealCategory;
  displayLabel: string;                    // 'Breakfast'
  totalKcal: number | null;                // null = pending
  timeLabel: string;                       // '06·42' or 'pending' or '15·24 · & · 18·10'
  entries: MealsBulletinEntry[];
  suggestedKcal?: number;                  // when entries empty + past meal time
}

interface MealsBulletinProps {
  date: string;                            // 'YYYY-MM-DD' in user TZ
  dateRangeLabel: string;                  // 'recorded 06:42 → 21:47'
  columns: MealsBulletinColumn[];
  onEntryClick: (entryId: string) => void; // opens food detail sheet (Agent 5)
  onEntryContextMenu: (entryId: string, anchor: { x: number; y: number }) => void;
  onAddToMeal: (category: MealCategory) => void; // opens log flow (Agent 4) pre-filled with meal category
  onCopyYesterday: () => void;             // header CTA when entire day empty
  state?: 'default' | 'loading' | 'error' | 'empty';
}
```

**Visual spec.**
- `bulletin-head` row above the grid:
  - `bulletin-title`: Newsreader 300 at `text-section-title` (44px desktop / 32px tablet / 28px mobile) — `The day's entries` with `entries` in italic `color-text-sand`.
  - `bulletin-sub`: Newsreader 400 italic 16px `color-text-sand` with em-dashes — `"— five meals, in order of their taking —"`.
  - `bulletin-date`: JetBrains Mono 400 11px `color-text-dust` right-aligned, `dateRangeLabel`.
  - Full hairline `color-rule-strong` below head.
- `meals-grid`: CSS grid, 5 columns × 1 row (desktop), with vertical column rules (`border-left: 1px color-rule` on all columns after the first).
- Per column:
  - `meal-head` row — space-between:
    - `meal-name`: Newsreader 300 at 24px `color-text-ivory`.
    - `meal-kcal`: Newsreader 400 italic 14px `color-text-sand` tabular lining. Shows `—` when `totalKcal === null`.
  - `meal-time`: JetBrains Mono 400 11px `color-text-dust` tracking 0.1em on its own row; hairline `color-rule` below.
  - Section header as drawn: Inter 500 10.5px UPPERCASE `color-text-dust` right-aligned with a horizontal rule extending to column edge on the left (a real `<hr>` styled as hairline — this is the "kicker" pattern from §8).
  - `entry` rows (stacked `gap: 14px`):
    - `e-name`: Newsreader 400 italic 18px `color-text-ivory` (15px mobile). Italic signals food name.
    - `e-portion`: JetBrains Mono 400 11px `color-text-dust` tracking 0.08em.
    - `e-foot`: flex row space-between. Left: Inter 500 10.5px UPPERCASE `color-text-sand` tabular `"P {p} · C {c} · F {f}"`. Right: Newsreader 400 italic 14px `color-text-sand` tabular `"{kcal} kcal"`.
    - 1px dotted `color-rule` divider between entries inside a column.
  - `add-entry` affordance at column bottom: Inter 500 10.5px UPPERCASE `color-oxblood-soft` tracking 0.18em with `+` prefix: `"+add to breakfast"`. 44×32 min tap target. Hover swaps `color-oxblood`.

**Interactions.**
- Tap/click on entry → `onEntryClick(id)` — opens food detail sheet (owned by Agent 5). Desktop: slide right-side panel; mobile: full sheet from bottom.
- Long-press (touch) OR right-click OR hover `⋯` button (desktop 44×44 button top-right of entry) → `onEntryContextMenu` → tonal menu with Edit / Delete / Copy to today.
- Delete → triggers undo toast (owned by Agent 4 undo system; this component emits `delete` intent; optimistic removal via Zustand).
- `add-entry` click → `onAddToMeal(category)` — opens log flow with `meal_category` pre-filled.

**Responsive behavior.**
- **375px (mobile).** 1 column. All 5 meal sections stacked vertically (`stacked` variant). Empty sections collapse to kicker + one-line `"— none —"` that expands on tap. Entry name drops to 15px; portion and macros stay mono 11px. `bulletin-sub` line hides (edition line above masthead provides sufficient context).
- **768px (tablet).** 2-column grid via `grid-template-columns: 1fr 1fr`. Breakfast | Lunch first row; Dinner | Snacks second row; Drinks full-width third row. Column rules drawn.
- **1280px (desktop).** 5-column grid. Full column rules. Entries render at full 18px serif. `bulletin-sub` visible.

**Motion spec.**
- On mount: entries fade in sequentially `motion-fade-ink` (220ms, `ease-ledger`) with 40ms stagger per entry across the whole bulletin (up to 20 entries; then stagger caps).
- On delete (post undo grace period): entry row fades out via `motion-fade-ink` + row height collapses via `ease-ledger` 220ms.
- On context menu hover (desktop): `⋯` button opacity 0→1 over 120ms.
- `prefers-reduced-motion` → no stagger, no height collapse (instant remove after undo grace).

**Accessibility notes.**
- Each meal column is a `<section aria-labelledby="meal-head-{category}">`.
- Each entry is an `<article>` with `aria-label="{displayName}, {portionLabel}, {kcal} kilocalories, logged at {loggedAtHHmm}"`.
- Context menu follows ARIA menu pattern: `role="menu"`, menu items as `role="menuitem"`, arrow-key navigation, Escape closes.
- `add-entry` is a `<button>`, not a link.
- Empty-column placeholder italic text is real text content, not decorative — screen readers announce `"No entry yet."`.
- Focus outline `focus-ring` token on all interactive elements including entry row (entries are clickable).
- Delete action requires intent confirmation via undo toast; no double-confirm needed because undo restores.

**Data contract.**

```ts
// Server-fetched via Cache Components keyed on user:${uid}:entries:${day}
// Columns derived by grouping food_entries WHERE DATE(logged_at AT TIME ZONE tz) = today
//   GROUP BY meal_category
// timeLabel: first HH·MM if 1 entry; 'first · & · last' if multiple; 'pending' if empty and meal time has not elapsed
// macrosShort: rounded to nearest integer; entry.items[] totals reduced per-entry
```

---

## Water Tracker

**Purpose.** Horizontal strip of water bullets showing today's water intake against a daily goal. One of the three documented zero-radius exceptions (alongside the chronometer ring and data points). Two quick-add affordances (`+GLASS` / `+BOTTLE`) plus a correction affordance. Optimistic mutation — emits an add event and renders the new bullet immediately; undo toast owned by Agent 4.

**Variants.**
- `default` — consumed < target; bullets show filled count + empty count.
- `on-target` — consumed ≥ target (all bullets filled); adds a subtle `color-moss` dot indicator in the header (`"ON TARGET"` Inter 10.5 UPPERCASE).
- `half-state` — last logged unit was a `+GLASS` partial (250ml) that lands mid-bullet; one bullet renders as `half` (50% fill from bottom).
- `custom-goal` — target_ml from profile instead of default 2000ml; bullet count adjusts (min 4, max 16 — clamped for layout).

**States.** `default`, `loading` (8 outline bullets, no fills, mono `— of — ml` in meta), `error` (inline error below; bullets render as outlines only; actions disabled), `offline-pending` (mono `QUEUED` chip on most-recent bullet until server confirms).

**Props interface.**

```ts
interface WaterTrackerProps {
  consumedMl: number;
  targetMl: number;                        // default 2000, overridable in settings
  bulletCount: number;                     // derived: Math.min(16, Math.max(4, Math.ceil(targetMl / 250)))
  bulletsFilled: number;                   // computed client-side: Math.floor(consumedMl / bulletUnitMl)
  bulletsHalf: boolean;                    // true if remainder > 100ml
  entries: Array<{                         // for undo LIFO + audit
    id: string;
    clientId: string;
    ml: number;
    loggedAt: string;
  }>;
  onAddGlass: () => Promise<void>;         // +250ml optimistic mutation
  onAddBottle: () => Promise<void>;        // +500ml optimistic mutation
  onCorrect: () => void;                   // opens correction dialog (delete most-recent, or manual edit)
  state?: 'default' | 'loading' | 'error';
}
```

**Visual spec.**
- Card wrapper: `bg-1` with `color-rule-strong` border (shared card pattern from Agent 1).
- Header row `eyebrow` — Inter 500 10.5px UPPERCASE tracking 0.22em `color-text-dust`: left `"the water column"`, right `"{bulletsFilled} of {bulletCount}"` in `color-ochre` when <100%, `color-moss` at 100%, `color-oxblood` if over.
- Optional literary caption: Newsreader 400 italic 14px `color-text-sand` one-line descriptor (shown on desktop only, a rotating set of phrases server-picked, e.g., `"Five glasses on record; three yet to be drawn."`). Non-critical; can ship flag-gated.
- `water-row`: flex row `gap: 10px`, bullets + right-aligned meta.
  - Each bullet: 16px circle (zero-radius exception). Empty: 1.5px `color-rule-strong` stroke, transparent fill. Filled: `color-oxblood` fill, no stroke. Half: `color-oxblood` fill mask with `clip-path: inset(50% 0 0 0)` to fill bottom half only.
  - Meta block right-aligned: `amount` (Newsreader 300 28px `color-text-ivory` tabular, e.g. `"1.4"`) + trailing `L` unit (JetBrains Mono 12px `color-text-dust`). Below: `goal` in JetBrains Mono 11px `color-text-dust` — `"goal · 2.0 L"`.
- `water-actions` row: 3 chip buttons, 44×32 min.
  - `chip` button: 1px `color-rule-strong` border, zero-radius, padding `6px 12px`, Inter 500 10.5px UPPERCASE `color-text-sand` tracking 0.18em.
  - `+` prefix: JetBrains Mono 12px `color-oxblood` with `6px` right-margin.
  - Copy: `"+ Glass · 250 ml"`, `"+ Bottle · 500 ml"`, `"Correct"`.
  - Hover: border swaps `color-oxblood`, text `color-text-ivory`, 120ms transition (`motion-fade-ink`).
  - Focus: 2px `color-text-ivory` outline offset-2.

**Responsive behavior.**
- **375px.** Bullets row wraps to 2 rows if bulletCount > 8. Meta block moves below bullet row (right-aligned on its own row). Action chips stack vertically full-width with 8px gap (min 44×44 tap).
- **768px.** Single row for bullets + meta. Action chips single row.
- **1280px.** Single row for bullets + meta. Action chips single row. Literary caption visible.

**Motion spec.**
- On `+GLASS` / `+BOTTLE` click: the new bullet (or bullets for +500ml filling two 250ml units) animates fill using `motion-ember-pulse` (350ms) — bullet outline shrinks to filled disk, with a 1-frame ember flash at the moment of fill, settling to `color-oxblood`.
- Consumed number ticks via `motion-fade-ink` cross-fade (220ms).
- On server error rollback: bullet fades back to outline via `motion-fade-ink` (220ms); undo toast (Agent 4) surfaces the failure.
- `prefers-reduced-motion` → instant fill; no ember flash; cross-fade still applies (fade-only is the reduced-motion contract from Agent 1).

**Accessibility notes.**
- Water row is a `<div role="group" aria-label="Water intake, {consumedMl} milliliters of {targetMl}">`.
- Each bullet is `aria-hidden="true"` decoration; a single sr-only summary serves screen readers.
- Action chips are `<button>` with explicit labels: `"Add glass, 250 milliliters"`, `"Add bottle, 500 milliliters"`, `"Correct latest water entry"`.
- Bullet color alone is never the only signal — header `"{filled} of {count}"` and numeric `"{consumedMl}ml"` provide textual redundancy.
- After a successful add, `aria-live="polite"` status announces `"{newTotal} milliliters logged"`.

**Data contract.**

```ts
// Client: optimistic mutation via Zustand useUndoQueueStore + TanStack-style mutation handler
// POST /api/water/log with { client_id, ml, logged_at }
// Server: inserts water_log row, updateTag(['user:${uid}:entries:${day}']); idempotent replay on duplicate client_id returns 200 no-op
// consumedMl: SUM(ml) from water_log WHERE DATE(logged_at AT TZ) = today
// bulletUnitMl: server-fixed 250ml (bullet granularity) — NOT user-configurable in MVP
```

---

## Micronutrient Panel

**Purpose.** Compact audit of today's micronutrients (min 7, max 10 visible + overflow disclosure) with percent-of-daily-value readouts. Dust-quiet by default — readers scan for the low/over colored rows. Membership list is derived per design-doc §10.4 (union of micros present in last 7 days of entries; priority sorted: protein > iron > vitamin D > vitamin C > calcium > fiber > rest alphabetical; priority constant at `lib/nutrition/display-micros.ts`).

**Variants.**
- `default` — rendered rows in priority order, mixed status colors.
- `sparse-data` — fewer than 3 distinct micros in last 7 days → shows `"INSUFFICIENT DATA"` empty-state inline.
- `over-flagged` — any row >200% DV gets an `over` status; row label gains `!` glyph prefix in `color-oxblood-soft`.
- `overflow` — more than 7 micros qualify; first 7 visible + `"+ {n} MORE"` disclosure button.

**States.** `default`, `loading` (7 ghost rows, track outlines only), `error` (inline: `"COULDN'T LOAD MICROS"`), `empty` (see `sparse-data` variant).

**Props interface.**

```ts
type MicroStatus = 'low' | 'mid' | 'good' | 'over';

interface MicroRow {
  name: string;                            // 'Fibre' | 'Iron' | 'Vitamin D' ...
  amount: number;                          // consumed amount in display unit
  unit: string;                            // 'g' | 'mg' | 'µg' | 'IU'
  dvPct: number;                           // 0–300+; clamped for track fill at 100
  status: MicroStatus;                     // server-computed from dvPct thresholds
}

interface MicronutrientPanelProps {
  micros: MicroRow[];                      // pre-sorted by priority
  visibleCount: number;                    // default 7; bump to 10 when desktop
  onShowMore?: () => void;                 // expands to 10 or opens overflow sheet
  state?: 'default' | 'loading' | 'error' | 'empty';
}
```

**Visual spec.**
- Panel wrapper: top border `1px color-rule` + 20px top padding; NOT a separate card on desktop — inlines into the right column card of the dashboard. On mobile it lives as its own card.
- `eyebrow` header: left `"Minor elements"`, right `"a daily audit"` — both Inter 500 10.5px UPPERCASE `color-text-dust`.
- `micro-list` — stack of rows, each row:
  - 3-column grid: `micro-name` | `micro-track` | `micro-pct`.
  - `micro-name`: Newsreader 400 italic 14px `color-text-ivory` (not caps — matches mockup's italic serif row names). Width fixed at 110px desktop / 90px mobile.
  - `micro-track`: 4px bar, `color-rule` background, full row width. Inner `<span>` fill at `dvPct%` (clamped 0–100), color per status: `low` → `color-oxblood`, `mid` → `color-ochre`, `good` → `color-moss`, `over` → `color-oxblood-soft`.
  - `micro-pct`: JetBrains Mono 400 11px tabular, right-aligned, 40px fixed width. Color per status: `good` → `color-text-sand`, `low`/`over` → `color-oxblood-soft`, `mid` → `color-text-dust`.
  - 1px `color-rule` divider between rows; last row no divider.
- `over` row: `name` gets `!` glyph prefix (JetBrains Mono 11px `color-oxblood-soft`, 4px margin-right).
- `sparse-data` empty: single row, Newsreader 400 italic 14px `color-text-sand`: `"Insufficient data — log 3+ days to see micros."`.
- `overflow` disclosure: Inter 500 10.5px UPPERCASE `color-oxblood-soft` tracking 0.18em button below list: `"+ {n} MORE ELEMENTS"`.

**Responsive behavior.**
- **375px (mobile).** 2-column grid (name on one row, track + pct on next), `visibleCount: 6`. Name font 14px italic. Track height 4px. Overflow shows `"+ N MORE"` that opens a full-screen sheet.
- **768px (tablet).** 3-column grid as default, `visibleCount: 8`.
- **1280px (desktop).** 3-column grid, `visibleCount: 10`. Overflow not usual at desktop (list generally fits).

**Motion spec.**
- On mount: rows fade in top-to-bottom via `motion-fade-ink` (220ms each) with 50ms stagger — matches heatmap row-by-row reveal spirit from §8 brief.
- On value update (e.g., after a new entry saved): affected row's track fill transitions width via `motion-rule-draw` (320ms).
- Overflow expand: new rows fade + height grows via `ease-ledger` 220ms.
- `prefers-reduced-motion` → no stagger; no height animation on overflow expand.

**Accessibility notes.**
- Panel is `<section aria-labelledby="micros-header">`.
- Each row is a `<div role="meter" aria-valuenow={dvPct} aria-valuemin={0} aria-valuemax={100} aria-label="{name}, {amount}{unit}, {dvPct} percent of daily value, status {status}">`.
- Status color never the only signal: `over` has `!` glyph; `low` has `color-oxblood` pct number which is perceptually distinct; per-row `aria-label` carries the status word explicitly.
- `"+ N MORE"` is a `<button>` with `aria-expanded` and `aria-controls`.
- Italic row names pass WCAG contrast at 14px `color-text-ivory` on `bg-1` (`>14:1`).

**Data contract.**

```ts
// Server: aggregate today's food_entries.items[] micros.
// Membership: distinct names from last 7 days' entries, priority-sorted per lib/nutrition/display-micros.ts.
// dvPct: amount / daily_value * 100; thresholds: low <50, mid 50-79, good 80-150, over >200
// (150-200 is still 'good' — the "over" status is for clinical over-intake warning only)
```

---

## Weekly Insight Card

**Purpose.** The AI-penned weekly review surface embedded on the dashboard — rendered as a pull-quote styled "From the Editor" section with oxblood drop cap on the first letter. Primary dashboard CTA to the full review page (owned by Agent 6). Renders as a PPR Suspense island so the dashboard's first paint never blocks on Gemini; skeleton shows first, hydrates with server-fetched insight. Per design-doc §8 the drop cap is used ONCE across the entire app — here.

**Variants.**
- `fresh` — generated_at within 7 days → full pull-quote visible with drop cap + byline + read-time.
- `stale` — >7 days since last generation → replaces pull-quote with a single-line prompt and `"GENERATE WEEKLY REVIEW"` oxblood button; clicking triggers server regeneration.
- `sparse-data` — per design-doc §18 F-mode (aka F9 Weekly Review Sparse Data fallback) → renders `"Need 3+ days of logging for insights"` italic + disables button.
- `generating` — after click, pull-quote region shows skeleton lines + `"DRAFTING..."` mono chip. Polls server or awaits Suspense resolve.

**States.** `default` (fresh), `loading` (skeleton shell — 4 hairline lines + drop cap placeholder), `error` (inline error inside card: `"COULDN'T DRAFT THIS WEEK — RETRY?"` oxblood button), `empty` (first-week user, 0 entries in first 7 days → hidden entirely).

**Props interface.**

```ts
interface WeeklyInsightCardProps {
  status: 'fresh' | 'stale' | 'sparse-data' | 'generating' | 'error';
  generatedAt: string | null;              // ISO string; used for "w/c DD Mon" label
  weekStartISO: string | null;             // 'YYYY-MM-DD' monday of the week under review
  insights: string[];                      // when fresh: 3-5 paragraphs/bullets from Gemini; first paragraph gets drop cap
  readTimeSeconds: number | null;          // computed server-side from word count
  onGenerate: () => Promise<void>;         // regeneration trigger for stale / error
  onViewFull: () => void;                  // routes to /progress?tab=weekly or weekly detail per Agent 6
}
```

**Visual spec.**
- Card: `bg-2` inset surface, 2px-tall `color-oxblood` left-side hairline rule (the section signature — distinguishes this card from regular `bg-1` cards). 1px `color-rule-strong` right/top/bottom borders. Zero radius.
- `eyebrow` row: `"from the editor"` left, `"weekly note"` right — Inter 500 10.5px UPPERCASE `color-text-dust` tracking 0.22em.
- `from` label: Inter 500 10.5px UPPERCASE `color-text-sand` tracking 0.2em — `"The week in review · w/c {weekStartShort}"`.
- `pull-quote` block:
  - First paragraph rendered with drop cap: first letter in Newsreader 300 48px `color-oxblood`, 3-line float-left, margin-right 12px, baseline aligned to second line.
  - Body text: Newsreader 400 italic 18px `color-text-sand` line-height 1.55, tracking -0.005em.
  - Subsequent paragraphs (if multi-paragraph): Newsreader 400 italic 16px `color-text-sand`, no drop cap, 12px top margin.
  - Max-width `measure-long` (72ch) on desktop; fluid on mobile/tablet.
- `byline` row: Newsreader 400 italic 12px `color-text-dust`, space-between: left `"Penned by Kalori, resident model"` (`Kalori` italic); right `"read time · {readTimeSeconds}s"` mono (JetBrains Mono 400 11px).
- `stale` variant: replaces pull-quote with a single italic line `"A fresh review awaits your word."` + oxblood button `"GENERATE WEEKLY REVIEW"`.
- `sparse-data` variant: italic line `"Need 3+ days of logging this week for an insight."` no button.
- `generating` variant: skeleton: 4 hairline lines (varying widths) in `color-rule-strong`, drop cap placeholder as a 48px `color-rule-strong` block. Small mono chip below-right `"DRAFTING..."` with ellipsis that animates (opacity loop).
- `"VIEW FULL REVIEW →"` link at card bottom: Inter 500 10.5px UPPERCASE `color-oxblood` tracking 0.2em with `→` arrow (mono). Hover → `color-oxblood-soft`.

**Responsive behavior.**
- **375px.** Card full-width. Drop cap stays 48px but float limits to 2 lines (constrained by width). Body 16px italic. Byline wraps to 2 lines if needed.
- **768px.** Card full content-width. Drop cap 48px, 3-line float. Body 18px.
- **1280px.** Card full column-width. Drop cap 56px, 3-line float (slightly larger). Body 18px. `measure-long` (72ch) cap.

**Motion spec.**
- **PPR island boundary.** Card mounts with skeleton rendered by server; client receives hydration with final content. Transition from skeleton → content uses `motion-fade-ink` cross-fade (220ms).
- On `generating` click: skeleton appears via `motion-fade-ink` (180ms) replacing the previous content; `"DRAFTING..."` chip pulses opacity 0.4→1.0 on 1.2s loop.
- On `fresh` mount: drop cap fades in 120ms after body text (sequenced — letter lands like ink).
- Hover on `"VIEW FULL REVIEW →"` link: arrow translates `2px` right via `ease-ledger` 120ms.
- `prefers-reduced-motion` → no arrow translate, no pulse loop (opacity fixed at 0.85), no drop-cap sequence.

**Accessibility notes.**
- Card is `<article aria-labelledby="weekly-insight-header">`.
- Drop cap letter is part of the paragraph text (not decoration) — screen readers read it as the first letter of the sentence.
- `generating` state uses `aria-busy="true"` + `aria-live="polite"` so completion announces.
- `"GENERATE WEEKLY REVIEW"` and `"VIEW FULL REVIEW"` are real `<button>` / `<a>` with `focus-ring` token.
- `generating` chip has `role="status"`.
- Contrast: italic 18px `color-text-sand` on `bg-2` passes WCAG AA for body text ≥14px. Drop cap `color-oxblood` at 48px passes AA by size alone.

**Data contract.**

```ts
// Cache: ai_response_cache keyed (userId, 'weekly_review', weekStartISO, inputHash of entries-7d)
// Freshness: generated_at within 7 days → 'fresh'; else 'stale'
// Sparse-data: distinct days-logged in last 7 < 3 → status='sparse-data'
// Generation path: POST /api/ai/weekly-review → Gemini → ai_response_cache insert → ai_call_log insert (I2) → updateTag(['weekly-review:${uid}:${weekStartISO}'])
// Rendering: RSC fetches from cache table; no generation on dashboard paint (I7 — AI failure never blocks)
```

---

## Dashboard Page Composition

**Layout (desktop 1280+ canonical).** The dashboard page is a React Server Component with a 3-column grid `[sidebar 240px | center flex | right-panel 320px]`. Inside the center column:

1. **Masthead** (top, full-content-width spanning across both center + right).
2. **Section kicker** `§ 01 · TODAY'S INTAKE` (Inter UPPERCASE + Newsreader 32 italic date subtitle).
3. **Chronometer + Macros** in the left sub-column (stacked: chronometer on top, macros below).
4. **Water Tracker + Micronutrient Panel** in the right-panel column (stacked: water on top, micros below).
5. **Weekly Insight Card** in a third sub-column on ultra-wide; on standard desktop (1280–1519) it drops below macros to span the full center width.
6. **Meals Bulletin** — full-content-width below the 3-column row, spanning all columns.

**Layout (tablet 768–1279).** 2-column grid inside content area: left (chronometer + macros + meals bulletin as 2-col grid underneath) + right (water + micros + insight card stacked). Masthead stacks full width top.

**Layout (mobile 375–767).** Single column. Order: Masthead → Chronometer Ring → Macro Bars → Meals Bulletin (stacked vertical sections) → Water Tracker → Micronutrient Panel → Weekly Insight Card. Each section separated by a hairline rule with 32px vertical rhythm.

**RSC vs client islands (per design-doc §6, Approach C Hybrid).**
- **Server-rendered (Cache Components + PPR):** Masthead, Chronometer Ring, Macro Bars, Meals Bulletin (entries list), Micronutrient Panel, Weekly Insight Card (PPR dynamic island with its own Suspense boundary).
- **Client-interactive islands:**
  - **Water Tracker quick-add** — one of the 3 allowlisted optimistic-UX categories (design-doc §6). Client component wrapping the two quick-add buttons + bullet fill; mutates via `onAddGlass/onAddBottle` with `client_id` idempotency (I11). Reads server-hydrated state, writes optimistically, rolls back on server error.
  - **Weekly Insight regeneration trigger** — a small client island inside the otherwise-RSC Weekly Insight Card wrapping the `"GENERATE WEEKLY REVIEW"` button (stale / error states). On click, POSTs to `/api/ai/weekly-review`, shows `generating` skeleton, revalidates via `updateTag`.
  - **Meals Bulletin context menu + delete** — client island on entry-row hover/long-press for `⋯` menu and optimistic delete (feeds Agent 4's undo system).
- **Suspense boundaries.** Weekly Insight Card has its own Suspense so its Gemini latency does not block the primary dashboard paint. Chronometer + Macros + Meals + Water + Micros share a single Suspense (they all read from the same `user:${uid}:entries:${day}` cache tag — no independent latency).

**Cache tags consumed.**
- `profile:${uid}` — masthead greeting + edition number.
- `user:${uid}:entries:${day}` — chronometer, macros, meals bulletin, micronutrient panel (all derive from today's food_entries aggregation).
- `user:${uid}:water:${day}` — water tracker.
- `weekly-review:${uid}:${weekStartISO}` — weekly insight card.

**Offline behavior.** Dashboard renders fully from cache with service-worker stale-while-revalidate. Water tracker quick-add queues mutations into the offline outbox (per Task 5.1); the `OFFLINE · QUEUE N` chip appears in masthead when outbox non-empty.

**Keyboard shortcuts (per design-doc §9).** `/` focuses library search (global); `n` opens log flow (same as FAB); `g d` navigates to dashboard (no-op when on dashboard); `?` opens shortcut overlay. All shortcuts suspend while log flow modal is open.

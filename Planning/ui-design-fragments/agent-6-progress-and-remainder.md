## Progress Page Overview

The Progress surface is Kalori's **Almanac** — an analytical retrospective of the last 7, 30, 90, or 365 days. It replaces the dashboard's real-time chronometer with five ruled analytical sections whose signature piece is the **7-nutrient × N-day micronutrient heatmap**. The page is **Cache-Components-first**: shell + static sections render from server data keyed by `TAGS.userProgress(uid, range)`, and the **Weekly Review Island** renders as a dedicated PPR Suspense boundary that streams independently of the other sections.

- **Route:** `/progress` (app-shell protected; redirects to `/onboarding` if `profiles.onboarding_completed_at IS NULL`)
- **Rendering mode:** PPR shell + Cache Components per section. Each section is a Server Component with `'use cache'` + `cacheTag([TAGS.userProgress(uid, range)])`. Log/weight/water mutations call `updateTag(TAGS.userProgress(uid, range))` for all ranges active in the cache, invalidating in O(N) ranges = 4. This is cheap and predictable.
- **Cache key shape:** `TAGS.userProgress(uid, range)` where `range ∈ {'7d','30d','90d','1y'}` — documented in `lib/cache/tags.ts` (Agent 1 §9.3 I12).
- **Data contract:** each section fetches its own slice via Server Actions returning plain-object aggregates (no charts on server); the client `<Recharts />` components render pre-computed numeric arrays.
- **Auth:** protected by middleware (I6). Anonymous users hit the login redirect.
- **Accessibility baseline:** every chart ships a `<details><summary>Data table</summary>` drawer containing the raw numeric values in an accessible `<table>` (Agent 1 §7.9). Screen readers announce via `aria-describedby` linking chart SVG → table.

### Section order (top to bottom)

| # | Section | Kicker | Title | Data source |
|---|---|---|---|---|
| 1 | Range toolbar + masthead | `§ 04 · THE ALMANAC` | `Thirty days, in the aggregate` | — (header only) |
| 2 | Calorie Adherence | `§ 05 · CALORIE ADHERENCE` | `Calories, a ledger` | `food_entries` aggregated per day × `profiles.daily_kcal_target` |
| 3 | Macro Distribution | `§ 06 · MACRO COMPOSITION` | `Protein, carbohydrate, fat, by day` | `food_entries.items[].macros` summed per day |
| 4 | Weight Trajectory | `§ 07 · WEIGHT` | `A trajectory` | `weight_log` ordered by `date` |
| 5 | Water Adherence | `§ 08 · WATER` | `Adherence, by the glass` | `water_log` × `profiles.daily_water_target_ml` |
| 6 | Micronutrient Heatmap | `§ 09 · THE MINOR ELEMENTS` | `The minor elements, in thirty` | `food_entries.items[].micros` × DV targets |
| 7 | Weekly Review Island (conditional) | `§ 10 · FROM THE EDITOR` | `Week of 12 April 2026` | `weekly_reviews` (lazy, 7-day cache) |

---

## Progress Range Toolbar

A chip row at the very top of the page, under the masthead. Replaces the mockup's `Day / Week / Month / Year` segmented control with a Ledger-consistent pattern.

**Component:** `<ProgressRangeToolbar range='7d'|'30d'|'90d'|'1y' />` — Client Component (URL-synced).

### Visual spec

- **Layout:** `flex justify-between items-center border-b border-rule pb-6 mb-8`
- **Left side — range chips:** 4 chips in a flush group with 1px `rule-strong` border, zero gap between chips, 1px vertical `rule-strong` dividers between chips:
  - Each chip: `padding: 10px 22px`, `font-family: var(--font-sans)`, `font-size: 10.5px`, `letter-spacing: 0.2em`, `text-transform: uppercase`, `font-weight: 500`
  - **Inactive:** `color: var(--color-sand)`, `background: transparent`
  - **Active:** `color: var(--color-bg-0)`, `background: var(--color-ivory)` (inverted pattern — ivory fill with bg-0 text, matches mockup §4 toolbar)
  - **Hover:** `background: var(--color-bg-2)` (tonal only, no scale)
  - **Focus-visible:** 2px oxblood outline, 2px offset (§7.2 Agent 1)
- **Right side — range caption:** `font-family: var(--font-serif) italic`, `font-size: 15px`, `color: var(--color-sand)`
  - Format: `showing <span class="k">{startDate} → {endDate}</span> · {label}`
  - Where `<span class="k">` is `color: var(--color-ivory); font-style: normal`
  - Example: *showing* **20 Mar → 18 Apr** *· thirty days*

### Chip labels and dates

| Chip | URL param | Date range | Caption label |
|---|---|---|---|
| `7D` | `?range=7d` | `today - 6d` → `today` (user TZ) | `seven days` |
| `30D` (default) | `?range=30d` | `today - 29d` → `today` | `thirty days` |
| `90D` | `?range=90d` | `today - 89d` → `today` | `ninety days` |
| `1Y` | `?range=1y` | `today - 364d` → `today` | `three-sixty-five` |

### State + URL sync

- Range is held in URL search param (`?range=30d`); chips use `<Link />` to push state without losing scroll position.
- Default range: `30d` (matches mockup, matches heatmap signature view).
- URL-first so range survives refresh + is shareable; Zustand NOT used (server-state truth principle from Agent 1 §11).
- Each range click triggers PPR re-render of all 5 sections; Suspense boundaries keep shell visible while sections stream.

### Responsive behavior

- **Desktop (1280+):** Full toolbar on one row. Chip row left, caption right.
- **Tablet (768–1279):** Same; caption may wrap.
- **Mobile (375–767):** Caption hides (replaced by section-meta under masthead); chip row remains visible, full-width, chips stretch to equal widths. `7d` becomes the default on mobile (heatmap cell width constraint — see §Heatmap Responsive below).

### Accessibility

- Chip group wrapped in `role="tablist"`, each chip `role="tab"` with `aria-selected={active}`, and `aria-controls` pointing to the main chart region `id="progress-sections"`.
- Keyboard: Left/Right arrows navigate chips per WAI-ARIA Authoring Practices tablist pattern. Enter/Space activates.

---

## Section 1 — Calorie Adherence

**Component:** `<CalorieAdherenceChart range={range} data={...} />` — Server Component wrapping client `<Recharts />`.

### Visual spec

- **Container:** `.chart-card` — `border: 1px solid var(--color-rule-strong); background: var(--color-bg-1); padding: 24px` (mockup §4.1). Grid cell `1/1` (half-width on desktop).
- **Header row (`c-head`):** `display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid var(--color-rule); padding-bottom: 14px; margin-bottom: 18px`
  - **Left — title (`c-title`):** `font-family: var(--font-serif); font-size: 22px; font-weight: 400; color: var(--color-ivory); letter-spacing: -0.01em`. Title string: `Calories,` + `<span class="i">the last seven</span>` (or `thirty`, `ninety`, `year`). `.i` = `font-style: italic; color: var(--color-sand)`
  - **Right — meta (`c-meta`):** `font-family: var(--font-mono); font-size: 10.5px; color: var(--color-dust); letter-spacing: 0.04em`. Format: `target 2,180 kcal / day`
- **Chart area:** Recharts `<ComposedChart>` at `height: 220px; width: 100%`
- **Chart composition:**
  - **Bars (primary):** one `<Bar />` per day; `dataKey="kcal"`; color-coded by status:
    - On-target (≥ 80% and ≤ 105% of target): `fill: var(--color-moss)` (`#5C6B3D`)
    - Approaching (80–100% of target): `fill: var(--color-moss)` — single category with on-target
    - Over-target (> 105%): `fill: var(--color-oxblood)` (`#8A2A1F`)
    - Under-target (< 80%): `fill: var(--color-ochre)` (`#B8894A`)
    - **Today, in progress:** `fill: var(--color-moss)` + overlay dashed `stroke: var(--color-ember); stroke-dasharray: 3 3` for the projection portion (bar extended to projected end-of-day). Projection = current intake + average remaining-day delta over last 14 days.
  - **Target line:** `<ReferenceLine y={target} stroke='var(--color-sand)' strokeWidth={0.75} strokeDasharray='4 4' label={{ value: 'target · 2,180', position: 'right', fill: 'var(--color-sand)', style: { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11 } }} />`
  - **Y-axis ticks:** 5 grid lines, labels `font-family: var(--font-mono); font-size: 9px; color: var(--color-dust-2)`; values: `target ± 800 / ± 400 / target / -400 / -800` (auto-ranged)
  - **X-axis labels:** mono 9px `color: var(--color-dust)`; format: `S · 12` (weekday letter + day number). Today: `color: var(--color-ivory)` (bolder).
  - **Value labels atop bars:** `font-family: var(--font-serif); font-size: 11px; color: var(--color-sand)`; today = italic `color: var(--color-ember)` for projection
- **Legend (`c-legend`):** below chart, `display: flex; gap: 18px; margin-top: 14px; font-family: var(--font-mono); font-size: 10.5px; color: var(--color-dust)`. Each entry has a 10×2px color swatch `<i></i>`:
  - `<i style='background: var(--color-moss)'></i> on target`
  - `<i style='background: var(--color-oxblood)'></i> over target`
  - `<i style='background: var(--color-ochre)'></i> under target`
  - `<i style='background: var(--color-ember); border-top: 1px dashed var(--color-ember); height: 0'></i> projected, remainder of day`
- **Summary stat (below legend):** `font-family: var(--font-serif); font-size: 14px; color: var(--color-ivory); .num`. Example: `avg 2,040 kcal · on target 5 of 7 days`. The adherence count uses the on-target band (80–105%).

### States

| State | Trigger | Visual |
|---|---|---|
| **Loading** | PPR Suspense pending | Skeleton: 7 grey bars at 40% opacity on `bg-2`; header text visible. `animation: ink-fade 120ms` |
| **Empty — 0 days logged** | `data.length === 0` | Italic serif centered `color: var(--color-sand)` 15px: *Nothing to chart yet. Log a meal to begin the record.* + oxblood CTA: `BEGIN LOGGING →` |
| **Empty — < 3 days** | `data.length < 3` | Banner at top of card: *`§ SPARSE DATA · at least three days produces a reading`* (italic serif 14px sand) + still renders bars for available days + hides averaged stat line |
| **Today-only** | Only today has data, in progress | Renders single bar with dashed ember projection; no adherence count (“—” placeholder) |

### Hover / focus (interaction)

- **Bar hover:** `fill-opacity: 0.9`; show tooltip (Recharts `<Tooltip />`) positioned above bar:
  - Tooltip container: `background: var(--color-bg-1); border: 1px solid var(--color-rule-strong); padding: 10px 12px; color: var(--color-ivory); font-family: var(--font-serif); font-size: 13px`
  - Content: 1) day/date (`font-family: var(--font-mono); color: var(--color-dust); font-size: 10.5px`), 2) kcal value (`font-family: var(--font-serif); font-size: 16px`), 3) delta vs target (`color: var(--color-sand); font-size: 11px`, mono delta: `-140 kcal · under`)
- **Keyboard focus:** Arrow Left/Right moves the hover selector bar-by-bar; tooltip announced via `aria-live="polite"` on a visually-hidden companion region.

### Accessibility

- Chart has `role="img"` + `aria-label="Calorie adherence, last 30 days, averaged 2,040 kcal per day, on target 5 of 7 days."`
- Companion `<details>` drawer below legend: `<summary>View as table</summary>` → `<table>` with columns **Date · Kcal logged · Target · Delta**. Passes axe-core.
- `prefers-reduced-motion`: bar animations disabled (instant render).

---

## Section 2 — Macro Distribution

**Component:** `<MacroDistributionChart range={range} data={...} />` — stacked bar; one bar per day.

### Visual spec

- **Container:** `.chart-card` full-width (`grid-column: 1 / -1` on desktop).
- **Header:** same pattern as §1
  - Title: `Protein, carbohydrate, fat,` + `<span class="i">by day</span>`
  - Meta: `expressed as grams · target {protein}g / {carbs}g / {fat}g`
- **Chart:** Recharts `<BarChart stackOffset='none'>` with three stacked `<Bar />` series — one per macro. `height: 180px; width: 100%`.
- **Stack order (bottom → top):** Protein → Carbs → Fat. Tokens per Agent 1 §2.2:
  - Protein: `fill: var(--color-ivory)` — primary macro gets strongest color (note: Agent 1 §2.2 maps protein to ivory; the mockup uses oxblood — **reconciliation:** this fragment defers to Agent 1's token assignment; if main-agent sees conflict, ivory wins per Agent 1 single-source-of-truth §2.2)
  - Carbs: `fill: var(--color-ochre)` (`#B8894A`)
  - Fat: `fill: var(--color-ember)` (`#C8693B`)
- **Target reference lines:** two horizontal `<ReferenceLine />`s at cumulative target grams (protein target, protein+carbs target), `stroke: var(--color-ivory); strokeWidth: 0.5; strokeDasharray: 3 3; opacity: 0.4`
- **X-axis:** mono 9px day labels (same format as §1)
- **Y-axis:** grams (ticks every 50g), mono 9px `var(--color-dust-2)`
- **Legend + trend sentence:** legend entries + right-aligned italic serif commentary (*— fat has drifted 7pt above target, three weeks running.*). Commentary is **derived server-side** from simple linear-regression on macro % over range; not AI-generated (avoids Gemini cost per render). Template: `— {macro} has {drifted | held | declined} {delta}pt {above | below | near} target, {duration} running.` Null if no clear trend.
- **Summary stat:** `avg protein {p}g · carbs {c}g · fat {f}g · calories {total}` (`.num font-variant-numeric: tabular-nums`)

### States + interaction

Same loading, empty, sparse, hover patterns as §1. Tooltip on bar hover shows full macro breakdown for that day: `Protein 110g · Carbs 245g · Fat 68g · Total 2,040 kcal`.

### Responsive

- Desktop: 30 bars in one row (30d range). Bar width auto-sized via `barCategoryGap='4'`.
- Tablet: same but reduced height (`160px`).
- Mobile: 7d default shows 7 wide bars. 30d on mobile: chart scrolls horizontally inside container (`overflow-x: auto`) with scroll indicator hairline below. Each bar min-width: 16px.

---

## Section 3 — Weight Trajectory

**Component:** `<WeightTrajectoryChart range={range} data={...} profile={...} />`

### Visual spec

- **Container:** `.chart-card`; half-width on desktop (`grid-column: span 1`).
- **Header:**
  - Title: `Weight,` + `<span class="i">a trajectory</span>`
  - Meta: `{startWeight} → {currentWeight} kg · {delta} over {range}` — example `82.4 → 78.9 kg · −3.5 over 30 d`. Unit respects `profiles.weight_unit` (`kg | lb`).
  - **Inline quick-add (right of meta):** `+ LOG WEIGHT TODAY` — `color: var(--color-oxblood-soft); font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; border-bottom: 1px solid var(--color-oxblood-soft)`. Tapping opens weight-log drawer (per Agent 3's weight-log affordance).
- **Chart:** Recharts `<LineChart>` at `height: 220px`
  - **Line (measured):** `stroke: var(--color-oxblood); strokeWidth: 1.5px`; **no area fill** (reserved for adherence — keep weight chart clean)
  - **Dots (logged days):** `r={2.5}; fill: var(--color-ivory); stroke: var(--color-oxblood); strokeWidth: 1.5px`. Today dot: `r={4}; fill: var(--color-oxblood); stroke: var(--color-ivory); strokeWidth: 2px` (emphasized)
  - **Trend line (linear regression):** dashed `stroke: var(--color-dust); strokeDasharray: '4 4'; strokeWidth: 0.75px; opacity: 0.5`. Rendered only when ≥ 5 data points; else hidden. Client-side OLS (ordinary least squares) from the data array.
  - **Goal line:** horizontal `<ReferenceLine />` at `profiles.goal_weight_kg`; `stroke: var(--color-ochre); strokeWidth: 0.75px; strokeDasharray: '2 3'`; label right: *goal · {value}* (italic serif 11px `var(--color-ochre)`)
  - **Projection (dashed ember):** dashed `stroke: var(--color-ember); strokeDasharray: '4 4'; strokeWidth: 1.5px` — projects from most-recent measurement to the goal line along the trend regression slope. Capped at 180 days forward. Label at end: *est. {date}*.
  - **Annotation callout:** at today's dot, a 0.5px dust leader line drawn to an italic serif label `today · {value}` (12px ivory). Leader angle 30° up-left.
- **Legend:** `measured` (oxblood dot swatch), `projected to goal · {N} days` (dashed ember), `goal line {value}` (ochre swatch)
- **Summary stat:** `trend: losing {X}g/day · on pace to reach {goal} by {est date}` OR `trend: stable (no significant change over {range})`. Color-coded: moss if trend matches goal direction, ivory neutral otherwise. **Never uses oxblood for "wrong direction"** — Agent 1 §2.2 reserves oxblood for over-target and error only.

### States

| State | Visual |
|---|---|
| **No measurements** | *No weight logged yet.* + `+ LOG FIRST WEIGHT` oxblood CTA |
| **1 measurement** | Single dot, no line, no trend, no projection. Meta: `{weight} kg · started today` |
| **< 5 measurements** | Line + dots; trend line hidden; legend hides projection entry |
| **Data gap > 14 days** | Line breaks at gap boundary (dashed segment `stroke: var(--color-dust); strokeDasharray: '2 2'` between last old and first new point); annotation *`14-day gap`* at break |

### Interaction

- Hover dot: tooltip with date (mono 10.5px) + weight (serif 16px) + delta from previous (`+0.2` ember / `-0.4` moss / `0.0` dust)
- Click dot: opens weight-log detail sheet (edit note, edit weight, delete entry). Per Agent 4 undo-queue, deletion toast enqueued (5s LIFO, I8).

### Responsive

- Desktop: half-width card
- Tablet: full-width card (stacks with weight adjacent to calorie adherence)
- Mobile: full-width, `height: 180px`, trend line hidden (density), 30-day max shown (older ranges disabled with tooltip: *rotate device for longer ranges*)

---

## Section 4 — Water Adherence

**Component:** `<WaterAdherenceChart range={range} data={...} profile={...} />`

### Visual spec

- **Container:** `.chart-card`; half-width on desktop (paired with §3 Weight).
- **Header:**
  - Title: `Water,` + `<span class="i">by the glass</span>`
  - Meta: `target {target}ml / day · unit {profiles.volume_unit}`
- **Chart:** Horizontal bar chart, one bar per day (Recharts `<BarChart layout='vertical'>`).
  - **Bar track:** full-width `fill: var(--color-bg-2)`; `height: 12px`
  - **Bar fill (actual):** `fill: var(--color-oxblood)` (**note:** oxblood here carries water semantic — this is the **one deviation from Agent 1 §2.2 where slate is the documented water color**. The mockup uses slate for the dashboard water bullet; for progress-page adherence bars, we adopt oxblood because it matches the chart-card primary-accent convention. Reconciliation: keep slate on dashboard; oxblood here. Main-agent may flag — rationale: progress-page charts are all oxblood-centric for visual consistency; water gets its accent treatment at progress scale).
  - **Target marker:** vertical 1px dashed `rule-strong` line at the target-ml position on each bar (marks 100% threshold).
  - **Overfilled portion (> 100%):** the fraction above target renders as `fill: var(--color-moss)` (bonus hydration, friendly signal).
- **Y-axis:** day labels (mono 10.5px); today in ivory bold
- **X-axis:** hidden (bar length is self-evident)
- **Summary stat:** `avg {avg}ml · hit target {N} of {M} days`
- **Legend:** `under target` (oxblood swatch), `at target` (hairline-strong at target position swatch), `over target` (moss swatch)

### States + interaction

Standard loading, empty, sparse, hover tooltip. Hover: `{day} · {volume}ml · {pct}% of target`.

### Responsive

Desktop/tablet/mobile: bar orientation stays vertical bars inside a horizontal-stacked layout on desktop; on mobile 7d shows 7 full-width horizontal bars stacked vertically. 30d on mobile: paginate 7d at a time with a weekly stepper `< Wk 13 >` below the chart.

---

## Section 5 — Micronutrient Heatmap (signature view)

The signature analytical view. **Y-axis = 7 nutrients; X-axis = N days (7 / 30 / 90).** Each cell is one day × one nutrient; fill color encodes % of DV met that day using the warm-ramp gradient.

> **Naming note:** Agent-6 prompt suggested 10–12 nutrients; the design-doc §10.8 and mockup both lock to **7 nutrients** (Fibre, Protein, Vitamin A, Vitamin C, Vitamin D, Iron, Calcium). This fragment adopts the mockup's 7-row canonical. If more nutrients are needed on the heatmap later, they are added post-MVP per §Residual below.

### The 7 nutrient rows (row order — top to bottom)

| # | Nutrient | DV target (reference) | Why in top 7 |
|---|---|---|---|
| 1 | **Fibre** | 30 g | High-signal for diet quality |
| 2 | **Protein** | user's macro target (`profiles.daily_protein_target_g`) | Primary macro |
| 3 | **Vitamin A** | 900 μg RAE | Common deficiency target |
| 4 | **Vitamin C** | 90 mg | Common, strong signal |
| 5 | **Vitamin D** | 20 μg (800 IU) | Chronic shortfall — mockup tells this story |
| 6 | **Iron** | 18 mg | Common deficiency; gender-sensitive |
| 7 | **Calcium** | 1000 mg | Bone health, common shortfall |

Row order is fixed (not user-reorderable in MVP). Post-MVP: user-configurable row order + extended 10-nutrient view.

### Visual spec

**Container (`.heatmap-card`):** Full-width (`grid-column: 1 / -1`), `border: 1px solid var(--color-rule-strong); background: var(--color-bg-1); padding: 30px 32px`

**Header (`.heatmap-head`):** `display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 24px; align-items: baseline; padding-bottom: 18px; margin-bottom: 22px; border-bottom: 1px solid var(--color-rule)`

- **Left — title block:**
  - `.title`: `font-family: var(--font-serif); font-size: 32px; font-weight: 300; letter-spacing: -0.02em; color: var(--color-ivory); line-height: 1.0` — text: `The <em>minor elements</em>, in thirty` (em word: italic `color: var(--color-sand)`)
- **Middle — sub:**
  - `.sub`: `font-family: var(--font-serif) italic; font-size: 14px; color: var(--color-sand); line-height: 1.5`
  - Text: *Seven nutrients, traced across the last thirty days — each cell a reading, taken at day's end, colored by share of the target met.*
  - Text for other ranges: substitute "thirty" → "seven" / "ninety" / "three-sixty-five"
- **Right — meta:**
  - `.meta`: `font-family: var(--font-mono); font-size: 11px; color: var(--color-dust); text-align: right; line-height: 1.8`
  - `em` inside: `font-family: var(--font-serif); color: var(--color-sand); font-size: 13px`
  - Content: *<em>A signature view.</em>* + newline + `hover a cell for the exact figure`

**Table structure (`<table class='heatmap-table'>`):** `width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 10.5px`

- **`<thead>` — two rows:**
  - **Row 1 — month band (`th.month`):** `text-align: left; font-family: var(--font-sans); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-sand); padding-bottom: 14px; border-bottom: none`. Each month band spans its day-columns via `colspan={N}`. Example: `<th colspan="12">March</th> <th colspan="18">April</th>`
  - **Row 2 — day numbers (`th`):** `color: var(--color-dust); font-weight: 400; padding: 8px 3px; text-align: center; font-size: 9.5px; border-bottom: 1px solid var(--color-rule)`. Format: day-of-month only (`20`, `21`, … `31`, `01`, `02`, …). Today: `color: var(--color-ivory); font-weight: 500`.
  - **Row-header column spacer:** `<th class='row-hdr'>` in both rows; `text-align: left; padding-left: 0; width: 100px` (empty header above row labels)

- **`<tbody>` — 7 rows, one per nutrient:**
  - **Name cell (`td.name`):** `font-family: var(--font-serif); font-style: italic; font-weight: 400; color: var(--color-ivory); font-size: 13px; padding: 8px 10px 8px 0; width: 100px`. Text = nutrient name (e.g., *Fibre*, *Vitamin D*).
  - **Data cells (`td`):** `padding: 0; height: 28px; text-align: center; border-right: 1px solid var(--color-bg-0)` (thin column rules that match mockup).
  - **Row separators (`tr`):** `border-bottom: 2px solid var(--color-bg-1)` (tonal, barely visible — the cells themselves carry the visual hierarchy).
  - **Cell fill (`<span class='cell c{N}'>`):** `display: block; width: 100%; height: 28px; position: relative`. Color class assigned from 10-step ramp:

### Color ramp (c0 → c9) — walking warm-to-supportive

| Class | Hex | % of DV | Semantic |
|---|---|---|---|
| `c0` | `#1F1613` | 0–10% | Almost unlogged / total miss |
| `c1` | `#3E1C16` | 10–25% | Very low |
| `c2` | `#5A261A` | 25–40% | Low |
| `c3` | `#7A3523` | 40–55% | Below target (oxblood mid) |
| `c4` | `#8B5A2D` | 55–65% | Approaching (ochre low) |
| `c5` | `#A97B3F` | 65–80% | Nearly there (ochre high) |
| `c6` | `#7A7A42` | 80–90% | Good (moss low) |
| `c7` | `#5C6B3D` | 90–100% | On target (moss mid) |
| `c8` | `#718041` | 100–115% | Above target (moss high) |
| `c9` | `#8B9A50` | > 115% | Excellent / over-delivering |

**Token declaration:** These 10 ramp colors are added to `lib/tokens.ts` as `colors.heatmap.c0` through `c9`. Agent 1 tokens remain the single source of truth; the ramp lives in a sub-namespace.

**Ramp rationale:** walks oxblood → ochre → moss monotonically by HSL lightness, so the transition from "under" to "over" crosses through warm tones before settling into supportive green — matching the mockup's visual narrative of *under target reads warm/critical; on-target reads supportive*. Greater-than-115% does NOT flip to oxblood (would over-signal) — c9 is the "excellent" green.

**Today cell (in-progress marker):** the rightmost cell in each row gets a `title` suffix `· today, in progress` and a 1px `border: 1px solid var(--color-ivory)` overlay to mark it as partial.

### Footer (`.heatmap-footer`)

`display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--color-rule)`

- **Left — legend ramp:**
  - `under` label (mono 10.5px dust) + 9-swatch gradient (each `width: 22px; height: 10px`) + `at target` label
  - Swatches: c0 → c1 → c2 → c3 → c4 → c5 → c7 → c8 → c9 (skipping c6 for visual clarity)
- **Right — editorial note (`.note`):** `font-family: var(--font-serif); font-style: italic; font-size: 13px; color: var(--color-sand)`
  - **Server-generated commentary** from simple rules (NOT Gemini):
    - Find the row with the lowest average over the range; if that average is < 50% DV, render: `— {Nutrient} trends low, entire {range}. A {suggestion} would shift the field.`
    - Suggestions map: `Vitamin D → walk at midday, or a fortified yoghurt`; `Iron → leafy greens, or a beef-based meal`; `Fibre → more legumes, or a bowl of oats`; `Calcium → yoghurt, or dark greens`; `Vitamin C → citrus fruit, or a pepper`; `Vitamin A → sweet potato, or a serving of liver`; `Protein → an egg at breakfast`.
    - If no row is < 50% DV, render: `— A steady field. Nothing trends low.`
  - Copy is template-based; no AI call. Kept fast + deterministic.

### Accessibility

- **Cells as interactive elements:** each cell `<span class="cell">` is wrapped as a `<button type="button">` with:
  - `aria-label="{Nutrient}, {weekday} {date}, {value}{unit}, {pct}% of daily value{, today, in progress if applicable}"` — example: `aria-label="Iron, Tuesday 14 April, 46 mg, 46% of daily value"`
  - `aria-describedby` linking to a screen-reader-only `<p>` element below the legend: *Color encodes percent of daily value met. Warmer colors indicate under-target days; greener colors indicate on-target days.*
  - Focus-visible outline: 2px oxblood inset ring (2px offset would clip adjacent cells; use `outline-offset: -2px` for heatmap cells specifically).
- **Keyboard navigation:** arrow keys navigate 2D grid (row up/down, column left/right) with `aria-activedescendant` pattern on a grid container `role="grid"`. Enter/Space opens detailed tooltip. Escape closes it.
- **Data table fallback (`<details>` drawer):** full 7×N matrix as an accessible `<table>` below the heatmap. Screen-reader announces matrix cell via `aria-describedby` link.
- **Color-never-sole-signal (§7.7 Agent 1):** hover/focus tooltip always shows numeric value + percentage; color alone never communicates state.

### Interaction

- **Hover:** cell increases brightness by 6% (tonal; no scale). Tooltip appears above cell:
  - Container: `background: var(--color-bg-1); border: 1px solid var(--color-rule-strong); padding: 10px 12px; font-family: var(--font-serif); font-size: 13px; color: var(--color-ivory); min-width: 180px`
  - Content (3 lines): `{Nutrient}` (serif italic 14px sand) · `{Weekday}, {date}` (mono 10.5px dust) · `{value} {unit} · {pct}% DV` (serif 15px ivory; pct in mono color-coded: oxblood-soft < 50%, ivory 50–90%, moss ≥ 90%)
- **Tap (mobile):** same tooltip; second tap or tap-outside dismisses. Tooltip position flips above/below based on available viewport space.
- **Focus:** same as hover.
- **Row hover:** nutrient-name cell highlights in `bg-2` (subtle row emphasis); column hover unchanged.

### Responsive — heatmap is the mobile edge case

The heatmap's information density is the **primary constraint** across breakpoints.

| Breakpoint | Cell size | Visible range | Rendering strategy |
|---|---|---|---|
| **Desktop (1280+)** | `24px × 28px` | Full 30 / 90 / 365 days fit in row at 30d; 90d/365d compress to 6–10px wide cells with horizontal scroll if needed (container overflow-x) | Full 7 rows visible |
| **Tablet (768–1279)** | `20px × 26px` | 30d fits; 90d/365d scroll horizontally | Full 7 rows; row labels shrink to 80px |
| **Mobile (375–767)** | `12px × 20px` | **7d default; 30d rotates 90°** (transposed: days on Y-axis, nutrients on X-axis) so 30 days stack vertically in a scrollable column. 90d/365d disabled on mobile (tooltip: *rotate device for longer ranges* — same UX as weight chart). | When transposed: nutrient headers become column heads (sans 10.5px uppercase), day labels (mono 10.5px) on left |

**Binding rules for mobile:**

1. **At 375–479px width:** force `range=7d` as the mobile default (chip row reflects this).
2. **At 480–767px width with range=30d:** trigger the transposed layout automatically. Transpose is a CSS-grid re-layout, not a separate component; the same data props power both orientations.
3. **Both orientations carry equivalent interaction + a11y:** cells remain buttons, tooltips still appear, arrow-keys still navigate.
4. **Scroll affordance:** for horizontally-scrollable cases (tablet/desktop 90d+), add a 1px `rule` scroll-shadow on left/right edges that fades to transparent when content is fully in view.

### Motion

- **First paint:** rows fade in top-to-bottom with `animation: rowFadeIn 180ms ease-editorial forwards` and a `animation-delay: calc(var(--row-index) * 40ms)`. Full 7 rows take 7 × 40ms + 180ms = 460ms. `prefers-reduced-motion`: all rows render instantly (no stagger).
- **Cell hover:** 120ms brightness cross-fade.

---

## Weekly Review Island

**Component:** `<WeeklyReviewIsland userId={uid} weekStartOn={date} />` — renders inside `<Suspense fallback={<WeeklyReviewSkeleton />}>` at the bottom of the progress page.

### Route + entry points

- **Embedded (default):** rendered as Section 7 of the Progress page (below the heatmap) when `range=30d` or `range=90d` (range spans a full week).
- **Focused drill-in (`/progress?focus=weekly-review`):** scroll-anchors directly to this section and expands the section to fill viewport; range chip row hides temporarily.
- **Entry from Dashboard:** Agent 3's weekly insight card links here with `scroll-behavior: smooth` + hash (`/progress#weekly-review`).

### PPR Suspense pattern

The Weekly Review is the **one place in Progress where server-rendering is deferred**. Rationale: the `/api/ai/weekly-review` call can take 2–6 seconds for a cache-miss (Gemini Flash first-paint). PPR renders everything else instantly and streams this section when ready.

```tsx
// app/(app)/progress/page.tsx — pattern sketch (spec only, not implementation)
<>
  <ProgressRangeToolbar />
  <CalorieAdherenceChart />
  <MacroDistributionChart />
  <WeightTrajectoryChart />
  <WaterAdherenceChart />
  <MicronutrientHeatmap />
  <Suspense fallback={<WeeklyReviewSkeleton />}>
    <WeeklyReviewIsland />
  </Suspense>
</>
```

**Fetching contract:**
- Server Component reads `weekly_reviews` table by `(user_id, week_start_on = currentWeekStart(user_tz))`.
- **Cache hit (fresh, expires_at > now):** returns stored `insights.body_markdown`. Zero Gemini call.
- **Cache miss / expired:** fires `POST /api/ai/weekly-review` → Gemini → Zod-validate → insert row → return insights.
- **Sparse-data fallback (< 3 logged days in past 7):** stub row created with `sparse_data: true`; template copy rendered directly (no Gemini call). See §Sparse state below.
- **Cache tag:** `TAGS.weeklyReview(uid, weekStartOn)` — invalidated on dashboard log-save that lands within the review's window (7-day staleness cap is a secondary guard).

### Visual spec

- **Container:** `.chart-card` full-width; `padding: 40px 32px` (more generous than other charts — editorial breathing room).
- **Kicker:** `§ 10 · FROM THE EDITOR` (uppercase sans 10.5px `color: var(--color-oxblood-soft); letter-spacing: 0.22em`)
- **Masthead row:** `display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 1px solid var(--color-rule)`
  - **Left — title:** `WEEKLY REVIEW — WEEK OF {date}` (sans 10.5px uppercase dust) + on next line serif 32px ivory: `{Month} {day}–{day}, {year}` (e.g., `April 12–18, 2026`)
  - **Right — generation meta (`meta`):** `font-family: var(--font-mono); font-size: 10.5px; color: var(--color-dust)` — `generated {date}` + newline + `via Gemini Flash`
- **Hero insight (pull-quote-style paragraph):** `font-family: var(--font-serif); font-size: 24px; line-height: 1.5; color: var(--color-ivory); font-weight: 400; margin-bottom: 28px; max-width: 68ch`
  - First letter of the hero paragraph is the **drop cap** (Agent 1 §3.2 T6; used exactly once per app — the weekly review). `font-size: 82px; float: left; line-height: 0.85; margin-right: 8px; margin-top: 4px; color: var(--color-oxblood); font-family: var(--font-serif); font-weight: 400`
- **Body insights (3–5 bullets):** `<ul class='insights'>`
  - Each `<li>`: `font-family: var(--font-serif); font-size: 16px; line-height: 1.6; color: var(--color-ivory); margin-bottom: 12px; padding-left: 18px; position: relative`
  - Oxblood em-dash prefix: `<li>::before { content: '—'; position: absolute; left: 0; color: var(--color-oxblood-soft) }`
  - Example bullet: *Your protein average is trending up 12% over last week.*
- **Chart highlights (2 mini-charts side-by-side):** `display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 32px; padding-top: 28px; border-top: 1px solid var(--color-rule)`
  - **Left:** calorie adherence for the week (same `<CalorieAdherenceChart />` component, filtered to 7d range and scoped to the review window)
  - **Right:** macro composition for the week (same `<MacroDistributionChart />` component, 7d)
  - Both charts render at 60% scale: `height: 140px; font-sizes reduced by 1px`
- **Footer:**
  - Left — `generated {datetime} · via Gemini Flash · cached until {expires_at}` (mono 10.5px dust)
  - Right — `REGENERATE REVIEW` link (uppercase sans 10.5px oxblood-soft with oxblood hover). **Enabled only if:** (a) cache is within 12h of expiry, or (b) user is a project-lead account (post-MVP admin mode). Otherwise disabled with tooltip: *Review regenerates automatically each Monday.*

### Skeleton fallback (`<WeeklyReviewSkeleton />`)

- Full-width `.chart-card` with:
  - Kicker + masthead + bottom rule visible (matches final layout)
  - Hero paragraph: 3 lines of placeholder bars (`height: 18px; background: var(--color-bg-2); margin-bottom: 12px`) — progressively narrower
  - Bullets: 4 `<li>` skeletons, each `height: 14px; background: var(--color-bg-2); margin-bottom: 10px`
  - Chart region: two `height: 140px; background: var(--color-bg-2)` blocks side-by-side
- `animation: shimmer 1.6s infinite ease-in-out` — subtle opacity pulse (0.6 ↔ 1.0). `prefers-reduced-motion`: solid `bg-2` blocks, no animation.

### Sparse-data fallback state (< 3 logged days in past 7)

Per design-doc §18.3 + stored in `weekly_reviews.insights.sparse_data = true`:

- Same container, kicker, masthead
- **No drop cap** (drop cap is reserved for the editor's full voice — sparse state is a shorter note)
- Hero replaced with italic serif 18px sand, centered: *Too little logged this week to draw conclusions. A review is produced when at least three days have entries.*
- CTA below: `BEGIN LOGGING →` (oxblood-soft link to `/log`)
- No bullets, no mini-charts
- Footer still shows `cached until {date}` (template write is cheap; fallback text holds until next week rolls)

### Failure fallback (Gemini error at generation time)

Per §F11/F12 handling (Agent 1 §7 implicit + design-doc §18):

- If Gemini fails at first attempt, retry once per F12.
- If both attempts fail:
  - Show the kicker + masthead
  - **No hero, no bullets**
  - Show only the mini-charts (calorie + macro for the week)
  - Below mini-charts, italic serif sand centered: *Insights unavailable at the moment. The chart record still stands.*
  - `REGENERATE REVIEW` link is enabled immediately (no 12h gate)
  - Sentry breadcrumb logged with error class
  - **User can still see their data** — critical I7 principle applied to analytical surface

### Accessibility

- Hero paragraph: `role="article" aria-labelledby="weekly-review-heading"`
- Bullets: proper `<ul>` semantics; drop cap uses CSS-only pseudo-element (doesn't pollute screen-reader output — reader hears the full first word intact)
- Regenerate link: `aria-disabled="true"` when gated; tooltip read via `aria-describedby`
- Mini-charts: inherit a11y from their component definitions (data-table drawers etc.)

### Motion

- Hero paragraph fades in with `ink-fade` (120ms) after data arrives
- Bullets stagger in at 60ms intervals after hero
- Mini-charts render with `page-settle` (320ms opacity crossfade)
- `prefers-reduced-motion`: all render instantly in final position

---

## Onboarding 8-Step Flow

**Route:** `/onboarding`. **Guard:** redirects authenticated users with incomplete profile; redirects to `/dashboard` once `profiles.onboarding_completed_at` is set.

**Component tree:**
- `<OnboardingLayout step={N}>` — full-screen layout, masthead stripped, progress indicator at top
  - `<StepWelcome />` · `<StepName />` · `<StepDateOfBirth />` · `<StepBiologicalSex />` · `<StepHeight />` · `<StepWeight />` · `<StepActivityLevel />` · `<StepTarget />`

### Shared layout

- **Container:** full-viewport `min-height: 100dvh`; `display: flex; flex-direction: column`
- **Background:** `bg-0` with the same subtle radial glow from the main app (single decorative gradient, token: `--decorative-glow` from Agent 1 mockup-consistent rule)
- **Top — progress indicator:** 8 dashes arranged in a row
  - `display: flex; gap: 4px; padding: 24px 48px 0`
  - Each dash: `height: 1px; flex: 1; background: var(--color-rule-strong)` (default — unfilled)
  - Completed/current dashes: `background: var(--color-oxblood)`
  - **Animation:** on step advance, the next dash fills left-to-right with `rule-draw` (320ms `scaleX` 0→1 with `transform-origin: left`). `prefers-reduced-motion`: instant color swap.
- **Middle — step content area:** `flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px; max-width: 640px; margin: 0 auto`
- **Bottom — action row:**
  - `display: flex; justify-content: space-between; align-items: center; padding: 24px 48px; border-top: 1px solid var(--color-rule)`
  - **Left — BACK button:** `font-family: var(--font-sans); font-size: 10.5px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: var(--color-sand); padding: 12px 20px; border: 1px solid var(--color-rule-strong); background: transparent` — hidden on Step 1
  - **Right — NEXT / BEGIN / START TRACKING button:** primary oxblood: `background: var(--color-oxblood); color: var(--color-ivory); padding: 14px 32px; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 500`
    - **Hover:** `background: var(--color-oxblood-soft)`
    - **Disabled (validation unmet):** `opacity: 0.4; cursor: not-allowed`
  - **Skip link (optional steps only — Step 2 name):** top-right corner of step content area — `color: var(--color-dust); font-family: var(--font-sans); font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; border-bottom: 1px dotted var(--color-dust)` — text: `SKIP` — only shown on the 1 optional step (name).

### State management (per Agent 1 §11 + design-doc §11)

- `useOnboardingStore` — Zustand store with `sessionStorage` persistence (30-minute TTL on resume).
- Store shape: `{ step: 1..8, name, dob, biologicalSex, heightCm, weightKg, activityLevel, goal: 'maintain'|'lose'|'gain', targetAdjustPct: -20..20, completed: false }`
- Persistence fires on every field change (throttled 500ms).
- **On step advance:** store updates, URL updates (`/onboarding?step=N`), progress dash fills.
- **On unload without completion:** state persists; user can resume.
- **On Step 8 submit:** `POST /api/profile/save` (includes `client_id` per I11) → redirect `/dashboard` with first-time flag.

### Step-by-step specs

#### Step 1 — Welcome

- **Content layout:** vertically centered
  - Wordmark: `Kalori` (Newsreader 104px ivory, same as masthead) centered
  - Tagline below: *A record of what you eat, kept like a journal.* (serif italic 18px sand, max-width 52ch)
  - Body paragraph (serif 16px ivory, max-width 58ch): *To get your calorie target right, we need a few details. This takes less than a minute, and everything can be edited later in Settings.*
- **Action:** `BEGIN` (oxblood) right; no BACK
- **Input validation:** none
- **Back button disabled**

#### Step 2 — What's your name?

- **Title (Newsreader 44 ivory, centered):** `What should we call you?`
- **Subtitle (serif italic 16px sand):** *First name only. Used in your ledger masthead and weekly reviews.*
- **Input field:**
  - Label above (Inter 10.5 UPPERCASE dust tracking 0.18em): `NAME`
  - Field: `height: 56px; width: 100%; max-width: 420px; padding: 0 16px; font-family: var(--font-serif); font-size: 20px; color: var(--color-ivory); background: var(--color-bg-1); border: 1px solid var(--color-rule-strong)`
  - Focus state: `border-color: var(--color-oxblood)`; 2px oxblood outline 2px offset
  - Error state (empty on NEXT): border + caption oxblood; caption text: `! Please enter a name, or tap SKIP.`
- **Action:** `NEXT` disabled if empty AND skip not used; `SKIP` enables NEXT. Defaults name to "friend" if skipped.

#### Step 3 — Date of Birth

- **Title:** `When were you born?`
- **Subtitle:** *Used to compute your BMR — stays private.*
- **Input — native date picker:** `<input type='date' />` styled:
  - 56px tall, serif 18px ivory, bg-1 with rule-strong border
  - Placeholder: `YYYY-MM-DD` (mono dust)
  - Max date: `today - 13 years` (age 13+); min: `today - 120 years`
- **Validation:** age must be 13–120. Error caption: `! Enter a valid date of birth.`
- **Privacy note below field:** *Not shared, not displayed — used only in the Mifflin-St Jeor equation.* (mono 10.5px dust)

#### Step 4 — Biological Sex

- **Title:** `Biological sex`
- **Subtitle (extra long — medically relevant disclaimer):** *Used for accurate TDEE calculation via the Mifflin-St Jeor equation, which uses biological sex (not gender identity) because of its metabolic impact. Editable later.* (serif italic 14px sand, max-width 48ch)
- **Two chips, side-by-side:**
  - Chip layout: `display: flex; gap: 12px; margin: 32px 0`
  - Each chip: `flex: 1; max-width: 200px; padding: 24px; border: 1px solid var(--color-rule-strong); background: var(--color-bg-1); text-align: center; cursor: pointer`
  - Chip content: Sans 13px uppercase tracking 0.18em ivory: `FEMALE` / `MALE`
  - **Hover:** `background: var(--color-bg-2)` (tonal)
  - **Selected:** `border-color: var(--color-oxblood); background: var(--color-bg-2)`; a 3px oxblood top rule indicates selection
  - **Focus-visible:** 2px oxblood outline 2px offset
- **Action:** `NEXT` disabled until a chip is selected.

#### Step 5 — Height

- **Title:** `How tall are you?`
- **Subtitle:** *Used in the Mifflin-St Jeor equation.*
- **Input row:**
  - Number input: `<input type='number' inputmode='decimal' />`, 56px tall, serif 20px ivory, `width: 180px` — focus behavior same as Step 2
  - Unit toggle: two tiny chips `cm` / `in` (Agent 2-style segmented control, 32px tall, sans 10.5 uppercase)
  - Default unit: `cm` (metric per design-doc I6)
- **Storage:** always in `height_cm` (metric-canonical); unit toggle converts input to cm via standard conversion (1 in = 2.54 cm)
- **Validation:** range 100–250 cm (39–98 in). Error: `! Enter a height between 100 and 250 cm.`

#### Step 6 — Current Weight

- **Title:** `And your current weight?`
- **Subtitle:** *This is your starting line. Editable daily in Settings → Weight Log.*
- **Input row:** same pattern as Step 5
  - Units: `kg` / `lb` (default `kg`)
  - Storage: always `weight_kg`
  - Validation: range 30–300 kg (66–660 lb)

#### Step 7 — Activity Level

- **Title:** `How active are you?`
- **Subtitle:** *Affects your total daily calorie budget. Be honest — overestimating is a common pitfall.*
- **Five chips, vertically stacked (for description space):**
  - Each chip: `display: flex; flex-direction: column; padding: 20px 24px; border: 1px solid var(--color-rule-strong); background: var(--color-bg-1); margin-bottom: 12px; cursor: pointer; text-align: left`
  - Chip content: first line — sans 11px uppercase tracking 0.18em ivory (`SEDENTARY`, `LIGHT`, `MODERATE`, `ACTIVE`, `VERY ACTIVE`); second line — serif italic 13px sand description:
    - Sedentary: *Little to no exercise. Desk job.*
    - Light: *1–3 days per week of light activity.*
    - Moderate: *3–5 days per week of moderate exercise.*
    - Active: *6–7 days per week of vigorous exercise.*
    - Very active: *Daily training, or physical labor.*
  - **Selected:** oxblood left border (3px), `background: var(--color-bg-2)`
  - **Focus-visible:** 2px oxblood outline

#### Step 8 — Your Target (final / results)

The big reveal — Mifflin-St Jeor computation shown live.

- **Title:** `Your daily target`
- **Live-computed calorie value (large display):** `font-family: var(--font-serif); font-size: 82px; font-weight: 300; color: var(--color-ivory); letter-spacing: -0.02em; .num; text-align: center; margin: 32px 0`
  - Format: `2,180` with mono-spaced tabular lining figures
  - Updates in real time as the goal selector and adjust slider change
- **Goal selector (3 chips):**
  - `MAINTAIN` (default) / `LOSE` / `GAIN`
  - Selecting `LOSE` sets default adjust to `-15%`; `GAIN` sets `+10%`; `MAINTAIN` sets `0%`
  - Same chip visual pattern as Step 4 (border oxblood selected)
- **Adjustment slider (appears under goal selector):**
  - Label: `ADJUSTMENT` (sans 10.5 uppercase dust)
  - Range: `-20%` to `+20%`
  - Slider track: `height: 2px; background: var(--color-rule-strong)`
  - Filled portion: `background: var(--color-oxblood)`
  - Thumb: `width: 16px; height: 16px; border-radius: 0 (!)` — **square per Ledger rule §4.1** — `background: var(--color-ivory); border: 1px solid var(--color-oxblood)`. (Deviation from platform-native slider-thumb circle — documented as an onboarding-specific control.)
  - Current value display right: mono 11px ivory: `−15%`
  - Changing slider live-updates calorie value above
- **"How we calculated this" disclosure (expandable panel below):**
  - Collapsed by default; toggled by oxblood-soft link: `HOW WE CALCULATED THIS`
  - Expanded: serif 14px sand with mono numerals showing the Mifflin-St Jeor formula:
    ```
    BMR = 10 × weight + 6.25 × height − 5 × age + s
      (s = +5 for male, −161 for female)
    TDEE = BMR × activity multiplier
      (sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9)
    target = TDEE × (1 + adjustment%)
    ```
  - Your values line-by-line:
    - `BMR` = 1,650 kcal
    - `TDEE` = 2,560 kcal  
    - `target` = 2,180 kcal (TDEE −15%)
  - Collapse toggles with `ink-fade` 120ms.
- **Action:** `START TRACKING` (oxblood, 56px tall for weight)

### Responsive

- **Desktop (1280+):** Content max-width 640px; progress dashes span full width; action row full width
- **Tablet (768–1279):** Same but padding reduces to 32px horizontal
- **Mobile (375–767):** Padding 16px horizontal; wordmark on Step 1 reduces to 72px; calorie hero on Step 8 reduces to 58px; activity chips on Step 7 stay vertically stacked (works natively)

### Accessibility

- Each step is a `<form>` with proper labels and `aria-required` for mandatory fields
- Focus order: input(s) → BACK → NEXT
- `Enter` key on NEXT button submits the step
- `Tab` → `Shift+Tab` cycles focus
- Progress indicator: `role="progressbar" aria-valuenow={N} aria-valuemin={1} aria-valuemax={8} aria-label="Onboarding, step {N} of 8"`
- Live-computed target on Step 8: `aria-live="polite"` announces changes to slider

---

## Settings Page

**Route:** `/settings` (Top-level nav destination per Agent 2). **Subroutes:** `/settings/account`, `/settings/export`.

**Layout pattern:** **sidebar subsections + main content** on desktop/tablet; vertical-scroll sections stacked on mobile.

### Desktop/tablet layout

- **Container:** two-column grid — `grid-template-columns: 220px 1fr; gap: 48px; max-width: 1280px; margin: 0 auto; padding: 48px`
- **Left — subsection rail:**
  - 5 subsection links listed vertically
  - Each: sans 11px uppercase tracking 0.18em; `color: var(--color-sand)` default; `color: var(--color-ivory); border-left: 2px solid var(--color-oxblood); padding-left: 14px` active; hover adds `bg-2` row
  - 1px hairline separates rail from content
- **Right — content panel:**
  - Each subsection renders as a scrollable region with its own `§` kicker + title

### Mobile layout

- **Container:** single column, full-width, padding 16px
- Each subsection is a collapsible `<details>` block with a chevron affordance in the summary row. Summary row: kicker + title + current-value preview (so user can see settings without expanding).

### Subsection 1 — PROFILE

- Kicker: `§ 01 · PROFILE`
- Title (serif 44 ivory): `Who you are`
- Fields (stacked, each with 24px vertical gap):
  - **Name** — text input (serif 18px ivory, 56px tall)
  - **Date of birth** — date input (mono 14px ivory, 56px tall)
  - **Biological sex** — two-chip toggle (Female / Male)
  - **Height** — number + unit toggle (same as Onboarding Step 5)
  - **Weight** — link to Weight Log instead of inline field: `MANAGE WEIGHT HISTORY →` (oxblood-soft uppercase link) — to emphasize weight as a log, not a single value
  - **Activity level** — 5-chip vertical group (same as Onboarding Step 7)
- **Target recalc side effect:** changing name has no side effect; changing DOB, sex, height, activity triggers an **auto-recalc preview** banner: *Changing this will update your daily target from 2,180 to 2,240 kcal. Confirm below.* (ember-toned italic serif, pairs with an explicit `APPLY CHANGES` button)
- **Save behavior:** autosave on blur for name (no side-effect fields); explicit APPLY button for side-effect fields. Autosave writes `POST /api/profile/save` with `client_id` (I11) + toast: `Saved.` (moss check glyph, dismisses 3s later).

### Subsection 2 — TARGET

- Kicker: `§ 02 · TARGET`
- Title: `Your daily calorie budget`
- Display block (serif 82px ivory centered): current target kcal `.num`
- Below — two chip row: `AUTO (Mifflin-St Jeor)` / `MANUAL OVERRIDE`
  - **Auto mode:** shows "Recalculated from profile — last recalc {date}" + `RECALCULATE NOW` button (triggers fresh compute)
  - **Manual mode:** shows a number input to set `manual_override_value` + mono caption: `Auto-computed suggestion: 2,180 kcal` (reference value preserved)
  - **Transition rules (design-doc §10.9):** manual → auto fires immediate recalc + dashboard nudge card; auto → manual copies current auto value into override field.
- **Recalc threshold setting (advanced):** dropdown: `Threshold for auto-recalc: 2% | 5% (default) | 10% | never`; controls `profiles.recalc_threshold_pct`.

### Subsection 3 — DISPLAY

- Kicker: `§ 03 · DISPLAY`
- Title: `Units and locale`
- Fields:
  - **Weight unit:** toggle `kg` / `lb` (stored as display preference; DB always metric per I6)
  - **Volume unit:** toggle `ml` / `fl oz`
  - **Timezone:** native `<select>` with IANA list, default-filled from browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - **Show Roman hour numerals on chronometer:** toggle (on/off) — aesthetic preference
  - **Reduce motion:** toggle (mirrors `prefers-reduced-motion`; overrides OS preference if explicitly set — Agent 1 §7.9)

### Subsection 4 — DATA

- Kicker: `§ 04 · DATA`
- Title: `Your records`
- Two export buttons side-by-side:
  - `EXPORT AS CSV` — oxblood primary button, 44px tall
  - `EXPORT AS JSON` — hairline-strong secondary button, 44px tall
  - Below: caption *Includes all entries, library items, weight log, water log. ISO 8601 timestamps in UTC with your timezone column.*
- Toggle: `ALWAYS SAVE WITHOUT REVIEW` (off by default) — if on, the log-flow confirmation screen (Agent 4's spec) is auto-confirmed and skipped.

### Subsection 5 — ACCOUNT

- Kicker: `§ 05 · ACCOUNT`
- Title: `Credentials and closure`
- Fields:
  - **Email:** read-only, serif 16px ivory, mono 11px dust caption: `Signed in · {datetime}`
  - **Sign out button:** hairline-strong secondary, 44px tall: `SIGN OUT`
  - **Danger zone (hairline top rule, 32px above):**
    - Label kicker: `§ DANGER` (sans 10.5 uppercase oxblood tracking 0.22em)
    - `DELETE ACCOUNT` — oxblood link underlined with hover `oxblood-soft`. Opens the Account Delete Flow modal (below).

### Save behavior

- **Autosave on blur** for non-side-effect fields (name, units, toggles) — optimistic + `client_id` + rollback on 4xx/5xx.
- **Explicit APPLY** for side-effect fields (DOB, sex, height, activity, target mode, goal, threshold).
- **Toast pattern:** success — moss check glyph + "Saved." (3s). Failure — oxblood `!` glyph + "Couldn't save — try again." (assertive aria-live).

### Accessibility

- Each subsection has `<h2>` with matching `id`; sidebar rail links via hash + `scroll-behavior: smooth`
- All inputs labeled with `<label for="...">` pattern
- All toggles are `<button role="switch" aria-checked="...">` per WAI-ARIA
- Focus order follows visual order in each subsection

---

## Account Delete Flow

**Trigger:** Settings → Account → `DELETE ACCOUNT` link.

**Modal stack:** 3 sequential modals (not a single multi-step form — explicit breaks keep the user fully aware of each gate).

### Modal visual base (shared by all 3 steps)

- **Scrim:** `background: rgba(14, 10, 8, 0.72)` (72% `bg-0`, no blur — Agent 1 §4.5)
- **Modal card:** `max-width: 520px; background: var(--color-bg-1); border: 1px solid var(--color-rule-strong); padding: 48px 40px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: z-modal`
- **Close (X) in top-right:** allowed only on Step 1 and Step 2; Step 3's closing is via the CANCEL button only
- **Kicker (top-left):** `§ DANGER` (sans 10.5 uppercase oxblood tracking 0.22em)
- **Focus trap:** applied throughout; Escape closes modal (Step 1 + 2 only) and clears the flow state

### Step 1 — Warning

- **Title:** `This cannot be undone.` (Newsreader 28px ivory)
- **Body:** serif 16px ivory paragraph: *Deleting your account removes everything you have ever logged. There is no recovery. There is no export after the fact.*
- **List of consequences (bulleted, mono-dashed in oxblood-soft):**
  - *All food entries*
  - *All library items and their thumbnails*
  - *All weight log entries*
  - *All water log entries*
  - *Your profile — name, DOB, target, settings*
  - *Your email and password*
  - *Your weekly reviews and AI call logs*
- **Actions (action row, bottom-aligned):**
  - Left: `CANCEL` (sand secondary, 44px tall)
  - Right: `I WANT TO CONTINUE` (oxblood, 44px tall) — proceeds to Step 2

### Step 2 — Email confirmation

- **Title:** `Confirm by typing your email.` (Newsreader 24px ivory)
- **Body:** serif 15px sand: *Enter the email you signed up with. Case must match exactly.*
- **Input field:** 56px tall, mono 14px ivory (mono because email is technical data), bg-1 fill, rule-strong border, hidden by default for placeholder so user must type blind
- **Live validation:** as user types, a moss check-glyph appears next to the field when string matches `user.email` (case-sensitive); otherwise no feedback (prevents user from brute-guessing via UI feedback)
- **Actions:**
  - Left: `CANCEL`
  - Right: `DELETE MY ACCOUNT` — oxblood, disabled until email matches exactly

### Step 3 — Final confirm with countdown

- **Title:** `Last chance.` (Newsreader 24px oxblood)
- **Checkbox row:**
  - `<input type='checkbox' id='understand' />` — 16×16px, zero-radius, bg-1 with rule-strong border; when checked: oxblood fill + ivory check glyph
  - Label (serif italic 14px ivory): *I understand that my ledger and its entries will be permanently destroyed.*
- **Countdown block:** once checkbox is checked, a 10-second countdown begins:
  - Display (serif 44px ivory centered): `00:10` → `00:00` (mono tabular nums; updates every 200ms)
  - Caption below: mono 10.5px dust: `the button enables when this reaches zero`
  - On zero: button enables, countdown display replaced with `READY` (moss check glyph)
- **Actions:**
  - Left: `CANCEL` (only visible option during countdown)
  - Right: `DELETE NOW` (oxblood, disabled until countdown reaches 0)

### Deletion execution

On `DELETE NOW` tap:

1. **Modal replaced with full-screen progress panel:**
   - Bg-0 scrim, no card, full viewport
   - Centered: kicker `§ DELETING` (sans 10.5 uppercase oxblood)
   - Below: title (Newsreader 44px ivory) `Destroying your ledger.`
   - 3-step progress list (serif 16px sand):
     - `⟶ Removing photos...` (animates to ivory check when complete)
     - `⟶ Removing records...`
     - `⟶ Removing account...`
   - Each step: when active, spinner-like 1px oxblood arrow oscillates; when complete, `✓` glyph (moss)
   - At bottom: mono caption 11px dust: `please stay on this page until the ledger closes`

2. **Backend contract (per I9 + architecture.md §6 Route 14):**
   - `DELETE /api/account/delete`
   - Route handler order (LOAD-BEARING): (a) Storage objects first (all under `food-thumbnails/{user_id}/`); (b) DB rows (all user-owned tables, via `ON DELETE CASCADE` triggered by auth.users deletion); (c) `auth.users` row last
   - Zero-object test (design-doc §18 + tests/integration/account-delete-cascade.test.ts) verifies no orphans remain

3. **On success:**
   - Sign-out fires (clears session cookies, broadcasts to other tabs via BroadcastChannel per F12)
   - Redirect to `/` (marketing landing — the public root per design-doc §10.1)
   - Toast on landing page (shown once, from URL flag `?deleted=1`): `Your account has been deleted.` (sand italic serif, moss check-glyph, 8-second persist)

4. **On failure:**
   - Progress panel shows oxblood `!` glyph + error step + caption: *The ledger could not be closed. Some data may remain.*
   - Two CTAs: `TRY AGAIN` (oxblood, retries DELETE call) and `CONTACT SUPPORT` (hairline-strong, `mailto:support@kalori.app?subject=Account+deletion+failed`)
   - Sentry breadcrumb + `ai_call_log`-style table row if applicable (deletion path failures are logged)

### Accessibility

- Each step modal uses `role="dialog" aria-modal="true" aria-labelledby="{step-title-id}"`
- Focus moves to first interactive element on open; returns to trigger on close
- Focus trap enforced
- Countdown announced via `aria-live="polite"` region at 10s / 5s / ready
- `prefers-reduced-motion`: spinner replaced with text state ("...")

---

## Export Flow (CSV / JSON)

**Trigger:** Settings → Data → `EXPORT AS CSV` or `EXPORT AS JSON`.

**Behavior:** Inline progress modal + download trigger. No separate route — stays on Settings.

### Modal visual

- Standard modal base (scrim + bg-1 card, same as Delete modal)
- **Content:**
  - Kicker: `§ EXPORT` (sans 10.5 uppercase oxblood-soft)
  - Title: `Preparing your archive.` (Newsreader 28 ivory)
  - Body (serif 15 sand): *{Entry count} entries, {library count} library items, {weight count} weight entries, {water count} water entries. Your complete ledger.*
  - Progress indicator (spinner-like oxblood 1px arc rotating 1.2s ease-editorial infinite) + caption mono 11px dust: `reading records...` → `serializing...` → `ready`
  - Est. time: dust mono 11px: `this usually takes 2–6 seconds`
- **Actions:**
  - Single button: `CANCEL` until ready; replaced with `DOWNLOAD` (oxblood) on completion

### Download mechanics

- `GET /api/export/csv` or `GET /api/export/json` (architecture.md Route 12/13)
- Response headers include `Content-Disposition: attachment; filename="kalori-export-{userId}-{YYYYMMDD}.csv"` (or `.json`)
- Route streams the CSV/JSON directly (no blob client-side buffering) — large archives still work
- **Filename format:** `kalori-export-{userId}-{YYYYMMDD}.{ext}` (matches architecture §Notes field)
- Browser native download UI takes over on response receipt; modal shows `DOWNLOAD COMPLETE` for 2s then auto-closes

### File structure

- **CSV:** per design-doc §10.9 — zipped bundle containing `entries.csv` (flat, one row per logged item; includes joined library fields; ISO timestamps in UTC + user-TZ column), `weight.csv`, `water.csv`, `library.csv`. Architecture.md finalizes exact column list.
- **JSON:** nested single file per design-doc §10.9 — `{ profile, library, entries, logs: { weight, water }, weekly_reviews, schema_version: 'v1' }`. Pretty-printed with 2-space indent.

### Failure handling

- On error: modal shows oxblood `!` glyph + *Export failed.* with retry button; Sentry breadcrumb logged.
- Timeout: if export >30s, modal shows `This is taking longer than expected — continue waiting or cancel?` with CANCEL / WAIT options.

### Accessibility

- Modal `role="dialog"`, focus trapped, Escape cancels
- Progress announced via `aria-live="polite"`
- Download triggers via a temporarily-visible-then-hidden `<a href={blobUrl} download={filename}>` — screen readers announce via a11y companion text

---

## Login / Signup Page

**Route:** `/login`. Unauthed only; authed users redirect to `/dashboard` (or `/onboarding` if profile incomplete).

### Visual spec

- **Container:** full-viewport `min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px`
- **Masthead (centered):**
  - Wordmark: `Kalori` (Newsreader 104px ivory on desktop, 72px tablet, 48px mobile). The italic "ac" accent per mockup: first two letters `font-style: italic; color: var(--color-oxblood-soft)` (optional decorative touch).
  - Tagline below: sans 11px uppercase tracking 0.22em sand: `A RECORD OF WHAT YOU EAT, KEPT LIKE A JOURNAL`
  - Hairline rule below: `width: 200px; height: 1px; background: var(--color-rule-strong); margin: 48px auto`
- **Form block (max-width 420px centered):**
  - Mode toggle (two tiny links at top right): `SIGN IN` / `CREATE ACCOUNT` (uppercase sans 10.5 dust; active: ivory with oxblood underline)
  - **Email input:**
    - Label: `EMAIL` (sans 10.5 uppercase dust tracking 0.18em)
    - Field: 56px tall, mono 14px ivory, bg-1 fill, rule-strong border
    - Autocomplete: `username email`
  - **Password input:**
    - Label: `PASSWORD`
    - Field: 56px tall, type="password", mono 14px ivory
    - Reveal toggle: icon button right-inside field (`Eye` / `EyeOff` — phosphor), 44×44 tap target, `aria-label='Show password' | 'Hide password'`
    - Autocomplete: `current-password` (sign-in) / `new-password` (signup)
  - **Primary button:** `SIGN IN` or `CREATE ACCOUNT` — oxblood fill, 56px tall, 100% width, uppercase sans 11px letter-spacing 0.2em
  - **Secondary links (below button, centered):**
    - Sign-in mode: `FORGOT PASSWORD?` (oxblood-soft underlined link)
    - Signup mode: by-line: *By creating an account you agree to the Privacy Notice.* (serif italic 12px sand, link to `/privacy`)
- **Divider:**
  - `width: 100%; max-width: 420px; display: flex; align-items: center; gap: 12px; margin: 32px 0`
  - Left hairline + text `OR` (sans 10.5 uppercase dust) + right hairline
- **OAuth buttons (max-width 420px centered):**
  - `CONTINUE WITH GOOGLE` — button, 56px tall, bg-2 fill, rule-strong border, with 20×20px Google G icon left, sans 13px ivory label center
  - **Apple OAuth deferred post-MVP per blueprint** — NO button shown.
- **Footer (page bottom, serif italic 12px sand centered):** *Private. Owner-only. No ads, no tracking.*

### Errors

- **Inline field errors:** 1px oxblood underline + 10.5px oxblood caption below field: `! Invalid email format.` / `! Password too short.`
- **Form-level errors (auth failure):** shown above form block as a single-line oxblood banner: `! Incorrect credentials. Try again.`
- **Auth success:** toast `Welcome back, {name}.` (sand italic, 3s) + redirect

### Authentication contracts

- **Sign in (email/password):** `POST` to Supabase auth endpoint via `@supabase/ssr` client. On success → set cookies → redirect `/dashboard`.
- **Sign up:** `POST` to Supabase auth signup. Requires email verification if enabled. On success → redirect `/onboarding`.
- **Google OAuth:** `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`
- **Forgot password:** separate route `/forgot-password` (out of MVP scope for full spec; at minimum a stub page with email-magic-link UI).

### Responsive

- **Desktop:** wordmark 104px, form block centered with generous padding
- **Tablet:** wordmark 72px, padding 32px
- **Mobile:** wordmark 48px, padding 16px, form fills viewport width (max-width removed), OAuth buttons full-width

### Accessibility

- All inputs have `<label>` (visible, not placeholder-only)
- Form has `aria-labelledby` pointing to wordmark
- Keyboard Enter submits
- Focus order: email → password → reveal button → submit → mode toggle → forgot-password → divider → Google OAuth
- `prefers-reduced-motion`: no page-settle crossfade on load

---

## First-Time Dashboard State

**Trigger:** First visit to `/dashboard` after completing onboarding (detected via `profiles.last_dashboard_visit_at IS NULL OR food_entries.count === 0`).

This is a **variant of the dashboard** (Agent 3's scope) — documented here because it is an onboarding-continuous state and shares the gate logic. Coordinate with Agent 3 at main-agent synthesis.

### Visual spec

Inherits the full dashboard layout (masthead, chronometer ring, macro bars, meals bulletin, water tracker, micronutrient panel, weekly-insight-island) but with these modifications:

- **Masthead title override:** replace the editorial section title with `WELCOME TO YOUR LEDGER, {firstName.toUpperCase()}` (Newsreader 44 ivory centered for this state only). Subtitle serif italic 16 sand: *Your first meal begins the record.*
- **Chronometer ring (empty state):**
  - Outer ring: hairline-strong 1px `#3A3029` — ring drawn but unfilled
  - Roman hour numerals: rendered in `dust` (not ivory) — dimmer
  - Center calorie value: replaced with dust italic serif 18px: *— log your first meal —*
  - No projection arc, no now-indicator triangle
- **Macro bars:**
  - All three at 0/target grams; fill portion hidden; track full-width `bg-2`
  - Values in dust (not ivory); `.num` still applied
  - Opacity of whole macro block: 0.5
- **Meals bulletin:**
  - All 5 columns show kicker `§ 01 BREAKFAST` etc. + empty state inside each column: serif italic 13px sand centered: *empty*
  - Overall section banner below meals: a 2px oxblood top rule + caption: `NO ENTRIES YET`
  - CTA (mobile): *Tap ＋ to log* (italic serif 15px ivory with oxblood + glyph)
  - CTA (desktop/tablet): *Press `N` or click LOG in the sidebar* (mono 11px ivory with backtick key mnemonic styled as `<kbd>` — bg-2 fill with rule border)
- **Water tracker:** `0 / {target} ml` in dust; unchanged functionally
- **Micronutrient panel:** hidden (no data to display); replaced with a single dust caption: *The minor elements appear after three days.*
- **Weekly insight card:** hidden (same reason; Weekly Review needs ≥ 3 days)
- **Target-updated nudge:** hidden

### Coachmark / onboarding tooltip

On first render, a dismissable tooltip points at the LOG affordance:

- **Desktop/tablet:** points at the sidebar `LOG` item — tooltip appears to the right of the sidebar, bg-1 card with rule-strong border, content: serif italic 15px ivory: *Press `n` or click here to log your first meal.* + close (`×`) top-right
- **Mobile:** points at the FAB (bottom center) — tooltip appears above FAB, arrow pointing down, same content
- **Dismissal:** tap × / click outside / press Escape / first log
- **Persistence:** dismissal is sticky (`localStorage.setItem('kalori.coachmark.log', '1')`) — never shows again after first dismissal or first log action

### Transition to normal state

Once the user saves their first entry:
- Coachmark dismisses automatically
- Chronometer animates from empty to first-entry state with `chrono-draw` (600ms)
- Macro bars fade from dust to full color with `ink-fade` cross-fade
- Masthead reverts to normal edition-line format on next page visit

### Accessibility

- Coachmark: `role="dialog" aria-labelledby="coachmark-title" aria-describedby="coachmark-body"`
- Focus trapped inside coachmark until dismissed; on dismiss, focus returns to the LOG trigger
- Announcement on first render: `aria-live="polite"` region announces *Your ledger is empty. Log your first meal to begin.*

---

## PWA Install Prompt

**Trigger sources:**
1. Chrome/Edge automatic — the browser fires `beforeinstallprompt` event; captured and deferred until user-initiated moment.
2. iOS Safari manual — since Safari doesn't fire `beforeinstallprompt`, show a manual-install affordance on iOS detection.

### Deferral strategy

- Capture `beforeinstallprompt` on page load, store `deferredPrompt` in Zustand `useUIStore`.
- **Do NOT auto-show.** Auto-prompting a fresh user is user-hostile.
- Instead, show the install prompt at **one of these contextual moments:**
  - (a) After the user's 3rd log (meaningful engagement reached)
  - (b) Settings page has a persistent `ADD KALORI TO HOME SCREEN` affordance under Display subsection
  - (c) Manual install triggered via a discrete oxblood-soft link

### Modal visual

- **Container:** standard modal (scrim + bg-1 card, 440px max-width, padding 32px)
- **Content:**
  - Kicker: `§ INSTALL` (sans 10.5 uppercase oxblood-soft)
  - Title: `Keep Kalori close.` (Newsreader 28 ivory)
  - Body: serif 15px sand: *Add Kalori to your home screen for offline-ready ledger access. No App Store, no installs — it's already here.*
  - Small app-icon preview (48×48 px): Kalori wordmark mini-mark on bg-2 with rule-strong border
  - Below: what-you-get list (serif 14 ivory, 3 bullets):
    - *Offline access to your library and last 7 days*
    - *Quick launch from home screen*
    - *Native-like photo capture*
- **Actions:**
  - Left: `NOT NOW` (sand secondary)
  - Right: `INSTALL` (oxblood) — on click, calls `deferredPrompt.prompt()`; waits for outcome; modal dismisses on either outcome

### iOS-specific path

On iOS (Safari detection via `navigator.userAgent.includes('iPhone') || 'iPad'`), the same modal shows but `INSTALL` button is replaced with illustrated instructions:

- Serif 16 ivory: *On iPhone: tap the share button {share-icon} in Safari, then "Add to Home Screen."*
- Below: an SVG illustration of the share-sheet menu item (single step, kept simple)
- Button row: `GOT IT` (oxblood) + `NOT NOW` (sand)

### Persistence

- On dismissal (either button): `localStorage.setItem('kalori.pwa-prompt.dismissed', '1')` — never shown again automatically
- Settings affordance remains available for manual install attempt
- If user does install (tracked via `appinstalled` event), same flag set

### Accessibility

- Modal `role="dialog" aria-modal="true"`
- Focus trap; Escape cancels
- Install button announced: `aria-label="Install Kalori as a home screen app"`
- iOS illustration has descriptive `aria-label`: *Share sheet opened with "Add to Home Screen" option highlighted*

### Responsive

- Desktop: modal 440px centered
- Tablet: modal 440px centered
- Mobile: modal full-width (16px margin), content same; illustration sized down to 60% on iOS path

---

## Component responsibilities summary (for main-agent assembly)

| Component | File path | Agent scope | Breakpoints |
|---|---|---|---|
| `<ProgressRangeToolbar />` | `components/progress/range-toolbar.tsx` | Agent 6 | All |
| `<CalorieAdherenceChart />` | `components/progress/calorie-adherence.tsx` | Agent 6 | All |
| `<MacroDistributionChart />` | `components/progress/macro-distribution.tsx` | Agent 6 | All |
| `<WeightTrajectoryChart />` | `components/progress/weight-trajectory.tsx` | Agent 6 | All |
| `<WaterAdherenceChart />` | `components/progress/water-adherence.tsx` | Agent 6 | All |
| `<MicronutrientHeatmap />` | `components/progress/micronutrient-heatmap.tsx` | Agent 6 | All (special mobile transpose) |
| `<WeeklyReviewIsland />` | `components/progress/weekly-review-island.tsx` | Agent 6 | All |
| `<WeeklyReviewSkeleton />` | `components/progress/weekly-review-skeleton.tsx` | Agent 6 | All |
| `<OnboardingLayout />` | `components/onboarding/layout.tsx` | Agent 6 | All |
| `<StepN />` (8 total) | `components/onboarding/step-*.tsx` | Agent 6 | All |
| `<SettingsLayout />` | `components/settings/layout.tsx` | Agent 6 | All |
| `<SettingsSection />` (×5) | `components/settings/section-*.tsx` | Agent 6 | All |
| `<AccountDeleteFlow />` | `components/settings/account-delete-flow.tsx` | Agent 6 | All |
| `<ExportModal />` | `components/settings/export-modal.tsx` | Agent 6 | All |
| `<LoginForm />` | `components/auth/login-form.tsx` | Agent 6 | All |
| `<FirstTimeDashboardCoachmark />` | `components/dashboard/first-time-coachmark.tsx` | Agent 6 + coordinate w/ Agent 3 | All |
| `<PWAInstallPrompt />` | `components/pwa/install-prompt.tsx` | Agent 6 | All |

---

## Residual / post-MVP heatmap notes

Flagged for future iteration (NOT in MVP scope, NOT specified here as live specs):

- **Extended 10-nutrient heatmap:** current MVP locks to 7 rows; Vitamin B12, Magnesium, Zinc, Folate, Potassium are common additions.
- **User-configurable row order:** not in MVP.
- **Heatmap row hover showing a trend spark-line:** post-MVP.
- **Year-view heatmap with month-aggregation cells:** the 1Y range currently just scales cell width down; a true month-aggregation view (365 days → 12 month columns × 7 rows) is post-MVP.

---

## Cross-agent reconciliation flags (for main-agent synthesis)

1. **Protein macro color (§2 Macro Distribution):** Agent 1 §2.2 maps protein → ivory; mockup uses oxblood. This fragment adopts Agent 1 (ivory) as canonical. Main-agent should confirm.
2. **Water adherence bar color (§4):** Agent 1 §2.2 maps water → slate; this fragment uses oxblood for progress-page charts. Dashboard water bullet stays slate (Agent 3 scope). Main-agent may adopt one token or both — both pass contrast.
3. **First-Time Dashboard (§First-Time Dashboard State):** overlaps with Agent 3's dashboard scope. This fragment defines the first-time variant; Agent 3 defines the normal-state. Main-agent synthesizes as "Dashboard — normal state + first-time state."
4. **Onboarding + Login mastheads:** use the same Kalori wordmark pattern as dashboard masthead — but with layout variations documented here (centered for onboarding Step 1 and login; edition-line omitted). No reconciliation needed — consistent enough with Agent 3 dashboard masthead.
5. **Weekly Review masthead format:** uses `§ 10 · FROM THE EDITOR` as its own section kicker; does NOT use edition-line format (that's a daily-dashboard affordance). No conflict.

---

## Fragment end.

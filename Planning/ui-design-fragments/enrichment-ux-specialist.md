# Pass 2 — UX Specialist Enrichment Delta

**Reviewer:** `ux-specialist` via the `ui-ux-pro-max` skill.
**Scope:** All six Pass-1 component-area fragments (foundations, navigation, dashboard, log-flow, library, progress/remainder) plus `Planning/design-doc.md §8–10`.
**Lens:** `ui-ux-pro-max`'s 99 UX guidelines + 57 font-pairing principles + 25 chart types + 161 product-type rules, plus `ui-design/web-ui-guide.md` for Next.js-specific patterns.
**Output format:** delta keyed by section — do NOT rewrite fragments.

This file surfaces cross-cutting issues first, then per-fragment overrides. Every finding cites a rule from the `ui-ux-pro-max` Quick Reference (§1–§10) or the skill's Common Rules / Pre-Delivery Checklist.

---

## 1. Typography Scale + Rhythm Audit

### 1.1 Triad coherence — verdict: strong foundation, three leaks

The `Newsreader · Inter · JetBrains Mono` triad is a textbook high-personality pairing — per `typography.font-pairing` it matches the editorial product type, and Agent 1's T1–T14 scale is disciplined. Three concrete **scale-drift** issues exist between fragments:

| # | Location | Size declared | Agent 1 scale says | Severity |
|---|---|---|---|---|
| A | Fragment 3 Meals Bulletin entry name `e-name` — "Newsreader 400 italic 18px" (mobile 15px) | T5 body serif is 14–22px, so 18px is inside-scale but mobile 15px is orphan | T5 range | Minor — add 15px to the scale as T5-small, or force mobile to 14px |
| B | Fragment 5 Library item card `food name` — "Newsreader 400 / 16px desktop, 14px mobile" | Same concept ("saved food name") as Fragment 3's e-name, but different weight + different size | — | **Moderate — user sees the same word in two sizes/italics depending on which screen** |
| C | Fragment 6 Progress `chart title (c-title)` — "Newsreader 400 / 22px" | Agent 1 T3 Heatmap/hero title is 32px; T5 body serif tops at 22px. 22px chart title collides with T5 body size, feels underweight for a header | T3 | Minor — bump to 24–28px, or tighten T5 max to 20px |

**Recommendation:** Introduce a `T5-small` row at 15px in Agent 1's scale so Fragment 3's mobile meals entry and Fragment 4's confirmation "Newsreader 20px" item name can coexist inside one system. Document that "library food name" and "meals entry food name" share the T5-italic role and must render at the same size on the same breakpoint.

### 1.2 Italic discipline — one leak

Fragment 5 §5.3 explicitly says "No italics" for library item name (per mockup), while Fragment 3 §Meals Bulletin puts the entry name in italic 18px. The user's mental model is "this is the food I ate" in both cases. Per `typography.font-pairing` the italic should signal *voice* (food-as-identified-subject), so Fragment 5's non-italic divergence is a meaningful break. **Fragment 5's own "Flag 4 for main agent" already raises this.** My recommendation: italicize in both places (preserve voice consistency) OR non-italicize in both (preserve mockup purity). Do not split. Italicizing reads more editorial and is more consistent with Agent 1 §3.2 T5 guidance ("Italic for food names").

### 1.3 Tracking consistency

Agent 1 declares `tracking-caps-loose` = 0.22em and `tracking-caps` = 0.18em. Fragments inconsistently pick:

- Fragment 2 nav labels: 0.18em (correct for nav per §10)
- Fragment 3 Masthead kicker: 0.22em
- Fragment 4 tabs: 0.22em
- Fragment 4 meal category chips: 0.22em
- Fragment 5 `FILTER` label: 0.22em
- Fragment 5 `SELECT` button: 0.22em
- Fragment 6 `SORT` labels in chart meta: 0.22em
- Fragment 6 onboarding BACK button: 0.2em (orphan — does not match either scale)

**Fix:** Either define a third tier `tracking-caps-wide = 0.2em` or force onboarding BACK button to 0.18em. Multiple 0.2em values scattered across Fragment 6 (onboarding dash text) should normalize to 0.18em or 0.22em. Per `typography.letter-spacing` — tracking drift is a premium-quality smell.

### 1.4 Line-height rhythm

Agent 1 §3.2 specifies `line-height: 1.55` for T5 body. Fragment 4 Confirmation "Newsreader 20 ivory, line-height 1.4" — 1.4 breaks the rhythm. `typography.line-height` says body should sit at 1.5–1.75; 1.4 is too tight for 20px. Force to 1.5.

### 1.5 Tabular numerics — strong and enforced

Agent 1 §3.3 is unambiguous — `.num` class is mandatory for every numeric display. This is correctly applied to the chronometer hero, macro gram values, heatmap cells, and progress bar labels. **No action needed**, this is a strength.

---

## 2. Spacing System Consistency

### 2.1 8px-base scale discipline — two concrete leaks

Agent 1 §5.1 declares an 8px scale: 0 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Most fragments hold the line. Two leaks:

| Location | Value used | Scale says | Severity |
|---|---|---|---|
| Fragment 3 Water Tracker `gap: 10px` between bullets | 10px | 8 or 12 | Minor (aesthetic) |
| Fragment 3 Meals Bulletin `gap: 14px` between rows | 14px | 12 or 16 | Minor — but breaks 8px rhythm |
| Fragment 5 Tools Rail vertical rhythm `14px top / 24px bottom` | 14px top | 16 or 12 | Minor |
| Fragment 5 divider `padding-top: 10px` | 10px | 8 or 12 | Minor |
| Fragment 5 dropdown label `margin-right: 10px` | 10px | 8 | Minor |
| Fragment 5 mono-tag `padding: 2px 6px` | 2/6px | 4/8 | Tolerable for sub-pixel chips, but 4/8 is the scale |
| Fragment 6 onboarding `padding: 24px 48px 0` on progress dash row | 48px ≠ on scale? 48 IS on scale, OK | — | OK |
| Fragment 6 onboarding dash `gap: 4px` | 4 | 4 | OK |

**Fix:** Normalize Fragment 3 `gap: 14px` → `gap: 16px`, Fragment 3 Water Tracker `gap: 10px` → `gap: 8px`, Fragment 5 `14px top` → `16px top`, Fragment 5 `padding-top: 10px` → `12px`, Fragment 5 label margin-right 10px → 8px. Per `layout.spacing-scale` (MD §5) — every spacing break reduces perceived polish.

### 2.2 Section padding inconsistency

Each surface declares its own top-of-page padding differently:
- Fragment 3 Dashboard: implied from grid tokens (no explicit)
- Fragment 5 Library `tools rail`: "padding: 0 16px" ❌ (16px horizontal but no page padding declared)
- Fragment 6 Progress: "padding: 24px" on chart cards
- Fragment 6 Onboarding: "padding: 48px"
- Fragment 6 Settings: "padding: 48px"

**Recommendation:** Define `--page-padding-desktop: 48px`, `--page-padding-tablet: 32px`, `--page-padding-mobile: 16px` as tokens in Agent 1 §5. Every page consumes the same token. Currently different screens produce visually different left-margin positions for their mastheads — a premium-quality break (per `layout.container-width`).

### 2.3 Card padding drift

- Fragment 6 `chart-card` padding: "24px"
- Fragment 6 `heatmap-card` padding: "30px 32px" — 30 is not on scale (24 or 32 is)
- Fragment 6 Weekly Review card: "40px 32px" — 40 is not on scale
- Fragment 5 library item card: "22px 20px 24px" — 22/20 neither on scale

**Fix:** Normalize to 24px / 32px / 48px. Fragment 6 heatmap-card → `32px`. Weekly review → `48px 32px`. Fragment 5 library item card → `20px 20px 24px` or even better `24px 20px` (consistent horizontal). Per MD `consistency` + `whitespace-balance` — reading a page becomes unsettled when each card has a different inner breathing room.

---

## 3. Interaction Pattern Completeness

### 3.1 Five-state coverage audit

`touch-and-interaction` + `state-clarity` require every interactive element to define default / hover (or pressed on mobile) / focus / active / disabled.

| Component | Fragment | Default | Hover | Focus | Active | Disabled |
|---|---|---|---|---|---|---|
| Sidebar nav item | 2 | ✓ | ✓ | ✓ | ✓ | — (MVP has no disabled) OK |
| Mobile tab | 2 | ✓ | — (n/a) | ✓ | ✓ | — OK |
| Mobile FAB | 2 | ✓ | — | ✓ | ✓ pressed | — OK |
| Log modal PARSE button | 4 | ✓ | ✓ implicit | ✓ implicit | parsing state | ✓ (text≤2) OK |
| Log capture button | 4 | ✓ | ✓ implicit | ✓ implicit | ✓ press scale | ✓ permission denied |
| Search input (Fragment 4 library) | 4 | ✓ | — | ✓ (2px oxblood) | focused | — ❌ **no empty-results state for the search itself** |
| Library card | 5 | ✓ | ✓ | ✓ | ✓ selected | — |
| Filter / Sort dropdown | 5 | ✓ | ✓ | ✓ | ✓ open | — ❌ **no loading/error state when options come from server** |
| Merge Dialog MERGE button | 5 | ✓ | — | ✓ | — | ✓ N≠2 |
| Progress range chips | 6 | ✓ | ✓ | ✓ | ✓ active | — |
| Onboarding Input | 6 | ✓ | — | ✓ | — | ✓ empty validation |
| Weight-log edit dot | 6 | ✓ | ✓ | ✓ (implicit) | — | — ❌ **delete action from within the dot tooltip has no disabled state for the last-remaining measurement** |
| Macro bar (Fragment 3) | 3 | ✓ | — | — | — ❌ | — |
| Water bullet (Fragment 3) | 3 | ✓ | — | — | filled | — |
| Micronutrient row | 3 | ✓ | — | — | — | — |

**Gaps:**

- **Fragment 3 Chronometer empty-state CTA (`state='empty'`):** has default but missing hover/focus/pressed explicit states for the inner button. State description says "acts as button" but doesn't wire pressed scale or focus ring. **Per `touch-and-interaction.hover-vs-tap` + `forms-and-feedback.loading-buttons`**, add default/hover/focus/pressed/disabled explicitly.
- **Fragment 3 Weekly Insight "VIEW FULL REVIEW →"** link arrow translate on hover only → add keyboard `focus-visible` (distinct from hover) and `active` (pressed on mobile).
- **Fragment 5 dropdown options during loading/error** — not defined. If library grows beyond 200 rows and server fallback fires, the dropdown needs a loading spinner option and an error state inline.
- **Fragment 6 onboarding slider** — only one combined state spec; no focus ring, no pressed, no disabled.

### 3.2 Transition-duration consistency

Agent 1 §6.1 declares the 4 motion tokens (micro 120ms, standard 180ms, expressive 320ms, chrono 600ms). Fragments should cite these names, not raw values. Audit:

| Fragment | Uses named tokens | Uses raw durations |
|---|---|---|
| 2 Navigation | ✓ mostly | "200ms debounce" on rail pointer-leave ❌ (use `motion-standard`) |
| 3 Dashboard | ✓ mostly | "350ms" for water bullet ember pulse ❌ (use `motion-expressive = 320ms`) |
| 4 Log Flow | "180ms", "120ms", "600ms" — named by number only | ✓ but should reference token name |
| 5 Library | ✓ referenced by name | "150ms" debounce (acceptable — not a UI transition) |
| 6 Progress | ✓ mostly | "1.6s" skeleton shimmer ❌ (introduce `motion-shimmer` token) |

**Fix:** Add `motion-shimmer: 1600ms` to Agent 1 §6.1. Change Fragment 3 water bullet ember pulse from 350ms to `motion-expressive` (320ms). Fragment 2 rail-leave debounce from 200ms to `motion-standard` (180ms). Per `animation.motion-consistency` — unified duration tokens is a premium-UI requirement.

### 3.3 Missing state-definition cluster: loading/empty/error/offline

`forms-and-feedback.empty-states` + `charts-and-data.empty-data-state` + `performance.offline-support` require every data-dependent component to ship these 4 states.

| Component | loading | empty | error | offline |
|---|---|---|---|---|
| Dashboard Chronometer | ✓ | ✓ | ✓ | ❌ no explicit offline state |
| Dashboard Macro Bars | ✓ | — ❌ no empty variant (zero entries today?) | ✓ | ❌ |
| Dashboard Meals Bulletin | ✓ | ✓ | ✓ | ❌ |
| Dashboard Water Tracker | ✓ | ❌ no 0-glasses state | ✓ | ✓ offline-pending |
| Dashboard Micronutrient Panel | ✓ | ✓ sparse-data | ✓ | ❌ |
| Dashboard Weekly Insight | ✓ | ✓ sparse-data/first-week | ✓ | ❌ |
| Log TYPE textarea | ✓ empty idle | — ❌ | ✓ | ❌ (auth-expiry is a different state) |
| Log SNAP capture | ✓ | — ❌ no "camera not yet permitted" empty | ✓ | ❌ |
| Log LIBRARY grid | ✓ | ✓ | ❌ | ❌ |
| Library grid | ✓ | ✓ | — ❌ no error state when fetch fails | ❌ |
| Library Food Detail | ✓ | — | — ❌ | ❌ |
| Progress Calorie Adherence | ✓ | ✓ × 2 (empty + sparse) | — ❌ | ❌ |
| Progress Weight | ✓ | ✓ × 4 | — ❌ | ❌ |
| Progress Heatmap | ✓ | — ❌ no "no micronutrient data yet" state | — ❌ | ❌ |
| Progress Weekly Review | ✓ | ✓ sparse | ✓ | ❌ |

**Most impactful gap:** Nothing defines an **offline state** for reads. Service-worker stale-while-revalidate handles the mechanics, but no fragment specifies what the user sees when offline and data is stale. Add an offline indicator: a persistent top-of-viewport bar "OFFLINE · showing cached data from {HH:mm}" in `sand` on `bg-2`. Per `performance.offline-support` + `network-fallback` this is a hard requirement for PWAs.

### 3.4 Disabled-state opacity discipline

`forms-and-feedback.disabled-states` specifies 0.38–0.5 opacity + cursor change + semantic attribute. Audit:

- Fragment 2 nav (no disabled) — OK
- Fragment 4 PARSE button disabled: "cursor: not-allowed" ✓, `bg-2` fill + `dust` text — **uses color change instead of opacity reduction** — acceptable but inconsistent with Fragment 6
- Fragment 6 onboarding NEXT disabled: "opacity: 0.4" — uses opacity ✓
- Fragment 6 Bulk Action Bar Merge disabled: "oxblood × 0.4 alpha" — uses opacity ✓
- Fragment 6 DELETE NOW disabled: opacity-based ✓

**Fix:** Pick ONE convention. Recommendation: disabled state is always `opacity: 0.4 + cursor: not-allowed + aria-disabled="true"`. The color-change pattern in Fragment 4 is less scannable. Per MD `disabled-states` the opacity-based approach is the documented Material standard.

---

## 4. Form Field Conventions

### 4.1 Label + input + helper + error pattern

`forms-and-feedback.input-labels`, `error-placement`, `input-helper-text`, `error-clarity`. The fragments collectively define forms in 5 places:

| Form surface | Label position | Input | Helper | Error |
|---|---|---|---|---|
| Fragment 4 TYPE textarea | — (placeholder only) ❌ | serif 20px | "ENTER = PARSE · SHIFT + ENTER" helper ✓ | inline banner (above textarea) |
| Fragment 4 LIBRARY search | — (icon + placeholder) ❌ | 44px sans 14px | — | empty-results message |
| Fragment 4 Portion Picker stepper | — | serif 32px | — | — |
| Fragment 4 Confirmation stepper + time | — | serif 20px | — | — |
| Fragment 5 Library search + filter + sort | label prefix (`FILTER`, `SORT`) above-inline ✓ | 44px | `/` hotkey chip ✓ | — (no validation on these controls) |
| Fragment 6 Onboarding Step 2 name | UPPERCASE label above ✓ | 56px serif | — | inline caption below "! Please enter a name" ✓ |
| Fragment 6 Onboarding Step 3 DOB | label above ✓ | 56px native date | privacy caption below ✓ | inline caption ✓ |
| Fragment 6 Onboarding Step 5/6 height/weight | label above ✓ | 56px | — | — ❌ no validation spec for out-of-range |
| Fragment 6 Settings | label above ✓ | 56px | depends | "Couldn't save" toast ✓ |
| Fragment 6 Account Delete Step 2 email | "case must match" instruction above ✓ (serif) | 56px mono | — | — (silent validation — intentional) |
| Fragment 6 Login email/password | label above ✓ | 56px mono | — | inline caption oxblood + form-level banner ✓ |

**Gaps:**
1. **Fragment 4 TYPE textarea has no visible label.** `forms-and-feedback.input-labels` prohibits placeholder-only labels. Add a small UPPERCASE label above (`DESCRIBE YOUR MEAL`) or the hidden-visually `<label for="">` pattern with `sr-only`. This is a WCAG 1.3.1 requirement — flagging as a **Moderate** accessibility concern too.
2. **Fragment 4 LIBRARY search has no visible label.** Same fix. Hotkey chip is not a label.
3. **Fragment 4 Portion Picker stepper** — the value is 32pt serif, gorgeous, but has no label anywhere saying "portion quantity". Add UPPERCASE label above.
4. **Fragment 6 Onboarding Step 5/6** — `inline caption error` pattern appears on Step 2/3 but not Step 5/6 despite having range validation. Extend the pattern.
5. **Fragment 6 password** — no helper for password requirements (min length, complexity). Per `input-helper-text` add inline-on-focus helper: "at least 8 characters".

### 4.2 Inline vs on-blur vs on-submit validation

`forms-and-feedback.inline-validation` says validate on blur, not keystroke. Audit:

- Fragment 6 Onboarding Step 2: "Validate on NEXT" — behaves like on-submit only. Should be on-blur (show error caption when user leaves empty field).
- Fragment 6 Account Delete Step 2 email: "as user types" silent validation — fine (security-driven).
- Fragment 6 Settings: autosave on blur ✓ — good pattern.
- Fragment 4 TYPE textarea: "text ≤ 2 chars" disables button — effectively on-keystroke for the PARSE enablement. Acceptable because button is the commit gate, not a validation error.

**Recommendation:** Onboarding inputs should validate on **blur** with inline caption; re-validate on NEXT submit. Current spec conflates the two.

### 4.3 44px min-height

`forms-and-feedback.touch-friendly-input` + tap-target rule: ≥44px height on all mobile inputs. Audit:
- All onboarding inputs: 56px ✓
- Log TYPE textarea: 12 lines default → at 20px Newsreader line-height 1.4 = 28px per line → 336px ✓
- Log LIBRARY search input: 44px ✓
- Login email/password: 56px ✓
- Portion Picker steppers: stepper buttons 44×44 ✓
- Chip buttons (meal category in Confirmation): 96×44 ✓
- Confirmation inline stepper: "36 × 28px" ❌ **breaks 44×44** — needs a wrapper touch-area of 44×44 even if the visual is 36×28. This is a Moderate issue — fix by expanding hit area via padding or `hitSlop`-equivalent.

### 4.4 Number steppers, date pickers, file uploads — consistency

- Stepper (Fragment 4 Portion Picker): `−` / value / `+`, 44×44 buttons, serif 32px value — clear pattern.
- Stepper (Fragment 4 Confirmation): "36 × 28px" — different size from Portion Picker. **Inconsistency**. Align both at 44×44.
- Date/time picker (Fragment 4 Confirmation "LOGGED AT"): "native date + time input" — no styling spec. Native inputs vary widely across browsers; on mobile they're sheets, on desktop they're dropdown. **Moderate:** Specify a styled wrapper or pick one library (`react-day-picker` for a Ledger-consistent calendar).
- File upload (Fragment 4 SNAP "UPLOAD INSTEAD"): link styling only — no drag-drop zone spec, despite being on desktop too. Per the web-ui-guide, add drag-drop support with visual zone + border-dashed on drag-enter.
- Toggle switches (Fragment 4 "SAVE TO LIBRARY" + Fragment 6 Display/Reduce motion): two spec styles — Fragment 4 is "48×24 rectangular zero-radius", Fragment 6 describes toggles as "`<button role="switch" aria-checked>`". Both should share a single `<Toggle>` component spec. Fragment 4's visual is the canonical definition; add a `components/ui/toggle.tsx` reference.

---

## 5. Chart Type Selection

Referencing `ui-ux-pro-max`'s 25 chart types and `charts-and-data.chart-type` rule — matching data type to chart.

### 5.1 Current selections — mostly good, one miss

| Chart | Data type | Current choice | Verdict |
|---|---|---|---|
| Chronometer ring | "today vs. target" single ratio + projection | Radial dual-arc ring (custom) | ✓ Excellent, distinctive, signature piece |
| Macro Bars (dashboard) | "consumed/target per macro, stacked within day" | Horizontal progress bar × 3 | ✓ Good |
| Macro Distribution (progress) | "per-day macro grams over N days" | Stacked bar chart | ✓ Good choice per `chart-type` (comparison + composition) |
| Weight Trajectory | "weight over time + projection + goal line" | Line chart + dashed projection + reference line | ✓ Excellent |
| Water Tracker (dashboard) | "units consumed vs. target" | Bullet row | ✓ Good — bullet chart variant |
| Water Adherence (progress) | "daily water vs. target, N days" | Horizontal bar chart | ⚠️ **See below** |
| Micronutrient Heatmap | "7 nutrients × N days matrix" | Calendar-style heatmap | ✓ Excellent signature piece |
| Calorie Adherence (progress) | "kcal vs. target per day" | **Bar chart with projection overlay** | ⚠️ **See below — area chart would arguably read better** |

### 5.2 Missed opportunity #1 — Calorie Adherence as an area chart

Fragment 6 Section 1 uses a bar chart with color-coded bars + dashed projection. Per `chart-type` and `trend-emphasis`: when the user cares about **trend over time** (is my adherence trending up?), an area chart with filled area below a target line is a stronger reading than bars. The current bar chart emphasizes discrete daily comparison — good for answering "did I hit target on day 7?" but weak for "am I on track this month?"

**Recommendation:** Make calorie adherence a **composed area chart**:
- Area fill (ivory 20% opacity) under the actual-kcal line
- Target reference line (ivory dashed at target)
- Over-target area (oxblood 30% opacity) above target line where line exceeds
- Projection as dashed continuation of line

Retain bars as an opt-in variant if needed. Per `trend-emphasis` + `data-density`, areas communicate "pattern over time" faster.

### 5.3 Missed opportunity #2 — Water Adherence horizontal bars

Current: "one bar per day". Not compelling for 30d view. With 30 stacked horizontal bars the user scans a wall of bars.

**Alternative:** Match Water Adherence to Calorie Adherence's axis orientation — same format = same mental model. Use the same **bar chart with target reference line** pattern Calorie uses. Or better: make water a **line chart** (daily ml) with target line, visually paralleling Weight Trajectory. Two horizontal-bar charts (Water + Macro) feel redundant; diversifying to a line matches the Progress page's "data genres" narrative better.

### 5.4 Chart interactions — specified unevenly

Per `charts-and-data.tooltip-on-interact` + `axis-labels` + `legend-interactive`:

| Chart | Tooltip | Keyboard focus | Legend interactive | Empty state |
|---|---|---|---|---|
| Chronometer | ✓ aria-label | N/A (not a chart per se) | — | ✓ |
| Macro Bars | ✓ aria-label (meter role) | — | — | — |
| Calorie Adherence | ✓ explicit tooltip content | ✓ Arrow keys | — ❌ not specified | ✓ |
| Macro Distribution | ✓ tooltip | — ❌ not specified | — ❌ | ✓ |
| Weight Trajectory | ✓ | — ❌ | ❌ | ✓ |
| Water Adherence | ✓ | — ❌ | ❌ | — ❌ |
| Micronutrient Heatmap | ✓ | ✓ Arrow navigation, comprehensive | N/A | — ❌ no "no data yet" state |

**Gaps to fill:**
1. All charts need **keyboard focus** for data points (not just heatmap). Use WAI-ARIA pattern: arrow keys move focus between data points; Enter/Space triggers tooltip display.
2. **Legend interactive** (`legend-interactive`): clicking a legend item toggles the series visibility. Implement on Macro Distribution and Calorie Adherence. Progress legend entries should be `<button aria-pressed>`.
3. **Heatmap empty state:** if fewer than X days with micronutrient data, show "Log 3+ days with annotated micros to see the heatmap" instead of a blank matrix.

### 5.5 Axis readability — tabular formatting

`charts-and-data.number-formatting` + `axis-readability`. Fragment 6 uses mono 9px for axis labels — below the 12px WCAG-comfortable floor. `number-tabular` says tabular figures for data columns. Audit:
- Fragment 6 Calorie Adherence Y-axis ticks: mono 9px `dust-2` — **font-size fails `readable-font-size` minimum**.
- Fragment 6 heatmap day numbers: 9.5px `dust` — similar.

**Fix:** Raise axis tick labels to 10.5px (minimum from Agent 1's Mono scale). Keep mono + tabular but at the accessibility floor. On mobile, axis label auto-skip per `axis-readability` — specify auto-skip every-2nd or every-3rd label when bar-width < 16px.

---

## 6. Micro-interaction Quality

### 6.1 Delightful-and-appropriate micro-interactions — preserved

`animation.motion-meaning` — every animation must express a cause/effect.

| Interaction | Purpose | Verdict |
|---|---|---|
| Chronometer stroke-dashoffset 600ms `ink-settling` | Draws the day into being | ✓ Signature, perfect |
| Macro bar `rule-draw` 320ms | Bar inks in from left | ✓ On brand |
| Water bullet ember pulse on +GLASS | Confirmation the tap registered | ✓ Excellent |
| Drop cap fade 120ms after body | Sequenced "letter lands like ink" | ✓ Signature, perfect |
| Undo toast countdown bar | Tactile sense of time pressure | ✓ Good |
| "VIEW FULL REVIEW →" arrow translate 2px on hover | Directional cue | ✓ Good |
| Shared-element library card → food detail | Spatial continuity | ✓ Good |
| Rail width 56→240 | Expands on intent | ✓ Good |

### 6.2 Micro-interactions that feel overused or risk overuse

- **Fragment 6 chart card `motion-ember-pulse` on edit commit** (pessimistic PATCH) — at 180ms a single scale pulse is fine, but the pattern is used everywhere (water bullet, weekly-review CTA hover, library edit commit, merge dialog confirm). Risk: every commit feels the same. **Recommendation:** Reserve ember-pulse for **first-time confirmations only**. Subsequent commits (e.g., editing a library item for the 10th time this session) should settle to a simpler `ink-fade`. Per `animation.excessive-motion` — 1–2 key animations per view max.
- **Fragment 6 skeleton shimmer** — 1.6s ease-in-out opacity pulse across every chart during load. Across 6 chart cards loading simultaneously = 6 pulses in sync. Disorienting. **Fix:** Stagger the skeleton shimmers 150ms apart per card OR use a single page-level shimmer.

### 6.3 Missing micro-interactions that would elevate the product

1. **Scroll-linked edition number rotation.** As the user scrolls through the dashboard, the edition line could subtly update `opacity: 0.6 → 1.0` when approaching the masthead's re-entry point. Subtle, per `parallax-subtle`.
2. **Haptic-like visual feedback on mobile long-press.** When the user long-presses a meal entry to open the context menu, render a micro-scale pulse on the entry itself (scale 1.00 → 0.99 → 1.00 over 120ms) before the menu appears. Signals "your press registered". Per `animation.scale-feedback`.
3. **Chronometer numeric tick cross-fade on entry add.** Current spec crossfades the center number in 220ms — this is good but subtle. Consider a **vertical slide up + fade** (old number slides up 4px, new number slides in from bottom) for more perceptual continuity — signals "entry just added, this is the new total". Per `animation.hierarchy-motion`.
4. **Rule-draw entering on first-scroll-reveal for progress charts.** The 320ms rule-draw hairline entering when a section first scrolls into view would reinforce The Ledger metaphor — printing the page as the user reads. Current spec only uses rule-draw for bar widths. Apply to section hairlines via IntersectionObserver.
5. **Focus-ring "lift" on keyboard focus.** Currently focus is a flat 2px oxblood outline. Per `animation.state-transition`, animate the outline's offset from 0px → 2px over 80ms (`motion-micro`) so the ring *appears*, signaling "focus received". Not required but elevates perception.

---

## 7. UX Flow Quality

### 7.1 Log Flow (TAB → Confirmation → Save → Undo) audit

End-to-end flow: Launch (FAB/shortcut) → Modal open → Tab select (TYPE/SNAP/LIBRARY) → Input → [AI parse or library pick] → Confirmation → Save → Undo Toast.

#### Cognitive friction checks

- **Tab switcher at top of modal.** User taps FAB, modal opens with TYPE as default. Good default (most common intent). BUT: if user previously used SNAP 3 times in a row, default doesn't adapt. **Recommendation:** After 5 uses of a single tab in a session, remember the preference in Zustand and make it the default for next open. Per `forms-and-feedback.progressive-disclosure` — learn user intent.
- **"PARSING…" state on PARSE button** — disables the button + adds spinner ✓. But there's no cancel affordance during parsing (spec says tap outside or Escape aborts). On mobile, "tap outside" is unclear — what's "outside" when modal is full-screen? **Fix:** Add explicit `CANCEL PARSING` button inline with the spinner or a swipe-down gesture hint.
- **Confirmation screen entry motion is 600ms (chrono-draw level).** This is a deliberate editorial flourish, but 600ms is long for a transition the user will see every single time they log. Per `animation.duration-timing` — micro-interactions 150–300ms max. **Recommendation:** Cut to `motion-expressive` (320ms) for regular use; reserve 600ms chrono-draw for the once-per-day chronometer paint. The 220ms `motion-fade-ink` crossfade could be equally good here.
- **"Save-to-library" toggle default ON.** Great — avoids dead library. But user with rapid-fire tastes ("avocado toast today, avocado toast tomorrow") might unintentionally create 2 library items if dedup fails. The dedup-prompt banner is good, but `REUSE EXISTING` and `CREATE NEW` are equally-weighted CTAs. **Recommendation:** Reuse Existing should be the primary button (oxblood fill), Create New secondary (outline). Per `forms-and-feedback.destructive-emphasis` — prevent irrevocable branching into fragmented library by weighting the canonical action.
- **Back-button ambiguity from confirmation.** If the user decides "I don't want to save this" at the Confirmation screen, the Discard link is there, but the only path back to the TAB view (without discarding) is... none. User cannot go back to re-edit text on TYPE tab, for example. **Fix:** Add a tertiary link "← EDIT INPUT" to the left of SAVE that returns user to the tab with preserved draft.
- **Unsaved-state warning.** Fragment 4 specifies "backdrop click closes — if >2 chars typed, show 'DISCARD UNSAVED ENTRY?' prompt". Good. But the prompt doesn't cover the case where the user closes the browser tab mid-edit. `forms-and-feedback.form-autosave` calls for sessionStorage-persisted drafts — this is already spec'd ✓. Double-check SNAP capture images are NOT persisted (per I4 retention policy) — spec is correct, re-upload required.

#### "Why these numbers?" trust-building surface strength

The panel surfaces Gemini's ingredient-confidence triples when available. **Audit:**
- Collapsed by default ✓ — appropriate progressive disclosure
- Expansion caret rotation 120ms ✓
- Max-500-char body hard-capped ✓
- Per-ingredient confidence inside the table ✓
- **Missing:** A "Was this helpful?" thumb-up/thumb-down control on the expanded body. Helps you learn which reasoning styles users trust — currently Fragment 4 has a per-item "· REPORT" but that's for flagging bad parses, not celebrating good ones. Per `forms-and-feedback.success-feedback` — positive feedback loops build trust.
- **Missing:** Source citations clickable. "sources · usda.sr30 · openfoodfacts" is mono text. Make each source a link that opens in a new tab — makes the reasoning traceable. Per `charts-and-data.drill-down-consistency`.
- **Missing:** Clear indication when AI confidence is LOW (per design-doc §7). Fragment 4 says "italic serif 'estimate' footnote" — specify which exact threshold triggers the italic 'estimate' tag and whether it shows on the item row (for quick scan) or only in the expanded panel.

### 7.2 Undo toast LIFO + 5s window clarity

- **5-second window:** clear via countdown bar ✓.
- **LIFO visible semantics:** only top toast visible, stack depth hidden. If user saves 3 things rapidly, they'll see 3 toasts flash quickly but only the latest is undoable. **Concern:** User may not realize earlier saves committed silently. Per `forms-and-feedback.undo-support` the undo pattern requires clear indication of scope.
- **Recommendation:** On the visible toast, when stack depth > 1, add a small "+N MORE SAVED" muted text in the toast. Makes the stacking visible.
- **Pending count on FAB / nav.** When multiple undo toasts are silently committing in background, user may wish to see "3 pending commits" to not close the tab. Out of scope for MVP probably — flag as post-MVP.
- **Undo through page navigation.** Fragment 4 specifies: route change auto-dismisses + commits all pending. This is the correct cognitive model (you can't un-eat the page change), but users will hit it — changing screen invalidates their undo window. **Consider:** warn with a "You have 2 pending actions. Navigate anyway?" dialog if the user tries to change route with toast visible. Or accept this as documented cost of speed.

### 7.3 Library flow

- Tap → Food Detail drill-in ✓ via shared-element transition
- Long-press → context menu ✓
- Select mode (bulk) → Cancel resets ✓
- Merge flow → dialog with per-field picker → preview ✓ — genuinely excellent
- **Concern:** Select mode is triggered by `SELECT` button in top tool rail. There's no visual indication of "select mode" other than chip/border appearance until a card is selected. Per `navigation.persistent-nav` the current mode (browse vs. select) should persist as a visible chrome element. Fragment 5 §3.5 does add an oxblood 2px hairline below the tools rail in active mode — good. Strengthen: gray out the search input while select mode is on (search doesn't apply in select mode) OR allow search inside select mode.

### 7.4 Onboarding flow

- 8 steps with progress dashes ✓
- Back/next pattern clear ✓
- Skip on step 2 only ✓
- Step 8 live-compute calorie target ✓
- **Concern:** Step 1 has no input; user just taps BEGIN. Step 8 has no validation failure path — what if user tries to proceed with no goal chosen? Currently "disabled until chip selected" — acceptable.
- **Missing:** Multi-step progress indicator (`forms-and-feedback.multi-step-progress`) — the 8 dashes are thin; users may not count them. Add "Step 3 of 8" text alongside the dashes.
- **Missing:** No explicit back-navigation behavior for Step 8 (results). If user hits Back from Step 8, do they land on Step 7 with activity level pre-selected? Fragment 6 says progress dash fills on step advance, but doesn't describe what unfills on back. Specify.

---

## 8. Empty + Edge States

Per §3.3 above, the state-coverage table has gaps. Here are the priority fixes:

### 8.1 Must-have empty states (highest user-impact)

1. **Dashboard Chronometer loading state during first Gemini call** (Fragment 3). `state='loading'` spec says "single hairline-strong circle, center `—`" — good. But when first-time-dashboard (Fragment 6 §First-Time) is rendered, the chronometer looks empty but actually awaits the Weekly Review generation. Disambiguate: first-time empty says "LOG SOMETHING" center text ✓; post-log loading says "—". Clear.
2. **Heatmap empty state** when < 3 days of micronutrient data (Fragment 6): Currently spec says `< 3` days renders bars for available days but hides averaged stat. Extend: if 0 days of micronutrient data logged, render the heatmap table **with all cells in `c0` (darkest warm)** + a caption "Log 3+ days to see the heatmap fill in." per `charts-and-data.empty-data-state`.
3. **Library error state** (Fragment 5): `food_library_items` fetch may fail (RLS error, network). Spec currently implies server-rendering via Cache Components doesn't have a client-visible error path. Add an explicit error state: "Couldn't load library. Refreshing…" with a retry button. Per `error-state-chart`.
4. **Weekly Insight offline/cached state** (Fragment 3): when user is offline and cached weekly review is stale (>7d), Fragment 3 says `stale` variant shows "A fresh review awaits your word" + regenerate button. Per `performance.offline-support` add: "You're offline — your last review is from {date}" to make the staleness visible, not just action-able.

### 8.2 Offline state global pattern

Fragment 3 water tracker has `offline-pending` chip. No other component has an offline indicator. Per `performance.offline-support`:

**Add to Agent 1:** A global offline banner that renders at top of viewport when `navigator.onLine === false`. Spec:
- Position: sticky top, z-index above masthead
- Height: 32px
- Background: `bg-2`, 1px bottom border `rule-strong`
- Text (Inter 10.5 UPPERCASE tracking 0.22em, `ember`): `OFFLINE · YOUR CHANGES WILL SYNC WHEN YOU RECONNECT`
- Aria-live: `polite`

### 8.3 "First-time / no data yet" states — check for warmth

Current first-time states in Fragment 6:
- Dashboard: "Log your first meal" ✓
- Library: "No titles yet filed" ✓
- Progress: "Nothing to chart yet. Log a meal to begin the record." ✓
- Onboarding Step 1: Warm welcoming copy ✓

All tone-appropriate. No change needed.

---

## 9. Accessibility as UX (pre-a11y-audit)

### 9.1 Visual focus indicators — contrast check

Agent 1 §7.2 specifies 2px `oxblood` outline at 2px offset. Contrast of oxblood (`#8A2A1F`) vs bg-0 (`#0E0A08`) = 2.86:1. WCAG SC 2.4.11 requires **3:1** contrast for focus indicators (and 1.4.11 Non-text Contrast requires 3:1 for UI components). **2.86 FAILS** by 0.14.

This is a **Moderate accessibility issue** already flagged by Agent 1 §2.1 for oxblood as text. It applies to focus rings too because focus indicators are UI contrast-critical.

**Fixes (pick one):**
1. Shift focus ring to `ivory` (15.86:1) — strong but clashes with accent identity
2. Shift focus ring to `oxblood-soft` (`#A13A2C`, 3.70:1) — passes ✓ — recommended
3. Use oxblood + add `outline-offset: 2px` (which Agent 1 already specifies) + add a 1px `ivory` inner ring to create double-ring visibility

**Recommendation:** Change focus ring to `oxblood-soft`. Pass contrast AND stay in palette. Update Agent 1 §7.2 and propagate to all fragments.

### 9.2 Tap target 44×44 audit

- Fragment 2 nav items: 56px ✓
- Fragment 3 water bullet chips: 44×32 ❌ **breaks 44×44** — the chip is 44 wide but 32 tall. Fragment 3 §Water Tracker says "3 chip buttons, 44×32 min". **Fix:** Raise to 44×44.
- Fragment 4 Confirmation stepper: 36×28 ❌ (already flagged §4.3)
- Fragment 5 select-mode checkbox chip: decorative — card hit-target is used — OK
- Fragment 6 onboarding slider thumb: 16×16 — fails 44×44 on touch. Touch handler must extend hit area, specify explicitly.
- Fragment 6 password reveal toggle: 44×44 ✓
- Fragment 6 bulk action bar close (X) on sheet: 44×44 via Phosphor `X` in wrapper ✓

**Fixes:**
1. Fragment 3 Water Tracker chip buttons → 44×44
2. Fragment 4 Confirmation stepper → 44×44
3. Fragment 6 slider thumb → specify `hitSlop` or invisible padding for 44×44 touch target

### 9.3 Color-never-sole-signal audit

Agent 1 §7.7 table is strong and downstream fragments mostly honor it. Two fragments need tightening:

1. **Fragment 6 weight trajectory "dashed ember projection" color-only signal.** The dashed ember segment is visually distinct only by dash pattern + color. Color-blind users will see the pattern (dash) ✓ but not the color cue. Fragment 6 correctly calls this out in legend "projected, remainder of day" with its own swatch. ✓
2. **Fragment 6 water adherence over/under/at target** colored bars. Legend has swatches but if user can't distinguish the colors, they rely on bar length + target line. Fine but add a small `✓` glyph on bars ≥100% as second channel per §7.7.
3. **Fragment 6 macro distribution stack colors** — user must distinguish 3 stacked colors. Legend has swatches. Per `charts-and-data.pattern-texture` add subtle patterns/textures to the stack segments (diagonal hatch, dots, horizontal lines) as a secondary cue. Protein ivory = plain; Carbs ochre = diagonal 45° hatch; Fat ember = dot pattern. Increases color-blind accessibility without breaking the editorial look.

---

## 10. Specific Overrides + Recommendations (Per-Fragment)

Per instructions — 3–5 concrete upgrades per fragment. Cite skill rule.

### Fragment 1 — Foundations

1. **Add offline banner token** (`offline-banner-bg: bg-2`, text color `ember`, height 32px). Per `performance.offline-support`.
2. **Change focus-ring color to `oxblood-soft`.** Per §9.1. Update §7.2 utility `.focus-editorial` accordingly.
3. **Add `motion-shimmer: 1600ms` token + define shimmer easing.** Per `animation.motion-consistency` + `performance.progressive-loading`.
4. **Extend type scale T5-small = 15px italic Newsreader.** Resolves fragment 3's mobile orphan + fragment 5 library card. Per `typography.font-scale`.
5. **Add `--page-padding-desktop/tablet/mobile` tokens** in §5. Per `layout.container-width`.

### Fragment 2 — Navigation

1. **Add missing hover states** on mobile tab bar (`hover` is desktop/tablet only — but the entry says "Pressed" overlaps with active state). Per `touch.press-feedback` — add a distinct pressed state (scale 0.98, 80ms) on touch to signal registration separate from active.
2. **Add rail-collapsed tooltip keyboard path.** Fragment 2 §Tablet Rail says "hover shows tooltip with name"; add focus-visible tooltip (not just hover) — per `hover-vs-tap`.
3. **Make FAB scale-press animation more subtle.** `scale(0.96)` is aggressive for a button that will be pressed 10× per day. Reduce to `scale(0.98)` over 80ms. Per `animation.scale-feedback`.
4. **Add loading state to FAB** during log modal in-flight. When user taps FAB and the modal hasn't rendered yet, show `opacity: 0.6 + cursor: progress` for 200ms. Per `forms-and-feedback.loading-buttons`.
5. **Breakpoint transition at 1279→1280 is instant.** Per `animation.layout-shift-avoid` — specify graceful transition: fade old nav out 120ms, fade new nav in 120ms, on resize event. Currently "instant pattern swap" risks jarring UX on desktop window-drag.

### Fragment 3 — Dashboard

1. **Align meals bulletin `gap: 14px` to `gap: 16px`** for 8px-scale compliance. Per `layout.spacing-scale`.
2. **Water bullet tap-target to 44×44** (currently 44×32). Per `tap-target-minimum`.
3. **Add `<button>` wrapper for chronometer empty-state CTA** with explicit hover/focus/pressed states. Currently implicit. Per `touch.press-feedback`.
4. **Add empty state for macro bars** (all zeros) — currently undefined; during first-time-dashboard the macro bars go to 0%. Per `forms-and-feedback.empty-states`.
5. **Weekly Insight: move drop-cap color check to audit.** Drop cap oxblood at 48px on `bg-2` (bg-quote): verify contrast — currently 2.86:1 oxblood on bg-0 stated; bg-quote (`#1A1310`) is slightly lighter so contrast is lower (~2.74:1). Fragment 3 waives this because size passes WCAG LargeText (≥18pt). Document the waiver explicitly in the Weekly Insight spec. Per `color-contrast`.

### Fragment 4 — Log Flow

1. **Add visible labels to TYPE textarea and LIBRARY search** (sr-only or UPPERCASE above). Per `input-labels`.
2. **Align confirmation stepper to 44×44** (currently 36×28). Per `touch-friendly-input`.
3. **Reduce confirmation entry motion from 600ms to 320ms** (`motion-expressive`). 600ms is too slow for a repeat interaction. Per `animation.duration-timing`.
4. **Weight `REUSE EXISTING` as primary button** in dedup-prompt (currently equal). Per `destructive-emphasis` (emphasis reversed — favor the canonical action).
5. **Add "EDIT INPUT" back-link** on confirmation screen to return to tab with preserved draft. Per `forms-and-feedback.error-recovery` + `multi-step-progress` (back-nav preserved).
6. **Specify native date-time picker styling wrapper** — the `LOGGED AT` field should use a styled calendar library (e.g., `react-day-picker` or the shadcn date picker) not raw native `<input type="datetime-local">`. Per `style-selection.consistency`.

### Fragment 5 — Library

1. **Add loading + error states to filter/sort dropdowns.** Currently only default/hover/open. Per `forms-and-feedback.disabled-states` + `error-clarity`.
2. **Normalize card padding** from `22px 20px 24px` to `24px 20px 24px` (8px scale compliance). Per `layout.spacing-scale`.
3. **Letter-mark color reconciliation:** adopt `oxblood bg + ivory letter` (Fragment's choice) as canonical + cite contrast ≥ 6.5:1. Update Agent 1 and design-doc to match. Per `color.contrast-readability`.
4. **Specify filter/sort dropdown open motion direction.** Currently 4px translateY up — should be down (coming from the button below). Per `animation.hierarchy-motion` (enter from below = deeper).
5. **Add confirmation preview list pagination** when N>10 for bulk delete. Currently shows "AND {N-3} MORE" — for large batches add "View all {N}" disclosure. Per `forms-and-feedback.progressive-disclosure`.

### Fragment 6 — Progress + Remainder

1. **Convert Calorie Adherence from bar chart to composed area chart** with target line and over-target shaded area. Per `charts-and-data.trend-emphasis`.
2. **Add keyboard arrow-key navigation to all charts** (currently only heatmap). Per `focusable-elements` + WCAG 2.1.1.
3. **Add interactive legend** (click to toggle series) to Calorie Adherence and Macro Distribution charts. Per `charts-and-data.legend-interactive`.
4. **Add texture patterns to Macro Distribution stack** (diagonal for carbs, dot for fat). Per `charts-and-data.pattern-texture` — color-blind support.
5. **Onboarding progress indicator: add "Step N of 8" text** alongside 8-dash pattern. Per `forms-and-feedback.multi-step-progress`.
6. **Onboarding slider thumb**: specify `hitSlop` of 16px on all sides for 48×48 effective touch area. Per `touch.touch-target-size` and `no-precision-required`.
7. **Account Delete Step 2** — the "silent match validation" UX is intentional security but jars against typical forms. Add subtle indicator: once match, a moss dot + "email confirmed" text appears below the input so user knows they can proceed without guessing. Per `forms-and-feedback.success-feedback`.
8. **First-Time Dashboard coachmark dismissal trigger "first log"** — spec says dismisses automatically. Add: also dismiss on any of (a) user presses `n`, (b) taps FAB, (c) taps any sidebar LOG item — all log-intent actions dismiss the coachmark, not just the save. Per `navigation.gesture-nav-support`.

---

## Summary — Top 3 cross-cutting findings

1. **Focus ring fails WCAG 3:1 contrast** — oxblood (`#8A2A1F`) focus outline on bg-0 (`#0E0A08`) is 2.86:1. Change to `oxblood-soft` (3.70:1) across all fragments. Propagate through Agent 1 §7.2.
2. **Spacing and motion-token drift** — multiple raw `10px`, `14px`, `350ms`, `1.6s` values break Agent 1's 8px + 4-duration tokens. Add `motion-shimmer` token + `--page-padding-*` tokens + resolve all scale-misses in a single Agent 1 sweep.
3. **Empty/loading/offline states are under-defined** in 60% of components. Offline especially — add a global offline banner token + per-component offline state specs. Offline is the most common PWA degradation mode and must be visible in the UI.

## Top 3 per-component findings

1. **Fragment 4 Log confirmation entry motion** is 600ms — too slow for repeat interaction. Reduce to 320ms.
2. **Fragment 5 dropdown missing loading/error states** + motion direction reversed (translateY should be from above, entering downward per `hierarchy-motion`).
3. **Fragment 6 Calorie Adherence would read better as area chart** than bar chart — surfaces trend over discrete comparison. Missed per `trend-emphasis`.

*End of ux-specialist enrichment.*

## Library Page Overview

**Route:** `/library`
**Purpose:** A read-heavy archive of every `food_library_items` row the user has ever saved — the catalogue of their personal pantry. Surface for: browse, search, sort, filter, drill-in to a single item, edit, delete, and merge duplicates. Kicker identity (per `Design/mockups-brainstorm/direction-1-editorial/index.html` §III): **§ 03 · PERSONAL LIBRARY — "Your catalogue of familiars"**.

**Layout (top → bottom):**
1. **Masthead** — page-scoped masthead with the wordmark lockup from the sidebar (Agent 2); kicker `§ 03 · PERSONAL LIBRARY`; title "THE LIBRARY"; meta line with title count + last-added timestamp; double hairline beneath.
2. **Tools rail** — search / filter / sort / multi-select toggle (§3 below).
3. **Ruled grid** — 4-col on desktop, 3-col tablet, 2-col mobile; drawn column + row hairlines (§4).
4. **Bulk action bar** — anchored sheet that materializes only when ≥2 cards are selected (§6).
5. **Drill-in overlay** — opens on tap of any card (non-select mode): right-side sheet on desktop (shared-element transition from the card), slide-up sheet on mobile (§7).

**Data source:** Server-rendered via Next.js 16 Cache Components, keyed on `TAGS.userLibrary(uid)` (see `Planning/architecture.md` §5 cache registry, §8 route handlers). Row fetch is a direct Supabase `select * from food_library_items where user_id = auth.uid()` — RLS (`food_library_items_select_own`, architecture.md §3.3) guarantees scoping.

**Mutations:** All write paths (merge, bulk-delete, per-item update, per-item delete) carry a `client_id` UUID generated client-side **before** the optimistic UI update, per **I11** idempotency contract (architecture.md §8.4, design-doc.md §18.2 I11). Server enforces `UNIQUE (client_id)` on the relevant mutation-log tables; replayed offline-outbox POSTs return 200 with no-op.

**Cache invalidation:** Every mutation calls `updateTag(TAGS.userLibrary(uid))` from `lib/cache/tags.ts` (enforced by ESLint rule **I12**). Merge and bulk-delete additionally call `updateTag(TAGS.userEntries(uid, day))` because FK repoints / SET NULL affect the day-dashboard read path.

**Empty state:** First-time visit (zero library rows) shows a centered editorial card reading "*No titles yet filed.*" (Newsreader 400 italic 22px sand) plus kicker `§ 03` and a subline "Log a meal by text or photo and we will file it here." (Inter 14 dust). Oxblood primary button "OPEN THE LOG FLOW" routes to `/log?tab=type`.

---

## 2. Masthead

Top of `/library`. Shares the Masthead primitive from Agent 3's dashboard spec — the same primitive renders across all authed routes. Library-specific content only:

| Element | Type | Token |
|---|---|---|
| Kicker | `§ 03 · PERSONAL LIBRARY` | Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust` |
| Title | "THE LIBRARY" | Newsreader 300 / 44px / tracking `-0.02em` / `ivory` |
| Subtitle | "YOUR SAVED FOODS · {N} ITEMS" | Inter 500 / 10.5px / UPPERCASE / tracking `0.18em` / `sand` |
| Meta (right-aligned, desktop/tablet) | "LAST ADDED · APR 17, 2026 · 22:03" | JetBrains Mono 400 / 11px / `dust` |
| Divider | Double hairline (2 × `1px` at `rule-strong` with `6px` gap) | — |

**Count formula:** `N` is a server-rendered number via the same Cache Components fetch that feeds the grid. Subtitle updates in lockstep with cache invalidation — no separate count query.

**Last-added computation:** `MAX(created_at) from food_library_items where user_id = auth.uid()`, formatted in user's profile timezone. Falls back to "NEVER" when count is 0 (hides the masthead meta line on empty).

**Responsive:**
- Desktop 1280+: title left-aligned, meta line right-aligned, same baseline.
- Tablet 768–1279: title left, meta wraps below subtitle.
- Mobile 375–767: title + subtitle stacked, meta on its own row beneath, left-aligned.

**Motion:** Page-mount fires `page-settle` (Agent 1: `motion-expressive` 320ms, `ease-editorial`) on the main content container. Masthead does not independently animate.

---

## 3. Tools Rail (Search / Filter / Sort / Select)

Sits directly below masthead. 1px `rule-strong` hairline separates it from the grid below (drawn bottom border).

### 3.1 Layout (desktop 1280+)

Three-column flex row, ` 2fr | 1fr | 1fr ` gutter `18px`, vertical rhythm `14px` top / `24px` bottom:

```
[   search input         ] [ filter dropdown ] [ sort dropdown | SELECT ]
```

**Tablet 768–1279:** same three cells, one row, columns reflow to `2fr | 1fr | 1fr`. SELECT button wraps below sort on narrow tablet widths.

**Mobile 375–767:** stacked vertically. Search on row 1 (full-width, 44px). Row 2 is a horizontal flex: filter + sort both 1fr. Row 3 is the SELECT button (44px, right-aligned, oxblood text button only — no border).

### 3.2 Search input

**Container:**
- `height: 44px`, background `bg-1`, border `1px solid rule-strong`, zero radius.
- Left padding `18px`, right padding `14px`.
- On focus: border `1px solid oxblood`; additionally a `2px` oxblood inset ring via `outline: 2px solid var(--oxblood); outline-offset: 0`. Meets Agent 1's 2px focus ring contract.

**Inside:**
- Icon: Phosphor `MagnifyingGlass` regular, 16px, color `dust`, left-aligned.
- Input: `flex: 1`, background transparent, border none, Inter 400 / 14px / `ivory`, placeholder "Search library" in `dust` (Inter 400 / 14px / italicized false — sans placeholder, not serif, to match Agent 1's form conventions).
- Right-side hotkey chip: JetBrains Mono 400 / 10px / `dust`, border `1px solid rule`, padding `2px 6px`, text "`/`". Invisible on mobile (where keyboard shortcuts are not applicable).

**Behavior:**
- Real-time, debounced **150ms** (Agent 1 `motion-micro` × 1.25, rationale: below perceptual latency floor; keeps typing snappy).
- Query runs against `food_library_items.normalized_name` (architecture.md §2.4 — lowercase + stripped punctuation + sorted tokens).
- For library size < 200 rows (the first-year single-owner expected load per blueprint), matching is client-side — fetch the full row set once and filter via `Array.prototype.filter` + `String.includes` against the normalized token of the query. Server-side fallback (route: `GET /api/library/search?q=`, under §8.6 of architecture.md if and when added) activates when `rows.length >= 200` — monitored via a client-side heuristic logged once per session to Sentry breadcrumb.
- Keyboard shortcut **`/`** focuses the search (Agent 1 §Accessibility). Hotkey handler registered at `/library` page level; released on unmount. Only fires when focus is not inside another input/textarea.
- Typing `Escape` while focused clears the query and blurs.
- Empty-results state: replaces the grid with a centered italic line "*No titles match '{query}'.*" (Newsreader 400 / italic / 22px / sand) and a dust subline "Try a shorter word or check the spelling."

### 3.3 Filter dropdown

**Visual:**
- Border `1px solid rule-strong`, background `bg-1`, height `44px`, padding `0 16px`.
- Label micro-prefix: `FILTER` — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust` / margin-right `10px`.
- Selected value: Inter 500 / 10.5px / UPPERCASE / tracking `0.18em` / `sand`.
- Caret: Phosphor `CaretDown` regular, 12px, `dust`, right-aligned. Rotates 180° on open (`transform` with `ink-fade` timing per Agent 1).

**Options (future-proof, per brief):**
- `ALL` (default) — no predicate
- `WITH PHOTOS` — `thumbnail_url IS NOT NULL`
- `NO PHOTOS` — `thumbnail_url IS NULL` (letter-mark cards)
- `LOGGED THIS WEEK` — `last_used_at >= now() - interval '7 days'` (computed in user's profile timezone per **I5**)

**Open state:** Menu is a zero-radius panel, `bg-1` surface, `1px rule-strong` border, rendered via Radix UI `DropdownMenu`. Each option: 40px tall, Inter 10.5 UPPERCASE, hover = `ivory/5% overlay` via `ink-fade`. Active option shown with an oxblood left-edge 2px inset strip — not a checkmark.

**Motion:** Menu open uses `motion-standard` 180ms fade + 4px translateY. Respects `prefers-reduced-motion` via Agent 1's reduced-motion collapse.

### 3.4 Sort dropdown

Same visual shell and motion as filter. Label: `SORT`. Options in order presented to user:

| Label | Backing | Default |
|---|---|---|
| `MOST LOGGED` | `ORDER BY log_count DESC NULLS LAST, last_used_at DESC` | **default** |
| `LAST USED` | `ORDER BY last_used_at DESC NULLS LAST, created_at DESC` | — |
| `NAME A–Z` | `ORDER BY display_name ASC` | — |
| `NAME Z–A` | `ORDER BY display_name DESC` | — |
| `KCAL LOW–HIGH` | `ORDER BY (nutrition->>'kcal')::numeric ASC` | — |
| `KCAL HIGH–LOW` | `ORDER BY (nutrition->>'kcal')::numeric DESC` | — |

**Default rationale:** Owner-use case per `Planning/PRD.md §3.4` — "re-log usual breakfast" in 1 tap. Frequency-first is the single most valuable ordering for that flow.

**Sort persistence:** User's last choice persists to `sessionStorage` under key `library:sort` (JSON). Loaded on page mount; never transmitted to the server. Cleared only on explicit logout.

**Filter persistence:** Same pattern, key `library:filter`.

### 3.5 Select button (multi-select toggle)

**Idle:**
- Text-only button. Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `oxblood`. Label: `SELECT`. No border. Icon: Phosphor `CheckSquare` regular, 14px, `oxblood`, left of label, 6px gap. Padding `10px 0` to preserve 44×44 tap target (44px min-height enforced).

**Active (mode engaged):**
- Label changes to `CANCEL` / `dust` / no icon.
- A secondary indicator line appears below the tools rail as a thin oxblood 2px hairline (`rule-draw` 320ms on entry; shrinks on exit). Signals "select mode is on" even when scrolled far down.
- Checkboxes materialize on each card (§5).

**Interaction:** Toggling Select mode never navigates; stays on `/library`. Tapping outside any card (e.g., on the page background) does NOT exit — user must tap `CANCEL` or press `Escape`.

**Keyboard:**
- `Escape` exits select mode (and clears the selection set).
- `Shift+click` on a second card range-selects between it and the last-selected card (desktop only).
- `Cmd/Ctrl+A` while in select mode selects all visible (filtered) cards.

---

## 4. Library Grid

### 4.1 Breakpoints

| Breakpoint | Columns | Gutter | Aspect | Card size (approx) |
|---|---|---|---|---|
| Desktop 1280+ | 4 | 0 (ruled, see §4.2) | 1:1 square | `240 × 240` content area |
| Tablet 768–1279 | 3 | 0 | 1:1 square | `220 × 220` content area |
| Mobile 375–767 | 2 | 0 | 1:1 square | `160 × 160` content area |

Grid container is `grid` with `grid-template-columns: repeat(N, 1fr); gap: 0;`. Column count swaps at the breakpoint tokens from Agent 1 (§5 spacing / §7 grid).

### 4.2 Ruled grid aesthetic — the signature library treatment

**Not gutters, not cards with shadows.** Every row and column boundary is a drawn hairline:

```css
.library-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-top: 1px solid var(--rule);
  border-left: 1px solid var(--rule);
}
.lib-item {
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  padding: 22px 20px 24px;
  position: relative;
  cursor: pointer;
  transition: background var(--motion-micro) var(--ease-editorial);
}
```

(Adapted verbatim from `Design/mockups-brainstorm/direction-1-editorial/index.html` lines 1093–1107.)

**Consequence:** No shadows. No rounded corners. No card borders other than the grid rules themselves. The visual continues edge-to-edge like a printer's column ruling; the masthead's double hairline closes the top.

**Dangling rules:** When the final row is partial (e.g., 11 items in a 4-column grid = 3 empty cells), the bottom `rule` still prints on the empty cells to keep the grid visually closed. Empty cells are rendered as inert `<div class="lib-item lib-item--empty">` nodes with no content, solely for border rendering.

### 4.3 Responsive gutter rationale

The brief's §4 specifies `24px / 16px / 12px` gutters, but the mockup (canonical visual reference per Agent 1) uses `gap: 0` with drawn rules. I resolve this in favor of the mockup: the ruled-grid aesthetic depends on adjacent cells sharing a hairline, which a gap would break. **Gutter = 0 at all breakpoints.** Flagged for main-agent consolidation if Agent 1 consolidates differently.

---

## 5. Library Item Card (`.lib-item`)

### 5.1 Anatomy

**Square container.** Aspect 1:1 on all breakpoints. Padding `22px 20px 24px` desktop/tablet; `14px 12px 16px` mobile.

**Top-to-bottom layout (inside the padding box):**

```
┌──────────────────────────────────┐   padding
│ ┌──────────────────────────┐      │
│ │                          │      │   Thumb zone: aspect 4/3,
│ │     [thumbnail OR        │      │   bg-2, 1px rule border,
│ │      letter-mark]        │      │   overflow:hidden.
│ │                          │      │   Contains (absolute): mono-tag
│ │                  [logged]│      │   top-left, count-badge bot-right.
│ └──────────────────────────┘      │
│                                   │
│ Food name (italic serif, clamp-2) │
│ Default portion · unit            │
│ ·············dotted hairline······│
│ [82kcal]              [P/C/F row] │
└──────────────────────────────────┘
```

**Heights mapped to tokens:**

| Zone | Percentage of card height | Desktop px | Mobile px |
|---|---|---|---|
| Thumb zone (aspect 4/3 inside a square card, margin-bottom `16px` tablet+ / `10px` mobile) | ~55% | ~130px | ~85px |
| Text zone | ~45% | ~95px | ~60px |

The 60/40 split in the brief is approximate — actual ratio is driven by the thumb's 4/3 aspect (per mockup), which produces ~55/45 on square cards. Flagging: if main agent wants strict 60/40, the thumb can switch to `aspect-ratio: 1/1` — but that loses the mockup's letterbox feel. I recommend preserving `4/3`.

### 5.2 Thumbnail zone

**Container:** `aspect-ratio: 4/3`, background `bg-2`, `1px solid rule` border, `overflow: hidden`. Zero radius.

**Photo content (when `thumbnail_url IS NOT NULL`):**
- `<img>` with `object-fit: cover`, `object-position: center`, `width: 100%`, `height: 100%`.
- Signed URL served on demand from Supabase Storage path `food-thumbnails/{user_id}/{client_id}.webp` (architecture.md §5). Signed URL cached client-side for 60 minutes; refreshed lazily.
- Alt text: `{display_name}` (falls back gracefully with letter-mark if image errors — see §5.4).
- `img` opacity `0.85` (per mockup) so the warm bg-2 underlies the image tone slightly. Hover state lifts to `1.0` via `ink-fade`.

**Letter-mark content** — see §10.

**Overlay chips (absolutely positioned within thumb zone):**

| Chip | Position | Content | Styling |
|---|---|---|---|
| `mono-tag` | top `8px` left `8px` | Label + filed-on date: `MEAL · 06.03` or `ITEM · 02.01` | JetBrains Mono 400 / 9.5px / `dust`, background `bg-0`, `1px solid rule`, padding `2px 6px`, letter-spacing `0.05em` |
| `count-badge` | bottom `8px` right `8px` | `logged 47×` | Newsreader italic / 11px / `sand`, background `rgba(14,10,8,0.8)`, `1px solid rule`, padding `2px 8px` |

**`mono-tag` label logic:**
- If `created_from = 'photo'` OR `nutrition.items.length > 1` (multi-item entry flavor) → `MEAL · {MM.DD}` where MM.DD is `created_at` in user's profile timezone.
- Else → `ITEM · {MM.DD}`.
- The label is decorative (editorial flavor) and does not imply filtering — clicking doesn't filter. It's there for the print-journal feel.

**`count-badge` formula:**
- `log_count >= 1` → `logged {N}×` (mono numeral N from `food_library_items.log_count` per architecture.md §2.4).
- `log_count = 0` → badge hidden (never-logged items — e.g., library created via save-toggle-on without confirming).

### 5.3 Text zone

**Food name:**
- Font: Newsreader 400 / 16px (desktop/tablet) / 14px (mobile) / `ivory`.
- Line-height `1.25`.
- `-webkit-line-clamp: 2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-box-orient: vertical`.
- Truncation falls on word boundary. For Vietnamese names with diacritics (e.g., "Phở bò tái nạm"), the clamp preserves glyph integrity — browsers handle combining marks automatically.
- No italics here (divergence from mockup's italicization) — I preserve mockup styling: `lib-name` in mockup is NOT italic (see `index.html` lines 1144–1150). Italics are reserved for the `lib-portion` below.

**Default portion line (beneath name):**
- Newsreader 400 / italic / 12.5px / `sand`, margin-top `4px`.
- Content: `{default_portion} {default_unit}` (e.g., "one bowl · 280 g"). Formed by preferring `default_unit` when present; else falls back to "one serving".

**Divider:**
- `1px dotted rule`, margin-top `12px`, padding-top `10px`. Dotted (not solid) per mockup §III line 1164. This is the only dotted rule in the library surface — it frames the kcal line subtly.

**Metadata row:**
- Left: `{kcal}` in Newsreader 400 / 16px / `ivory` + an `em` suffix `kcal` in Inter 500 / 9.5px / UPPERCASE / tracking `0.15em` / `dust`. Tabular lining figures. `82kcal` example: "82" then small "KCAL" inline.
- Right: `P {p} · C {c} · F {f}` in JetBrains Mono 400 / 10.5px / `dust`. Values are per-portion grams rounded to whole numbers.

### 5.4 States

| State | Trigger | Visual |
|---|---|---|
| **Idle** | default | bg-0 card, rule borders only |
| **Hover** (tablet/desktop, non-select) | pointer over card | Background `bg-1` (tonal shift per mockup line 1108); transition `background var(--motion-micro) var(--ease-editorial)`; image opacity lifts `0.85 → 1.0` |
| **Focus** (keyboard) | `Tab` to card | 2px `oxblood` outline, offset `-2px` (inset). Same as Agent 1's focus ring contract. No background change. |
| **Press** | pointerdown | `transform: scale(0.97)` / `motion-micro` 120ms. Applies to whole card. |
| **Selected** (select mode on) | card in selection set | 2px `oxblood` inset border (overlays the hairline); checkbox chip top-right (see §5.5); card overall `transform: scale(0.95)` / `motion-standard`. Hover/focus stacks on top. |
| **Disabled** (no state in MVP) | — | reserved |

**Motion references Agent 1 named timings:**
- Hover background swap → `ink-fade` (`motion-micro` 120ms, `ease-editorial`).
- Selection scale-down → `motion-standard` 180ms with `ease-editorial`.
- Press scale → `motion-micro` 120ms.
- Reduced-motion: all of the above collapse to 1ms per Agent 1 §6.4.

### 5.5 Selection checkbox chip

Visible only when select mode is engaged. Rendered absolutely at top-right of card, offset `12px` in from edges.

**Idle (unchecked):** `16 × 16` square, `bg-0` fill, `1px oxblood` border, zero radius. Empty inside.

**Checked:** `bg-0 → oxblood` fill via `ink-fade`; an ivory `Check` glyph (Phosphor `Check` bold 12px / `ivory`) renders inside.

**Hit target:** The entire card is the toggle target in select mode — clicking anywhere on the card flips its selection state. The chip is decorative plus visually confirms state; it does not need its own 44×44 target since the whole card exceeds that.

### 5.6 Interactions

| Mode | Interaction | Action |
|---|---|---|
| Non-select | Tap card | Opens Food Detail drill-in (§7) |
| Non-select | Right-click (desktop) / long-press 500ms (mobile) | Context menu: `LOG NOW` / `EDIT` / `DELETE` (§5.7) |
| Non-select | Hover | `bg-0 → bg-1` background swap |
| Select mode | Tap card | Toggles its presence in the selection set |
| Select mode | Shift+click (desktop) | Range-select from last-clicked card to this card |
| Both | Keyboard `Enter` when card is focused | Non-select: opens drill-in. Select: toggles selection. |
| Both | Keyboard `Space` when card is focused | Select: toggles selection (standard checkbox convention). Non-select: also opens drill-in (redundant with Enter). |

### 5.7 Context menu (non-select long-press / right-click)

A floating Radix `ContextMenu` positioned at the cursor / touch point. Surface `bg-1`, `1px rule-strong` border, zero radius. Three rows:

| Row | Label | Color | Action |
|---|---|---|---|
| 1 | `LOG NOW` | `oxblood` | Navigates to `/log?tab=library&item={id}` — shortcut to the Log Flow's "From library" tab with the item pre-filled; Agent 4 owns that surface |
| 2 | `EDIT` | `ivory` | Opens Food Detail drill-in with edit-mode primed (first edit field focused) |
| 3 | `DELETE` | `oxblood` | Triggers single-item delete confirm (reuses the bulk-delete dialog with N=1) |

Each row: 40px tall, Inter 500 / 10.5px / UPPERCASE / tracking `0.18em`, padding `0 18px`. Hover: `ivory/5% overlay` per Agent 1.

Menu closes on: outside click, `Escape`, scroll, or selection.

---

## 6. Bulk Action Bar

Materializes when **≥2 cards** are selected. Idles off-screen.

### 6.1 Anchor & layout

- **Desktop 1280+ / Tablet 768–1279:** Anchored at top of main content column, sticky `top: 0`, `z-index: 20`. Slides down from above on appear; slides up on disappear. Shadow-less (rule-framed surface only).
- **Mobile 375–767:** Anchored bottom of viewport, sticky/fixed `bottom: env(safe-area-inset-bottom, 0)`, `z-index: 20`. Slides up from below.

**Surface:** `bg-1` with `1px solid rule-strong` on the edge nearest the viewport boundary (bottom edge desktop/tablet; top edge mobile).

**Height:** `56px` desktop/tablet, `64px` mobile (extra touch margin).

### 6.2 Contents (left → right)

| Cell | Content | Styling |
|---|---|---|
| Count | `{N} SELECTED` | Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `sand` |
| `MERGE` button | — | Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `oxblood` (enabled) or `oxblood × 0.4 alpha` (disabled); height `44px`; padding `0 20px`; no border — text button per Agent 1 button spec |
| `BULK DELETE` button | — | Same styling with `oxblood` accent |
| `CANCEL` button | — | Same shell, color `dust` |

### 6.3 State rules

| Condition | Merge enabled? | Tooltip on hover |
|---|---|---|
| 2 selected | ✓ | — |
| 1 selected | n/a (bar not shown) | — |
| 3+ selected | ✗ (disabled) | "SELECT EXACTLY 2 ITEMS TO MERGE" — Radix `Tooltip`, Inter 10.5 UPPERCASE tracking 0.22em sand, bg-1, 1px rule |

Bulk Delete is always enabled when bar is visible (requires ≥2 selected by definition). Cancel always enabled; exits select mode and clears selection.

### 6.4 Motion

- Appear: `ember-pulse` (Agent 1: `motion-standard` 180ms scale-tick) + slide-in via `translateY` from `+100%`/`-100%`. Combined transition duration `motion-standard`.
- Dismiss: reverse, `motion-micro` 120ms.
- Reduced-motion: crossfade only, no translate.

### 6.5 Keyboard

- `Delete` / `Backspace` (macOS) while select mode is on and bar visible → triggers Bulk Delete confirm.
- `m` while bar visible and exactly 2 selected → triggers Merge Dialog.
- `Escape` → exits select mode (Cancel).

---

## 7. Food Detail Sheet / Drill-In

### 7.1 Route & surface

**Desktop 1280+:** Opens as a right-side overlay sheet (`640px` wide, per design-doc.md §10.7 "Desktop: right-side overlay panel on dashboard/library (shared-element transition)"). Renders alongside the library grid (grid becomes dimmed via `bg-0/60%` scrim on desktop). Route updates to `/library/[id]` with `replace` history (no nav-stack growth on close).

**Tablet 768–1279:** Right-side overlay sheet, `100vw × 80vh` or `560px` wide, whichever is narrower. Behavior otherwise same as desktop.

**Mobile 375–767:** Full-sheet from bottom, `100vw × 90vh`, `bg-0` surface, `rule-strong` top border. Route updates to `/library/[id]`. Swipe-down on the top 48px drag-handle zone closes the sheet.

**Shared-element transition** (desktop/tablet only): The tapped card's thumbnail animates from its grid position to the sheet's hero thumbnail slot via Framer Motion's layout animation. Uses Agent 1 `motion-expressive` (320ms) `ease-editorial`. Mobile skips the shared element because the grid is no longer visible.

### 7.2 Layout

Top-to-bottom structure:

```
┌───────────────────────────────────┐
│ «« BACK TO LIBRARY   [ ×  close ] │   ← top bar
├───────────────────────────────────┤
│                                   │
│   [ full-width hero thumbnail ]   │   ← 320×240 desktop/tablet, 100vw × aspect-4/3 mobile
│                                   │
├───────────────────────────────────┤
│ Food name (editable on tap)       │
│ Default portion · unit (editable) │
├───────────────────────────────────┤
│ § 04 · NUTRITION                  │   ← kicker
│                                   │
│      [ kcal hero: 82-pt serif ]   │
│                                   │
│      [ P/C/F horizontal bars ]    │
│                                   │
│      [ micro table ]              │   ← full micronutrient breakdown
├───────────────────────────────────┤
│ § 05 · HISTORY                    │
│  First logged · MAR 14, 2026      │
│  Logged 47× total                 │
│  Recent uses:                     │
│    APR 17 22:03                   │
│    APR 15 08:12                   │
│    APR 13 13:40                   │
│    APR 11 08:06                   │
│    APR 09 19:50                   │
├───────────────────────────────────┤
│  Action bar (anchored bottom)     │
│  [LOG THIS NOW]  [EDIT]  [🗑]     │
└───────────────────────────────────┘
```

### 7.3 Top bar

- Height `56px`, `bg-0` surface, `1px rule-strong` bottom border.
- Left: `«« BACK TO LIBRARY` — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `oxblood`. Icon is a double-caret glyph drawn as two `‹‹` characters. Clicking closes the sheet (reverse of the open transition).
- Right: `×` close button, 16×16 Phosphor `X` regular / `dust`, 44×44 tap target. Same action as BACK.
- Keyboard `Escape` closes.

### 7.4 Hero thumbnail

- Desktop/tablet: `320 × 240` centered, `bg-2` background, `1px rule-strong` border.
- Mobile: full-width, aspect 4/3, flush to the sheet edges horizontally but with the border preserved.
- If `thumbnail_url IS NULL` → letter-mark placeholder (§10), sized proportionally.
- Meta chip bottom-right: `FILED · APR 14, 2026 · 22:03` — JetBrains Mono 400 / 10.5px / `dust` / `bg-0/80%` background.

### 7.5 Name + portion (editable)

- Newsreader 300 / 32px / `ivory` for name. Tap → inline edit mode.
- Portion/unit line below: Newsreader 400 / italic / 16px / `sand`. Tap → inline edit mode.
- Edit mode: field converts to a bordered `1px rule-strong` input (44px min-height), focus gets 2px oxblood ring. `Enter` commits, `Escape` reverts. Commit fires PATCH (§7.8).

### 7.6 Nutrition section

**Kicker:** `§ 04 · NUTRITION` — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust`.

**Kcal hero:** Newsreader 300 / 48px (desktop/tablet) / 40px (mobile) / tabular lining / `ivory`. Suffix `KCAL` in Inter 500 / 10.5px / UPPERCASE / `dust` aligned to baseline.

**P/C/F bars:** Reuses Agent 3's Macro Bar primitive (P = `oxblood`, C = `ochre`, F = `ember`). Bars stacked vertically, each 4px tall, 240px max width. Labels to the left (Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust`), grams on the right (JetBrains Mono 400 / 11px / `ivory`).

**Micro table:** Two-column table listing every micronutrient stored in `food_library_items.nutrition.micros`. Left column: micronutrient name (Newsreader 400 / italic / 14px / `sand`). Right column: value + unit (JetBrains Mono 400 / 11px / `ivory`). Rows separated by dotted 1px `rule`. Max 20 rows before disclosure "*Show all micros*" expand (oxblood text).

Each field (name, kcal, macros, any micro, default_portion, default_unit) is tap-editable inline.

### 7.7 History section

**Kicker:** `§ 05 · HISTORY`.

**Content (three rows):**
- `FIRST LOGGED · {MMM DD, YYYY}` — JetBrains Mono 400 / 11px / `dust`.
- `LOGGED {N}× TOTAL` — mono / `dust`. Value comes from `food_library_items.log_count`.
- `RECENT USES:` header — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust`.

**Recent-uses list:** Query the last **5** `food_entries` rows with `library_item_id = {id}` ordered by `logged_at DESC`. Each row: mono date prefix `APR 17 22:03` + Inter 12 sand format "at breakfast" (meal category label if available).

If `log_count = 0`: show "NEVER LOGGED — TAP 'LOG THIS NOW' TO BEGIN" (Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `oxblood`).

### 7.8 Edit mutations

Each inline edit commits independently via `PATCH /api/library/[id]/update` (architecture.md §8.6, route #10):

```ts
PATCH /api/library/[id]/update
body: { client_id: uuid, fields: { display_name?, default_portion?, default_unit?, nutrition? } }
response: { item: FoodLibraryItem }
```

- **`client_id`** is generated per-edit (one UUID per commit) per **I11**. Replays are no-ops.
- **Optimistic?** No — per architecture.md §4.2, library edits are **pessimistic** with a brief loading state. On commit: field shows a subtle `ember-pulse` (180ms) to signal in-flight; server response replaces local value; on error: revert + toast "EDIT FAILED" (oxblood) with a "RETRY" action in the undo-style toast shell (Agent 4 toast primitive).
- **Cache invalidation (I12):** Server `updateTag(TAGS.userLibrary(uid))`; if the edit affects any entry's inlined nutrition (it doesn't — entries carry their own items snapshot per architecture.md §2.3) no additional tag invalidation is needed.

### 7.9 Action bar (anchored bottom of sheet)

- Height `64px` desktop/tablet, `72px` mobile (safe-area), `bg-1` surface, `1px rule-strong` top border.
- Three buttons:

| Button | Style | Action |
|---|---|---|
| `LOG THIS NOW` | Primary oxblood button — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `ivory` on `oxblood` bg, `56px` height, padding `0 28px` | Navigates to `/log?tab=library&item={id}` with the item pre-selected; Agent 4 owns that flow |
| `EDIT` | Secondary hairline button — Inter 500 / 10.5px / UPPERCASE / `sand` on transparent, `1px rule-strong` border, `56px` height, padding `0 20px` | Toggles edit-mode on the sheet (primes first field focus) |
| `DELETE` | Tertiary icon-only — `Trash` Phosphor regular 18px / `dust` in a 44×44 tap target. Hover: `oxblood`. | Triggers single-item delete confirm (reuses §9 dialog with N=1) |

### 7.10 Delete behavior

Single-item delete uses `DELETE /api/library/[id]/delete` (architecture.md route #11):

- Confirm dialog (§9 shell, N=1 variant): "DELETE THIS ITEM?" with copy "Your past entries will keep their nutrition data but lose the library reference. This cannot be undone after the 5-second grace window." (per `ON DELETE SET NULL` on `food_entries.library_item_id`, architecture.md §2.3).
- On confirm: optimistic remove from grid + close sheet + toast "1 ITEM DELETED · UNDO 5s" (Agent 4 undo-toast primitive + LIFO queue per **I4**).
- Undo: `POST /api/library/bulk-undo` with `{ client_ids: [original_client_id] }` (or equivalent — route spec adapts architecture.md §8 to cover undo; main agent to validate route list).
- Cache invalidation: `updateTag(TAGS.userLibrary(uid))`; also `updateTag(TAGS.userEntries(uid, day))` for any day that had entries referencing this item (server computes the date set from the FK table; bounded by user's log count).

---

## 8. Merge Dialog (per-field picker)

### 8.1 Trigger

Exactly 2 cards selected → Bulk Action Bar `MERGE` button active → click → dialog opens.

Keyboard shortcut `m` while the bar is visible and preconditions hold also opens it.

### 8.2 Surface

**Desktop/Tablet 768+:** Centered modal, `640px` wide, `min-height: 560px`, `max-height: 80vh` with internal scroll. `bg-0` surface, `1px rule-strong` border. Scrim: `bg-0/60%` behind.

**Mobile 375–767:** Full-screen modal, `100vw × 100vh`, `bg-0` surface. Top of dialog has a 56px top bar with title + close.

**Zero radius, no shadow — rule-framed only.** Masthead-style kicker at top.

### 8.3 Structure

```
┌──────────────────────────────────────────────┐
│  § 06 · MERGE                    [×  CLOSE]  │   ← top bar
│  MERGE TWO ITEMS                             │
│  Pick which value to keep for each field.    │
│  The unselected item will be filed as        │
│  merged and its entry history repointed.     │
├──────────────────────────────────────────────┤
│                                              │
│   [ ITEM A ]          [ ITEM B ]             │   ← headers
│                                              │
│  Field: NAME                                 │
│  (A) ○ Oat porridge   (B) ○ Oatmeal bowl    │
│                                              │
│  Field: THUMBNAIL                            │
│  (A) ○ [thumb A]      (B) ○ [thumb B]       │
│  — or — (C) ○ NONE (letter-mark)             │
│                                              │
│  Field: KCAL                                 │
│  (A) ○ 318  (B) ○ 305                       │
│  (C) ○ CUSTOM  [input]                      │
│                                              │
│  ... (protein, carbs, fat, default_portion,  │
│       default_unit, each with same pattern)  │
│                                              │
├──────────────────────────────────────────────┤
│  § MERGED RESULT (live preview)              │
│  ┌────────────────────────────────┐          │
│  │ [ preview card with chosen     │          │
│  │   values, same visual as a     │          │
│  │   regular library card ]       │          │
│  └────────────────────────────────┘          │
│  log_count: 47 + 12 = 59                     │
│  last_used_at: max(A, B) = APR 17, 22:03     │
├──────────────────────────────────────────────┤
│  [CANCEL]                         [MERGE »]  │   ← action bar
└──────────────────────────────────────────────┘
```

### 8.4 Per-field row specification

Every mergeable field renders as a 3-segment row:

| Segment | Content |
|---|---|
| Label | Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust` — e.g., `FIELD · KCAL` |
| Option A | Radio button (16×16 `1px oxblood` border, filled oxblood when selected) + value styled as a library-card field (Newsreader 16 ivory for text/numeric, thumbnail for image) |
| Option B | Same shell, B's value |
| Option C (CUSTOM) | Visible only for numeric fields (kcal, macros, portion). Radio + native numeric input (Inter 14 ivory, 44px tall, `1px rule-strong`, zero radius) |

**Field list** (in order):

1. `display_name` — text, A or B (no CUSTOM in MVP — rationale: name edits are available post-merge in drill-in; avoid scope creep).
2. `thumbnail_url` — image or NONE. Option C reads `NONE (letter-mark)`.
3. `nutrition.kcal` — numeric, A/B/CUSTOM.
4. `nutrition.macros.protein` — numeric, A/B/CUSTOM.
5. `nutrition.macros.carbs` — numeric, A/B/CUSTOM.
6. `nutrition.macros.fat` — numeric, A/B/CUSTOM.
7. `default_portion` — numeric, A/B/CUSTOM.
8. `default_unit` — text, A/B (no CUSTOM).

**Micronutrients:** Collapsed under a `Show micros` disclosure (Inter 500 / 10.5px / UPPERCASE / `oxblood`). Default expansion: closed. When expanded, each micro follows the same A/B/CUSTOM pattern. Rationale: keeps primary field list visible without scrolling for the 95% case.

**Default selection heuristic (ship-friendly):** When the dialog opens, pre-select the value from whichever item has the higher `log_count` (the "winner" heuristic — more historical data likely means more accurate numbers). Tie-break by older `created_at`. User can change all picks before confirming.

### 8.5 Live preview

**"MERGED RESULT" section** renders a real library card (reusing the `.lib-item` component from §5) with the chosen values applied in real time. Updates on every radio change via React state — no server round-trip needed.

**Derived fields:**
- `log_count` = `A.log_count + B.log_count` — shown below the preview card with an info line.
- `last_used_at` = `max(A.last_used_at, B.last_used_at)` — shown.
- `created_from` = `'photo'` if either has a photo and user kept it, else `'text'`. Not user-selectable; computed.
- `client_id` = newly generated UUID at merge commit time.

### 8.6 Server contract

On `MERGE »` click: `POST /api/library/merge` (architecture.md §8.6, route #8):

```ts
POST /api/library/merge
body: {
  client_id: uuid,                     // I11 idempotency for the merge operation itself
  winnerId: uuid,                       // kept: the id that survives
  loserId: uuid,                        // the id whose entries repoint
  fields: {                            // user's per-field picks
    display_name: string,
    thumbnail_url: string | null,
    nutrition: { kcal, macros, micros },
    default_portion: number,
    default_unit: string
  }
}
response: { winner: FoodLibraryItem }
cache: updateTag(TAGS.userLibrary(uid)), updateTag(TAGS.userEntries(uid, day)) — for every day with entries referencing loser
```

**Server sequence (pessimistic, atomic transaction):**
1. Lookup `client_id` → return existing `winner` if replay (I11 no-op).
2. UPDATE `food_entries SET library_item_id = winnerId WHERE library_item_id = loserId` — repoints every entry.
3. UPDATE `food_library_items SET { fields, log_count = A.log_count + B.log_count, last_used_at = max(A, B) } WHERE id = winnerId`.
4. Soft-tombstone `loserId` (architecture.md §2.4 does not currently include a `deleted_at` column — see §8.7 below for the design decision on reversibility).
5. `updateTag(TAGS.userLibrary(uid))` + `updateTag(TAGS.userEntries(uid, day))` for affected days.
6. Return the merged `winner` row.

### 8.7 Merge reversibility — design decision (FLAG FOR MAIN AGENT)

**Brief specifies:** Merge IS reversible within a 5-second undo window; after 5s the operation is final (tombstoned). Toast shows "UNDO 5s" countdown.

**design-doc.md §10.6 states:** Merge "Cannot be undone (confirm dialog required)."

**design-doc.md §18.3 line 910 states:** "cheaper rows are then FK-reassigned and the loser deleted."

These are **inconsistent**. I follow the brief — merge IS reversible in a 5-second undo window — but this requires a schema shift in architecture.md that is not currently reflected: `food_library_items` needs a `deleted_at timestamptz null` column (or an `archived_at` equivalent) so that loser rows can be resurrected within the window. Without it, the loser row is `DELETE`'d and can only be re-inserted with a new `id`, orphaning the FK repoint that already happened.

**Proposed resolution (for main agent):**
- Option A (recommended): Add `deleted_at timestamptz null` to `food_library_items` schema. Merge sets loser's `deleted_at = now()`; the undo window reverses both the FK repoint (back to loser) and the deleted_at (null). After 5s, a background job (or a lazy cleanup in the next unrelated mutation) deletes any row whose `deleted_at < now() - 5s`.
- Option B: Keep "cannot be undone" semantics; show a confirm dialog instead of an undo window. More conservative; matches design-doc.md §10.6 literally.

I spec the **reversible variant** below (Option A) per the brief. Main agent: if you pick Option B, strike the UNDO toast line and add a confirm step before commit.

### 8.8 Undo toast (reversible variant)

On successful merge:
- Dialog closes via `motion-standard` exit.
- Undo toast materializes in the shared toast region (Agent 4's primitive) — **LIFO order** per **I4** / design-doc.md §11.
- Toast content: "2 ITEMS MERGED · UNDO 5s" (Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `ivory` on `bg-1`, `1px oxblood` border, `44px` tall, 5-second countdown shown inline).
- Click UNDO → `POST /api/library/merge/undo` with `{ merge_client_id }` → server reverses both operations atomically (resurrect loser via `deleted_at = null`, re-point entries from winner back to loser where `merge_operation_id` matches).
- After 5s: toast auto-dismisses; merge becomes final; a deferred server job cleans up the tombstoned loser.
- Queue behavior: If multiple merges happen within 5s, each shows its own toast in LIFO; undo always reverses the most recently visible toast's merge.

### 8.9 Motion

- Dialog open: `motion-standard` 180ms scrim fade + `motion-expressive` 320ms content scale `0.98 → 1.0` + fade.
- Per-field radio change: `ink-fade` 120ms on the radio dot.
- Live preview update: `ink-fade` 120ms on every field change (crossfade numerals, not count-up, per Agent 1 §6.3).
- Dialog close: reverse, `motion-micro` 120ms.
- Reduced-motion: all fades collapse to 1ms.

### 8.10 Accessibility

- Role: `dialog`, `aria-modal="true"`, `aria-labelledby` pointing to the title.
- Focus trap: focus is trapped within the dialog until close.
- First focus on open: the first radio of the first field (display_name, Option A).
- `Tab` order: field-by-field, A → B → (C if present) per row.
- `Escape` closes (treated as Cancel).
- `Enter` commits when focus is on `MERGE »`; otherwise does not commit from mid-dialog focus.
- Live preview announced via `aria-live="polite"` on an off-screen summary of the chosen values.

---

## 9. Bulk Delete Confirm Modal

### 9.1 Trigger

Bulk Action Bar `BULK DELETE` click (N ≥ 2) OR Food Detail sheet `DELETE` click (N = 1, reuses same dialog with N=1 variant) OR card context menu `DELETE` (N=1).

### 9.2 Surface

Same shell as merge dialog: desktop/tablet centered `480px × auto`, mobile full-screen. `bg-0`, `1px rule-strong` border, zero radius, no shadow.

### 9.3 Contents

```
┌───────────────────────────────────┐
│  § 07 · DELETE                    │
│                                   │
│  DELETE {N} ITEMS?                │   ← Newsreader 28 ivory
│                                   │
│  This will remove {N} items from  │   ← Inter 14 sand
│  your library. Your past entries  │
│  will keep their nutrition data   │
│  but lose their library refer-    │
│  ences. This cannot be undone     │
│  after the 5-second grace window. │
│                                   │
│  - Oat porridge, blueberries      │   ← preview list,
│  - Greek yoghurt, Fage Total 10%  │     first 3 items,
│  - Grilled chicken, farro bowl    │     Newsreader 14 ivory
│  AND 4 MORE                       │   ← Inter 500 10.5 UPPER dust
│                                   │
│         [CANCEL]   [DELETE {N}]   │   ← action bar
└───────────────────────────────────┘
```

**Title:** `DELETE {N} ITEMS?` — Newsreader 300 / 28px / `ivory`. When N=1, reads `DELETE THIS ITEM?`.

**Body copy:** Inter 400 / 14px / `sand`, line-height `1.5`. Exact wording above (no dynamic templating beyond N).

**Preview list:** Up to first **3** item display_names, each as a bullet-prefix row (`- ` prefix in `dust`, name in `ivory`, Newsreader 400 / 14px). If N > 3, append `AND {N-3} MORE` in Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `dust`.

**Actions (right-aligned):**
- `CANCEL` — text button, Inter 500 / 10.5px / UPPERCASE / `dust`, 44px.
- `DELETE {N}` (primary oxblood) — Inter 500 / 10.5px / UPPERCASE / tracking `0.22em` / `ivory` on `oxblood` bg, 44px (48px on mobile), padding `0 22px`. Keyboard shortcut `Enter` when focus is on the dialog.

### 9.4 Server contract

`POST /api/library/bulk-delete` (architecture.md §8.6, route #9):

```ts
POST /api/library/bulk-delete
body: { ids: uuid[], client_ids: uuid[] }   // client_ids per I11 (one per deletion row)
response: { deleted_count: number }
cache: updateTag(TAGS.userLibrary(uid)) + updateTag(TAGS.userEntries(uid, day)) for affected days
```

Per the reversibility decision in §8.7, bulk-delete also uses `deleted_at` soft-tombstone. Undo resurrects via `POST /api/library/bulk-delete/undo` with `{ client_ids }`.

### 9.5 Optimistic UI + undo toast

- On confirm: cards disappear from grid with `ink-fade` 120ms (crossfade to empty slot — grid reflows via `motion-standard` 180ms).
- Toast: "{N} ITEMS DELETED · UNDO 5s" — LIFO per **I4**.
- Click UNDO: server undoes the batch. All `client_id` rows resurrect with `deleted_at = null`. Grid re-fills in original positions (`motion-standard` 180ms).
- After 5s: background job permanent-deletes the tombstoned rows.

### 9.6 Motion & a11y

Same primitives as merge dialog (§8.9–8.10). Additionally: focus lands on `CANCEL` (not `DELETE`) — destructive-action convention — so an accidental `Enter` doesn't commit.

---

## 10. Letter-Mark Thumbnail Fallback

### 10.1 When used

Any time `food_library_items.thumbnail_url IS NULL`. Covers:
- Text-logged items (per architecture.md §2.4 note: "NULL when text-created (letter-mark UI)").
- Photo-logged items whose thumbnail generation failed (`F7` fallback path — per design-doc.md §18 F7).
- Merged items where the user chose "NONE (letter-mark)" for thumbnail.

### 10.2 Visual

- Container: identical to the photo thumbnail zone (aspect 4/3, bg-2, 1px rule border, overflow hidden). The letter-mark is the content.
- Background: **oxblood** (`#8A2A1F`) — overrides `bg-2` inside the letter-mark variant. (Divergence from design-doc.md §10.6 which specs "`bg-2` surface" with a dust-colored letter; I follow the brief's §10 spec — oxblood bg, ivory letter — because it's more visually distinctive and the mockup's library cells are uniformly dark. Flagged for main agent.)
- Letter: **Newsreader 300 / 48px (tablet+)** / **32px (mobile)** / `ivory` / tabular lining, centered both axes (`display: grid; place-items: center`).

### 10.3 Letter-selection algorithm

```ts
function computeLetterMark(displayName: string): string {
  // 1. Strip leading emoji (covers 🍎 → first alphabetic char)
  let s = displayName.replace(
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u,
    ""
  );

  // 2. Get the first grapheme (handles combining chars correctly)
  const firstGrapheme = [...s][0] ?? "";

  // 3. Strip diacritics: "Phở" → "P", "Crème" → "C", "Jalapeño" → "J"
  const decomposed = firstGrapheme.normalize("NFKD");
  const stripped = decomposed.replace(/\p{Mark}/gu, "");

  // 4. If starts with a number, keep it as-is: "2-egg omelet" → "2"
  if (/^\d/.test(stripped)) return stripped.charAt(0);

  // 5. Uppercase the alphabetic result
  if (/^\p{Letter}/u.test(stripped)) return stripped.charAt(0).toUpperCase();

  // 6. Fallback: "?"
  return "?";
}
```

**Edge case coverage:**

| Display name | Letter-mark | Rationale |
|---|---|---|
| `Oat porridge` | `O` | Standard |
| `Phở bò tái nạm` | `P` | Vietnamese diacritic stripped; full name still stored and displayed |
| `Crème brûlée` | `C` | NFKD decomposes `è` → `e`, combining `\u0300` stripped |
| `2-egg omelet` | `2` | Number preserved |
| `🍎 Gala apple` | `G` | Emoji stripped, first alphabetic char |
| `Żurek` | `Z` | Polish diacritic stripped |
| `  Yogurt` (leading spaces) | `Y` | Whitespace implicitly handled by §1 regex class |
| `α-lipoic` | `Α` (Greek capital alpha) | Greek letter survives uppercasing |
| `…` (punctuation-only) | `?` | Final fallback |

### 10.4 Where rendered

- Library grid cards (§5.2)
- Food Detail sheet hero (§7.4)
- Merge dialog "THUMBNAIL" field Option C (§8.4 — renders a mini letter-mark at `80 × 60` for the pick preview)
- Live preview in merge dialog (§8.5 — full letter-mark when user picks Option C)
- Future surface: Log Flow Library tab search results (Agent 4 scope; same primitive)

### 10.5 Accessibility

- `role="img"` with `aria-label="{display_name} (no photo)"` on the letter-mark container.
- Contrast: ivory (`#F4EBDC`) on oxblood (`#8A2A1F`) yields WCAG AA contrast **≥ 6.5:1** (verified via Agent 1 token table) — passes large-text and normal-text thresholds.

---

## 11. Data Flow Summary

```
LIBRARY GRID mount
  └─> Cache Components fetch: SELECT * FROM food_library_items WHERE user_id = auth.uid()
        ORDER BY {sort token};  (RLS enforces scoping per I1)
        cacheTag: TAGS.userLibrary(uid)
        cacheLife: 'minutes'

USER TYPES IN SEARCH
  └─> debounced 150ms → client-side filter on normalized_name
        (falls back to GET /api/library/search?q= for sets ≥200 rows)

USER TAPS CARD (non-select)
  └─> navigate /library/[id]
        └─> Cache Components fetch: SELECT * FROM food_library_items WHERE id = :id
              cacheTag: [TAGS.userLibrary(uid), `library:item:${id}`]

USER EDITS FIELD IN DRILL-IN (pessimistic)
  └─> client generates client_id
        └─> PATCH /api/library/[id]/update { client_id, fields }
              └─> server lookup client_id → I11 no-op OR UPDATE row
              └─> updateTag(TAGS.userLibrary(uid))
              └─> response: { item } → client replaces local state

USER SELECTS 2 CARDS → MERGE
  └─> client generates merge client_id
        └─> POST /api/library/merge { client_id, winnerId, loserId, fields }
              └─> server: atomic txn:
                    UPDATE food_entries SET library_item_id = winnerId WHERE library_item_id = loserId
                    UPDATE food_library_items SET {fields, log_count += B, last_used_at = max} WHERE id = winnerId
                    UPDATE food_library_items SET deleted_at = now() WHERE id = loserId
              └─> updateTag(TAGS.userLibrary(uid)), updateTag(TAGS.userEntries(uid, day)) × affected days
              └─> response: { winner }
        └─> 5s undo window (Agent 4 toast, LIFO, I4)
              └─> UNDO click → POST /api/library/merge/undo { client_id } → atomic reverse

USER SELECTS N CARDS → BULK DELETE
  └─> client generates one client_id per deleted row
        └─> POST /api/library/bulk-delete { ids, client_ids }
              └─> server: UPDATE food_library_items SET deleted_at = now() WHERE id = ANY(ids)
                    (ON DELETE SET NULL on food_entries.library_item_id fires lazily on hard-delete)
              └─> updateTag(TAGS.userLibrary(uid))
        └─> 5s undo window (Agent 4 toast, LIFO, I4)
              └─> UNDO → POST /api/library/bulk-delete/undo { client_ids } → resurrect
```

---

## 12. Accessibility Summary (Library-specific)

| Concern | Implementation |
|---|---|
| Keyboard navigation | `Tab` through tools rail → grid cards in row-major order; `Enter`/`Space` activates; `Shift+Tab` reverses |
| Keyboard shortcuts | `/` focus search; `m` merge (bar visible, 2 selected); `Delete/Backspace` bulk-delete; `Escape` dismiss modal/cancel select mode; `Cmd/Ctrl+A` select all filtered |
| Focus rings | 2px `oxblood` inset on cards, search, dropdowns, dialog buttons (per Agent 1) |
| Tap targets | Cards are intrinsically ≥160×160 (mobile); all auxiliary controls (checkbox chip, close button, action buttons) meet 44×44 min |
| Dialog traps | Merge and delete dialogs trap focus; `aria-modal="true"`; first focus on least-destructive action |
| Live regions | Merge preview summary, undo toast countdowns, search results empty-state all `aria-live="polite"` |
| Reduced motion | All transitions collapse to 1ms per Agent 1 §6.4 |
| Contrast | All text/background pairs verified ≥4.5:1 (body) or ≥3:1 (large) per Agent 1 color table; ivory on oxblood (letter-mark) ≥6.5:1 |

---

## 13. Component Quality Checklist

| Component | Variants | States | Responsive | Motion | A11y |
|---|---|---|---|---|---|
| Library grid (`.library-grid`) | — | loaded, loading, empty | 4/3/2 cols @ 1280/768/375 | page-settle on mount | grid role, row-major tab order |
| Library item card (`.lib-item`) | photo, letter-mark | idle, hover, focus, press, selected | square 1:1 all bp | ink-fade hover, motion-micro press, motion-standard select-scale | focus ring, Enter/Space activation |
| Search input | — | idle, focus, filled, empty-results | full-width mobile | ink-fade focus ring | `/` shortcut, `Escape` clear |
| Filter/sort dropdowns | — | idle, hover, open, selected | same @ all bp | motion-standard open | Radix built-in kbd |
| SELECT button | idle, active | hover, focus, press | text-button all bp | ink-fade | 44×44 target |
| Bulk action bar | ≥2 selected | visible, merge-disabled (3+), merge-enabled (==2) | top desktop / bottom mobile | motion-standard slide+pulse | tooltip on merge-disabled |
| Food Detail sheet | — | opening, open, editing, saving, closing | right sheet / full sheet | motion-expressive shared-element | focus trap, Escape close |
| Merge dialog | — | opening, field-pick, custom-input, confirming | centered modal / full-screen | motion-standard open, ink-fade on change | role=dialog, focus trap, aria-live preview |
| Bulk delete modal | N≥2, N==1 | opening, confirming | centered / full-screen | motion-standard open | focus on CANCEL, Escape close |
| Letter-mark | 48px / 32px | — | desktop/tablet 48, mobile 32 | — | role=img, aria-label |

---

## 14. Fragment-level Flags for Main Agent

1. **Merge reversibility inconsistency (§8.7):** Brief says 5s undo window; design-doc.md §10.6 says "cannot be undone." Brief wins in this fragment, but needs a `food_library_items.deleted_at` schema addition that architecture.md §2.4 does not currently carry. Main agent: add schema addition in artifact 2 or downgrade to confirm-only.
2. **Letter-mark color divergence (§10.2):** Brief says "oxblood bg with ivory letter"; design-doc.md §10.6 says "`bg-2` surface with `dust`-colored letter." Brief wins for visual impact — flag for main agent reconciliation.
3. **Grid gutter resolution (§4.3):** Brief's numeric gutters (24/16/12) vs mockup's `gap: 0` + drawn rules. I chose `gap: 0` (ruled-grid aesthetic depends on it). Flag in case other agents computed gutters differently.
4. **Lib-name italicization (§5.3):** Mockup puts the food name in NON-italic serif; design-doc.md §8 says "italic serif food names." I followed the mockup (authoritative per Agent 1). Flag for cross-check with Agent 3 (meals bulletin) which also uses italic serif — those are entries, not library cards, so italics there are fine.
5. **Undo route names (§7.10, §8.8, §9.5):** I introduced `/api/library/merge/undo` and `/api/library/bulk-delete/undo` to support the 5s undo window. Architecture.md §8.6 does not list these routes. Main agent: either add them to architecture.md route table or collapse undo behavior into existing endpoints via a `client_id` flag (`?undo=true`).
6. **Context menu (§5.7):** Right-click / long-press affordance is not covered in design-doc.md §10.6. Added as a convenience surface; can be dropped if scope-tight — library is navigable without it via select-mode and drill-in.
7. **Micros disclosure in merge dialog (§8.4):** Collapses micronutrient field picking behind a disclosure to keep the primary field list compact. If the user needs to merge with specific micro picks, they need to expand. Flag: might simplify to "micros are copied from the picked kcal/macros item" (no per-micro picking) if the implementation cost is high.

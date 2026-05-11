## Log Flow Overview

The Log Flow is the primary input surface of Kalori — the most-frequent interaction in the app. It consists of a **3-tab modal** (Type / Snap / Library), a **shared Confirmation Screen with "Why these numbers?"**, and a **Undo Toast LIFO system** that gives the user a 5-second window to reverse any save-like action. Everything visual references tokens from Agent 1 (no hardcoded hex); launch affordances and keyboard shortcuts are owned by Agent 2.

### Launch affordances

| Breakpoint | Primary trigger | Secondary trigger |
|---|---|---|
| Mobile (375–767 px) | Center **FAB** (56×56 circular, `oxblood` fill, ivory `+` glyph — the documented zero-radius exception) | Sidebar "LOG" item if sidebar expanded (tablet pinned only) |
| Tablet (768–1279 px) | Sidebar rail "LOG" icon (1.5px stroke, 18px) | Keyboard `n` |
| Desktop (1280+ px) | Sidebar "LOG" labeled item | Keyboard `n` |

### Modal shell

- **Surface:** `bg-1` card field on `bg-0` backdrop at 85% opacity.
- **Frame:** 1px `rule-strong` hairline border; zero radius (Ledger-consistent; FAB is the only circle).
- **Sizing:**
  - Mobile: **full-screen** (100vw × 100dvh, safe-area insets respected for top notch + bottom home indicator).
  - Tablet + Desktop: **centered** at `max-width: 720px`, `max-height: 80vh`. Vertical scroll within modal if content overflows.
- **Entry motion:**
  - Mobile: 180ms slide-up from bottom, easing `cubic-bezier(.2, .8, .2, 1)`.
  - Tablet + Desktop: 180ms fade + scale (0.98 → 1), same easing.
  - `prefers-reduced-motion` → 120ms opacity-only crossfade, no translate/scale.
- **Exit motion:** same, reversed.
- **Dismissal:**
  - `Escape` closes (keyboard).
  - Backdrop click closes. **If user has typed >2 chars OR captured/uploaded a photo OR selected a library item**, shows inline "DISCARD UNSAVED ENTRY?" confirm prompt (two buttons: "KEEP EDITING" ivory outline / "DISCARD" oxblood fill) before dismissing.
- **Scroll lock:** body scroll locked while modal is open; `inert` attribute set on background routes for a11y.

### Tab switcher (top of modal)

- Three tabs horizontally: **TYPE** · **SNAP** · **LIBRARY**.
- Typography: Inter 10.5px UPPERCASE tracking 0.22em.
- Default state: `dust` color.
- Active state: `ivory` color + 2px `oxblood` underline rule at tab bottom.
- Hover state (desktop/tablet): `sand` color, no underline.
- 44×44 min tap target (extra padding rather than visual weight).
- Keyboard navigation: `ArrowLeft` / `ArrowRight` moves between tabs when the tablist has focus; `Home` / `End` jumps to first/last.
- State: tab active index persists in `useLogFlowStore` Zustand; open-modal always resets to TYPE unless `sessionStorage` restore kicks in (per design-doc §11 draft restoration rule).

### State shape (log modal)

```ts
// lib/stores/log-flow-store.ts (Zustand)
type LogFlowState = {
  isOpen: boolean;
  activeTab: 'type' | 'snap' | 'library';
  // Tab-specific drafts (persist via sessionStorage throttled 500ms; cleared on confirm or explicit cancel)
  typeDraft: { text: string; isParsingBlocked: boolean };
  snapDraft: { thumbnailDataUrl: string | null; status: 'idle' | 'capturing' | 'compressing' | 'uploading' | 'analyzing' | 'done' | 'error' };
  librarySelection: { itemId: string; portionQty: number; unit: string }[];
  // Confirmation state — populated after parse/vision/library resolve
  confirmation: ParsedEntryDraft | null;
  // Flow phase (drives which screen is visible)
  phase: 'tab' | 'confirmation';
  open: () => void;
  close: (force?: boolean) => void;
  setTab: (tab: 'type' | 'snap' | 'library') => void;
};
```

---

## TAB 1 — TYPE (Text Parse via Gemini)

### Layout

- **Textarea:**
  - Typography: Newsreader 20px ivory, line-height 1.4, italics on placeholder only.
  - Sizing: 12 lines default, autosize to 20 lines max, vertical scroll past that.
  - Placeholder: `"Describe what you ate — in any language"` in `sand` italic.
  - Background: `bg-1` (same as modal; no nested card).
  - Bottom border: 1px `rule` hairline (no box frame — Ledger paper-like).
  - Focus: 2px `ivory` outline at 2px offset (per all-breakpoint a11y rule).
  - Caret: `oxblood`.
- **Copy-yesterday affordances** (appear above textarea when yesterday has matching meals):
  - Row of links: `"COPY YESTERDAY'S BREAKFAST"` / `"... LUNCH"` / `"... DINNER"` in Inter 10.5 UPPERCASE `oxblood`, tracking 0.22em, 44×44 tap target via padding.
  - Links visible only if the corresponding meal slot has ≥1 entry on the prior day (client-checked from cached dashboard data; no extra fetch).
  - Tapping a link: prefills textarea with the entries' display names joined by " + " (e.g., `"2 eggs + avocado toast + black coffee"`).
- **PARSE button:**
  - Inter 10.5px UPPERCASE tracking 0.22em, color `ivory`.
  - Background: `oxblood` fill; hover `oxblood-soft`.
  - Dimensions: full-width on mobile with 12px horizontal padding, 44px tall; tablet/desktop 240px centered, 44px tall.
  - Disabled state (text ≤ 2 chars): background `bg-2`, text `dust`, cursor `not-allowed`.
  - Enabled state: pointer cursor.
- **Helper copy below button (dust Inter 10.5 UPPERCASE):** `"ENTER = PARSE · SHIFT + ENTER = NEW LINE"` (desktop/tablet only).

### States

| State | Visual |
|---|---|
| Empty / idle | Textarea, placeholder visible, button disabled |
| Typing (>2 chars) | Button enabled, character count mono JetBrains 10.5 `dust` at bottom-right (`"128 chars"`) |
| Parsing | Button text → `"PARSING…"` with 1px spinner left; textarea locks (`readOnly`, `dust` color overlay at 60% opacity); cancel affordance: tap outside or `Escape` aborts in-flight `fetch` via `AbortController` |
| Success | Smooth 180ms ink-fade transition to Confirmation Screen |
| AI failure (F7, I7) | Inline error banner above textarea: oxblood 2px top rule + `bg-2` fill + Inter 14 ivory `"AI couldn't parse — enter manually or try again"` + **"MANUAL ENTRY"** oxblood button + **"RETRY"** outline button (both 44px tall). Manual entry opens plain form inside the same modal (kcal, P/C/F, name, portion — all unit-less number inputs; no Gemini call). Original text preserved and prefilled into name field. |
| Auth expiry (F12) | Fetch interceptor retries once after silent refresh; on second 401, redirect to `/login?next=/log&restoreTab=type`; sessionStorage draft persists so restored post-login |

### Parsing contract (F11 mitigation)

- **Client side:** POST `/api/ai/text-parse` with `{ text, client_id: crypto.randomUUID(), locale }`. No prompt concatenation on client; raw text sent verbatim.
- **Server side** (documented for traceability — implementation in Route Handler): user text is injected as a separate `parts` entry in the Gemini content array, never string-concatenated into the system prompt template. Zod schema caps `ai_reasoning` at 500 chars and strips control characters before response hits the client.
- **Expected latency:** 5s target (per design-doc critical-flow targets). If >8s first byte, show "STILL ANALYZING…" helper under button. If >30s total, switch to AI-failure state (F2 boundary).

### Motion / a11y

- Textarea autosize uses `ResizeObserver`, animated with 120ms `height` transition; under reduced-motion the resize is instant.
- Spinner: 120ms opacity fade-in; spin uses CSS `@keyframes rotate` 900ms linear infinite; under reduced-motion, spinner becomes a static `"·"` glyph with opacity pulse at 1.5s interval.
- Screen reader announces status changes via `aria-live="polite"` region ("Parsing…", "Parsed 3 items", "Parse failed").

---

## TAB 2 — SNAP (Photo Vision via Gemini)

### Layout

- **Camera/upload surface:**
  - Mobile: full-width of modal content area, 4:3 aspect ratio (≈375 × 280 within safe-area).
  - Tablet: centered 480 × 360 px preview area.
  - Desktop: centered 480 × 360 px preview area.
  - Surface: 1px `rule-strong` border on `bg-2`; inner: live camera `<video>` or selected image.
  - Placeholder state (no image yet): centered icon (lucide-react `Camera` 1.5px stroke, 48px, `dust`) + Inter 10.5 UPPERCASE `dust` label `"TAP TO CAPTURE A MEAL"`.
- **CAPTURE button:**
  - Dimensions: **56 × 56 square** (NOT round — distinct from mobile FAB; Ledger aesthetic).
  - Background: `oxblood` fill; ivory 1.5px stroke inner circle (camera aperture glyph) centered.
  - Position: centered under preview area, 16px gap.
  - Disabled when camera permission denied or no image source.
- **"UPLOAD INSTEAD" link:**
  - Below CAPTURE, 8px gap.
  - Inter 10.5 UPPERCASE `oxblood` tracking 0.22em; hover `oxblood-soft` underline.
  - Tapping opens OS file picker (accept `image/*`).
- **Post-capture controls:**
  - Thumbnail preview 160 × 160 px, `rule-strong` border.
  - Row of two buttons below thumbnail:
    - `"RE-TAKE"` — outline button (1px `rule-strong` border, ivory text, `bg-1` fill, hover `bg-2`).
    - `"ANALYZE"` — oxblood fill primary.
  - Both 44px tall; Inter 10.5 UPPERCASE tracking 0.22em.

### States

| State | Visual |
|---|---|
| Idle (camera available) | Live preview, CAPTURE enabled |
| Permission denied | Preview area replaced with `bg-2` fill + Inter 14 `sand` italic `"Camera unavailable — UPLOAD INSTEAD"` + oxblood link |
| Captured | Thumbnail + RE-TAKE / ANALYZE row; CAPTURE hidden |
| Compressing (client-side) | Progress label Inter 10.5 UPPERCASE `dust` `"COMPRESSING…"` + 1px progress bar `oxblood` depleting L→R over estimated ~800ms |
| Uploading | Label `"UPLOADING… 2s"` + indeterminate spinner (circular 24px, oxblood 2px stroke, 900ms rotation) |
| Analyzing | Label `"ANALYZING… 4s"` + same spinner; thumbnail persists (ghosted at 70% opacity to signal work-in-progress) |
| Success | 180ms ink-fade to Confirmation Screen; thumbnail persists inset top-right of confirmation (72 × 72 px, 1px `rule-strong`) |
| AI failure (I7, F7) | Same fallback banner as Tab 1 ("AI couldn't analyze — enter manually or retry"); thumbnail survives into manual-entry form as the library item's thumbnail if user saves-to-library |
| Auth expiry (F12) | Refresh interceptor retries upload + analyze calls once; on second 401, redirect `/login?next=/log&restoreTab=snap` (thumbnail blob is **not** persisted across login — re-upload required; see draft-persistence exclusion in design-doc §11) |

### Compression contract (client-side)

- Library: `browser-image-compression` (per tasks.md Phase 3).
- Target: <500 kb, max dimension 1600 px, JPEG quality tuned by library (auto).
- Output: `File` object → uploaded to Supabase Storage under `{userId}/{entryId}/original.jpg`.
- On compression failure: surface error banner `"Image too large — try a different photo"` + RE-TAKE button; no retry of compression (no user-tunable knob — avoids gold-plating).

### Photo retention policy (I4)

- Original uploaded to Supabase Storage bucket `food-thumbnails`.
- **Immediately post-analysis**, server deletes original and generates a <50 kb thumbnail.
- Thumbnail URL is what persists on `food_entries.thumbnail_url` and `food_library_items.thumbnail_url` if save-to-library is on.
- UI surfacing: user never sees the original after the analyze step completes; thumbnail is what shows on confirmation screen and in meals bulletin.

### Motion / a11y

- Capture button press: 120ms scale 1 → 0.96 → 1 feedback; under reduced-motion, opacity pulse instead.
- Preview → thumbnail transition: 180ms crossfade.
- Screen reader: `aria-live="polite"` announces `"Photo captured"`, `"Uploading"`, `"Analyzing"`, `"Analysis complete"`.
- Keyboard: `Space` or `Enter` on focused CAPTURE button; `Tab` cycles to UPLOAD INSTEAD link.

---

## TAB 3 — LIBRARY (Saved Items)

### Layout

- **Search input (top):**
  - Full-width (modal-width minus 12px padding each side).
  - Height 44px; Inter 14px `ivory`; placeholder `"Search library"` in `dust` italic.
  - Background `bg-1`; bottom border 1px `rule` (no full box — matches Tab 1 textarea treatment).
  - Left: lucide `Search` icon (1.5px stroke, 18px, `dust`); 12px gap to text.
  - Focus: bottom border thickens to 2px `oxblood`; 2px ivory outline for keyboard focus.
  - Global `/` keyboard shortcut (desktop/tablet) focuses this input when Library tab is active.
- **Library grid (below search, 12px gap):**
  - Mobile: 1-col grid.
  - Tablet: 2-col grid, 16px gutter.
  - Desktop: 3-col grid, 16px gutter.
  - No drawn column lines here (unlike the full `/library` grid which has visible column rules per Agent 5 — this is a compact picker).
- **Library item card (160 × 120 px):**
  - 1px `rule-strong` border; `bg-1` background; hover `bg-2` (tonal-only per Ledger motion philosophy, no scale).
  - Layout: thumbnail left (56 × 56 px, 1px `rule` border, `bg-2` fill if no photo → letter-mark); right column contains name + kcal + date.
  - **Letter-mark fallback** (when `thumbnail_url` is null): first letter of `display_name` in Newsreader 300 weight, 28px, `dust` on `bg-2`, centered in the 56 × 56 square.
  - Name: Newsreader 16 `ivory`, line-height 1.3, clamps at 2 lines with ellipsis.
  - kcal/portion: Inter 10.5 UPPERCASE `sand` tracking 0.22em, e.g. `"318 KCAL · 280G"`.
  - Last-used: JetBrains Mono 10.5 `dust`, e.g. `"03 APR"`.
- **Empty state** (no library items yet, no search query):
  - Centered vertically in content area.
  - Inter 14 `dust` italic: `"No library items yet — log something to save it."`
  - Below: outline button `"OPEN TYPE"` (switches active tab to TYPE).

### States

| State | Visual |
|---|---|
| Empty (zero items, no query) | Empty state as above |
| Idle (items present, no query) | Grid of all items, default sort = most-used first (descending `log_count`) |
| Searching | Real-time filtered grid (debounce 150ms); matched substring highlighted `ivory` on 10% `oxblood` fill inline |
| No results | Inter 14 `dust` italic centered: `"No matches for 'X' — try different words"` |
| Item selected (tap) | Item row animates 120ms → opens Portion Picker (Section below) |
| Long-press (mobile) / right-click (desktop) | Contextual menu with single action `"EDIT ITEM"` (opens library detail route `/library/[id]` — Agent 5's territory); menu is `bg-2` surface, 1px `rule-strong` border, 180ms fade-in |

### Search filter behavior

- Real-time client-side filter against cached library list (from the `useLibraryStore` or server-fetched snapshot; no per-keystroke fetch).
- Debounced 150ms on `input` events.
- Matches `normalized_name` (lowercase, punctuation-stripped) substring; not fuzzy (per design-doc invariant — normalized-equality only).
- Highlight: wrap matched substring in `<mark>` styled `bg-[oxblood]/10 text-ivory`.
- Clear affordance: 1px `rule` `×` glyph (lucide `X`, 16px, `dust`, hover `oxblood`) appears in the input's right edge when query length > 0; 44 × 44 tap target.

### State shape (library tab)

```ts
type LibraryTabState = {
  query: string;
  debouncedQuery: string;            // 150ms behind `query`
  items: FoodLibraryItem[];          // read from cached library list
  selectedForPortion: string | null; // library_item_id currently in portion picker
  sortMode: 'most-used' | 'recent';  // default: 'most-used'
};
```

### Motion / a11y

- Grid cells enter on tab-switch with staggered 120ms opacity fade (rows 0 → N at 30ms delay per row); under reduced-motion, crossfade without stagger.
- Search highlight: instant (no transition).
- Screen reader: each grid cell is `<button role="option">`; grid uses `role="listbox"` with `aria-activedescendant` tracking the keyboard-focused cell.
- Keyboard: `ArrowDown`/`ArrowUp`/`ArrowLeft`/`ArrowRight` navigates cells; `Enter` selects → opens Portion Picker.

---

## Portion Picker (sub-surface — launches from Library tab OR Confirmation edit)

### Layout

- **Mobile:** inline **bottom sheet** that slides up 180ms from the bottom of the modal, 50vh default height, `bg-2` surface, 1px `rule-strong` top edge. Backdrop inside the modal (not full screen) at 50% `bg-0` opacity.
- **Tablet + Desktop:** floating panel centered over the selected library card, 360 × 280 px, `bg-2` surface, 1px `rule-strong` border, drop-anchored to the card (not overlay-centered — preserves spatial context).
- **Dismiss:** `Escape` closes; tap outside closes; explicit `×` top-right (lucide 18px `dust`).

### Controls

- **Stepper row:** horizontal, centered.
  - `−` button: 44 × 44, 1px `rule-strong` border, `ember` glyph (24px Newsreader), hover `bg-1`.
  - **Value display:** Newsreader 32 tabular-nums lining `ivory`, centered; dynamic width matches longest expected value (e.g. `"2.5"`).
  - `+` button: mirror of `−`.
  - Step: 0.5 for "portion" unit; 10 for "g" / "ml".
- **Unit selector** (below stepper, 12px gap):
  - Default unit from library item (`default_unit` field).
  - Switcher: segmented control of Inter 10.5 UPPERCASE pills with 2px `oxblood` underline on active. Options: `"PORTION"`, `"G"`, `"ML"` (only those the library item supports are shown).
- **Preset chips** (below unit selector, 12px gap — only if active unit is `"portion"`):
  - `"HALF"` · `"FULL"` · `"DOUBLE"` — 44 × 44 min, Inter 10.5 UPPERCASE `oxblood` tracking 0.22em, 1px `rule-strong` border, `bg-1` fill, hover `oxblood-soft` border.
  - Tapping a chip sets value to 0.5 / 1.0 / 2.0 respectively; active chip highlights with 2px `oxblood` bottom border.
- **"LOG THIS" button:**
  - Full-width of sheet/panel, 56px tall, Inter 10.5 UPPERCASE `ivory` tracking 0.22em, `oxblood` fill, hover `oxblood-soft`.

### Save action (optimistic per design-doc §6, I11, I8)

- On tap:
  1. Generate `client_id = crypto.randomUUID()`.
  2. Compose `food_entries` row locally: `{ client_id, library_item_id, portion_qty, portion_unit, meal_category: autoFromTimeOfDay(), logged_at: now(), items: libraryItem.nutritionItems, source: 'library' }`.
  3. Optimistically insert into Zustand `useEntriesStore.today` at LIFO position; close modal immediately.
  4. Fire `POST /api/entries/save` with `client_id`.
  5. **On success:** no UI change (optimistic view is already correct); push an Undo Toast (Section below).
  6. **On failure:** rollback local insert, surface error toast (`bg-2`, 1px `rule-strong`, 2px `oxblood` left rule) with message + RETRY button; restore modal state + re-open modal on TAB 3 with portion picker pre-populated.
- F12 handling: same refresh-interceptor pattern; integration test `library-log-refresh.test.ts` verifies.
- Skip Confirmation Screen: **Library flow bypasses the Confirmation Screen** when user saves directly from Portion Picker (library items have stored nutrition — no AI reasoning to review). If the user needs to edit meal category or time, they use the Confirmation Screen by tapping `"REVIEW BEFORE SAVING"` secondary link (Inter 10.5 UPPERCASE `dust` below LOG THIS button) which routes into the shared Confirmation with `source: 'library'`.

### State shape (portion picker)

```ts
type PortionPickerState = {
  libraryItem: FoodLibraryItem;
  qty: number;
  unit: 'portion' | 'g' | 'ml';
  isSaving: boolean;
  errorMessage: string | null;
};
```

---

## Confirmation Screen (shared by TYPE + SNAP; optional for LIBRARY)

### Purpose

User reviews Gemini's interpretation **before** saving to the database. Surfaces the `"Why these numbers?"` panel — the primary trust-builder for AI accuracy. For library logs, this screen is opt-in (skipped by default; user can toggle via `"ALWAYS REVIEW LIBRARY LOGS"` in Settings).

### Layout

- **Full modal takeover** — replaces the Tab content area entirely within the same modal shell (no new overlay; user is still inside the Log modal). Tab switcher hides during confirmation phase (`useLogFlowStore.phase === 'confirmation'`).
- **Entry motion:** 600ms ink-fade from the previous tab state (per Ledger "ink settling" motion philosophy — matches chronometer ring animation tempo). Under reduced-motion: 180ms crossfade.
- **Mobile:** full-screen stacked; scroll within modal.
- **Tablet + Desktop:** 720px centered modal; `max-height: 80vh` with internal scroll.

### Top section (kicker rule)

- Inter 10.5 UPPERCASE `sand` tracking 0.22em: `"KALORI'S LEDGER READS:"`
- Double hairline rule below (1px `rule` + 1px `rule-strong` with 2px gap — Ledger signature).
- 16px margin below rule.

### Items list

Each parsed item is a row with the following grid:

```
[Food name + sub]     [Stepper]    [Macros strip]    [kcal right-aligned]
```

- **Food name:** Newsreader 20 `ivory`, line-height 1.2. Editable on tap → inline edit with caret, same typography.
- **Sub (portion + unit):** Newsreader 14 italic `sand` directly below name. E.g., `"one bowl · 280 g"`. Editable on tap → stepper replaces the sub line inline.
- **Stepper (qty):** 1px `rule-strong` border box; `−` / value / `+` — same component as Portion Picker's stepper but compact (36 × 28px).
- **Macros strip (P / C / F with mini-bars):**
  - 3 inline labels + 3 1-pixel-tall 48px-wide horizontal bars.
  - Labels: JetBrains Mono 10.5 `dust` `"P · C · F"`.
  - Values below each label: Newsreader 14 tabular-nums `ivory`.
  - Mini-bars colored `oxblood` (protein), `ochre` (carbs), `moss` (fat); fill proportional to contribution to that item's kcal.
- **kcal:** Newsreader 24 tabular-nums `ivory`, right-aligned; below: Inter 10.5 UPPERCASE `dust` `"KCAL"`.
- Row separator: 1px `rule` hairline.
- **Delete-from-confirmation:** swipe-left on mobile / hover `×` (44×44) on tablet+desktop removes the item from the to-be-saved entry list; emits an inline micro-undo within the confirmation (10s timer; localized; not the global Undo Toast system).

### "Why these numbers?" expandable

- Below items list, 16px gap.
- **Collapsed state (default):**
  - Single row: Inter 10.5 UPPERCASE `oxblood` tracking 0.22em `"WHY THESE NUMBERS?"` + right-aligned `▸` caret (`oxblood`, Newsreader 18).
  - 1px `rule-strong` top + bottom border (double-sandwich rule — signals expandability).
  - 48px row height, 44 × 44 tap target.
  - Hover/focus: `bg-2` fill (tonal).
- **Expanded state:**
  - Caret rotates to `▾` (120ms rotation; under reduced-motion: instant).
  - Body: Newsreader 15 `sand` line-height 1.6, 20px top padding, max 500 chars (enforced server-side per F11 Zod cap; client just displays).
  - If Gemini returned a bullet list of ingredient-confidence triples, render as a table: `ingredient` (Newsreader 14 italic `sand`) · `source + confidence` (JetBrains Mono 10.5 `dust`) · `kcal` (Newsreader 14 `ivory` right-aligned).
  - 1px `ember` left border on the whole body (visual hierarchy — same device used by the `bg-2` inset pattern on the dashboard weekly-review card).
  - Bottom line: JetBrains Mono 10.5 `dust` `"sources · usda.sr30 · openfoodfacts · library/…"` if present.
- **Hidden when:**
  - `source === 'library'` (no AI reasoning exists for library items).
  - Manual-entry fallback path (no AI reasoning because no AI call).

### Meal slot picker

- Below Why-panel, 16px gap.
- Kicker: Inter 10.5 UPPERCASE `dust` tracking 0.22em `"MEAL CATEGORY"`.
- Row of 4 chips: `BREAKFAST` · `LUNCH` · `DINNER` · `SNACK`.
  - Chip dimensions: min 96 × 44.
  - Default state: 1px `rule-strong` border, `bg-1` fill, Inter 10.5 UPPERCASE `dust`.
  - Active state: `oxblood` fill, `ivory` text, no border.
  - Hover: `bg-2` fill (tonal only, no scale).
- Auto-selected on confirmation load based on time-of-day (user's TZ via `profiles.timezone`, per F5):
  - 5:00 – 10:59 → Breakfast
  - 11:00 – 15:59 → Lunch
  - 17:00 – 21:59 → Dinner
  - Otherwise → Snack
- Editable — user tap overrides auto-selection.
- Keyboard: `1` / `2` / `3` / `4` jumps to each slot (when confirmation focus is inside the slot picker).

### Time editor

- Below meal slot picker, 12px gap.
- Kicker: Inter 10.5 UPPERCASE `dust` `"LOGGED AT"`.
- Field: JetBrains Mono 14 `ivory` showing `"HH:MM · DD MMM YYYY"` (user TZ).
- Tap to edit inline: native date + time input; backfill allowed up to 30 days (per blueprint §9; enforced by Zod server-side + client date-picker `min` attribute — I8).
- Default: `now()` at confirmation load.

### Save-to-library toggle

- Below time editor, 16px gap.
- Row: Inter 10.5 UPPERCASE `sand` `"SAVE COMBINED ENTRY TO LIBRARY"` on left + toggle switch on right.
- Toggle: 48 × 24 rectangular (zero-radius, Ledger), `bg-2` track with 1px `rule-strong` border; knob is 20 × 20 `ivory` square sliding L→R; active state `oxblood` track fill + ivory knob.
- Default: ON (unless the items came from a library log — then the toggle is hidden because the items are already library-backed).
- Below toggle (when ON): Inter 10.5 UPPERCASE `dust` sub-label showing the normalized-name that would be used, e.g. `"AS: 'YOGHURT WITH WALNUTS AND HONEY'"`.
- **Normalized-name dedup prompt** (inline): if the normalized-name matches an existing library row, show an amber banner (`ember` 1px top rule + `bg-2` fill):
  - Inter 14 `ivory`: `"A library entry with this name already exists."`
  - Two buttons: `"REUSE EXISTING"` (oxblood fill) and `"CREATE NEW"` (outline).
  - Keyboard: `Enter` activates primary action (reuse).

### Save affordance

- **"SAVE TO LEDGER" button:**
  - Bottom of confirmation, 24px top margin.
  - Mobile: full-width minus 12px side padding, 56px tall.
  - Tablet + Desktop: centered 360px wide, 56px tall.
  - Inter 10.5 UPPERCASE `ivory` tracking 0.22em on `oxblood` fill; hover `oxblood-soft`.
- **"DISCARD" secondary link:**
  - Above or beside the primary depending on width; Inter 10.5 UPPERCASE `dust` tracking 0.22em; hover `oxblood`.
  - Tap: shows "DISCARD UNSAVED ENTRY?" inline confirm (same pattern as modal backdrop dismissal) before destroying state.

### Save action (optimistic per design-doc §6, I8, I11)

1. On SAVE tap, **before** any network call, generate `client_id = crypto.randomUUID()` (if not already present).
2. Compose entry locally: `{ client_id, source, items, ai_reasoning (nullable), portion, meal_category, logged_at, library_item_id (nullable), thumbnail_url (nullable) }`.
3. Insert into `useEntriesStore.today` LIFO at position 0 (optimistic — appears on dashboard meals bulletin immediately via Zustand subscription).
4. Close modal immediately (state reset: `phase = 'tab'`, all draft fields cleared; sessionStorage draft dropped).
5. Fire `POST /api/entries/save` with `{ client_id, …payload }`. The fetch goes through the F12 refresh-interceptor (`lib/auth/refresh-interceptor.ts` — per Task 2.1 contract).
6. **Server side:** UNIQUE constraint on `client_id` ensures idempotency (I11); replay of the same `client_id` returns 200 no-op without double-insert.
7. **Cache invalidation:** server handler calls `updateTag(TAGS.userEntries(uid, day))` and `updateTag(TAGS.userLibrary(uid))` if save-to-library is on (per I12 — typed cache-tag constants only).
8. **On success:** no UI change (already showing optimistic view); push Undo Toast (next section).
9. **On failure:**
   - Roll back the local insert (remove entry from `useEntriesStore.today` by `client_id`).
   - Surface error toast (bottom-center, `bg-2` surface, 1px `rule-strong` border, 2px `oxblood` left rule): Inter 14 `ivory` `"Couldn't save — try again"` + RETRY link (oxblood, re-fires the same POST with the same `client_id`).
   - Re-open log modal in `phase === 'confirmation'` with state preserved (items, meal category, time, save-to-library toggle all restored) so user doesn't re-enter anything.

### "Skip confirmation" power-user setting (cross-ref)

- Settings › Preferences › `"ALWAYS SAVE WITHOUT REVIEW"` toggle (OFF by default; Agent 5 territory for the settings screen).
- When ON:
  - TYPE: after PARSE, skips confirmation and fires the save with Gemini's auto-parsed items at `portion = 1` and auto-inferred meal slot.
  - SNAP: same (thumbnail persisted to library if save-to-library also ON; default on).
  - LIBRARY: already skippable by default.
- The Undo Toast still fires so user has the 5s window to revert without confirmation step.
- Setting is user-level (stored on `profiles.always_save_without_review`); no per-tab override.

### State shape (confirmation)

```ts
type ConfirmationState = {
  source: 'text' | 'photo' | 'library' | 'manual';
  client_id: string;             // generated before entering confirmation
  items: ParsedItem[];           // editable
  ai_reasoning: string | null;   // ≤500 chars, Zod-validated
  thumbnailUrl: string | null;   // photo flow only
  mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  loggedAt: string;              // ISO 8601, user TZ aware
  saveToLibrary: boolean;
  dedupMatch: FoodLibraryItem | null;
  isSaving: boolean;
  errorMessage: string | null;
};
```

---

## Undo Toast (LIFO system per I8)

### Trigger events

The toast fires after every **save-like action**, giving the user a 5-second window to undo. Triggers include:

- Log entry saved (any of the 3 flows).
- Water quick-add (+glass / +bottle).
- Weight quick-add.
- Library item edited (name, portion, nutrition).
- Library item deleted.
- Library items merged (treats merge as a single undoable op).
- Library bulk-delete.
- Copy-yesterday (bulk; single toast for the whole batch).
- Entry deleted from the dashboard meals bulletin.

This makes the Undo Toast **a cross-cutting surface** that every other agent's components must emit events into. Flagged in "Cross-Component Data Flow" below.

### Layout

- **Position:**
  - Mobile: bottom-center, anchored above the bottom tab bar + FAB (`bottom: calc(56px + env(safe-area-inset-bottom) + 72px)` — 72px clears the FAB + 8px gap).
  - Tablet: bottom-center, anchored above content (no tab bar at this breakpoint), 24px from viewport bottom.
  - Desktop: bottom-center, 24px from viewport bottom; sidebar does NOT shift the toast off-center (toast is centered within the content column, not the viewport, so it visually belongs to the active screen).
- **Dimensions:**
  - Mobile: 80vw max-width, content-hugs up to that; 56px min-height.
  - Tablet + Desktop: 480px fixed width, 56px min-height.
- **Surface:** `bg-2` fill.
- **Border:** 1px `rule-strong` on all sides; **2px `oxblood` rule on left edge** (signature accent device — same treatment as the Why-panel's ember rule, but oxblood here because Undo is user-reversible, not editor reasoning).
- **Inner padding:** 16px horizontal, 12px vertical.

### Content

- **Left (flex-grow):** Inter 14 `ivory`, dynamic text describing action:
  - `"LOGGED '3 EGGS' (+240 KCAL)"` (log save)
  - `"DELETED ENTRY · AVOCADO TOAST"` (delete)
  - `"MERGED 'YOGHURT' INTO 'GREEK YOGHURT'"` (library merge)
  - `"COPIED 5 ENTRIES FROM YESTERDAY"` (copy-yesterday)
  - `"+1 GLASS · WATER"` (water quick-add)
- **Right:** **UNDO** link.
  - Inter 10.5 UPPERCASE `oxblood` tracking 0.22em; hover `oxblood-soft` underline.
  - 44 × 44 tap target (padding expands beyond text footprint).
  - Keyboard: focusable; `Enter` activates undo.

### Auto-dismiss behavior

- **Timeout:** 5000ms from render.
- **Countdown progress bar:** 1px tall `oxblood` bar along the bottom edge of the toast, width 100% → 0% depleting right-to-left linearly over 5000ms.
- **Hover pause (desktop only):** mouse over toast pauses countdown; mouse-out resumes from current position.
- **Reduced-motion fallback:** no animated depletion. Instead, bar uses 5 opacity steps (100% → 80% → 60% → 40% → 20% → 0%) at 1000ms intervals — same semantic information, zero motion.

### LIFO stacking

- Internal queue is a stack (LIFO) in `useUndoQueueStore` (Zustand, per design-doc §11).
- **Only the top toast is visible and has an active `UNDO` link.**
- When a new save event fires while a toast is already visible:
  1. Current toast slides down 120ms + fades to 0% opacity; at the end it's retained in the stack (hidden but tracked).
  2. New toast slides in 180ms from the same anchor position.
  3. The displaced toast's 5s timer **continues running in the background**; if it expires while hidden, its destructive action commits and it is removed from the stack.
  4. When the visible toast dismisses (undo or timeout), the next item down in the stack surfaces (if still within its 5s window); otherwise surfaces nothing.
- Under reduced-motion, the swap is a crossfade (no slide).
- Queue depth is unbounded but practically capped by rapid-action rate (<5 stacked in normal use).

### Cleared on navigation

- Route change auto-dismisses any pending toast with a 120ms fade.
- Pending destructive actions **commit** on nav-dismiss (you can't un-eat the page change — that's the I8 design intent).
- Crossing breakpoint (e.g., rotating mobile → tablet) does NOT trigger a route change and thus does NOT dismiss toasts; toast re-anchors.

### Undo action

1. User taps UNDO (or presses `Enter` with toast focused).
2. Toast shifts to "undoing…" state (link text → `"UNDOING…"`, spinner `·` glyph, no new taps accepted; 150ms transition).
3. Zustand reverses the optimistic change:
   - For **save** events: remove the optimistically-inserted row from `useEntriesStore.today` by `client_id`; fire `DELETE /api/entries/{id}?client_id=X` to remove the server row. Use a **tombstone insert** pattern: if the server row was already created, insert a delete-marker row with the same `client_id` + `deleted_at = now()` that the server's idempotent DELETE handler respects.
   - For **delete** events: re-insert the previously-deleted row locally; fire `POST /api/entries/save` with the original `client_id` (idempotent per I11 — replay returns 200 no-op, or recreates the row if server had already committed the delete).
   - For **edit** events: write the pre-edit snapshot back to local state; fire `PATCH /api/entries/{id}` with the pre-edit payload.
   - For **merge** events: reverse is complex and documented as a post-MVP enhancement — the initial MVP merge is **non-undoable** (user sees the toast but no UNDO link — per design-doc §18.3 "cannot be undone, confirm dialog required"). The toast for merge operations shows `"MERGED — NO UNDO"` as informational with a fade-out and no undo action.
4. On successful server reverse: toast dismisses with 120ms fade; success banner (1s auto-dismiss) slides in briefly: `"RESTORED."`
5. **On server-reverse failure:**
   - Re-apply the original (intended) change in local state (since server didn't reverse).
   - Show error toast (replaces undo toast inline): `"Undo failed — try again"` + RETRY link.
   - Error toast has its own 5s auto-dismiss; if dismissed without retry, the destructive action stands.

### State shape (undo queue)

```ts
// lib/stores/undo-queue-store.ts (Zustand)
type UndoToast = {
  id: string;                          // UUID per toast
  action: UndoableAction;              // discriminated union
  description: string;                 // Inter 14 copy shown in toast
  client_id: string;                   // for idempotent reversal
  snapshotBefore: unknown;             // typed per action
  snapshotAfter: unknown;              // typed per action
  createdAt: number;                   // ms epoch, drives countdown
  expiresAt: number;                   // createdAt + 5000
  isUndoable: boolean;                 // false for merge ops
  onCommit: () => Promise<void>;       // fires at timeout to commit destructive action
  onUndo: () => Promise<void>;         // fires when UNDO tapped
};
type UndoQueueState = {
  stack: UndoToast[];                  // LIFO
  pushToast: (toast: UndoToast) => void;
  popTop: () => void;                  // timeout expiry + undo both call
  dismissAll: () => Promise<void>;     // fires on route change; commits all pending
};
```

### Motion summary (cites Agent 1 timings)

- Toast enter: 180ms slide-up + fade; easing `cubic-bezier(.2, .8, .2, 1)`.
- Toast swap (LIFO): 120ms out + 180ms in (overlap allowed).
- Toast dismiss (timeout): 120ms fade-down.
- Toast dismiss (nav): 120ms crossfade.
- Countdown bar: linear 5000ms width interpolation.
- Reduced-motion: all transitions replaced with opacity-only crossfades; countdown bar uses discrete 5-step opacity.

### A11y

- Toast is rendered inside an `aria-live="polite"` region (announces description + `"Press Undo"` on appear).
- Toast element has `role="status"`.
- UNDO link is focusable; keyboard `Tab` includes it in the natural tab order when a toast is visible (skipped when none visible).
- Min 44 × 44 tap target for UNDO.
- Color-not-sole-signal: countdown uses bar width/opacity + the text "UNDO" — never color alone to indicate state.

---

## AI Accuracy Tier Integration (cross-ref)

- The Confirmation Screen's `"Why these numbers?"` panel is the primary **UI trust-builder** for Gemini's outputs — the user's direct window into model reasoning.
- The AI Accuracy gate (critical-tier: 5 VN dish + 3 Western staple fixtures — per Task 3.2 + 5.4) ensures the numbers shown on the Confirmation Screen are meaningful and plausibly correct.
- Advisory-tier misses (Gemini returns an implausible number) are reported via an in-app `"Report issue"` link on the confirmation row (inline Inter 10.5 UPPERCASE `dust` `"· REPORT"` next to each parsed item's kcal — desktop/tablet only, collapses behind long-press menu on mobile). Tapping it writes a row to `ai_call_log.user_flagged = true` with the Zod payload for later review; no UI change for the user beyond a brief toast `"NOTED."` — no blocking behavior.
- VN-first: the 5-VN critical-tier fixtures are what the Confirmation Screen must render intelligibly (dish name, portion inference rationale, ingredient-level confidence). If Gemini can't return that shape for `"bún bò"`, the merge-blocking gate catches it upstream (Task 3.2) before the Confirmation UI is ever asked to render incorrectly.

---

## Cross-Component Data Flow

```
LOG MODAL (TAB selection → draft)
  ↓
TYPE  → POST /api/ai/text-parse → Zod validate → parsed items + ai_reasoning
SNAP  → compress → POST /api/ai/vision (with Storage path) → Zod validate → parsed items + ai_reasoning + thumbnail
LIBRARY → select item → Portion Picker → (optionally) skip to SAVE
  ↓
CONFIRMATION SCREEN (phase === 'confirmation')
  ├─ edit items inline (portion / kcal / macros / name) — does NOT re-query Gemini
  ├─ review Why-panel
  ├─ pick meal category + time
  └─ save-to-library toggle + dedup-merge prompt
  ↓
SAVE ACTION (client_id generated; optimistic insert into useEntriesStore.today; close modal)
  ↓
POST /api/entries/save (F12 refresh-interceptor, F11 Zod re-validate on server, I11 UNIQUE enforce)
  ↓
updateTag(TAGS.userEntries(uid, day)) + optional updateTag(TAGS.userLibrary(uid))  [I12]
  ↓
UNDO TOAST (5s window; LIFO; cleared-on-nav)
  ├─ user taps UNDO → reversal (tombstone insert, delete, or patch)
  └─ timeout → destructive action commits
  ↓
DASHBOARD UPDATES
  └─ chronometer ring redraws · macro bars tick · meals bulletin re-renders · weekly review may refresh next visit
```

### Cross-cutting concerns flagged

- **Undo Toast is consumed by every component that mutates data** — not just the Log modal. Agent 3 (dashboard water/weight quick-add), Agent 5 (library edit/delete/merge/bulk-delete), and any future Agent 6 chart interactions that allow deletion must all emit `useUndoQueueStore.pushToast()` events using the same LIFO contract documented here. This is the load-bearing `I8` surface for the entire app.
- **Copy-yesterday button on the dashboard (Agent 3)** must emit a **single** toast describing the batch ("COPIED 5 ENTRIES") rather than 5 individual toasts — per user cognitive load.
- **F12 refresh-interceptor** wraps *every* network call in this flow (parse, vision, save, delete, patch, merge). Agent 4 defines the UX (session-expired banner + `/login?next=...&restoreTab=...`); Task 2.1 owns the implementation (per R1 mitigation contract).
- **Normalized-name dedup prompt** (Confirmation Screen) reads from the library cache that Agent 5 owns; Agent 5 should expose the normalized-name index as a client-accessible helper (`lib/library/normalized-lookup.ts`) so this Confirmation surface doesn't trigger an extra fetch.
- **Sessionstorage draft persistence** (design-doc §11) applies to TYPE text + LIBRARY selection + Confirmation edits, but explicitly NOT to SNAP blobs — see §11 exclusion. Fragment treats this as already-locked policy; no UX workaround beyond re-upload.

---

## Responsive behavior summary (3 breakpoints)

| Surface | Mobile 375–767 | Tablet 768–1279 | Desktop 1280+ |
|---|---|---|---|
| Log modal shell | Full-screen; slide-up 180ms | Centered 720px × 80vh; fade+scale 180ms | Same as tablet |
| Tab switcher | Full-width, 3 tabs evenly | Same | Same |
| TYPE textarea | 12 lines default, autosize to 20 | Same | Same |
| SNAP preview | Full-width × 4:3 | Centered 480 × 360 | Centered 480 × 360 |
| LIBRARY grid | 1-col | 2-col (16px gutter) | 3-col (16px gutter) |
| Portion Picker | Bottom sheet (50vh) | Floating panel 360 × 280 anchored to card | Same as tablet |
| Confirmation | Full-screen stacked scroll | 720px centered, internal scroll | Same |
| Undo Toast anchor | Above FAB + tab bar | 24px above viewport bottom, centered | 24px above viewport bottom, centered in content column |
| SAVE TO LEDGER button | Full-width minus 12px | Centered 360px | Centered 360px |

Motion, focus rings, and tap targets meet the all-breakpoint a11y rules from Agent 2 (2px ivory outline at 2px offset; 44 × 44 min; `prefers-reduced-motion` crossfade-only).

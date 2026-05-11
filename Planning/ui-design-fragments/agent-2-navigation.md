## Navigation Topology

Kalori ships five primary destinations plus one modal launcher. The topology is identical across breakpoints; only the presentation pattern changes.

### Primary destinations (5)

| # | Destination | Route | Nav role |
|---|---|---|---|
| 1 | **Dashboard** | `/` (authed) | Standard destination |
| 2 | **Log** | `/log` (modal route) | **Modal launcher** — not a real page route on mobile; launches the Log flow modal. On desktop/tablet it is a sidebar/rail item that still opens the modal over the current surface rather than navigating. |
| 3 | **Library** | `/library` | Standard destination |
| 4 | **Progress** | `/progress` | Standard destination |
| 5 | **Settings** | `/settings` | Standard destination |

> **Log is a modal, not a destination.** Tapping "Log" in the sidebar/rail, pressing `n`, or tapping the mobile FAB all open the same `<LogFlow />` modal (see Agent 4's fragment). The modal stacks on top of the current URL; close returns to the prior route with no navigation entry pushed.

### Secondary destinations (not in primary nav)

Drilled from primary surfaces; never surface in the sidebar/rail/tab-bar:

| Secondary destination | Drilled from | Entry |
|---|---|---|
| Food Detail (`/library/[id]`) | Library | Tap library grid cell |
| Account (`/settings/account`) | Settings | Row in Settings list |
| Weekly Review (`/review`) | Dashboard | "Read the week" link in Weekly Insight card |
| Export (`/settings/export`) | Settings | Row in Settings list |
| Weight log entry (`/weight`) | Dashboard nudge OR Settings row | Either |

Breadcrumb on secondary surfaces is a back chevron in the route's own header (not in the nav chrome). Active parent tab stays highlighted: `/library/[id]` keeps LIBRARY active, `/settings/account` keeps SETTINGS active.

---

## Desktop Sidebar (1280+ px)

Persistent left sidebar. The masthead lives **inside the sidebar**, not in the main content column, so the content area gets a full-width canvas for the chronometer and ruled grids.

### Dimensions & surface

- **Width:** 240px, fixed; full viewport height (`100vh`, with safe-area padding)
- **Background:** `bg-1` (`#15100D`)
- **Right edge:** 1px hairline-strong (`#3A3029`) — the content column's left hairline doubles as the sidebar's right rule
- **Position:** `position: sticky; top: 0` inside a CSS grid `[nav] 240px [main] 1fr` layout

### Masthead (top of sidebar)

- **Height:** 104px, padded `22px 16px 18px`
- **Wordmark row:** "Kalori" in Newsreader 300, **28px**, `ivory`, letter-spacing `-0.035em`. Oxblood bullet (7px square, zero-radius, `bg-oxblood`) sits 8px right of the final letter's baseline — NOT a circle here, per the zero-radius rule for sidebar mode
- **Edition line (directly below wordmark):** `Vol. 1, Edition XXX` in Inter 500 / **10.5px** / UPPERCASE / tracking **0.22em** / `sand` (`#C9BDA8`). "Vol." + arabic volume number are `dust`; edition number itself uses tabular-nums
- **Bottom rule of masthead:** 1px hairline (`#2A2320`), full 240px width

### Nav list

Five items, vertical stack, beginning 16px below the masthead rule.

- **Item height:** 56px (exceeds 44×44 tap target by 12px)
- **Padding:** `0 16px` left/right; 16px vertical centered content
- **Icon:** 24×24px Phosphor icon, 1.5px stroke, sits flush at 16px from left edge
- **Label:** Inter 500, **13px**, normal case, `sand` default, 12px gap from icon
- **Gap between items:** 0 (rows butt directly; hairline-separated only on the bottom of the list, not between items)

#### States

| State | Text | Icon | Row bg | Left bar |
|---|---|---|---|---|
| Default | `sand` (`#C9BDA8`) | `sand` | transparent | none |
| Hover | `ivory` (`#F4EBDC`) | `ivory` | transparent (no bg change until active) | none |
| Focus (keyboard) | inherits hover ivory | ivory | transparent | 2px `oxblood` outline at 2px offset around full row |
| Active | `ivory` | `ivory` | `bg-2` (`#1E1815`) | 2px `oxblood` (`#8A2A1F`) flush left, full 56px tall |
| Disabled | N/A for primary nav | — | — | — |

**Active + focus combined:** focus outline overrides — 2px oxblood ring 2px outside the row, active fill + left bar persist underneath.

#### Icon map (Phosphor regular weight)

- Dashboard → `ChartBar`
- Log → `Plus` (desktop sidebar only; mobile uses a custom SVG glyph for the FAB)
- Library → `BookOpen`
- Progress → `ChartLine`
- Settings → `Gear`

### User strip (bottom of sidebar)

Anchored to sidebar bottom via flex layout; 1px hairline (`#2A2320`) above.

- **Height:** 72px
- **Layout:** 12px padding; horizontal flex, 12px gap
- **Avatar:** 32×32px square (zero radius — sidebar mode), `bg-oxblood` fill, single uppercase initial letter of user's first name in Newsreader 300, 16px, `ivory`, centered
- **Name stack:** Inter 500, **12px**, `ivory`; email/handle (if present) on line below in Inter 400, **10.5px**, `dust`
- **Sign-out affordance:** On row hover, a right-aligned "SIGN OUT" link appears in Inter 500, **10.5px**, UPPERCASE, tracking 0.22em, `dust` default → `ivory` hover. Never permanently visible — it's a hover affordance to preserve the calm

### Keyboard behavior

- **Focus entry:** Tab from page skip-link enters sidebar at first nav item
- **Arrow Up/Down:** cycle through nav items (wraps); does not activate
- **Enter / Space:** activates focused item (navigates or opens log modal)
- **Tab (from any nav item):** moves focus out of sidebar to the main `<main>` landmark
- **Escape:** no action inside sidebar (reserved for modals)

### Motion

- Hover text color fade: **120ms** `ease-out-expressive` (token from Agent 1)
- Active indicator (on route change): left bar slides from prior-active row to new-active row in **180ms**. Row background fill crossfades **120ms**
- Reduced motion: all transitions → 1ms; opacity-only crossfade for indicator swap; no slide

---

## Tablet Rail (768–1279 px)

Collapsed rail by default; expands on hover/focus.

### Collapsed state (default)

- **Width:** 56px
- **Background:** `bg-1` (`#15100D`)
- **Right edge:** 1px hairline-strong (`#3A3029`)
- **Height:** full viewport (`100vh`, sticky top:0)
- **Masthead (icon mode):** 56×56px cell at top. Contains **Kalori monogram** — Newsreader 300, uppercase **K**, 32px, `ivory`, centered. A 1px hairline (`#2A2320`) double-underline sits 4px below the K, spanning 20px width, representing the edition-line in compressed form
- **Nav items:** 56×56px each (meets 44×44 minimum with 6px padding to spare). Phosphor icon 24×24, centered; no label visible in collapsed mode
- **Active indicator (collapsed):** 2px `oxblood` bar flush left, 56px tall (identical to desktop active bar, no row bg change because a single-color 56px width would feel heavy at rail width)
- **User strip:** 56×56px cell at bottom with avatar only (no name/email visible); hover shows tooltip with name

### Expanded state (hover / focus-within)

- **Trigger:** `:hover` on the rail container OR `:focus-within` (any rail item has keyboard focus)
- **Width:** 240px (identical to desktop)
- **Content:** labels fade in beside each icon; masthead swaps K monogram for full Newsreader 28px "Kalori" wordmark + edition line (identical to desktop masthead)
- **Exit delay:** 200ms debounce on pointer-leave before collapse animation starts; prevents jitter when user's cursor transits edge

### Motion

- Width transition (56px ↔ 240px): **180ms** `ease-out-expressive`
- Label opacity: fade 120ms, triggered at 40% of width transition (labels arrive as the rail widens; not before)
- Monogram ↔ wordmark: crossfade 120ms, staggered 60ms after width begins
- Reduced motion: no width animation; labels instant-show on hover/focus; no opacity transition beyond 1ms

### Keyboard behavior

- Rail is `:focus-within`-expanded — keyboard focus entering any item auto-expands rail
- Arrow Up/Down: cycles items (wraps); rail stays expanded while any item is focused
- Tab out of last item exits rail to main content (rail collapses after 200ms debounce if pointer is not over it)
- `aria-expanded="true|false"` on the rail's `<nav>` container reflects current width state; screen readers hear the expand/collapse

---

## Mobile Bottom Tab Bar + Center FAB (375–767 px)

### Bottom tab bar

- **Height:** 56px + `env(safe-area-inset-bottom)` padding on bottom (iOS home indicator)
- **Background:** `bg-1` (`#15100D`)
- **Top edge:** 1px hairline-strong (`#3A3029`)
- **Position:** `fixed; bottom: 0; left: 0; right: 0; z-index: 40`
- **Destinations (4):** Dashboard, Library, Progress, Settings — **Log is NOT a tab**; the center slot is reserved for the FAB

### Tab layout

Four equal tab slots flanking a 72px center gap for the FAB.

- **Slot width:** `calc((100vw - 72px) / 4)` (on a 375px viewport → ~75.75px per slot, well above 44px minimum)
- **Slot height:** 56px (icon 24px + label 10.5px Inter UPPERCASE + 6px vertical gap)
- **Tap target:** each slot is the full 56×75px hit area; minimum 44×44 comfortably satisfied
- **Icon:** 24×24px Phosphor regular, top-centered with 8px top padding
- **Label:** Inter 500, **10.5px**, UPPERCASE, tracking 0.18em, centered below icon, 4px gap
- **Spatial layout:** `[Dashboard] [Library] [72px gap for FAB] [Progress] [Settings]`

#### States

| State | Icon | Label | Top bar |
|---|---|---|---|
| Default | `dust` (`#8A8173`) | `dust` | none |
| Active | `ivory` (`#F4EBDC`) | `ivory` | 2px `oxblood` (`#8A2A1F`) flush at slot's top edge, full slot width |
| Pressed | `ivory` | `ivory` | (same as active if current, else none) |
| Focus (keyboard) | `ivory` | `ivory` | 2px `oxblood` outline 2px offset around slot |

**Tab switch behavior:** Instant active swap — the 2px oxblood bar does NOT animate between tabs. Only the label + icon color does a 120ms "ink-fade" crossfade from dust → ivory.

### Center FAB

The Ledger's zero-radius rule wins here over the standard circular FAB — a **56×56px square** with 1px `hairline-strong` border for legibility against `bg-1`.

- **Dimensions:** 56×56px (meets 44×44 tap minimum with 12px padding to spare)
- **Shape:** zero radius (square); NOT circular
- **Background:** `bg-oxblood` (`#8A2A1F`)
- **Border:** 1px `hairline-strong` (`#3A3029`), inside — ensures legibility of the square against the dark rail
- **Glyph:** ivory "+" rendered as **custom SVG** (not emoji, not font glyph) — two 2px rectangles crossed at center; 20px total glyph size; stroke cap square; `color: #F4EBDC`
- **Elevation:** positioned 8px above the tab bar's top edge via `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)`; horizontally `left: calc(50% - 28px)` (centered)
- **z-index:** 41 (above tab bar z:40)
- **Label:** none (FAB has no visible text; aria-label provides accessible name)
- **Action:** opens `<LogFlow />` modal (full-sheet from bottom on mobile)

#### FAB accessibility

- `<button aria-label="New log entry">`
- `aria-haspopup="dialog"` — screen reader announces it opens a modal
- Keyboard focusable in tab order; focus ring: 2px `oxblood` outline 2px offset around the square (doubled-up effect against the oxblood fill — contrast is maintained by the 2px offset gap)

#### FAB motion

- **Press:** `scale(0.96)` over **120ms** `ease-out-expressive`, then `scale(1)` over **180ms** on release
- **Ember pulse ripple (release):** a **square** (zero radius) ring emits from the FAB boundary, expanding to `110%` size over 180ms, `oxblood` at alpha 0.15, fading to alpha 0 simultaneously. Clipped to `overflow: visible` on FAB parent
- **No rotation, no bounce** — the glyph never pivots; calm
- Reduced motion: press scale + ember pulse both disabled; opacity-only 60ms flash (alpha 0.8 → 1) on release for tactile feedback

### Safe-area handling

- Tab bar: `padding-bottom: env(safe-area-inset-bottom)` — prevents overlap with iOS home indicator
- FAB: `bottom: calc(56px + env(safe-area-inset-bottom) + 8px)` — lifts above tab bar AND home indicator
- On non-iOS / non-notched devices, `env(safe-area-inset-bottom)` evaluates to `0px` — layout is identical

---

## Header / Top Bar

### Mobile (375–767 px) — minimal top strip

Since the bottom tab bar owns navigation and the route's own page header owns the masthead, the top bar serves ONE purpose: edition-context (date + edition number).

- **Height:** 40px (not 56px — does not need to meet tap target; purely informational)
- **Background:** `bg-0` (`#0E0A08`) — transparent onto page void
- **Content (single row, space-between):**
  - **Left:** `TUESDAY · APR 18` in Inter 500 / **10.5px** / UPPERCASE / tracking **0.22em** / `sand`. Date format: `{WEEKDAY} · {MON} {D}` with mid-dot separator (U+00B7, 8px spacing each side)
  - **Right:** `EDITION 142` in Inter 500 / 10.5px / UPPERCASE / tracking 0.22em / `dust`
- **Bottom edge:** no rule — the route page owns its own section masthead below
- **Position:** `position: sticky; top: 0; z-index: 30`; scrolls with content on elastic overscroll

No hamburger, no drawer, no avatar on mobile top bar — Settings lives in the bottom tab; the user strip is inside Settings.

### Tablet + Desktop — no top bar

The sidebar/rail owns the masthead and user strip. The main content column gets its full vertical real estate from the page's own section headers (§ 01 · DASHBOARD, etc.). There is no horizontal top bar chrome.

---

## Keyboard Shortcuts

Global keyboard shortcuts registered at the root layout level. All shortcuts are ignored while focus is inside a text input, textarea, or contenteditable element (detected via `event.target.matches('input, textarea, [contenteditable]')`).

| Keys | Action | Available on | Notes |
|---|---|---|---|
| `/` | Focus search | Dashboard, Library, Progress | Jumps keyboard focus to the primary search input on the current route; on Dashboard there is no search → becomes a no-op with subtle dust-color toast "No search on this page" |
| `n` | Open new-log modal | Desktop, Tablet | Equivalent to sidebar "Log" click or mobile FAB tap. Mobile has no `n` because physical FAB is faster |
| `Escape` | Close modal, defocus search | All | Stacks: closes topmost modal first; if no modal, defocuses search input; if neither, no-op |
| `g` then `d` | Go to Dashboard | Desktop, Tablet | Two-key sequence. Second key must follow within 1200ms or sequence resets |
| `g` then `l` | Go to Library | Desktop, Tablet | |
| `g` then `p` | Go to Progress | Desktop, Tablet | |
| `g` then `s` | Go to Settings | Desktop, Tablet | |
| `?` | Open shortcuts help modal | Desktop, Tablet | `<ShortcutsOverlay />` — lists every shortcut in this table |

### Shortcuts help modal (`?`)

- **Surface:** centered modal, 560px wide, `bg-1` fill, 1px `hairline-strong` border, zero radius
- **Content:** two-column table (keys / action), Inter 500 11px keys in monospace-boxed style (`bg-2` fill, 1px hairline, 4px inner padding), Inter 400 13px action labels in `ivory`
- **Dismiss:** Escape key, click-outside, or X icon (top-right, `Gear`-style 20px Phosphor X)

### Shortcut implementation contract (hands off to Agent 4 + architecture)

- Registered in a single `useGlobalShortcuts()` hook mounted at root layout
- Hook reads from Zustand store `useShortcutsStore` which tracks current sequence state (for `g d`-style sequences)
- Hook respects `role="dialog"` focus trap — sequences disabled while modal with `aria-modal="true"` is open, except Escape

---

## Responsive Behavior Summary Table

| Breakpoint | Nav Pattern | Masthead Location | Log Launcher | Top Bar |
|---|---|---|---|---|
| **Desktop 1280+** | Persistent sidebar, 240px wide, `bg-1`, left-anchored | Inside sidebar (28px wordmark + Edition XXX line) | Sidebar item ("Log" with `Plus` icon); `n` keyboard shortcut | None (sidebar owns chrome) |
| **Tablet 768–1279** | Collapsed rail 56px / expanded 240px on hover/focus | Inside rail (K monogram collapsed; 28px wordmark expanded) | Rail item (Plus icon collapsed; Plus icon + "Log" label expanded); `n` keyboard shortcut | None (rail owns chrome) |
| **Mobile 375–767** | Bottom tab bar 56px fixed + center FAB | Top bar shows date + edition number only; route page owns its own section masthead | Center FAB (56×56 square, oxblood, "+") | 40px thin strip: `WEEKDAY · MON D` left + `EDITION N` right |

### Breakpoint transitions

- **1279 → 1280px:** Tablet rail → desktop sidebar. Instant pattern swap on viewport-resize event; no animation (prevents flash during window-drag). Masthead content identical in expanded state, so perceptual change is minimal
- **767 → 768px:** Mobile bottom-tab → tablet rail. Complete chrome change. Swap is instant; top strip disappears, bottom tab + FAB disappear, rail appears
- **Viewport-width JS reads via `useMediaQuery` (TanStack or Zustand store)** — SSR renders a breakpoint-neutral placeholder, hydrates into correct pattern. No layout shift for already-known breakpoint from cookie hint

---

## Navigation State Management

### Active-route derivation

Active nav state is **purely derived from the URL** — no Zustand store for "which tab is active." Using Next.js 16 App Router:

```ts
const pathname = usePathname(); // '/library/xyz'
const activeTab = getActiveTab(pathname); // 'library'
```

`getActiveTab` maps:
- `/` or `/dashboard/*` → `dashboard`
- `/log` or modal-open → `log` (sidebar/rail only; tab bar has no log slot)
- `/library` or `/library/*` → `library`
- `/progress` or `/progress/*` → `progress`
- `/settings` or `/settings/*` → `settings`

Secondary routes (`/review`, `/weight`) highlight NO primary nav item — the back chevron in the route's own header is the only wayfinding.

### Persistent UI preferences

| Preference | Scope | Persistence | Store |
|---|---|---|---|
| Rail expanded/pinned (tablet only) | Per-device | `localStorage` key `kalori:nav:rail-pinned` (boolean) | Zustand `useNavPreferencesStore` with `persist` middleware |
| Sidebar collapsed override (desktop) | Post-MVP | — | Not in MVP — desktop sidebar is always 240px |

Rail-pinned, when true, overrides hover-collapse: rail stays at 240px regardless of pointer position. Toggled via hamburger icon in expanded masthead (tablet only).

### Cross-tab sync

- **Nav state:** not synced. Each tab's sidebar/rail/bottom-tab reflects that tab's URL independently. No conflict possible because nav state is URL-derived
- **Rail-pinned preference:** not synced across tabs — changing pinned state in Tab A does not propagate to Tab B (it writes to localStorage but Tab B already has its own Zustand state in memory)
- **Auth state:** cross-tab sign-out IS synced via `BroadcastChannel('kalori-auth')` per F12 — handled outside nav system (auth middleware)

---

## Motion Specifications

All motion consumes tokens from Agent 1's motion system. Summary of nav-specific motion:

| Element | Property | Timing | Easing | Reduced-motion fallback |
|---|---|---|---|---|
| Sidebar active-indicator (route change) | `translateY` of left bar between rows | 180ms | `ease-out-expressive` | Opacity crossfade 1ms |
| Sidebar row bg fill (hover → active) | `background-color` | 120ms | `ease-out-expressive` | 1ms instant swap |
| Sidebar row text color (default ↔ hover) | `color` | 120ms | `ease-out-expressive` | 1ms instant swap |
| Tablet rail width expand | `width` 56px → 240px | 180ms | `ease-out-expressive` | No animation (rail width set instantly based on `:focus-within` / `:hover`) |
| Rail labels fade-in | `opacity` 0 → 1 | 120ms starting at 40% of width transition | linear | Instant display on `:hover` / `:focus-within` |
| Rail monogram ↔ wordmark | crossfade | 120ms staggered 60ms after width begins | `ease-out-expressive` | Instant swap |
| Mobile tab active bar | (no animation — instant swap) | — | — | — |
| Mobile tab icon + label color | `color` crossfade dust → ivory | 120ms | `ease-out-expressive` | 1ms instant |
| FAB press-down | `scale(0.96)` | 120ms | `ease-out-expressive` | None |
| FAB press-release | `scale(1)` | 180ms | `ease-out-expressive` | None |
| FAB ember ripple | expanding square ring, alpha 0.15 → 0, scale 1 → 1.1 | 180ms | `ease-out-expressive` | Disabled; 60ms opacity flash 0.8 → 1 on release |
| Shortcuts help modal open | opacity 0 → 1 + scale 0.98 → 1 | 180ms | `ease-out-expressive` | Opacity only, 120ms |

### Global motion rule

- All nav animations inherit the design system's `prefers-reduced-motion: reduce` override: durations truncated to 1ms, opacity-only fallbacks, no translate/scale
- Tab active-bar is the one permanent exception — it was already instant, so reduced motion is identity

---

## Accessibility Specifications

### ARIA landmarks

- Sidebar container: `<nav aria-label="Primary">` (desktop + tablet; only one mounted at a time per breakpoint)
- Mobile bottom tab bar: `<nav aria-label="Primary">` (only one mounted at a time — switches at breakpoint)
- Top mobile strip: `<header>` element, no nav role (informational only)
- Main content: `<main id="main-content" tabindex="-1">` — skip-link target

### Skip link

- Hidden at the top of page DOM (`position: absolute; top: -40px`)
- Becomes visible on keyboard focus: `top: 0; left: 0` with `bg-1` fill, `ivory` text, 2px `oxblood` outline
- Activation moves focus to `<main id="main-content">` — bypasses sidebar/rail/tab-bar

### Active-route announcement

- All nav items (sidebar, rail, bottom tab) carry `aria-current="page"` when active
- Screen readers announce: `"Dashboard, current page, link"` vs `"Library, link"`
- Page title updates via Next.js `<title>` so browser tab reflects active route — screen readers also announce on route change via `<title>` polling

### FAB

- `<button aria-label="New log entry" aria-haspopup="dialog">`
- On open, focus moves to first input inside Log modal
- On close, focus returns to the FAB (not lost)

### Tablet rail expand state

- `aria-expanded="true"` or `aria-expanded="false"` on the `<nav>` container, toggled on hover/focus-within
- Screen readers can hear the expansion

### Color-only state avoidance

- Active tab is signaled by BOTH oxblood bar AND ivory text color AND `aria-current="page"` — three independent signals
- Disabled items would signal via greyed color AND `aria-disabled="true"` (MVP has no disabled nav items)

### Focus ring (global)

- **Spec:** 2px `oxblood` (`#8A2A1F`) outline, 2px offset (consumed from Agent 1's focus-ring token `--focus-ring`)
- Applied via `:focus-visible` only (pointer focus does not display the ring)
- Never suppressed; never replaced with box-shadow

### Minimum contrast compliance

- `sand` (`#C9BDA8`) on `bg-1` (`#15100D`) — nav label default state — contrast ratio ~10.2:1 (AAA)
- `ivory` on `bg-1` — active state — ~13.1:1 (AAA)
- `dust` on `bg-1` — secondary labels on tab bar — ~5.8:1 (AA normal; above the 4.5:1 floor)

### Cross-component a11y rules (for main agent consolidation)

These rules apply beyond navigation and should be consolidated in the global accessibility section of `ui-design.md`:

- **Skip-link** is global — lives above all chrome; not specific to nav
- **Focus ring token** `--focus-ring: 2px solid #8A2A1F; outline-offset: 2px` — used by every interactive element, not just nav
- **`prefers-reduced-motion` global rule** — every motion spec in nav defers to this; a global CSS-level `@media (prefers-reduced-motion: reduce)` block can handle many fallbacks en masse
- **Tap target minimum 44×44 px** applies to every pressable element app-wide
- **`aria-current="page"`** convention for any link that represents the current route, not just nav

---

## Visual Spec Cross-Reference

### Icon library: Phosphor Icons (regular weight)

- Package: `@phosphor-icons/react` (v2.x, React 19 compatible)
- **Import pattern:** selective import per route to preserve tree-shaking — `import { ChartBar } from '@phosphor-icons/react/dist/ssr/ChartBar'` (SSR-safe path)
- Icon size: 24×24px nav default; 20×20px in modal headers; 16×16px in inline affordances
- Stroke weight: regular (1.5px effective at 24px size)
- Color: inherits `currentColor` from parent element's text color

### Exact icon choices (locked)

| Destination | Icon (Phosphor regular) | SSR import path |
|---|---|---|
| Dashboard | `ChartBar` | `@phosphor-icons/react/dist/ssr/ChartBar` |
| Log (desktop/tablet sidebar item) | `Plus` | `@phosphor-icons/react/dist/ssr/Plus` |
| Library | `BookOpen` | `@phosphor-icons/react/dist/ssr/BookOpen` |
| Progress | `ChartLine` | `@phosphor-icons/react/dist/ssr/ChartLine` |
| Settings | `Gear` | `@phosphor-icons/react/dist/ssr/Gear` |
| Mobile FAB | **custom SVG glyph** (NOT Phosphor) | inline in `<LogFAB />` component |

### Why a custom SVG for the FAB and not Phosphor Plus?

The Phosphor `Plus` icon is optimized for inline use at 24px with a balanced 1.5px stroke. At the FAB's effective display (20px glyph inside a 56px square on `oxblood` fill), the Phosphor stroke reads thin against the high-saturation background. The custom SVG uses 2px stroke rectangles for higher weight and perfect pixel alignment on the square FAB — a one-off worth deviating from the library for.

### Wordmark / masthead typography (consumed from Agent 1)

- Desktop + tablet expanded masthead wordmark: `Newsreader 300 28px`, `letter-spacing: -0.035em`, `color: ivory`
- Tablet collapsed monogram: `Newsreader 300 32px`, single uppercase "K", `color: ivory`
- Edition line: `Inter 500 10.5px UPPERCASE tracking 0.22em`, `color: sand`
- Mobile top-strip date/edition: `Inter 500 10.5px UPPERCASE tracking 0.22em`, date in `sand`, edition number in `dust`

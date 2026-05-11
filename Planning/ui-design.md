# UI Design — The Ledger (Kalori)

> **Two-pass production note.** This artifact is the synthesis of a two-pass review: 6 parallel component-area opus sub-agents (foundations, navigation, dashboard, log-flow, library, progress+remainder) produced the Pass 1 specs; 5 parallel skill-persona opus reviewers (design-lead / ui-ux-pro-max / vercel-composition-patterns / vercel-react-best-practices / web-design-guidelines) produced Pass 2 enrichment deltas. Main-agent reconciliation of ~22 conflicts appears in §13. `Planning/design-doc.md` §8–10, §14–15, §18–19 is the authoritative tiebreaker source.

---

## 1. Overview

### 1.1 Aesthetic thesis

Kalori's visual system is **"The Ledger"** — a **dark-only editorial archival broadsheet**. Warm candlelit serif (Newsreader), quiet sans labels (Inter), printer-mono timestamps (JetBrains Mono), oxblood-on-near-black palette. Depth is carried by hairline rules, tonal card stacks (`bg-0 → bg-1 → bg-2`), and whitespace — **never** by shadows or glassmorphism. The app reads like a private evening broadsheet kept on a nightstand; the model speaks as an attentive literary editor, not a fitness coach.

**Mood tags:** archival newspaper · bibliophile library · turn-of-century printer's ledger · candlelit bedside notebook · set-in-type daily.

### 1.2 Load-bearing constraints

These constraints are enforced via ESLint rules and propagate through every component spec below:

1. **Dark-only.** No light-mode toggle, no `@media (prefers-color-scheme: light)` branches. No `ThemeProvider`.
2. **No shadows.** `box-shadow: none` is the system default.
3. **No glassmorphism / blur.** No `backdrop-filter`, no translucent surfaces.
4. **Zero radii.** `border-radius: 0` everywhere; documented circle exceptions only (chronometer ring, data dots, water bullet, avatar glyph, status dots, spinner — see §2.4).
5. **Hairlines only.** 1px `rule` for dividers, 1px `rule-strong` for card frames, dotted 1px for sub-rows.
6. **Grid is visible.** Column and row rules are drawn, not implied. 3-col dashboard, 5-col meals bulletin, 4-col library, 30-col heatmap.

### 1.3 Complexity tier

Kalori is a **Complex UI** per the `brainstorm-tomi` artifact tier matrix (data-heavy + RLS + AI integration + responsive). This artifact was produced via the two-pass multi-sub-agent pattern documented in §13.

### 1.4 Signature moments

Only five places earn visual singularity. Elsewhere, restraint:

- **Chronometer Ring** on the dashboard (oxblood consumed arc + dashed ember projection + Roman hour numerals + now-indicator triangle + 82px Newsreader center value).
- **Drop Cap** — Newsreader 82px oxblood-adjacent, used **exactly once** in the Weekly Review pull-quote.
- **Micronutrient Heatmap** — 7 nutrients × N days, warm-to-supportive gradient, italic serif row names, month-band headers.
- **Ruled Library Grid** — `gap: 0` with drawn column/row hairlines (printer's column ruling).
- **FAB** on mobile — zero-radius oxblood square with custom-SVG `+` glyph, the only hand-drawn affordance break.

---

## 2. Design Tokens

Every component spec references tokens by name. Hardcoded hex outside `lib/tokens.ts` and `app/globals.css` is an ESLint error.

### 2.1 Color palette (14 tokens)

Per tiebreaker #5: the palette expands to 14 tokens (Agent 1 mockup-extraction adds `bg-quote` and `dust-2` beyond the 13 listed in `03-pre-artifacts.md`).

| Token | Hex | Semantic role |
|---|---|---|
| `bg-0` | `#0E0A08` | Page void — deep warm black with slight red cast |
| `bg-1` | `#15100D` | Card field, editor pane, sidebar |
| `bg-2` | `#1E1815` | Inset, "Why these numbers?" panel, meter track |
| `bg-quote` | `#1A1310` | Pull-quote and footnote-commentary surface |
| `rule` | `#2A2320` | Standard hairline 1px dividers |
| `rule-strong` | `#3A3029` | Card frames, masthead rules, section boundaries |
| `ivory` | `#F4EBDC` | Primary text — warm cream |
| `sand` | `#C9BDA8` | Secondary text, italic pull-quote body |
| `dust` | `#8A8173` | Metadata, labels, UPPERCASE tracked captions |
| `dust-2` | `#6B6156` | De-emphasized decoration (never body text on bg-1/bg-2) |
| `oxblood` | `#8A2A1F` | Signature accent — fills, borders, arcs, drop cap |
| `oxblood-soft` | `#A13A2C` | Hover of oxblood CTAs, kicker text on dark surfaces |
| `ember` | `#C8693B` | Projections, "approaching target" (80–100%), fat macro |
| `ochre` | `#B8894A` | Carb macro, inner fiber arc, heatmap mid-range |
| `moss` | `#5C6B3D` | On-target data, micronutrient ≥ target, adherence-good |
| `slate` | `#4A5764` | Neutral data series, **water fill** (dashboard + progress) |
| `plum` | `#5D3A44` | Decorative 5th series — weight-trajectory beyond-goal segment |

### 2.2 Contrast matrix (RECOMPUTED — ux-auditor authoritative per tiebreaker #2)

The ux-auditor recomputed every pair from scratch. Agent 1's published ratios were off by 0.3–0.9 in several places. These are the authoritative numbers:

| Foreground | on `bg-0` | on `bg-1` | on `bg-2` | on `bg-quote` | Normal-text AA (4.5:1) |
|---|---|---|---|---|---|
| `ivory` | **16.67** | 15.98 | 14.84 | 15.52 | AAA everywhere |
| `sand` | 10.63 | 10.19 | 9.47 | 9.90 | AAA everywhere |
| `dust` | **5.13** | **4.92** | 4.57 (borderline) | 4.78 | AA pass on bg-0/bg-1/bg-quote; escalate to `sand` on bg-2 |
| `dust-2` | 3.26 | 3.12 | 2.90 (fail) | 3.03 | Large/UI only; **banned on bg-2** as text |
| `oxblood` | **2.28** | 2.19 | 2.03 | 2.12 | **Non-text only** (fills, borders, arcs) |
| `oxblood-soft` | **2.96** | 2.84 | 2.64 | 2.76 | **Non-text only** — fails 3:1 UI floor on bg-0 |
| `ember` | 5.20 | 4.98 | 4.63 | 4.84 | AA small text ≥4.5 |
| `ochre` | 6.30 | 6.04 | 5.61 | 5.87 | AA small text ≥4.5 |
| `moss` | 3.40 | 3.26 | 3.03 | 3.17 | Large-text only; data-viz fill with adjacent ivory label |
| `slate` | 2.66 | 2.55 | 2.37 | 2.48 | Non-text only; data-viz with outline |
| `plum` | 2.02 | 1.94 | 1.80 | 1.88 | Non-text only |
| `rule` | 1.28 | — | — | — | Decorative only (never load-bearing semantic divider without heading) |
| `rule-strong` | 1.53 | — | — | — | Decorative frame only |

**Critical corrections** applied throughout this artifact:
- **oxblood as text = 2.28:1** (not 2.86:1 Agent 1 reported); fails AA even for large text → all oxblood text shifts to **ivory** with oxblood border/underline accent, or to **ember** (5.20:1).
- **oxblood-soft on bg-0 = 2.96:1** (not 3.70:1); large-text only with 0.22em tracking aid; otherwise escalate.
- **dust on bg-1 = 4.92:1 passes AA small-text** (Agent 1 marked it fail); lint rule slightly relaxed but kept for aesthetic consistency.
- **Focus ring must be ivory** (16.67:1 vs bg-0), NOT oxblood (2.28:1, fails WCAG 1.4.11 UI contrast 3:1) — per tiebreaker #1.

### 2.3 Typography system

Three characterful families, role-locked. The **Newsreader + Inter + JetBrains Mono** triad is non-negotiable; developers may not fall back to Inter for serif body surfaces when Newsreader is loading (see §9.3 risk rule).

| # | Role | Family | Weight | Size | Letter-spacing | Line-height |
|---|---|---|---|---|---|---|
| T1 | Wordmark (masthead) | Newsreader | 300 | 104px desktop / 72px tablet / 48px mobile | −0.035em | 0.88 |
| T2 | Section title (`§ 01 · …`) | Newsreader | 300 | 44px desktop / 32px tablet / 28px mobile | −0.02em | 1.0 |
| T3 | Hero / heatmap section title | Newsreader | 300 | 32px | −0.01em | 1.1 |
| T4 | Calorie hero value (chronometer, onboarding target) | Newsreader | 300 | 82px desktop / 64px tablet / 48px mobile | −0.02em | 0.95 |
| T5 | Body serif (entries, pull-quote body) | Newsreader | 400 / italic 400 | 16–22px | 0 | 1.55 |
| T5-small | Mobile body serif (meals-bulletin entry mobile, library card mobile) | Newsreader | 400 italic | 15px | 0 | 1.5 |
| T6 | Drop cap — **used once** (Weekly Review) | Newsreader | 400 | 82px 3-line float | 0 | 0.85 |
| T7 | Body sans (non-editorial fallback) | Inter | 400 | 14px | 0 | 1.55 |
| T8 | Buttons | Inter | 500 | 13px | 0.08em | 1.0 |
| T9 | Labels, kickers, form labels | Inter | 500 | 10.5px | 0.18–0.22em | 1.2 |
| T10 | Nav items | Inter | 500 | 11px | 0.18em | 1.2 |
| T11 | Masthead meta (top eyebrow) | Inter | 500 | 10.5px | 0.14em | 1.3 |
| T12 | Mono timestamps, footnotes | JetBrains Mono | 400 | 10.5–11px | 0.02em | 1.4 |
| T13 | Mono section-numbers (`§ 03`) | JetBrains Mono | 400 | 10.5px | 0.04em | 1.2 |
| T14 | Caption / literary footnote | Inter | 400 | 11px | 0 | 1.45 |

**Tabular numerics utility** — mandatory for every numeric display:

```css
.num {
  font-variant-numeric: lining-nums tabular-nums;
  font-feature-settings: 'lnum' 1, 'tnum' 1;
}
```

**`next/font` loader** (required, no `<link>` in `<head>`) — declared in `app/layout.tsx` with `Newsreader`, `Inter`, `JetBrains_Mono`, `display: "swap"`, and the `opsz` axis enabled on Newsreader.

**Tracking tier resolution** (per ux-specialist §1.3 audit): use only `0.18em` (nav), `0.22em` (kickers + caps labels), and `0.14em` (masthead meta). Orphan 0.20em values from onboarding normalize to 0.18em.

### 2.4 Shape + hairline system

**Radii:** `0` everywhere. Documented exceptions (exhaustive — any other radius fails code review):

| # | Component | Shape |
|---|---|---|
| 1 | Chronometer ring + tick/numerals | SVG circle |
| 2 | Data points on charts (Recharts dots) | 4px circle |
| 3 | Water bullet (+glass/+bottle indicator) | 9px circle — `slate` fill per tiebreaker #7 |
| 4 | Status dots (wordmark bullet, kicker accent) | 6–9px oxblood circle (only on sidebar wordmark + kicker accents) |
| 5 | Avatar glyph (profile menu) | 32px circle, 2-letter monogram |
| 6 | Loading spinner | SVG circle with stroke-dashoffset rotation |

**FAB exception (tiebreaker #3):** the mobile FAB is a **56×56 zero-radius square**, oxblood fill, ivory custom-SVG `+` glyph (NOT Phosphor Plus — 2px stroke rectangles crossed at center, 20px glyph). This overrides design-doc §9's "circular FAB" language because the Ledger brief's zero-radius rule is canonical visual source, and the mockup renders it square. Both Agent 1 + Agent 2 independently arrived at this.

**FAB amendment (tiebreaker #24, 2026-05-08, bugfix-tomi mobile-ui-overhaul Bug #5):** the single FAB is replaced by a **side-by-side PAIR**: food primary (oxblood ground, ivory `+` crosshair, opens log-flow modal) + water secondary (`bg-1` ground, 1px `ivory` border, ivory water-drop polygon glyph, navigates to `/dashboard` so the user lands on the existing `<WaterTracker />` chip — Path A per user Phase 2 decision). Both 56×56 zero-radius squares, 8px gutter between, total slot width 120px. Speed-dial / expanding FAB still forbidden — the override is exactly two equally-primary action buttons, not a Material 3 expanded-FAB or long-press menu. Tiebreaker #3 stays canonical for the food FAB; tiebreaker #24 governs the pair.

**Borders / rules:**

| Use | Thickness | Color | Style |
|---|---|---|---|
| Standard divider | 1px | `rule` | solid |
| Card frame / section boundary / masthead bottom | 1px | `rule-strong` | solid |
| Double-rule (masthead frame) | 1px + 4px gap + 1px | `rule-strong` | solid |
| Sub-row (dense-table rows) | 1px | `rule` | dotted |
| Focus ring (global) | 2px | **`ivory`** | solid outline + 2px offset (tiebreaker #1) |
| Active nav indicator | 2–3px | `oxblood` | solid (top on mobile tab, left on sidebar) |
| Form-field error underline | 1px | `oxblood` | solid |

**Shadows:** NONE. `box-shadow: none` is the system default.

### 2.5 Spacing + grid (8px base)

```css
@theme {
  --spacing-0: 0;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-12: 48px;
  --spacing-16: 64px;
  --spacing-24: 96px;
  --spacing-gutter-editorial: 28px;  /* broadsheet column gutter — anti-generic */
}
```

**Column grid:**

| Breakpoint | Columns | Gutter | Margin | Max width |
|---|---|---|---|---|
| Mobile (375–767px) | 4 | 12px | 20px | fluid |
| Tablet (768–1279px) | 8 | 16px | 28px | fluid |
| Desktop (1280px+) | 12 | 24px | 48px | 1280px |

**Page padding tokens** (per ux-specialist §2.2): `--page-padding-desktop: 48px`, `--page-padding-tablet: 32px`, `--page-padding-mobile: 16px`. Every page consumes these identically.

Spacing audit corrections applied: water-tracker bullet gap normalized 10→8px; meals-bulletin row gap 14→16px; library card padding 22/20/24 → 24/20/24; heatmap card padding 30/32 → 32; weekly-review card 40/32 → 48/32.

### 2.6 Motion tokens

Four primary timings + one print-inspired non-power-of-two duration + one shimmer:

```css
@theme {
  --motion-micro: 120ms;       /* hover, focus, opacity crossfade */
  --motion-standard: 180ms;    /* modal open/close, toast appear */
  --motion-expressive: 320ms;  /* rule-draw, page-settle */
  --motion-chrono: 600ms;      /* chronometer arc first paint */
  --motion-page-turn: 480ms;   /* intentionally-awkward page-transition duration — anti-generic */
  --motion-shimmer: 1600ms;    /* skeleton pulse */
  --ease-editorial: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

**Named transitions:**

| Name | Property | Duration | Use |
|---|---|---|---|
| `ink-fade` | `opacity` | micro | Hover, focus, number crossfade |
| `rule-draw` | `transform: scaleX()` 0→1 from left | expressive | Hairline entering on section reveal |
| `chrono-draw` | SVG `stroke-dashoffset` | chrono | Chronometer consumed arc first paint |
| `ember-pulse` | `transform: scale(1 → 1.02 → 1)` | standard | Save confirmation, nudge card entry |
| `page-settle` | `opacity: 0 → 1` on main content | expressive | Route change |
| `page-turn` | Mixed (opacity + width) | page-turn | Tablet rail expand, onboarding step advance |

**Reduced-motion rule:** `@media (prefers-reduced-motion: reduce)` collapses all durations to **1ms** for transforms/translates/scales; opacity crossfades remain. Chronometer renders fully drawn on first paint. Heatmap cells render instantly (no row stagger).

**Framer Motion pattern (tiebreaker #11):** every consumer uses **`LazyMotion` + `m`** components (not full `motion` import) to keep initial bundle at ~4.6 KB (vs ~32 KB).

```tsx
import { LazyMotion, domAnimation, m } from 'framer-motion';
<LazyMotion features={domAnimation}>
  <m.div animate={{ opacity: 1 }} />
</LazyMotion>
```

Shared config lives in `lib/motion/defaults.ts` exporting `EASE_EDITORIAL`, `motion.{micro,standard,expressive,chrono,pageTurn}`, and `variants.{inkFade,emberPulse,pageSettle}`.

### 2.7 `lib/tokens.ts` module

Single TypeScript source of truth. Every downstream component spec references these — never hardcoded values. Structure:

```ts
export const colors = {
  bg: { 0: '#0E0A08', 1: '#15100D', 2: '#1E1815', quote: '#1A1310' },
  rule: { default: '#2A2320', strong: '#3A3029' },
  text: { ivory: '#F4EBDC', sand: '#C9BDA8', dust: '#8A8173', dust2: '#6B6156' },
  accent: { oxblood: '#8A2A1F', oxbloodSoft: '#A13A2C', ember: '#C8693B',
            ochre: '#B8894A', moss: '#5C6B3D', slate: '#4A5764', plum: '#5D3A44' },
  heatmap: { c0: '#1F1613', c1: '#3E1C16', c2: '#5A261A', c3: '#7A3523',
             c4: '#8B5A2D', c5: '#A97B3F', c6: '#7A7A42', c7: '#5C6B3D',
             c8: '#718041', c9: '#8B9A50' },
} as const;

export const typography = { family, size, weight, tracking, lineHeight, numericFeatures };
export const spacing = { 0:0, 1:4, 2:8, 3:12, 4:16, 6:24, 8:32, 12:48, 16:64, 24:96, gutterEditorial:28 };
export const radii = { none: 0, full: 9999 };
export const motion = { duration: { micro:120, standard:180, expressive:320, chrono:600, pageTurn:480, shimmer:1600 }, ease: { editorial: [0.2, 0.8, 0.2, 1] as const } };
export const breakpoints = { mobile: 375, tablet: 768, desktop: 1280 };
export const zIndex = { base:0, raised:10, stickyHeader:20, sidebar:30, dropdown:40, modalBackdrop:50, modal:51, toast:60, fab:70, skipLink:100, shortcutsOverlay:110 };
export const container = { page: 1280, gutter: { mobile:12, tablet:16, desktop:24 }, margin: { mobile:20, tablet:28, desktop:48 }, pagePadding: { mobile:16, tablet:32, desktop:48 } };
```

Ships as pure data (no React imports) so both server and client components consume identically.

---

## 3. Design Principles (Ledger Inviolables)

Six prohibitions enforced across every component spec. Violations fail code review.

### 3.1 Aesthetic discipline — the oxblood consolidation rule

Per tiebreaker #7 (design-lead anti-diffusion): oxblood is the SIGNATURE accent. It appears on **at most 2–3 non-transient elements per screen**. Signature moments are retained; diffusion points are bound down:

**Signature moments (KEEP oxblood):**
- Chronometer ring consumed arc + over-target indicator.
- Drop cap in Weekly Review (single use across entire app).
- FAB fill + ivory `+` glyph.
- Primary CTA button fills (SAVE TO LEDGER, LOG THIS NOW, PARSE, GENERATE, CONTINUE).
- Active sidebar/rail nav left-border (3px); active mobile tab top-border (2px).
- Wordmark bullet + kicker accent dots.
- Form-field error underline (1px).

**Diffusion points bound down:**
- **Letter-mark thumbnail fallback** (library cards without photos): `bg-2` background + **2px oxblood top rule** + ivory letter — **NOT** oxblood background with ivory letter. Reduces oxblood surface area across a 4-column grid.
- **Water adherence bar** (progress page): **`slate` fill** (matches dashboard water bullet for cross-screen consistency). NOT oxblood.
- **Undo Toast left rule**: **2px `ember`** (not oxblood). Ember signals "warning / approaching" which matches "undoable within 5s"; reserves oxblood for the editor's-voice card.
- **"VIEW FULL REVIEW →" link** (weekly insight): **ivory text with 1px oxblood-soft underline**, not oxblood text (contrast fail).

**Visual budget test:** a page spec that produces >3 oxblood surfaces must push one to ember, oxblood-soft, or ochre. Lint-rule proposal: count `--color-oxblood` references per rendered CSS + warn at >4.

### 3.2 Typography characterful-pair enforcement

Newsreader + Inter + JetBrains Mono is a disciplined role-split, NOT substitutable:

- **Inter is labels-only.** Never fall back to Inter for Newsreader body copy. If Newsreader fails to load, cascade to Tiempos Display → Georgia → serif (defined in `--font-serif`). Visual regression test flags any `<p>` or pull-quote rendering Inter.
- **JetBrains Mono earns its spot.** Always used for: timestamps, edition numbers, portion units, heatmap day-numbers, hotkey glyphs (`/`), footnote macro labels `P · C · F`, chart axis ticks, chronometer footer annotations.
- **Newsreader italic signals voice.** Italic reserved for: food names (meals bulletin + library cards), direct quotes, editor's voice (weekly review body), pull-quote sub-lines.
- **OpenType flourishes (design-lead §4.4):** `.serif` utility opts into `font-variant-ligatures: discretionary-ligatures` and `font-optical-sizing: auto`. Free editorial polish. `.num-editorial { font-variant-numeric: oldstyle-nums proportional-nums }` is the secondary utility for inline serif prose (e.g., weekly insight bullets with inline numbers); `.num` stays for tables/charts/values.

### 3.3 Motion orchestration — the Dashboard page-load signature moment

Per tiebreaker #13 and design-lead §6.2: the Dashboard first paint is a **single choreographed entrance**, not scattered per-component motion. Extracted to `lib/motion/dashboard-choreography.ts` which exports `getDashboardStaggerDelay(element: string): number`.

```
t=0       page-settle begins (320ms opacity fade on main content)
t=80ms    masthead typography settled (opacity 1)
t=150ms   section kicker `§ 01` inks in (ink-fade 120ms)
t=180ms   chronometer compass circle + tick marks appear (RSC paint)
t=300ms   chrono-draw begins (600ms stroke-dashoffset on consumed arc)
t=400ms   macro bars rule-draw in parallel (320ms each, 40ms stagger)
t=600ms   meals bulletin entries ink-fade (220ms, 40ms stagger, capped at 20)
t=800ms   water + micros panel complete
t=1000ms  chronometer projection arc ink-fade (120ms) — the dashed ember layer
t=1200ms  weekly insight card renders (PPR-deferred; may arrive later)
```

Reduced-motion collapses all stages to instant paint. Surrounding per-component motion (hover, press, state change) is independent of this choreography.

### 3.4 Layout + composition rules

- **Controlled density over generous whitespace.** Printed-page aesthetic: many small elements in one grid beats airy single-column waste.
- **Editorial asymmetry on key surfaces.** Onboarding Step 1 is flush-left / top-weighted, not center-stage. Login form is flush-left with a horizontal rule and flush-right tagline (anti-generic auth pattern).
- **Hairline-as-hierarchy.** Section boundaries use 1px `rule-strong`; sub-section divides use 1px `rule`; dense-table rows use dotted 1px `rule`. Double-rule frames the masthead only.
- **Grid-breaking flourishes.** Weekly insight card's oxblood left rule may extend 12px up into the chronometer row above (overlap); library drill-in hero thumbnail may bleed 24px past its column edge on desktop (print-design bleed).

---

## 4. Component Architecture

Per architecture-enrichment (vercel-composition-patterns): primitives layer + compound APIs + headless primitives + discriminated-union state shape.

### 4.1 Primitives layer (`components/primitives/`)

Nine primitives ship in Task 1.1. ESLint rule `no-direct-button-element` (and similar for input/chip/card/hr) forbids duplicating these ad-hoc outside the primitives directory.

| # | Primitive | File | Purpose |
|---|---|---|---|
| 1 | `Button` | `Button.tsx` | Discriminated variant × size; polymorphic via `asChild` (Radix-style) |
| 2 | `Input` | `Input.tsx` | Discriminated-union `kind` (text / email / password / number / date / textarea) |
| 3 | `Chip` | `Chip.tsx` | Toggleable; variants `outline`, `inverted`, `oxblood-left` |
| 4 | `MacroBar` | `MacroBar.tsx` | Shared across dashboard / food-detail / confirmation / weekly-review mini |
| 5 | `Card` | `Card.tsx` | Polymorphic `as`; tone `bg-0/bg-1/bg-2`; accent `oxblood-left / ember-left / none` |
| 6 | `RuleDivider` | `RuleDivider.tsx` | `weight` (default/strong/dotted); `double`; orientation; color |
| 7 | `UndoToast` | `UndoToast.tsx` | Consumer-of-context primitive; never rendered directly — caller uses `UndoQueueContext.pushToast()` |
| 8 | `Kicker` | `Kicker.tsx` | `§ NN ·` mono prefix + Inter caps label (accent `default/oxblood/oxblood-soft`) |
| 9 | `DropCap` | `DropCap.tsx` | Runtime-singleton; dev-mode `console.error` if it renders twice on a page |
| 10 | `MobileWheelPicker` | `MobileWheelPicker.tsx` | Mobile-only (<768px) bottom-sheet wheel picker for high-cardinality enumerated selection. Built on `LazyMotion + m` per §9.4 — no new dependency. Desktop/tablet (≥768) uses existing primitive (Radix `DropdownMenu`, `Stepper`, `<select>`). Pair with `useIsMobile()` (`lib/hooks/use-is-mobile.ts`) to swap rendering at the consumer; the primitive itself is breakpoint-agnostic so it can also be hosted in a tablet drawer if needed. Reduced-motion (§9.3) collapses inertial spring → instant snap. See §10.6.1 for a11y contract. |

**ESLint rules (shipped in Task 1.1):**

1. `no-hardcoded-hex` — string literals matching `/#[0-9A-Fa-f]{3,8}/` outside `lib/tokens.ts` and `app/globals.css`.
2. `no-outline-none` — AST selector forbids `outline: none`, `outline: 0`, `outlineStyle: "none"`, `outlineWidth: 0`; plus Tailwind `outline-none` / `outline-0` / `focus:outline-0`.
3. `no-radius-other-than-zero` — `border-radius` values other than `0`, `var(--radius-none)`, `50%`, `var(--radius-full)`.
4. `no-inline-cache-tag` — `cacheTag`/`updateTag` arguments MUST be constants from `lib/cache/tags.ts` (I12).
5. `no-direct-button-element` — disallows raw `<button>` outside `components/primitives/` and Radix primitives' render-child paths.
6. `no-boolean-prop-proliferation` — flagged in review when a component declares >3 boolean props.
7. `no-server-state-in-zustand` — disallows imports of `useEntriesStore`, `useLibraryStore`, `useProfileStore` naming patterns.

### 4.2 Compound components (6 total — tiebreaker #14)

Every large stateful surface ships as a compound API with shared context. TypeScript contracts below.

#### 4.2.1 `LogModal`

```tsx
// components/log/log-modal.tsx
const LogModalContext = createContext<LogModalContextValue | null>(null);
interface LogModalContextValue {
  state: LogFlowState;
  actions: { setTab; submitParse; submitVision; commitSave; close };
  meta: { modalRef; firstInputRef };
}

export const LogModal = {
  Root: LogModalRoot,             // ModalShell + Provider + focus-trap
  Tabs: LogModalTabs,
  TypePane: LogModalTypePane,     // renders when activeTab==='type' && phase==='tab'
  SnapPane: LogModalSnapPane,     // lazy-loads browser-image-compression
  LibraryPane: LogModalLibraryPane,
  Confirmation: LogModalConfirmation,  // conditional on phase==='confirmation'
};
```

Phase is no longer an if-tree — it's whether the consumer mounts `<LogModal.Confirmation>`. Each pane is lazy-loadable.

#### 4.2.2 `Confirmation`

```tsx
export const Confirmation = {
  Root,                  // Provider with ConfirmationContext
  ItemList,              // editable items with inline stepper
  Reasoning,             // source-gated ("Why these numbers?" — hidden for library/manual)
  MealSlot,              // kicker-row radio pattern (tiebreaker #12)
  TimeEditor,            // LOGGED AT native input
  SaveToLibraryToggle,   // source-gated (hidden for library)
  SaveAction,            // primary oxblood fill
};
```

`source === 'library' | 'manual'` gates Reasoning and SaveToLibraryToggle via context — no props, no if-branches.

#### 4.2.3 `MergeDialog`

```tsx
interface MergeDialogFieldProps<T> {
  name: string;
  fieldKey: string;
  valueA: T; valueB: T;
  render: (v: T) => ReactNode;
  customInput?: ReactNode;
}

export const MergeDialog = {
  Root, Header, Field: MergeDialogField, Preview, Actions,
};
```

`showMicros` disappears — caller mounts micros rows inside `<details>` or not. Per tiebreaker #4: **merge is NON-UNDOABLE**; `MergeDialog.Actions` surfaces a confirm dialog before commit, not an undo toast with reversal logic.

#### 4.2.4 `FoodDetail`

```tsx
export const FoodDetail = {
  Root,       // owns sheet shell (mobile full-sheet vs desktop right-side overlay)
  Thumbnail,  // hero + meta chip; LetterMark fallback
  Name,       // inline-editable
  Macros,     // reuses MacroBar primitive
  History,    // recent-uses list from food_entries query
  Actions,    // LOG THIS NOW / EDIT / DELETE
};
```

Mobile vs desktop diverge only in `Root`'s shell. Children are identical.

#### 4.2.5 `LibraryCard`

Per tiebreaker #14 + architecture §7.1: 5 booleans in Agent 5's sketch collapse to 1 `active` prop + CSS pseudo-classes for hover/focus/press + composition children.

```tsx
<LibraryCard.Root active={selected} as="button">
  <LibraryCard.Thumbnail
    src={item.thumbnail_url}
    fallback={<LetterMark name={item.display_name} />}
  >
    <LibraryCard.MonoTag>MEAL · {date}</LibraryCard.MonoTag>
    <LibraryCard.CountBadge>logged {n}×</LibraryCard.CountBadge>
  </LibraryCard.Thumbnail>
  <LibraryCard.Name>{item.display_name}</LibraryCard.Name>
  <LibraryCard.Portion>{item.portion}</LibraryCard.Portion>
  <LibraryCard.Divider />
  <LibraryCard.Footer>
    <LibraryCard.Kcal>{item.kcal}</LibraryCard.Kcal>
    <LibraryCard.Macros>{`P ${p} · C ${c} · F ${f}`}</LibraryCard.Macros>
  </LibraryCard.Footer>
  {inSelectMode && <LibraryCard.SelectionChip />}
</LibraryCard.Root>
```

#### 4.2.6 `OnboardingLayout`

```tsx
<OnboardingLayout.Root step={n}>
  <OnboardingLayout.ProgressDashes total={8} current={n} />
  <OnboardingLayout.StepContent>
    {n === 1 && <StepWelcome />}
    {n === 2 && <StepName />}
    {/* ... through StepTarget */}
  </OnboardingLayout.StepContent>
  <OnboardingLayout.ActionRow>
    {n > 1 && <OnboardingLayout.BackButton />}
    <OnboardingLayout.NextButton />
  </OnboardingLayout.ActionRow>
</OnboardingLayout.Root>
```

8 named step variants beat `<OnboardingStep type="welcome|name|..." />` — per `patterns-explicit-variants`.

### 4.3 Headless primitives (`lib/primitives/`)

Four cross-cutting behaviors, no visuals.

| # | Primitive | Purpose |
|---|---|---|
| 1 | `useUndoable<T>` | Unified optimistic-mutation pipeline: generate `client_id`, optimistic insert, fire Server Action, push undo toast, on undo reverse via tombstone/delete/patch. 10+ callsites share one tested file. |
| 2 | `OfflineQueueProvider + useOfflineQueue` | One store for offline outbox; consumers (masthead chip, water-tracker badge) read their own Ledger-styled surface. |
| 3 | `<KeyboardShortcut />` component | Declarative shortcut registration; props `keys`, `onTrigger`, `scope: 'global' / 'modal' / 'route'`, `disabledWhileInputFocused`. Handles `g d`-style sequence leaders, modal suspension, input-focus blocking. |
| 4 | `<FocusTrap>` wrapper | Wraps `react-aria/useFocusScope`; used by all modals + sheets. |

### 4.4 Context tree

```
<AuthProvider>
  <I18nProvider>
    <UndoQueueProvider>
      <ModalPortalProvider>
        <ShortcutsProvider>
          <ReducedMotionProvider>
            <AppShell>{children}</AppShell>
```

| Context | Scope | State | Actions |
|---|---|---|---|
| `AuthContext` | Root | `{ user, session, expiresAt }` | `refresh, signOut` |
| `I18nContext` | Root | `{ locale, timezone }` | `format()` helpers |
| `UndoQueueContext` | Root | LIFO `stack: UndoToast[]` | `pushToast, popTop, dismissAll` |
| `ModalPortalContext` | Root | `openModals[]` | `open(id), close(id), closeAll` — z-stacking + focus-trap on stacked modals + body-scroll lock |
| `ShortcutsContext` | Root | `sequenceState` | `register, unregister` — modal-suspend aware |
| `ReducedMotionContext` | Root | `{ enabled, source: 'os' / 'user' }` | `setOverride` |
| `LogModalContext` | `LogModal.Root` | `LogFlowState` | submit / commit / close |
| `ConfirmationContext` | `Confirmation.Root` | `ConfirmationState` | edit / remove / commit |
| `MergeDialogContext` | `MergeDialog.Root` | `{ itemA, itemB, picks }` | `pick, commit, cancel` |
| `LibraryGridContext` | `LibraryGrid` | `{ items, query, filter, sort, selection }` | `set/toggle/clear` |
| `ProgressRangeContext` | `/progress` | `{ range }` | `setRange` (URL-synced) |
| `EditionContext` | `/` + `/library` + `/progress` + `/settings` | `{ todayISO, todayLabel, volume, editionNumber, greeting }` | — |

**Explicit non-goals:** no `ThemeProvider` (dark-only). No `MotionProvider` (stateless import from `lib/motion/defaults.ts`). No global Recharts provider (per-chart client island).

### 4.5 Discriminated unions for status states (tiebreaker #16)

Applied to 8 components. Pattern: `{ status: 'loading' } | { status: 'ready', data: T } | { status: 'empty', onCTA } | { status: 'error', error }`. Required data is bound to the status — `consumed` is not passable during loading/error.

**Applied to:**

1. `ChronometerRing`
2. `MacroBars`
3. `MealsBulletin`
4. `Confirmation` (lifecycle: editing / saving / error)
5. `SnapDraft` (7-state: idle / capturing / compressing / uploading / analyzing / done / error)
6. `LoginForm` (mode × submission)
7. `AccountDeleteFlow` (3 step variants)
8. `WeeklyInsightCard` + `WeeklyReviewIsland` (share `WeeklyReviewCore`)

**Example — ChronometerRing:**

```ts
type ChronometerData =
  | { status: 'default' | 'approaching' | 'on-target' | 'over-target' | 'way-over';
      consumed: number; target: number;
      fiber: { consumed: number; target: number };
      nowAngle: number;
      entryCount: number;
      lastLoggedAt: string | null }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty'; onLogFirst: () => void };

interface ChronometerRingProps {
  data: ChronometerData;
  size?: 'sm' | 'md' | 'lg';
}
```

TypeScript enforces: `onLogFirst` required only when `status === 'empty'`; `consumed` not passable during loading/error. Render is a single `switch (data.status)`.

---

## 5. React 19 + Next.js 16 Architecture

Per react-perf enrichment: Approach C Hybrid per `Planning/design-doc.md` §6, codified. Cache Components + PPR on data-heavy routes; client islands only where mutation, refs, or browser APIs require.

### 5.1 RSC / Client / Split classification (27 / 38 / 14)

**RSC (no `'use client'`) — 27 components:**

Tokens module; `DashboardMasthead`; `ChronometerRing` SVG structure; `MacroBars` (bars + labels, CSS-transition `width` — no JS needed for fill animation); `MealsBulletin` column/entry structure; `MicronutrientPanel` list; `WeeklyInsightCard` body (PPR shell); progress page route shell; 5 chart section shells (title + meta + container); `MicronutrientHeatmap` table structure; `WeeklyReviewIsland` body (inside Suspense); `LibraryPage` root; `LibraryMasthead`; `LibraryGrid` container (empty grid cells with hairline borders); `LibraryItemCard` visual (thumbnail + name + kcal + macros); `LetterMark`; `FoodDetail.Root` static shell; `DashboardPage`; skip link; mobile top strip; `Kicker`; `RuleDivider`; `Card`; `DropCap`; `PullQuote`.

**Client (`'use client'`) — 38 components:**

Log flow surfaces (10): `LogModal.Root`, `LogModalTabs`, `TypePane`, `SnapPane`, `LibraryPane`, `PortionPicker`, `Confirmation.Root`, `UndoToast`, `UndoToastStack`, `MergeDialog.Root`. Optimistic islands: `WaterQuickAdd`, `WeightQuickAdd`. `WeeklyInsightCard.GenerateTrigger` (just the regen button). `MealsBulletin.EntryRowActions` (per-row context menu + delete). `ProgressRangeToolbar`. Chart tooltip/hover islands × 5. `HeatmapKeyboardNav` (hook-owning island). `LibraryToolsRail` (search + filter + sort + select). `BulkActionBar`, `BulkDeleteModal`. Onboarding steps × 8. Settings form controls × 5. `ProfileMenu`, `ShortcutsOverlay`, `MobileTabBar`, `Sidebar` active-indicator, `FAB`, `TabletRail`. `LoginForm`, `AccountDeleteFlow`, `ExportModal`, `PWAInstallPrompt`, `FirstTimeDashboardCoachmark`. Headless: `KeyboardShortcut`, `FocusTrap`.

**Split (RSC parent + client leaf) — 14:**

`ChronometerRing` (RSC SVG + `<ChronometerArcDraw>` client for chrono-draw); `MacroBars` (RSC + CSS transition); `MealsBulletin` (RSC structure + `<EntryRowClient>` per-row wrapper); `WaterTracker` (bullet grid RSC + `<WaterQuickAdd>` mutates + renders optimistic state); `MicronutrientPanel` (list RSC + `<MicrosOverflowToggle>`); `WeeklyInsightCard` (body RSC + `<WeeklyReviewRegenButton>`); `LibraryItemCard` (visual RSC + `<LibraryItemCardClient>` wrapper for hover/select/context); chart containers × 5 (shell RSC + Recharts client child); `HeatmapCell` (buttons inside RSC `<table>` + event-delegated `<HeatmapKeyboardNav>`); dashboard composition; mobile nav; sidebar active-state island; food detail sheet.

### 5.2 Cache Components + PPR partitioning per route

**Dashboard (`/` authed):**

```tsx
// app/(app)/page.tsx — RSC
export default async function DashboardPage() {
  const uid = await getUserId();
  const day = await getToday(uid);
  return (
    <>
      <DashboardMasthead uid={uid} />
      <Suspense fallback={<DashboardDataSkeleton />}>
        <DashboardData uid={uid} day={day} />
      </Suspense>
      <Suspense fallback={<WeeklyInsightSkeleton />}>
        <WeeklyInsightCard uid={uid} />
      </Suspense>
    </>
  );
}

async function DashboardData({ uid, day }) {
  'use cache';
  cacheLife('minutes');
  cacheTag(TAGS.userEntries(uid, day));
  const entries = await fetchEntries(uid, day);
  return <>...</>;
}

async function WeeklyInsightCard({ uid }) {
  'use cache';
  cacheLife({ stale: 3600, revalidate: 86400 * 7, expire: 86400 * 7 });
  cacheTag(TAGS.weeklyReview(uid, weekStartOn));
  const insight = await fetchOrGenerateWeekly(uid);
  return <WeeklyInsightBody insight={insight} />;
}
```

`cookies()` / `headers()` / `searchParams` MUST NOT appear inside `use cache` — `uid` is extracted in caller and passed as argument (becomes part of cache key).

**Library (`/library`):** single `use cache` boundary for the grid, tagged `TAGS.userLibrary(uid)`. Filter/sort is client-side state on server-provided items — no re-fetch on filter change. No cache segmentation per filter (would cause 24+ cache entries per user; wasteful).

**Progress (`/progress`):** each of 5 chart sections is its own `use cache` boundary with `TAGS.userProgress(uid, range)` + `cacheLife('hours')` (progress aggregates tolerate staler caching). Weekly Review Island is a separate Suspense boundary — the PPR hole that prevents Gemini latency from blocking chart first paint.

### 5.3 Suspense boundary placement (6 on Progress, 1 on Dashboard Weekly Insight)

| Route | Component | Suspense | Fallback |
|---|---|---|---|
| Dashboard | `<DashboardData>` (chrono + macros + meals + micros) | YES (shared) | Chrono hairline + macro tracks skeleton |
| Dashboard | `<WeeklyInsightCard>` | YES (dedicated PPR hole) | 4-line hairline skeleton + drop cap placeholder |
| Library | `<LibraryGridServer>` | YES | Empty ruled grid with skeleton cells |
| Progress | Each of 5 chart sections | YES × 5 (per-section streaming) | `<ChartSkeleton>` — title + 7 grey bars 40% opacity |
| Progress | `<WeeklyReviewIsland>` | YES (dedicated; placed AFTER heatmap so rest streams first) | `<WeeklyReviewSkeleton>` |
| Log Flow | Library tab grid | YES (when opened) | Empty grid skeleton |

**Total: 6 Suspense boundaries on Progress, 1 on Dashboard Weekly Insight** (plus shared Dashboard boundary + Library boundary + Log library tab = 9 total across app).

### 5.4 Server Actions + `useOptimistic` pattern (tiebreaker #18)

All mutations migrate from Route Handlers to Server Actions. Routes stay for streaming Gemini endpoints only.

| Mutation | Server Action | Integration |
|---|---|---|
| Log save | `app/actions/entries.ts → saveEntry` | `useOptimistic` for optimistic insert; `client_id` generated client-side BEFORE insert |
| Water +glass / +bottle | `addWater` | `useOptimistic` + LIFO undo toast |
| Weight quick-add | `addWeight` | Pessimistic with ember-pulse on commit |
| Library PATCH | `updateLibraryItem` | Pessimistic; `client_id` for retry idempotency (not optimism) |
| Library DELETE | `deleteLibraryItem` | Optimistic with 5s undo tombstone |
| Library merge | `mergeLibraryItems` | **Pessimistic with confirm dialog; NOT optimistic, NOT undoable** (tiebreaker #4) |
| Library bulk-delete | `bulkDeleteLibraryItems` | Optimistic with 5s undo tombstone |
| Entry delete (meals bulletin) | `deleteEntry` | `useOptimistic` + undo toast |

**Kept as Route Handlers (streaming required):** `POST /api/ai/text-parse`, `POST /api/ai/vision`, `POST /api/ai/weekly-review`.

**Revalidation:** after every Server Action: `updateTag(TAGS.userEntries(uid, day))` (or relevant tag). NOT `revalidatePath` (Page-Router legacy).

**`client_id` generation (I11):** every optimistic mutation generates `client_id = crypto.randomUUID()` **before** the optimistic insert. Optimistic row carries client-generated id; server's `UNIQUE(client_id)` constraint matches the optimistic row on replay. Server-side idempotent: duplicate POST with same `client_id` returns 200 no-op.

### 5.5 Bundle strategy

Per react-perf §7 + tiebreaker #10:

**Recharts dynamic import:** all chart components go through `next/dynamic(() => import('./RechartsCharts'), { ssr: false })`. Saves ~120 KB on dashboard/library first paint; chart bundle only on `/progress`.

**Water Adherence uses inline SVG** (not Recharts) — simpler bar pattern; ~50 LOC native SVG; zero additional bundle cost.

**Framer Motion LazyMotion pattern** (tiebreaker #11): all consumers `LazyMotion + m` components, not full `motion` package import. ~27 KB saving on every route using motion.

**Log modal `next/dynamic`:** entire `LogModal` bundle lazy-loaded with `{ ssr: false }`. Dashboard first paint never pays the modal's ~40–60 KB. Loaded on `useLogFlowStore.isOpen === true`.

**Other lazy-loads:** `MergeDialog`, `BulkDeleteModal`, `AccountDeleteFlow`, `ExportModal`, `PWAInstallPrompt`, `ShortcutsOverlay`. Each is rarely-opened; each is dynamic-imported.

**Inside `SnapPane`:** `browser-image-compression` loads at first capture action, not at modal mount.

**Route bundle targets:**

| Route | Initial gzipped JS | Note |
|---|---|---|
| `/` (Dashboard) | ~95 KB | Within 200 KB threshold; grows to ~160 KB after modal open |
| `/library` | ~100 KB | Within threshold |
| `/progress` | ~85 KB (after Recharts dynamic) | Was ~205 KB before; now under threshold |
| `/onboarding` | ~90 KB | OK |
| `/settings` | ~80 KB | OK |
| `/login` | ~90 KB | OK |

### 5.6 Memoization

`React.memo` applied only where list-render cost justifies:

| Component | Memo key | Justification |
|---|---|---|
| `LibraryItemCard` (split wrapper) | `item.id + item.updated_at` | 50–200 grid items; filter-change should not re-render all |
| `MealsBulletinRow` | `entry.id + entry.updated_at` | Up to 20 rows per day |
| `HeatmapCell` | `nutrient + date + value` | 7 × 30 = 210 cells; prevents neighbor-update cascade |
| `WaterBullet` | `filled + index` | 8–16 bullets; one bullet flip re-renders that cell only |
| `NavItem` | `active + label` | 5 sidebar items; only newly-active and newly-inactive re-render on route change |
| `MicroRow` | `nutrient + value + status` | 7–10 rows |

**NOT memoized:** `ChronometerRing`, `MacroBars`, `DashboardMasthead`, `SkipLink`.

**Server state location (tiebreaker #17):** REMOVED `useEntriesStore` and `useLibraryStore`. Server state stays on the server (Cache Components + PPR). Zustand is reserved for: LIFO undo queue, modal open-state, selected tabs, unsaved form drafts, UI preferences.

---

## 6. Navigation System

### 6.1 Navigation topology

Five primary destinations + one modal launcher. Topology is identical across breakpoints; presentation pattern changes.

| # | Destination | Route | Nav role |
|---|---|---|---|
| 1 | **Dashboard** | `/` (authed) | Standard |
| 2 | **Log** | `/log` (modal route) | **Modal launcher** — opens `<LogModal.Root>` over current surface |
| 3 | **Library** | `/library` | Standard |
| 4 | **Progress** | `/progress` | Standard |
| 5 | **Settings** | `/settings` | Standard |

Log is a modal, not a destination. Tapping "Log" in sidebar/rail, pressing `n`, or tapping the mobile FAB all call `ModalPortalContext.open('log-modal')`. Modal stacks on top of current URL; close returns to prior route without nav-stack push.

**Secondary destinations** (not in primary nav): Food Detail (`/library/[id]`), Account (`/settings/account`), Weekly Review (`/review`), Export (`/settings/export`), Weight Log Entry (`/weight`). Active parent tab stays highlighted.

### 6.2 Desktop sidebar (1280+ px, 240px wide)

Persistent left sidebar. Masthead lives **inside the sidebar** so the content column gets full-width canvas for the chronometer.

**Dimensions + surface:**
- Width 240px, `position: sticky; top: 0`, full viewport height.
- Background `bg-1`, right edge 1px `rule-strong`.

**Masthead (top of sidebar, 104px high):**
- Wordmark row: "Kalori" Newsreader **36px** (increased from 28px per design-lead §4.1), letter-spacing −0.035em, `ivory`. Oxblood 7px square bullet (zero-radius) sits 8px right of the final letter.
- Edition line: `Vol. 1, Edition XXX` — Inter 500 10.5px UPPERCASE tracking 0.22em `sand`. Edition numerals use tabular-nums.
- Bottom rule: 1px `rule`, full 240px width.

**`§ NAVIGATION` kicker** (per design-lead §2.2.1 + design-doc §9 ASCII sketch): Inter 10.5 UPPERCASE tracking 0.22em `dust`, padding-left 16px, margin-top 8px / margin-bottom 12px. Divides masthead from nav list.

**Nav list (5 items, vertical stack):**
- Item height 56px.
- Icon: Phosphor `ChartBar` / `Plus` / `BookOpen` / `ChartLine` / `Gear` via SSR path `@phosphor-icons/react/dist/ssr/{Icon}`. **18×18** and shifted right (labels flush left — anti-generic).
- Label: Inter 500 **13px** normal-case, `sand` default, `ivory` on active/hover.

**States:**

| State | Text | Icon | Row bg | Left bar |
|---|---|---|---|---|
| Default | `sand` | `sand` | transparent | none |
| Hover | `ivory` | `ivory` | transparent | none |
| Focus (keyboard) | `ivory` | `ivory` | transparent | 2px **ivory** outline + 2px offset around full row |
| Active | `ivory` | `ivory` | `bg-2` | 2px `oxblood` flush left, full 56px tall |

**User strip (bottom, 72px):** 1px `rule` above. 32×32 square avatar (zero-radius, `oxblood` fill, Newsreader 16px ivory monogram). Name (Inter 500 12px ivory) + email (Inter 400 10.5px dust). "SIGN OUT" link is **persistently visible** (not hover-only — ux-auditor §11.2 fix), 44×44 hit area, Inter 500 10.5px UPPERCASE.

### 6.3 Tablet rail (768–1279 px)

**Collapsed state (default):** 56px, `bg-1`, 1px `rule-strong` right edge. K monogram masthead (Newsreader 32px). 56×56 nav cells, Phosphor 18×18 centered, no label. Active: 2px `oxblood` flush left.

**Expanded state (hover OR focus-within):** 240px via `motion-page-turn` (480ms `ease-editorial`) — the "turning to a new page" moment. Labels ink-fade starting at 40% of width transition. Monogram crossfades to full wordmark + edition line, staggered 60ms. Exit delay 200ms on pointer-leave.

**`aria-expanded="true|false"`** on `<nav>` container reflects keyboard-focused-user state (not visual-hover state — ux-auditor A1 fix). Rail-pinned persists to `localStorage` key `kalori:nav:rail-pinned`.

### 6.4 Mobile bottom tab + center FAB pair (food + water — tiebreaker #3 + #24)

**Bottom tab bar:** Fixed 56px + `env(safe-area-inset-bottom)`. `bg-1`, top 1px `rule-strong`. 4 destinations: Dashboard, Library, Progress, Settings. Log NOT a tab. Slot layout: `[Dashboard] [Library] [120px gap for FAB pair] [Progress] [Settings]` (was 72px gap pre-tiebreaker-#24). The bar uses `gridTemplateColumns: 'repeat(4, 1fr)'` so the four destinations distribute evenly across the full viewport width — there is no fixed "middle gap" cell to widen; the FAB pair simply floats at z-index 41 over the centre two tabs (Library + Progress). Tab switch instant; label/icon color 120ms `ink-fade` dust→ivory.

**States:**

| State | Icon | Label | Top bar |
|---|---|---|---|
| Default | `dust` | `dust` | none |
| Active | `ivory` | `ivory` | 2px `oxblood` flush top of slot |
| Focus | `ivory` | `ivory` | 2px **ivory** outline + 2px offset |

**Center FAB pair (tiebreaker #3 + #24):**

| | Food (primary) | Water (secondary) |
|---|---|---|
| **Size** | 56×56 zero-radius square | 56×56 zero-radius square |
| **Ground** | `oxblood` (signature) | `bg-1` (chrome) |
| **Border** | 1px `rule-strong` | 1px `ivory` |
| **Glyph** | Custom SVG `+` — two 2px rectangles crossed at centre, 20px, ivory. NOT Phosphor Plus | Custom SVG water-drop polygon — `M10 2 L4 12 a6 6 0 0 0 12 0 z` path, 2px ivory stroke, no fill. NOT Phosphor Drop |
| **Click** | Opens log-flow modal via `useLogFlowStore.getState().openModal('type')` | `router.push('/dashboard')` — surfaces the existing `<WaterTracker />` chip (Path A per user Phase 2 decision) |
| **aria-label** | `"Log food"` (was `"New log entry"` pre-#24; renamed for SR disambiguation) | `"Log water"` |
| **aria-haspopup** | `"dialog"` | (none — it navigates, doesn't open a dialog) |
| **data-testid** | `log-fab-food` (was `log-fab` pre-#24; one rename round) | `log-fab-water` |

**Pair layout:**
- Container: `position: fixed; left: calc(50% - 60px); bottom: calc(56px + env(safe-area-inset-bottom) + 8px); z-index: 41; display: flex; gap: 8px;`. Total wrapper width = 56 + 8 + 56 = 120px (was 56 single-FAB).
- 8px gutter between FABs respects WCAG 2.5.5 AAA adjacent-target rule (≥8px clearance for ≥44×44 targets).
- Both 56×56 = identical tap parity. **Asymmetric sizing rejected** — water is a first-class metric per PRD §3.7; squashing it to 44×44 would mis-rank it visually.
- Pair exists on **mobile only** (375–767px). Desktop (≥1280) keeps the sidebar "LOG" item; tablet (768–1279) keeps the rail "LOG" item; water-log entry on those breakpoints lives on the dashboard `<WaterTracker />` chip directly. Open question (dashboard sidebar "WATER" item on desktop) **deferred** — desktop's water-log surface is already the dashboard chip.
- **Focus ring (both): 2px `ivory`** (ux-auditor F3 fix; tiebreaker #1).

**FAB motion (applies to both variants):**
- Press: `scale(0.98)` over 80ms (reduced from 0.96 per ux-specialist §8.2).
- Release: back to `scale(1)` over 180ms.
- Ember pulse on release: square ring emits, expands to 110% over 180ms at 0.15 alpha. Per tiebreaker #11, motion uses `LazyMotion + m` from `lib/motion/defaults.ts` — never direct `framer-motion` import.
- Reduced-motion: opacity-only 60ms flash.

**Why two FABs, not a speed-dial:** speed-dial / expanding-FAB rejected because (a) PRD §3.7 makes water optimistic-first → no extra tap before commit; (b) WCAG 2.1.1 forbids long-press as the only path; (c) the pair is documented as Material 3 "extended FAB pair" precedent. Both stay 56×56 zero-radius squares so the Ledger glyph language is preserved.

### 6.5 Keyboard shortcuts + toggle setting

| Key | Action | Available | WCAG 2.1.4 |
|---|---|---|---|
| `/` | Focus search | Desktop + Tablet | Single-char — toggleable |
| `n` | Open log modal | Desktop + Tablet | Single-char — toggleable |
| `g d` / `g l` / `g p` / `g s` | Navigate | Desktop + Tablet | Leader sequence, 1200ms window |
| `?` | Shortcuts help overlay | Desktop + Tablet | Single-char — toggleable |
| `Escape` | Close modal, defocus search | All | Always on |
| `Tab` / `Shift+Tab` | Focus cycling | All | Native |

**WCAG 2.1.4 compliance:** `Settings → Display → DISABLE KEYBOARD SHORTCUTS` toggle per ux-auditor §13.6. Toggles all single-char shortcuts; leader-based remain. Shortcuts overlay (`?`): 560px centered modal, `bg-1`, 1px `rule-strong`, `role="dialog" aria-modal="true"`.

### 6.6 Responsive behavior table

| Breakpoint | Nav pattern | Masthead location | Log launcher | Top bar |
|---|---|---|---|---|
| Desktop 1280+ | Persistent sidebar 240px | Inside sidebar (36px wordmark) | Sidebar "LOG" + `n` | None |
| Tablet 768–1279 | Rail 56/240 | Inside rail (K monogram / wordmark) | Rail "LOG" + `n` | None |
| Mobile 375–767 | Bottom tab 56px + center FAB pair | Route page owns its own section masthead | Center FAB pair (food 56×56 + water 56×56, 8px gutter) — tiebreaker #24 | 40px strip: date left + `— No. 142` italic right |

**Rendering strategy:** all three nav patterns render unconditionally via Tailwind `hidden md:flex xl:flex` guards — zero `useMediaQuery`, zero hydration cost, zero flash. Active-state via `usePathname()` in tiny `<NavActiveIndicator>` client island per nav item.

---

## 7. Screen-by-Screen Component Specs

### 7.1 Dashboard (`/` authed — Primary Screen)

#### 7.1.1 Masthead with edition number

**Component:** `<DashboardMasthead displayName variant />` — RSC; consumes `EditionContext`.

Discriminated-union `variant`: `{ kind: 'first-visit' }` | `{ kind: 'returning' }` | `{ kind: 'recalc-nudge', newTargetKcal, oldTargetKcal, deltaPct }` | `{ kind: 'offline', queueSize }`.

**Visual spec:**
- Row 1 asymmetric kicker: **left-aligned** `THE LEDGER — KALORI` (em-dash, `dust`, Inter 10.5 UPPERCASE 0.22em); **right-aligned** `VOL. IV · Nº 142` (`Nº` typographic superior-letter, Newsreader italic 13px sand) per design-lead §2.3.1.
- Row 2 wordmark: Newsreader 300 `text-wordmark` (104/72/48), letter-spacing −0.035em, `ivory`.
- Edition line (right-aligned desktop, stacks below tablet/mobile): Newsreader 300 italic 44/32/28 `sand`: `"No. {editionNumber} · {weekday}, {day} {monthYear}"`.
- Double hairline: 1px `rule` + 4px gap + 1px `rule-strong`, full width.
- Greeting: Newsreader 400 italic 22px `sand`, `"Good {greeting}, {displayName}."` (period deliberate).
- first-visit welcome copy: Newsreader 400 italic 16px `sand`, max 48ch.

**Motion:** static RSC; no entrance on steady-state nav. First-visit welcome fades in via `ink-fade` 220ms staggered 80ms. `TargetUpdatedBanner` enters via `rule-draw` 400ms.

**A11y:** `<h1>` wraps wordmark. Edition line `<p aria-label="Edition 142, Thursday 18 April 2026">`. `TargetUpdatedBanner` `role="status" aria-live="polite"`. Roman numeral `aria-label="Volume 1"`. Wrap in `<header>`.

#### 7.1.2 Chronometer Ring (signature; orchestrated draw)

**Component:** `<ChronometerRing data: ChronometerData size?='sm'|'md'|'lg' />` — Split (RSC SVG + `<ChronometerArcDraw>` client for chrono-draw).

**Discriminated union (tiebreaker #16):**

```ts
type ChronometerData =
  | { status: 'default' | 'approaching' | 'on-target' | 'over-target' | 'way-over';
      consumed: number; target: number;
      fiber: { consumed: number; target: number };
      nowAngle: number; entryCount: number; lastLoggedAt: string | null }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'empty'; onLogFirst: () => void };
```

**Visual spec:**
- Dimensions: 280×280 desktop / 240×240 tablet / 200×200 mobile. SVG `viewBox="0 0 360 360"`.
- Outer compass circle: 1px `rule` stroke, r=164.
- Hour tick marks at I/IV/VII/X + minor ticks every 30°: 1px `rule-strong` cardinal, 0.75px `rule` minor.
- Hour numerals: Newsreader 11px italic `dust`.
- Background ring: 10px stroke `rule`, r=132.
- Consumed arc: 10px stroke, color per status (`oxblood` default/approaching/over-target/way-over; `moss` on-target), `stroke-linecap="butt"`, `transform="rotate(-90 180 180)"`.
- Projection arc: 10px stroke `ember`, `stroke-dasharray="4 6"`, opacity 0.55.
- Inner fiber arc: 2px stroke `ochre` on 2px `rule` track at r=112.
- Now-indicator: filled triangle, `ivory`, 12×12, rotates by `nowAngle`.
- Center stack:
  - Calorie value: Newsreader 300 82/64/48, `ivory`, `.num` — `toLocaleString('en-US')` comma separator.
  - Fraction: Newsreader 400 italic 14px `sand`: `"of {target} kcal"`.
  - Sub-label: Inter 500 10.5px UPPERCASE tracking 0.22em `dust`: `"calories, logged today"`.
  - **Delta line — 15px italic** (ux-specialist §4.1 push): `"{remain} remain · {remainCopy}"` — remainCopy is `plenty of room` / `a measured margin` / `past the mark`.
- **Footer annotations — JetBrains Mono 10.5px** middot-separated (design-lead §4.3): `{entryCount} entries · {pctOfTarget}% of daily target · {lastLoggedAt} last logged`.

**Empty state:** center `<button onLogFirst>` with `"LOG SOMETHING"` (Inter 10.5 UPPERCASE `oxblood`); keyboard-focusable; `focus-editorial` ring.

**Motion:** `chrono-draw` (600ms `stroke-dashoffset` via CSS `@keyframes` on mount — no Framer Motion for this animation per react-perf §11). Center-value change via `ink-fade` crossfade (220ms) — never count-up. `way-over` variant ember-pulse on arc end-cap (4s loop).

**A11y:**
- `role="img"` with `aria-label`: `"{consumed} of {target} calories logged today, {pctOfTarget} percent of target, status {status}"`.
- Decorative SVG `aria-hidden="true"`.
- `<details><summary>View as data table</summary>` drawer below (ux-auditor §5.5).

#### 7.1.3 Macro Bars (shared `MacroBar` primitive)

**Component:** `<MacroBars data />` — RSC; each row is a `<MacroBar>` primitive.

**Macro colors (tiebreaker #6):** Protein = `ivory`, Carbs = `ochre`, Fat = `ember`.

**Visual spec:**
- Three rows, `gap: 16px` (normalized from 14 per ux-specialist §2.1).
- Per row: `m-head` flex space-between (`m-name` Inter 500 10.5 UPPERCASE `dust`; **`m-pct` JetBrains Mono 10.5** per design-lead §4.3), `m-val` Newsreader 300 28px `ivory` with trailing italic `/ {target}g` in `sand`, `m-bar` 8px track on `rule-strong` bg with inner fill.
- Row variation (design-lead §2.3.2): Protein standard; Carbs inverts (bar on LEFT, value right); Fat value-split with vertical 1px rule.
- On-target: 2px `moss` outline around track.
- Over: fill swaps to `oxblood`, `m-pct` in `oxblood-soft` + `!` glyph prefix.
- Empty state (ux-specialist §3.3): bars at 0% fill, tracks at 0.5 opacity, values `—` dust.

**Motion:** CSS `transition: width var(--motion-expressive)` — RSC-only, no client JS for fill animation.

**A11y:** `<div role="meter" aria-valuenow={consumedG} aria-valuemin={0} aria-valuemax={targetG} aria-label="Protein, 103 grams of 140 target, 74 percent">`.

#### 7.1.4 Meals Bulletin

**Component:** `<MealsBulletin>` + 5 `<MealColumn category status entries? suggestedKcal? />` children.

**Column-status discriminated union:** `'filled' | 'pending' | 'empty' | 'loading' | 'error'`.

Callbacks lift to `MealsBulletinContext` (architecture §1.3) — no prop-drilling.

**Visual spec:**
- `bulletin-head`: Newsreader 300 44/32/28 title `"The day's entries"` with italic `entries` in `sand`; italic sub `"— five meals, in order of their taking —"`. Mono date-range right-aligned. Hairline `rule-strong` below.
- 5-column CSS grid with vertical `rule` borders between columns.
- Per column: `meal-head` (Newsreader 300 24px ivory + italic kcal 14px sand tabular), `meal-time` (JetBrains Mono 11px dust), hairline, kicker + entries.
- Entry row: `e-name` (Newsreader 400 italic 18px desktop / **15px mobile (T5-small)** `ivory`); `e-portion` (JetBrains Mono 11px dust); `e-foot` flex (Inter UPPERCASE `P · C · F` left, Newsreader italic 14px sand kcal right).
- **Heaviest-meal marker (design-lead §3.3):** single largest-kcal entry per column carries `oxblood-soft` accent on right-aligned kcal.
- Add-entry affordance: Inter 10.5 UPPERCASE `oxblood-soft` tracking 0.18em with `+` prefix — **44×44 min tap** (raised from 44×32 per ux-auditor §8.1).
- `⋯` context-menu button (44×44) on hover (desktop) / long-press (mobile).

**Interactions:**
- Tap entry → opens FoodDetail compound (shared-element transition on desktop).
- Long-press / right-click / **`Menu` / `Shift+F10`** → context menu (Edit / Delete / Copy to today) per tiebreaker #20 + ux-auditor M1.
- Add-entry → opens LogModal with meal_category pre-filled.
- Delete → emits `useUndoQueueStore.pushToast()`; optimistic removal via `useOptimistic`.

**Responsive:**
- Mobile: 1-col stacked; empty sections collapse to `— none —` tap-to-expand.
- Tablet: 2-col grid.
- Desktop: 5-col with full column rules.

**A11y:**
- Each column `<section aria-labelledby="meal-head-{category}">`.
- Each entry `<article role="button" tabindex="0" aria-label="{displayName}, {portionLabel}, {kcal} kilocalories, logged at {loggedAtHHmm}">` with `aria-haspopup="menu"`.
- Context menu ARIA menu pattern.

#### 7.1.5 Water Tracker (`slate` tint per tiebreaker #7)

**Component:** `<WaterTracker>` — Split (bullet grid + metadata RSC; `<WaterQuickAdd>` client for optimistic state).

**Visual spec:**
- Card wrapper: `bg-1` with `rule-strong` border.
- Header eyebrow: Inter 500 10.5 UPPERCASE tracking 0.22em `dust` — `"the water column"` left, `"{bulletsFilled} of {bulletCount}"` right (color by status — `ochre` <100%, `moss` 100%, `oxblood` over).
- `water-row`: flex row gap **8px** (normalized from 10) + right-aligned meta.
- Each bullet: **16×16 circle**, **`slate` fill** when filled (tiebreaker #7 — NOT oxblood), 1.5px `rule-strong` stroke when empty. Filled KEEPS stroke (ux-auditor V10 fix). Half-state uses `clip-path: inset(50% 0 0 0)`.
- Meta block: Newsreader 300 28px `ivory` tabular `"1.4"` + trailing `L` mono 12px dust; goal sub `"goal · 2.0 L"`.
- `water-actions`: 3 chip buttons, **44×44 min** (ux-auditor §8.1): `+ GLASS · 250ml`, `+ BOTTLE · 500ml`, `CORRECT`. 1px `rule-strong` border, zero-radius, Inter 10.5 UPPERCASE `sand` tracking 0.18em. `+` mono glyph `oxblood`.

**Motion:** new bullet fill via `ember-pulse` (**320ms** normalized from 350). Consumed number ticks via `ink-fade` 220ms. On rollback: bullet fades back to outline.

**Optimistic mutation pattern:**

```tsx
'use client';
export function WaterQuickAdd({ initial, addAction }) {
  const [optimistic, addOptimistic] = useOptimistic(
    initial,
    (state, delta) => ({
      consumedMl: state.consumedMl + delta.ml,
      entries: [...state.entries, { id: delta.clientId, ml: delta.ml, pending: true }],
    }),
  );
  async function handleGlass() {
    const clientId = crypto.randomUUID();
    startTransition(async () => {
      addOptimistic({ clientId, ml: 250 });
      await addWaterAction({ clientId, ml: 250 });
    });
  }
}
```

**A11y:** `<div role="group" aria-label="Water intake, {consumedMl} milliliters of {targetMl}">`. Bullets `aria-hidden="true"`. Action chips explicit labels. `aria-live="polite"` announces `"{newTotal} milliliters logged"`. Correction `aria-label="Correct latest water entry"`.

#### 7.1.6 Micronutrient Panel

**Component:** `<MicronutrientPanel micros visibleCount onShowMore?>` — Split (list RSC + `<MicrosOverflowToggle>` client).

**Membership:** union of micros from last 7 days; priority-sorted (protein > iron > vitamin D > vitamin C > calcium > fiber > rest). Priority constant at `lib/nutrition/display-micros.ts`. visibleCount: 7 mobile / 8 tablet / 10 desktop.

**Visual spec:**
- Panel: top 1px `rule`, 20px top padding; inlines into right-column on desktop, standalone mobile.
- Header eyebrow: `"Minor elements"` left, `"a daily audit"` right — Inter 500 10.5 UPPERCASE `dust`.
- Per row (3-col grid):
  - `micro-name`: Newsreader 400 italic 14px (or **15px for top 3 priority rows** per design-lead §3.3 typographic-weighting) `ivory`. Width 110px desktop / 90px mobile.
  - `micro-track`: 4px bar on `rule` bg. Fill per status: low→`oxblood`, mid→`ochre`, good→`moss`, over→`oxblood-soft`.
  - `micro-pct`: JetBrains Mono 11px tabular right-aligned. **Low status uses `ember`** (ux-auditor §1.4 fix — `oxblood-soft` on bg-1 = 2.84:1 fails AA).
- Over row: `name` gets `!` glyph prefix in `oxblood-soft`.
- Overflow: `+ N MORE ELEMENTS` Inter 10.5 UPPERCASE `oxblood-soft` — 44×44 tap.

**Motion:** rows fade via `ink-fade` 220ms with 50ms stagger. Reduced-motion: no stagger.

**A11y:** each row `<div role="meter" aria-valuenow={dvPct} aria-valuemax={100} aria-label="...">`. Status never sole signal.

#### 7.1.7 Weekly Insight Card (PPR Suspense island; `WeeklyReviewCore` shared)

**Component:** `<WeeklyInsightCard uid />` — RSC inside dedicated `<Suspense>`. `<WeeklyReviewRegenButton>` sole client child.

**Shared core (tiebreaker #22):** Dashboard card and Progress Island share `<WeeklyReviewCore status insights generatedAt />` primitive. Card is compact variant; Island is full.

**Status discriminated union:** `'fresh' | 'stale' | 'sparse-data' | 'generating' | 'error'`.

**Visual spec:**
- Card: `bg-quote` inset surface.
- **2px `oxblood` LEFT rule** — signature annotation chrome (tiebreaker #7 reserved).
- 1px `rule-strong` right/top/bottom. Zero radius.
- Header eyebrow: `"from the editor"` left, `"weekly note"` right — Inter 500 10.5 UPPERCASE `dust` tracking 0.22em.
- `from` label: `"The week in review · w/c {weekStartShort}"` Inter 500 10.5 UPPERCASE `sand` tracking 0.22em.
- Pull-quote:
  - Drop cap — **rendered in `ember`** (ux-auditor §10.3 — oxblood at 2.12:1 fails large-text; ember at 4.84:1 passes). Newsreader 400 48px desktop / 56px ultra-wide, 3-line float. **Used exactly once across app.**
  - Body: Newsreader 400 italic 18px `sand` (or `ivory` on bg-quote for extra contrast), line-height 1.55, max 72ch.
  - Subsequent paragraphs: 16px italic, 12px top margin.
- Byline: Newsreader 400 italic 12px `dust` — `"Penned by Kalori, resident model"` with **"Kalori" in small-caps** (`font-variant-caps: small-caps`) per design-lead §4.4. Right: mono read-time.
- Stale: italic `"A fresh review awaits your word."` + oxblood `GENERATE WEEKLY REVIEW`.
- Sparse-data: `"Need 3+ days of logging this week for an insight."` — no button.
- Generating: 4-line skeleton with pulsing `"DRAFTING..."` chip (opacity 0.4→1.0 at 1.2s loop — under 3Hz WCAG 2.3.1 floor).
- Footer: `"⟶ read the full account"` (design-lead §2.3.5) — **ivory text with 1px oxblood-soft underline** (ux-auditor §1.4 fix). 44×44 hit area.

**Motion:** PPR skeleton→content via `ink-fade` 220ms. Drop cap fades in 120ms AFTER body — "the letter lands last." Hover link arrow translates 2px right, 120ms.

**A11y:** `<article aria-labelledby="weekly-insight-header">`. Drop cap part of paragraph text (not decoration). Generating `aria-busy="true" aria-live="polite"`. Buttons real `<button>` / `<a>`.

#### 7.1.8 First-Time Dashboard State

**Trigger:** `profiles.last_dashboard_visit_at IS NULL OR food_entries.count === 0`.

Inherits full dashboard layout with modifications:
- Masthead title override: `WELCOME TO YOUR LEDGER, {firstName.toUpperCase()}` (Newsreader 44 ivory). Subtitle italic `"Your first meal begins the record."`
- Chronometer: ring hairline-strong unfilled; numerals in dust; center text italic 18px dust `"— log your first meal —"`. No projection, no now-indicator.
- Macro bars: 0/target at 0.5 opacity; values in dust.
- Meals bulletin: 5 empty kickers with italic `empty`. Banner 2px oxblood top + `NO ENTRIES YET`. CTA mobile: `Tap + to log`. CTA desktop: `Press 'n' or click LOG` with `<kbd>` styled bg-2 + rule border.
- Micros panel: hidden — `"The minor elements appear after three days."` dust.
- Weekly insight: hidden.

**Coachmark (`FirstTimeDashboardCoachmark`):** tooltip points at LOG affordance.
- Desktop/tablet: bg-1 card right of sidebar LOG.
- Mobile: above FAB.
- Content: italic 15px ivory `"Press 'n' or click here to log your first meal."` + close `×`.
- `role="dialog" aria-labelledby aria-describedby`. Focus-trapped until dismissed.

**Dismissal (ux-specialist §10.8):** (a) close, (b) outside, (c) Escape, (d) `n`, (e) FAB tap, (f) sidebar LOG tap, (g) first save. Sticky via `localStorage.setItem('kalori.coachmark.log', '1')`.

**Transition:** first save dismisses coachmark; chronometer `chrono-draw` (600ms); macro bars dust→full via `ink-fade`.

#### 7.1.9 Dashboard page-load choreography

See §3.3 above. Implementation: `lib/motion/dashboard-choreography.ts` exports `getDashboardStaggerDelay(element)`. Timings:
- t=0 masthead fade / t=150 kicker ink-fade / t=300 chrono-draw begin (600ms) / t=600 macro-bar rule-draw / t=800 meals bulletin / t=1000 water + micros / t=1200 weekly insight.

Reduced-motion returns 0 for all elements — instant paint.

---

### 7.2 Log Flow (`/log` — 3-tab modal)

#### 7.2.1 LogModal compound (Header/Tabs/Body/Footer)

Per architecture §2.1: monolithic modal replaced with compound API.

```tsx
export const LogModal = {
  Root: LogModalRoot,       // ModalShell + Provider + FocusTrap + body-scroll-lock
  Tabs: LogModalTabs,       // TYPE · SNAP · LIBRARY switcher
  TypePane: LogModalTypePane,
  SnapPane: LogModalSnapPane,    // dynamic-imports browser-image-compression
  LibraryPane: LogModalLibraryPane,
  Confirmation: LogModalConfirmation,  // conditional on phase==='confirmation'
};
```

Phase no longer an if-tree — whether consumer mounts `<LogModal.Confirmation>`. Each pane lazy-loadable.

**Modal shell:**
- Surface: `bg-1` card on `bg-0` 72% scrim (no blur).
- Frame: 1px `rule-strong`; zero radius.
- Sizing: mobile full-screen (safe-area insets); tablet+desktop 720px × 80vh centered.
- Entry motion: **mobile 180ms opacity + bg-scrim darken** (NOT slide-up; design-lead §6.1 — replaces Material Snackbar pattern with Ledger "page materializes"); tablet+desktop 180ms fade + scale 0.98→1.
- Dismissal: Escape (keyboard), backdrop click. If draft has >2 chars typed OR photo captured, shows inline `DISCARD UNSAVED ENTRY?` confirm prompt with KEEP EDITING / DISCARD.
- Scroll lock + `inert` attribute on background routes (a11y).
- `role="dialog" aria-modal="true" aria-labelledby={tab_title_id}` (ux-auditor A8).

**Tab switcher:**
- Inter 10.5px UPPERCASE tracking 0.22em.
- Default `dust`; active `ivory` + 2px `oxblood` underline with **1px ivory serif end-caps** (design-lead §2.4.1 — draftsman-ruled).
- Non-active tabs get 1px `rule` hairline above — tablist row reads as complete ruled header.
- Keyboard: `ArrowLeft`/`ArrowRight` moves between tabs; `Home`/`End` jumps first/last.
- 44×44 min tap target.

#### 7.2.2 TAB 1 Type (Gemini text parse; F11/F12 mitigation UX)

**Layout:**
- **Visible label above textarea** (ux-auditor §7.1 fix): Inter 10.5 UPPERCASE `dust` tracking 0.18em — `"DESCRIBE YOUR MEAL"`.
- Textarea: Newsreader 20px ivory, **line-height 1.5** (ux-specialist §1.4 fix — was 1.4), autosize 12→20 lines. Placeholder `"Describe what you ate — in any language"` italic sand. Bottom 1px `rule` hairline only. Focus 2px **ivory** outline + 2px offset. Caret `oxblood`.
- Copy-yesterday affordances (when prior-day meals exist): row of links `COPY YESTERDAY'S BREAKFAST` / `LUNCH` / `DINNER` — Inter 10.5 UPPERCASE `oxblood` tracking 0.22em, 44×44 tap.
- **PARSE button:** Inter 10.5 UPPERCASE tracking 0.22em `ivory` on `oxblood` fill; hover `oxblood-soft`. Mobile full-width 44px tall; tablet/desktop 240px centered 44px.
- Helper copy: **Newsreader italic 13px sand** (design-lead §4.2 — replaces Inter caps with literary voice): *"Enter parses · shift+enter for a new line."* Mono glyphs for literal keys only.

**States:**

| State | Visual |
|---|---|
| Empty/idle | Textarea visible; button disabled (`opacity: 0.4 + cursor: not-allowed + aria-disabled="true"`) |
| Typing (>2 chars) | Button enabled; char count JetBrains Mono 10.5 `dust` bottom-right |
| Parsing | Button `"PARSING..."` + 1px spinner; textarea `readOnly`; **bg-1→bg-2 tonal shift** instead of opacity (ux-auditor §1.4 fix). Abortable via Escape (`AbortController`) |
| Success | 180ms ink-fade to Confirmation |
| AI failure (F7/I7) | Banner above textarea: `ember` 2px top rule + bg-2 fill + Inter 14 ivory `"AI couldn't parse — enter manually or try again"` + MANUAL ENTRY (oxblood) + RETRY (outline). Both 44×44 |
| Auth expiry (F12) | F12 interceptor retries once; on 2nd 401 redirect `/login?next=/log&restoreTab=type`; sessionStorage draft persists |

**Parsing contract (F11 mitigation):** user text injected as separate `parts` entry in Gemini content array — NEVER string-concatenated into system prompt template. Zod schema caps `ai_reasoning` at 500 chars + strips control chars server-side.

**A11y:**
- `aria-describedby` linking textarea to error banner (ux-auditor §7.2).
- `aria-required="true"` once form submits.
- Parsing announced via `aria-live="polite"`.
- Screen-reader: "Parsing...", "Parsed 3 items", "Parse failed".

#### 7.2.3 TAB 2 Snap (vision + I4 photo-retention UX)

**Layout:**
- Camera/upload surface: mobile full-width 4:3; tablet/desktop 480×360 centered. 1px `rule-strong` border on `bg-2`.
- Placeholder: lucide `Camera` 48px dust + Inter 10.5 UPPERCASE `dust` `"TAP TO CAPTURE A MEAL"`.
- **CAPTURE button:** 56×56 zero-radius square, `oxblood` fill, ivory 1.5px stroke inner circle (camera aperture glyph) centered. Press motion: **120ms opacity 1→0.85→1 + 2px ivory inner stroke appears for 120ms** (design-lead §6.3 — shutter click, not button scale).
- UPLOAD INSTEAD link below: Inter 10.5 UPPERCASE `oxblood` tracking 0.22em; opens OS file picker.
- **Drag-drop zone** added on desktop (ux-specialist §4.4): surface becomes 2px dashed `oxblood` border on drag-enter.
- Post-capture: 160×160 thumbnail (1px `rule-strong`) + RE-TAKE (outline) + ANALYZE (oxblood) — both 44px.

**SnapDraft discriminated union (tiebreaker #16):**

```ts
type SnapDraft =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'compressing'; progress: number }
  | { status: 'uploading'; progress: number; thumbnailDataUrl: string }
  | { status: 'analyzing'; thumbnailDataUrl: string; abortController: AbortController }
  | { status: 'done'; thumbnailDataUrl: string; parsed: ParsedItem[] }
  | { status: 'error'; error: string; thumbnailDataUrl: string | null };
```

**States (mapped to discriminant):**

| State | Visual |
|---|---|
| Idle (permission) | Live preview + CAPTURE enabled |
| Permission denied | `bg-2` fill + italic 14 sand `"Camera unavailable — UPLOAD INSTEAD"` + oxblood link |
| Captured | Thumbnail + RE-TAKE / ANALYZE row |
| Compressing | `"COMPRESSING..."` + 1px `oxblood` depleting bar ~800ms |
| Uploading | `"UPLOADING..."` + circular 24px spinner (oxblood 2px, 900ms rotation) |
| Analyzing | `"ANALYZING..."` + spinner; thumbnail ghosted at 0.7 opacity |
| Success | 180ms ink-fade to Confirmation; thumbnail persists inset top-right of confirmation (72×72) |
| AI failure | Same fallback banner as TAB 1 |

**Photo retention policy (I4):** original uploaded to Supabase Storage `food-thumbnails/{userId}/{entryId}/original.jpg`. **Immediately post-analysis**, server deletes original and generates <50 KB thumbnail. UI surfacing: user never sees the original after analyze completes; thumbnail is what persists on `food_entries.thumbnail_url` and (if save-to-library on) `food_library_items.thumbnail_url`.

**Auth expiry (F12):** refresh interceptor retries upload + analyze once; on 2nd 401 redirect `/login?next=/log&restoreTab=snap`. **Thumbnail blob NOT persisted across login** (I4 retention) — re-upload required.

**A11y:** `aria-live="polite"` announces `"Photo captured"`, `"Uploading"`, `"Analyzing"`, `"Analysis complete"`. Capture button `Space`/`Enter` operable.

#### 7.2.4 TAB 3 Library (search + card grid)

**Layout:**
- **Visible label above search** (ux-auditor §7.1): Inter 10.5 UPPERCASE `dust` — `"SEARCH LIBRARY"`.
- Search input: 44px, Inter 14 ivory, placeholder `"Search library"` dust italic. `type="search"` (ux-auditor §7.5). `bg-1` + bottom 1px `rule` only. Focus: bottom border thickens 2px `oxblood` + 2px ivory outline. Left: lucide `Search` 18px dust. `/` hotkey chip right side (desktop/tablet).
- Grid: 1-col mobile / 2-col tablet (16px gutter) / 3-col desktop (16px gutter). **Vertical column hairlines** between cards even in this compact picker (design-lead §1.3 — preserves metaphor).
- Library item card (160×120): 1px `rule-strong` border, `bg-1`; hover `bg-2` (tonal only). Thumbnail 56×56 left + right column name/kcal/date.
- **Letter-mark fallback** (per tiebreaker #7): `bg-2` background + **2px oxblood top rule** + `sand` 28px Newsreader 300 letter (NOT oxblood bg + ivory letter).
- Name: Newsreader 16 `ivory` 2-line clamp.
- kcal/portion: Inter 10.5 UPPERCASE `sand` tracking 0.22em.
- Last-used: JetBrains Mono 10.5 `dust`.

**States:**

| State | Visual |
|---|---|
| Empty (zero items) | Centered italic 14 dust `"No library items yet — log something to save it."` + OPEN TYPE outline button |
| Idle | Grid, sorted most-used desc by `log_count` |
| Searching | Debounced 150ms filter on cached library list (from RSC props, NOT from `useLibraryStore` — per tiebreaker #17). Matched substring highlighted `<mark bg-oxblood/10 text-ivory>` |
| No results | Centered italic 14 dust `"No matches for 'X' — try different words"` |
| Item tap | 120ms → opens Portion Picker (§7.2.5) |
| Long-press / right-click | Context menu: `EDIT ITEM` (routes `/library/[id]`) |

**Search filter:** matches `normalized_name` (lowercase + punctuation-stripped) substring; NOT fuzzy (design-doc invariant — normalized-equality only). For sets ≥200 rows, server fallback `GET /api/library/search?q=`. CSS-filter approach (`display:none` on non-matches) used when client-side.

**A11y:** grid `role="listbox"` with `aria-activedescendant` tracking keyboard cell; each cell `<button role="option">`. Arrow keys navigate; Enter selects.

#### 7.2.5 Portion Picker (REDESIGNED per design-lead)

**Per tiebreaker #12:** Replace generic `[−][value][+]` stepper with **flush-serif layout**.

**Layout (desktop/tablet, ≥768px) — flush-serif primary surface (tiebreaker #12):**
- Floating panel 360×280 anchored to selected card, `bg-2`, 1px `rule-strong`.
- Dismiss: Escape / outside / explicit `×`.

**Layout (mobile, <768px) — wheel-picker bottom-sheet (tiebreaker #23):**
- Bottom-sheet slide-up 180ms (use `motion.standard` from `lib/motion/defaults`), 50vh, `bg-2`, 1px `rule-strong` top edge. Hosted in Radix Dialog so existing focus-trap / Escape semantics carry through.
- Preset chips (HALF · FULL · DOUBLE) sit ABOVE the wheel — same Inter 10.5 UPPERCASE `oxblood` tracking 0.22em + 44×44 + 1px `rule-strong`; tapping a chip pre-snaps the wheel.
- `MobileWheelPicker` (§4.1.10): 5 visible rows, 44px row height, oxblood center underline, ivory active label, dust-faded ±1/±2 rows. Step 0.25 over range 0.25–10 (40 items — within the §10.6.1 high-cardinality cap).
- Unit segmented control PORTION / G / ML stays directly below the wheel (unchanged).
- `−` / `+` 44×44 nudge buttons drop on mobile (the wheel replaces them). Desktop keeps them.
- Explicit `DONE` action at sheet base — full-width 56px Inter 10.5 UPPERCASE `ivory` on `oxblood`. Outside-tap = cancel (no commit). Required because mobile sheets cannot reliably commit on blur.

**Stepper redesign (flush-serif value × unit) — DESKTOP/TABLET ONLY:**
- Centered value: `1 × PORTION` typesetting.
  - Number: Newsreader 400 48px `ivory` tabular-nums centered, flush-left relative to `×`.
  - Multiplication sign `×`: Newsreader 400 italic 28px `sand` with 16px margin left/right.
  - Unit: Newsreader 400 italic 18px `sand` flush-right.
- Sub-row below (changes on step): *`one half portion · 140 g`* (Newsreader italic 14 sand).
- `−` / `+` keyboard-accessible side buttons: **44×44 hairline-strong outline** buttons flanking the value row. Tab-focusable with 2px ivory ring.
- Preset chips below: HALF · FULL · DOUBLE — Inter 10.5 UPPERCASE `oxblood` tracking 0.22em, 44×44 min, 1px `rule-strong` border. Active: 2px `oxblood` bottom underline.

**Unit selector:** segmented control PORTION / G / ML with 2px oxblood underline on active (only supported units shown per library item).

**"LOG THIS" button:** full-width sheet, 56px tall, Inter 10.5 UPPERCASE `ivory` on `oxblood`; hover `oxblood-soft`.

**Save action (optimistic per I8, I11):**
1. Generate `client_id = crypto.randomUUID()`.
2. Compose entry locally.
3. `useOptimistic` insert into meals bulletin today cache.
4. Close modal immediately.
5. Fire `saveEntryAction({ client_id, ... })` Server Action.
6. On success: push Undo Toast.
7. On failure: rollback via `useOptimistic`; surface error toast + RETRY; re-open modal pre-populated.

**Skip Confirmation:** Library flow bypasses Confirmation Screen (library items have stored nutrition; no AI reasoning). `"REVIEW BEFORE SAVING"` secondary link (Inter 10.5 UPPERCASE `dust`) reopens confirmation manually.

**A11y:** `<label for="portion-qty">` (ux-auditor §7.1). Stepper `role="spinbutton" aria-valuenow aria-valuemin aria-valuemax`. ArrowUp/ArrowDown on focused value also step.

#### 7.2.6 Confirmation compound (ItemList / Reasoning / MealSlot / Save)

Per architecture §2.2: compound API. `source === 'library' | 'manual'` gates Reasoning and SaveToLibraryToggle via context — no props, no if-branches.

**Layout:**
- Full modal takeover within same shell. Tab switcher hides during `phase === 'confirmation'`.
- Entry motion: **320ms** `motion-expressive` (reduced from 600ms per ux-specialist §7.1 — 600 was too slow for repeat interaction).
- Mobile full-screen stacked scroll; tablet+desktop 720px centered 80vh internal scroll.

**Top section:**
- Inter 10.5 UPPERCASE `sand` tracking 0.22em: `"KALORI'S LEDGER READS:"`
- Double hairline below (1px `rule` + 4px gap + 1px `rule-strong`).

**`<ConfirmationContext>`:**

```ts
interface ConfirmationContent {
  source: 'text' | 'photo' | 'library' | 'manual';
  client_id: string;
  items: ParsedItem[];
  ai_reasoning: string | null;
  thumbnailUrl: string | null;
  mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  loggedAt: string;
  saveToLibrary: boolean;
  dedupMatch: FoodLibraryItem | null;
}
type ConfirmationLifecycle = { status: 'editing' } | { status: 'saving' } | { status: 'error'; error: string };
type ConfirmationState = ConfirmationContent & { lifecycle: ConfirmationLifecycle };
```

**Items list (ItemList child):**
- Each row: `[Food name + sub] [Stepper] [Macros strip] [kcal right-aligned]`.
- Name: Newsreader 20 `ivory` line-height **1.5**. Editable on tap.
- Sub: Newsreader italic 14 `sand` `"one bowl · 280 g"`. Editable.
- **Stepper (desktop/tablet, ≥768px): 44×44 min inline** (ux-auditor §4.3 fix — raised from 36×28). Existing `[−] [number input] [+]` row kept.
- **Stepper (mobile, <768px) — tap-to-open `MobileWheelPicker` bottom-sheet** per tiebreaker #23. Tap the portion value to open the same Radix Dialog wheel-sheet shell as Portion Picker §7.2.5; range 0.25–10 step 0.25 (40 items). The kicker label (`PORTION`) stays inline; the value cell becomes a button (`role="button" aria-haspopup="listbox"`) showing the current value + `▾`. Unit segmented control inside the sheet. DONE commits; outside-tap or Escape cancels with no commit. Reduced-motion → instant snap (§9.3).
- Macros strip: JetBrains Mono 10.5 dust `P · C · F` labels; Newsreader 14 ivory values; mini-bars per macro (ivory/ochre/ember).
- kcal: Newsreader 24 tabular ivory; KCAL sub Inter 10.5 dust.
- Row separator: 1px `rule`.
- Delete-from-confirmation: swipe-left mobile / hover `×` (44×44) desktop.
- **"· REPORT" link** per item (desktop/tablet only; long-press menu on mobile): flags `ai_call_log.user_flagged = true`.

**Reasoning child ("Why these numbers?") — source-gated:**
- Hidden if `source === 'library' | 'manual'`.
- Collapsed: Inter 10.5 UPPERCASE `oxblood` tracking 0.22em `"WHY THESE NUMBERS?"` + `▸` caret. 1px `rule-strong` top+bottom (double-sandwich).
- Expanded: Newsreader 15 `sand` line-height 1.6. If ingredient-confidence triples present, renders table (ingredient italic sand · source+confidence mono dust · kcal newsreader ivory). **1px `ember` left border** (editor-commentary chrome).
- Surface: `bg-quote` inset (per design-lead §3.2 — propagates footnote-commentary token).
- **Sources clickable** (ux-specialist §7.1): `"sources · usda.sr30 · openfoodfacts"` — each source a link opens in new tab.
- **AI confidence low indicator**: italic serif "estimate" footnote inline + aria-describedby flag.
- `<button aria-expanded aria-controls="why-body">` (ux-auditor A11).

**MealSlot child — REDESIGNED (tiebreaker #12):**
- **Kicker-row radio pattern** replacing 4-chip row.
- 4 rows stacked vertically, each row: mono `§ 01` / `§ 02` / `§ 03` / `§ 04` + Inter caps label `BREAKFAST` / `LUNCH` / `DINNER` / `SNACK`.
- Active row: 2px `oxblood` LEFT border (same grammar as sidebar nav active state).
- Default: 1px `rule` row separator.
- Auto-selected on load by time-of-day (user TZ per F5): 5-10:59 Breakfast, 11-15:59 Lunch, 17-21:59 Dinner, else Snack.
- Editable: user tap overrides.
- Keyboard: `1`/`2`/`3`/`4` when focus inside picker (focus-scope guarded per WCAG 2.1.4).
- `role="radiogroup" aria-labelledby="meal-category-label"` wrapping 4 `<input type="radio">` with labels (ux-auditor A10, A11.4).

**TimeEditor child:**
- Kicker: `LOGGED AT`.
- Field: JetBrains Mono 14 `ivory` showing `HH:MM · DD MMM YYYY`.
- **Desktop/tablet (≥768px):** tap opens native date+time picker (styled via shadcn date-picker wrapper per ux-specialist §4.4).
- **Mobile (<768px) — tiebreaker #23:** the `HH:MM` portion opens a two-column `MobileWheelPicker` (hours `00`–`23`, minutes `00`/`05`/.../`55` — 24+12=36 items, well inside the §10.6.1 cap) inside the Radix Dialog wheel-sheet shell. The `DD MMM YYYY` portion keeps the native date picker (browsers render an OS-level wheel for `<input type="date">` already; per §10.6.1 we don't shim what's already native). DONE commits; outside-tap or Escape cancels. Reduced-motion → instant snap (§9.3).
- Default: `now()`. Backfill up to 30 days (I8 — Zod + client `min` attr).

**SaveToLibraryToggle child — source-gated:**
- Hidden if `source === 'library'`.
- Row: Inter 10.5 UPPERCASE `sand` `"FILE UNDER"` with **oxblood `⟶`** then normalized-name italic serif (design-lead §2.4.4 typographic flourish — reads as archivist filing).
- Toggle: 48×24 rectangular (zero-radius), bg-2 track + 1px rule-strong, 20×20 ivory knob sliding L→R. Active: `oxblood` track + ivory knob. **Hit area 44×44** (ux-auditor §8.1). `role="switch" aria-checked aria-labelledby` (ux-auditor A12).
- Default: ON (unless library-sourced).
- Normalized-name dedup prompt (when match exists): ember 1px top rule + bg-2 fill banner — Inter 14 ivory `"A library entry with this name already exists."` + **REUSE EXISTING (oxblood primary)** + CREATE NEW (outline) — weighting REUSE as primary per ux-specialist §7.1.

**SaveAction child:**
- "SAVE TO LEDGER" button. Mobile full-width minus 12px side padding, 56px. Tablet+desktop 360px centered 56px. Inter 10.5 UPPERCASE `ivory` on `oxblood`; hover `oxblood-soft`. On press: `+` mark ink-fades to `✓` (design-lead §6.4 — literal "file-it" gesture).
- Secondary DISCARD link: Inter 10.5 UPPERCASE `dust`; hover `oxblood`.
- **"← EDIT INPUT" tertiary link** (ux-specialist §7.1 fix): returns to tab with preserved draft.

**Save contract (optimistic per I8, I11, F12):**
1. Generate `client_id` before network.
2. `useOptimistic` insert into meals bulletin cache.
3. Close modal immediately.
4. Fire `saveEntryAction` Server Action through F12 refresh-interceptor.
5. Server `UNIQUE(client_id)` enforces idempotency.
6. Server `updateTag(TAGS.userEntries(uid, day))` + optional `TAGS.userLibrary(uid)`.
7. On success: push Undo Toast.
8. On failure: rollback `useOptimistic`; error toast + RETRY; re-open modal in confirmation phase with preserved state.

**A11y:**
- `<form role="dialog" aria-modal="true" aria-labelledby="confirmation-title">` (ux-auditor A10).
- Confirmation title `"KALORI'S LEDGER READS"` = `aria-labelledby` target.
- Inline errors linked via `aria-describedby` + `aria-invalid="true"`.
- Save button uses `useFormStatus().pending` (react-perf §5.1).

#### 7.2.7 Undo Toast LIFO system

**Per tiebreakers #7 + #12:**
- Left rule: **2px `ember`** (NOT oxblood — reserves oxblood for editor-voice card only).
- Countdown: **5 bullet dots ●●●●●** that toll, NOT depleting bar.

**Trigger events (cross-cutting per I8):**
- Log entry saved (any flow), water +glass/+bottle, weight add, library edit/delete/merge-denied-with-confirm/bulk-delete, copy-yesterday (single batched toast), entry deleted from meals bulletin.

**Layout:**
- Position: mobile `bottom: calc(56px + env(safe-area-inset-bottom) + 72px)` (clears FAB + 8px); tablet 24px from viewport bottom; desktop 24px from bottom centered within content column.
- Dimensions: mobile 80vw max; tablet+desktop 480px fixed (or scales 360–640px per design-lead §5.3).
- Surface: `bg-2` fill, 1px `rule-strong` all sides, **2px `ember`** left edge.
- Padding: 16px horizontal, 12px vertical.

**Content:**
- Left (flex-grow): Inter 14 `ivory` dynamic description:
  - `"LOGGED '3 EGGS' (+240 KCAL)"`
  - `"DELETED ENTRY · AVOCADO TOAST"`
  - `"COPIED 5 ENTRIES FROM YESTERDAY"`
  - `"+1 GLASS · WATER"`
  - `"MERGED — NO UNDO"` (non-undoable informational per tiebreaker #4)
- Right: **UNDO** link — Inter 10.5 UPPERCASE `oxblood` tracking 0.22em; hover `oxblood-soft` underline; 44×44 tap.

**Countdown (5-bullet tolling — tiebreaker #12):**
- 5 dots `●●●●●` top-right corner of toast, 6px each, oxblood initially.
- Each dot fades oxblood → dust at 1s intervals (1.0s, 2.0s, 3.0s, 4.0s, 5.0s).
- At t=5000ms: toast auto-dismisses.
- Hover pause (desktop): mouse over toast pauses countdown; mouse-out resumes from current position.
- Reduced-motion fallback: same 5 dots, fade via 5 discrete steps (no animation per tiebreaker #12).

**LIFO stacking (per I8):**
- `useUndoQueueStore` Zustand LIFO stack.
- Only top toast visible + has active UNDO.
- New save event while toast visible: current toast slides down 120ms + fades, retained hidden in stack; new toast slides in 180ms. **Stack depth >1: `"+N MORE SAVED"` sub-text** (ux-specialist §7.2 visibility push).
- Displaced toast timer continues in background; on expiry, destructive action commits; removed from stack.
- When visible toast dismisses, next in stack surfaces if still within 5s window.

**Cleared on navigation:** route change auto-dismisses with 120ms fade; pending destructive actions commit (per I8 design intent).

**Undo action:**
1. User taps UNDO / presses Enter.
2. Toast shifts to "undoing..." state.
3. Zustand reverses per action-type:
   - **Save**: remove optimistic row; fire `DELETE /api/entries/{id}?client_id=X` with tombstone-respecting idempotent handler.
   - **Delete**: re-insert local row; fire POST with original `client_id` (I11 replay).
   - **Edit**: write pre-edit snapshot; fire PATCH with pre-edit payload.
   - **Merge**: **NOT undoable** (tiebreaker #4 + design-doc §18.3) — toast informational only.
   - **Bulk-delete**: different from merge — IS undoable within 5s via `deleted_at` tombstone resurrect.
4. Success: 120ms fade-out + 1s "RESTORED." banner.
5. Failure: re-apply original change locally; error toast replaces.

**A11y:**
- Toast inside `aria-live="polite"` region.
- `role="status"`.
- UNDO link focusable in natural tab order when toast visible.
- 44×44 UNDO tap target.
- Countdown `aria-hidden="true"` (decorative).
- Color not sole signal: 5 discrete bullets + "UNDO" text.

#### 7.2.8 Log flow data flow diagram

```
LOG MODAL (TAB selection → draft)
  ↓
TYPE  → POST /api/ai/text-parse (F11 parts-array + Zod 500-char cap)
SNAP  → compress + POST /api/ai/vision (I4 thumbnail-only)
LIBRARY → select item → Portion Picker → (optional) skip to save
  ↓
CONFIRMATION (phase === 'confirmation')
  ├─ edit items inline · review Why-panel · pick meal · pick time
  └─ save-to-library toggle + dedup-merge prompt
  ↓
SAVE ACTION (client_id generated BEFORE optimistic insert)
  ├─ useOptimistic insert · close modal
  └─ fire saveEntryAction Server Action (F12 refresh-interceptor)
  ↓
Server: UNIQUE(client_id) idempotency (I11) · updateTag(TAGS.userEntries(uid,day)) (I12)
  ↓
UNDO TOAST (5s LIFO · cleared-on-nav · ember left rule · 5-bullet countdown)
  ├─ user undo → tombstone/delete/patch reversal
  └─ timeout → commit
  ↓
DASHBOARD UPDATES (chronometer redraws · macro bars tick · meals bulletin re-renders)
```

**Cross-cutting concerns:**
- **Undo Toast consumed by all mutating components** — not just Log modal. Agent 3 (water/weight), Agent 5 (library edit/delete/bulk-delete), Agent 6 chart deletions all emit `useUndoQueueStore.pushToast()` via same contract. I8 load-bearing surface.
- **Copy-yesterday emits ONE batched toast** ("COPIED 5 ENTRIES") — not per-entry.
- **F12 refresh-interceptor wraps every network call** in flow (parse, vision, save, delete, patch). Task 2.1 contract.
- **sessionStorage draft persistence** applies to TYPE text + LIBRARY selection + Confirmation edits. NOT SNAP blobs (I4 retention excludes).

---

### 7.3 Library (`/library`)

#### 7.3.1 Library Page Overview

**Route:** `/library`. **Purpose:** read-heavy archive of every `food_library_items` row — catalogue of personal pantry. Layout (top→bottom):
1. Masthead — `§ 03 · PERSONAL LIBRARY` / "THE LIBRARY" / count meta / double hairline.
2. Tools rail — search / filter / sort / multi-select.
3. Ruled grid — 4/3/2 col with drawn column+row hairlines.
4. Bulk action bar — anchored sheet when ≥2 selected.
5. Drill-in overlay — FoodDetail compound (right-sheet desktop, bottom-sheet mobile).

**Data source:** Server-rendered via Cache Components keyed `TAGS.userLibrary(uid)`. Supabase `select * from food_library_items where user_id = auth.uid()` — RLS (`food_library_items_select_own`) guarantees scoping.

**Mutations:** all writes carry `client_id` UUID generated client-side before optimistic UI (I11). Server `UNIQUE(client_id)` enforces idempotency; replayed offline POSTs return 200 no-op.

**Cache invalidation:** every mutation `updateTag(TAGS.userLibrary(uid))` + `updateTag(TAGS.userEntries(uid, day))` when FK repoints affect day cache.

**Empty state:** centered editorial card — Newsreader 400 italic 22px sand `"No titles yet filed."` + Inter 14 dust `"Log a meal by text or photo and we will file it here."` + oxblood `OPEN THE LOG FLOW` button → `/log?tab=type`.

#### 7.3.2 Masthead + Tools Rail

**Masthead:** reuses shared primitive; library-specific content:

| Element | Token |
|---|---|
| Kicker | `§ 03 · PERSONAL LIBRARY` — Inter 500 10.5 UPPERCASE tracking 0.22em `dust` |
| Title | "THE LIBRARY" — Newsreader 300 44 ivory tracking −0.02em |
| Subtitle | `"YOUR SAVED FOODS · {N} ITEMS"` — Inter 500 10.5 UPPERCASE tracking 0.18em `sand` |
| Meta (right) | `"LAST ADDED · APR 17, 2026 · 22:03"` — JetBrains Mono 400 11 dust |
| Divider | Double hairline (2× 1px `rule-strong` with 6px gap) |

**Tools rail:**
- Desktop 1280+: three-column flex `3fr · 1fr · 1fr` with SELECT floating inline after sort (asymmetric per design-lead §2.5.1 — anti-generic admin pattern). Above search: **mono kicker `§ FIND`** (JetBrains Mono 10.5 dust).
- Tablet: same; SELECT wraps below sort on narrow.
- Mobile: stacked — row 1 search full-width 44px, row 2 filter + sort 1fr each, row 3 SELECT right-aligned oxblood text button.

**Search input (3.2):**
- 44px height, `bg-1`, 1px `rule-strong` border, zero-radius.
- Icon: Phosphor `MagnifyingGlass` 16px `dust` left.
- Input: Inter 400 14 `ivory`; placeholder `"Search library"` `dust`; **`type="search"`** (ux-auditor §7.5).
- `/` hotkey chip right (JetBrains Mono 10 `dust`, 1px `rule` border, 2px 6px padding).
- Focus: 1px `oxblood` border + 2px **ivory** outline (tiebreaker #1).
- Real-time debounced **150ms**; matches `normalized_name` substring.
- Escape clears query + blurs.
- Empty-results: centered italic 22 sand `"No titles match '{query}'."` + dust sub `"Try a shorter word or check the spelling."`

**Filter dropdown (3.3):**
- 44px, bg-1, 1px `rule-strong`. Label prefix `FILTER` Inter 10.5 UPPERCASE `dust`. Selected value Inter 10.5 UPPERCASE `sand`.
- Options: ALL (default) · WITH PHOTOS · NO PHOTOS · LOGGED THIS WEEK.
- Open: zero-radius panel, `bg-1`, 1px `rule-strong` via Radix `DropdownMenu`. Each option 40px tall (raised to **44px** per ux-auditor §8.1). Active shows oxblood left 2px inset strip (not checkmark).
- Motion: open 180ms fade + **translateY 4px from below** (ux-specialist §5.4 — `hierarchy-motion`, entering from below = deeper).

**Sort dropdown (3.4):** same visual; options MOST LOGGED (default) · LAST USED · NAME A-Z / Z-A · KCAL LOW-HIGH / HIGH-LOW.

**Persistence:** `sessionStorage` keys `library:sort` + `library:filter`. Cleared on logout.

**SELECT button (3.5):**
- Idle: Inter 500 10.5 UPPERCASE tracking 0.22em `oxblood` + Phosphor `CheckSquare` 14px left (6px gap). Padding `10px 0` preserving 44×44.
- Active (mode on): label `CANCEL` `dust`; 2px oxblood hairline below tools rail via `rule-draw` 320ms — "select mode on" indicator persists when scrolled.
- Toggle never navigates. Background tap does NOT exit — user taps CANCEL or Escape.
- Keyboard: Escape exits + clears. Shift+click range-selects desktop. Cmd/Ctrl+A selects all visible.

#### 7.3.3 Library Grid (4/3/2 col ruled)

**Breakpoints:**

| Breakpoint | Columns | Gutter | Aspect | Card content |
|---|---|---|---|---|
| Desktop 1280+ | 4 | 0 (drawn rules) | 1:1 | 240×240 |
| Tablet 768–1279 | 3 | 0 | 1:1 | 220×220 |
| Mobile 375–767 | 2 | 0 | 1:1 | 160×160 |

**Ruled grid CSS (per tiebreaker #5):** `gap: 0` + drawn hairlines (mockup canonical). Every row+column boundary is a `rule` hairline; cells share hairlines. No rounded corners, no card borders beyond the grid rules. Empty cells in partial final row render as inert `<div>` nodes to keep grid visually closed.

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
  padding: 24px 20px;  /* normalized from 22/20/24 per ux-specialist §2.3 */
  position: relative;
}
```

#### 7.3.4 LibraryCard compound (Thumbnail/SelectionChip/Meta)

Per tiebreaker #14: 5 booleans → 1 `active` prop + CSS pseudo-classes + composition (architecture §7.1).

```tsx
<LibraryCard.Root active={selected} as="button">
  <LibraryCard.Thumbnail src={item.thumbnail_url} fallback={<LetterMark name={item.display_name}/>}>
    <LibraryCard.MonoTag>MEAL · {date}</LibraryCard.MonoTag>
    <LibraryCard.CountBadge>logged {n}×</LibraryCard.CountBadge>
  </LibraryCard.Thumbnail>
  <LibraryCard.Name>{item.display_name}</LibraryCard.Name>
  <LibraryCard.Portion>{item.portion}</LibraryCard.Portion>
  <LibraryCard.Divider />
  <LibraryCard.Footer>
    <LibraryCard.Kcal>{item.kcal}</LibraryCard.Kcal>
    <LibraryCard.Macros>{`P ${p} · C ${c} · F ${f}`}</LibraryCard.Macros>
  </LibraryCard.Footer>
  {inSelectMode && <LibraryCard.SelectionChip/>}
</LibraryCard.Root>
```

**Anatomy:**
- Thumbnail zone: `aspect-ratio: 4/3`, `bg-2`, 1px `rule` border, `overflow: hidden`. Photo `<img object-fit: cover>` with 0.85 opacity (hover lifts to 1.0). Alt text `{display_name}`.
- Overlay chips: `mono-tag` top-left (`MEAL · 06.03` or `ITEM · 02.01`) JetBrains Mono 400 9.5 `dust` on `bg-0` 1px rule. `count-badge` bottom-right (`logged 47×`) Newsreader italic 11 `sand` on rgba(14,10,8,0.8).
- Text zone:
  - Food name: **Newsreader 400 18px** desktop (bumped from 16 per design-lead §4.1) / **15px T5-small** mobile / `ivory` line-height 1.25. 2-line clamp.
  - Portion: Newsreader 400 italic 12.5 `sand` margin-top 4px. `"{default_portion} {default_unit}"`.
  - Divider: 1px dotted `rule` margin-top **12px** (ux-specialist §2.1 normalized from 10).
  - Metadata row: `{kcal}` Newsreader 400 16 `ivory` tabular + small `KCAL` Inter 500 9.5 UPPERCASE tracking 0.15em `dust`. Right: `P {p} · C {c} · F {f}` JetBrains Mono 400 10.5 `dust`.

**Letter-mark fallback (tiebreaker #7):** **`bg-2` background + 2px `oxblood` TOP rule + `sand` letter** (Newsreader 300 48 tablet+ / 32 mobile, tabular lining, centered). NOT oxblood bg + ivory letter (Agent 5's §10.2 proposal rejected per design-doc §10.6 authority + design-lead §3.1 anti-diffusion).

**Letter-mark algorithm:**
```ts
function computeLetterMark(displayName: string): string {
  let s = displayName.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, "");
  const firstGrapheme = [...s][0] ?? "";
  const decomposed = firstGrapheme.normalize("NFKD");
  const stripped = decomposed.replace(/\p{Mark}/gu, "");
  if (/^\d/.test(stripped)) return stripped.charAt(0);
  if (/^\p{Letter}/u.test(stripped)) return stripped.charAt(0).toUpperCase();
  return "?";
}
```

Covers: `Phở bò tái nạm` → `P`; `Crème brûlée` → `C`; `2-egg omelet` → `2`; `🍎 Gala apple` → `G`; `Żurek` → `Z`.

**States:**

| State | Trigger | Visual |
|---|---|---|
| Idle | default | bg-0 card, rule borders only |
| Hover | pointer over | bg-0→bg-1 background via `ink-fade` 120ms; image 0.85→1.0 |
| Focus | Tab | **2px `ivory` outline, offset −2px inset** (ux-auditor §1.1 fix — oxblood 2.28:1 fails) |
| Press | pointerdown | `background: bg-0 → bg-2 → bg-1` tonal ripple 180ms (NOT scale per design-lead §6.3 — tonal-only Ledger philosophy) |
| Selected (select mode) | in selection set | 2px oxblood inset border; `SelectionChip` visible |

**SelectionChip (decorative):** 16×16 square top-right offset 12px. Unchecked: bg-0 + 1px oxblood border. Checked: oxblood fill + ivory `Check` glyph (Phosphor bold 12). `aria-hidden="true"`; card itself bears `aria-checked="true|false"` when in select mode (ux-auditor A15).

**Context menu (non-select long-press / right-click):** floating Radix `ContextMenu`, `bg-1`, 1px `rule-strong`. 3 rows at **44px min** (raised from 40 per ux-auditor §8.1):

| Row | Label | Action |
|---|---|---|
| 1 | `LOG NOW` (oxblood) | `/log?tab=library&item={id}` |
| 2 | `EDIT` (ivory) | Opens FoodDetail with edit primed |
| 3 | `DELETE` (oxblood) | Triggers single-item delete confirm |

**Keyboard paths to context menu (tiebreaker #20):** `Menu` key + `Shift+F10` on focused card opens context menu — mandatory per ux-auditor M2.

**A11y:** `role="grid"` on container; `role="row"` on each row; `role="gridcell"` on cells (ux-auditor A14). Card `<button>` as root. Enter/Space toggles selection in select mode; Enter opens drill-in in non-select mode.

#### 7.3.5 Bulk Action Bar

Materializes when ≥2 cards selected.

**Anchor + layout:**
- Desktop/tablet: sticky `top: 0` inside main content column; slides down; `bg-1` + 1px `rule-strong` bottom.
- Mobile: sticky `bottom: env(safe-area-inset-bottom)`; slides up; 1px `rule-strong` top.
- Height: 56px desktop/tablet; 64px mobile.

**Contents (left→right):**
| Cell | Content |
|---|---|
| Count | `{N} SELECTED` — Inter 500 10.5 UPPERCASE tracking 0.22em `sand` |
| MERGE | Inter 500 10.5 UPPERCASE `oxblood` enabled / 0.4 alpha disabled; 44×20 padding |
| BULK DELETE | Same with `oxblood` |
| CANCEL | Same with `dust` |

**State rules:**
| Condition | Merge | Tooltip |
|---|---|---|
| 2 selected | ✓ | — |
| 3+ selected | ✗ disabled | `"SELECT EXACTLY 2 ITEMS TO MERGE"` |

**Motion:** Appear via `ember-pulse` 180ms + translateY from 100% slide. Dismiss reverse 120ms. Reduced-motion: crossfade only.

**Keyboard:** `Delete`/`Backspace` triggers Bulk Delete. `m` triggers Merge (bar visible, exactly 2 selected). Escape exits.

#### 7.3.6 FoodDetail compound (Thumbnail/Macros/History/Actions)

Per architecture §2.4: compound API.

```tsx
export const FoodDetail = {
  Root, Thumbnail, Name, Macros, History, Actions,
};
```

**Route + surface:**
- Desktop 1280+: right-side overlay sheet 640px wide; grid dimmed via `bg-0/60%` scrim. Route `/library/[id]` with `replace` history. **Hero thumbnail bleeds 24px past right edge into sidebar gutter** (design-lead §5.4 — print-design bleed).
- Tablet 768–1279: right-side sheet `min(100vw, 560px)`.
- Mobile: full-sheet from bottom 100vw × 90vh; 1px `rule-strong` top border. 48px drag-handle zone swipes closed.

**Shared-element transition** (desktop/tablet): tapped card's thumbnail animates from grid position to sheet's hero slot via Framer Motion `layoutId`. `motion-expressive` 320ms `ease-editorial`. **Surrounding hairline rules animate in via `rule-draw` 320ms, staggered 60ms after thumbnail lands** (design-lead §6.1 — typesetting metaphor).

**Top bar:**
- 56px, bg-0, 1px `rule-strong` bottom.
- Left: `← INDEX` — Inter 500 10.5 UPPERCASE tracking 0.22em `oxblood` (design-lead §2.5.4 — the library IS the index, print-navigation). Arrow single `←` (U+2190).
- Right: `×` → Newsreader 400 italic 13px sand *close* (italic-serif close, not glyph per design-lead).
- Close: Escape / click-close / back.

**Hero Thumbnail child:**
- Desktop/tablet 320×240 centered; mobile full-width 4:3.
- bg-2, 1px `rule-strong`. Letter-mark fallback (§7.3.4 algorithm).
- Meta chip bottom-right: `FILED · APR 14, 2026 · 22:03` — JetBrains Mono 10.5 `dust` on `bg-0/80%`.
- **Framed nutrition-plate treatment** (design-lead §3.3): kcal hero wrapped in 4-sided hairline frame with 4 ember corner labels (Inter 500 8px UPPERCASE dust): `source`, `recorded`, `portion`, `date`. Turns number into nutrition-label tearsheet.

**Name child (editable):**
- Newsreader 300 32 `ivory`. Tap → inline edit (44px bordered input, 2px oxblood ring on focus).
- Portion line below: Newsreader 400 italic 16 `sand`. Tap → inline edit.
- Edit: Enter commits; Escape reverts.

**Macros child:**
- Kicker `§ 04 · NUTRITION`.
- Kcal hero: Newsreader 300 48 desktop / 40 mobile tabular ivory + KCAL suffix Inter 10.5 UPPERCASE dust.
- Reuses `<MacroBar>` primitive (protein/carbs/fat in ivory/ochre/ember). 4px tall × 240px max width. Labels left; grams right.
- Micro table: 2-col. Left `micronutrient name` Newsreader 400 italic 14 `sand`. Right value + unit JetBrains Mono 400 11 `ivory`. Rows: dotted 1px `rule`. Max 20 before `*Show all micros*` oxblood disclosure.

**History child:**
- Kicker `§ 05 · HISTORY`.
- `FIRST LOGGED · MAR 14, 2026` / `LOGGED 47× TOTAL` — JetBrains Mono 400 11 `dust`.
- `RECENT USES:` header Inter 500 10.5 UPPERCASE tracking 0.22em `dust`.
- Last 5 entries: mono date prefix + Inter 12 sand meal-category.
- If `log_count = 0`: `"NEVER LOGGED — TAP 'LOG THIS NOW' TO BEGIN"` Inter 500 10.5 UPPERCASE `oxblood`.

**Actions child (anchored bottom, 64px desktop / 72px mobile safe-area):**
- `LOG THIS NOW` — primary oxblood, 56px, padding 0 28px, Inter 500 10.5 UPPERCASE `ivory`. Routes to `/log?tab=library&item={id}`.
- `EDIT` — secondary hairline, 56px, Inter 500 10.5 UPPERCASE `sand`, 1px `rule-strong`, padding 0 20px.
- `DELETE` — tertiary icon-only, `Trash` Phosphor 18px `dust` in 44×44 tap area. Hover `oxblood`. Icon-only `aria-label="Delete this item"` (ux-auditor §5.3).

**Edit mutations (pessimistic per architecture.md §4.2):**
- `updateLibraryItemAction({ client_id, fields })` Server Action.
- `client_id` per-edit (one UUID per commit per I11).
- Pessimistic with loading: ember-pulse 180ms on field during in-flight; server response replaces local; error reverts + undo-toast-style error with RETRY.
- `updateTag(TAGS.userLibrary(uid))` (I12).

**Delete:**
- Single-item confirm dialog (reuses §7.3.8 Bulk Delete shell with N=1).
- On confirm: optimistic remove via `useOptimistic`; close sheet; push undo toast `"1 ITEM DELETED · UNDO 5s"` (I4/I8).
- Undo: `POST /api/library/bulk-undo` with `{ client_ids: [original_client_id] }` → resurrect via `deleted_at = null`.
- After 5s: background job permanent-deletes tombstoned row.
- `updateTag(TAGS.userLibrary(uid))` + `updateTag(TAGS.userEntries(uid, day))` for affected days.

#### 7.3.7 MergeDialog compound — NON-UNDOABLE (tiebreaker #4)

**Per design-doc §18.3 authoritative:** merge "cannot be undone, confirm dialog required." Agent 5's proposal for 5s undo with `deleted_at` schema addition is **REJECTED** — `deleted_at` column is NOT in architecture.md §2.4, and the design-doc position stands. Toast is informational only (`"MERGED — NO UNDO"`).

**Delete Agent 5's merge-undo scheme.** Bulk-delete stays undoable (different operation — uses tombstone; see §7.3.8).

**Compound API (architecture §2.3):**

```tsx
<MergeDialog.Root>
  <MergeDialog.Header />
  <MergeDialog.Field name="NAME" fieldKey="display_name" valueA valueB render customInput?/>
  <MergeDialog.Field name="KCAL" fieldKey="nutrition.kcal" valueA valueB customInput={<NumericInput/>}/>
  <details>
    <summary>SHOW MICROS</summary>
    <MergeDialog.Field /* micros */ />
  </details>
  <MergeDialog.Preview />
  <MergeDialog.Actions />
</MergeDialog.Root>
```

`showMicros` boolean removed — caller mounts micro rows inside `<details>` or not.

**Trigger:** exactly 2 cards selected → MERGE button → click → dialog opens. Keyboard `m` also opens.

**Surface:**
- Desktop/tablet 768+: centered modal 640px wide, min-height 560px, max 80vh internal scroll. `bg-0` surface, 1px `rule-strong`. Scrim `bg-0/60%`.
- Mobile: full-screen 100vw × 100vh; 56px top bar with title + close.

**Structure:**
- Kicker `§ 06 · MERGE` top.
- Title `MERGE TWO ITEMS` (Newsreader 300 28 ivory).
- Body (Inter 14 sand): `"Pick which value to keep for each field. The unselected item will be filed as merged and its entry history repointed. This cannot be undone."` (ux-specialist §4.1 — serif italic alternative available).

**Per-field row (each with kicker `§ NAME` / `§ THUMB` / `§ KCAL` etc. per design-lead §2.5.5):**
- Label: Inter 500 10.5 UPPERCASE tracking 0.22em `dust`.
- Option A: radio 16×16 + value styled as library-card field (Newsreader 16 ivory / thumbnail).
- Option B: same with B's value.
- Option C CUSTOM (numeric fields only): radio + native numeric input (Inter 14 ivory, 44px, 1px `rule-strong`).
- **Radio buttons are `<input type="radio" name="{field}" id="{field}-{option}">` with `<label for>` per ux-auditor §11.5.**

**Fields (in order):**
1. `display_name` (text A/B, no CUSTOM)
2. `thumbnail_url` (image/NONE)
3. `nutrition.kcal` (A/B/CUSTOM)
4. `nutrition.macros.{protein,carbs,fat}` (A/B/CUSTOM)
5. `default_portion` (A/B/CUSTOM)
6. `default_unit` (A/B)
7. Micros — collapsed under `Show micros` disclosure

**Default selection heuristic:** pre-select value from item with higher `log_count` (more historical data = likely more accurate). Tie-break by older `created_at`.

**Live preview child:** real library card reusing `<LibraryCard>` compound with chosen values applied real-time. React state updates per radio change. Derived fields:
- `log_count = A.log_count + B.log_count`
- `last_used_at = max(A, B)`
- `created_from = 'photo'` if either has a photo + user kept it
- `client_id` = newly generated UUID at commit time.

**Server contract (atomic transaction):**

```ts
POST /api/library/merge
body: { client_id, winnerId, loserId, fields: { display_name, thumbnail_url, nutrition, default_portion, default_unit } }
response: { winner: FoodLibraryItem }
cache: updateTag(TAGS.userLibrary(uid)), updateTag(TAGS.userEntries(uid, day)) — affected days
```

Server sequence:
1. Lookup `client_id` → return existing winner if replay (I11).
2. `UPDATE food_entries SET library_item_id = winnerId WHERE library_item_id = loserId`.
3. `UPDATE food_library_items SET { fields, log_count = A+B, last_used_at = max } WHERE id = winnerId`.
4. `DELETE food_library_items WHERE id = loserId` (hard delete — no tombstone; operation is final per tiebreaker #4).
5. `updateTag(...)` + `updateTag(...)`.
6. Return merged winner.

**Pre-merge confirm dialog (since non-undoable):** after MERGE » tap, intermediate "THIS CANNOT BE UNDONE" prompt with CANCEL / PROCEED oxblood.

**Toast (informational per tiebreaker #4):** on success, toast appears with text `"MERGED — NO UNDO"` — no UNDO link, 5-bullet countdown still present (informational dismissal), `ember` left rule. Auto-dismisses after 5s.

**Motion:**
- Dialog open: 180ms scrim fade + 320ms content scale 0.98→1 + fade.
- Per-field radio: `ink-fade` 120ms on radio dot; `ink-fade` 120ms on preview field (sequenced, 60ms stagger per design-lead §6.4 — cause-and-effect).
- Live preview update: `ink-fade` 120ms on every field change (crossfade numerals).
- Dialog close: reverse 120ms.
- Reduced-motion: all fades 1ms.

**A11y:**
- `role="dialog" aria-modal="true" aria-labelledby="merge-title"`.
- Focus trap (`<FocusTrap>` primitive).
- First focus: display_name Option A radio.
- Tab order: field-by-field, A → B → C per row.
- Escape closes (Cancel).
- Enter commits only when focus on MERGE ».
- Live preview `aria-live="polite"` on off-screen summary.

#### 7.3.8 Bulk Delete Confirm Modal — UNDOABLE within 5s via tombstone

Different from merge: bulk-delete IS undoable via `deleted_at` tombstone.

**Trigger:** Bulk Action Bar `BULK DELETE` (N≥2); FoodDetail `DELETE` (N=1 variant); card context menu `DELETE` (N=1).

**Surface:** same shell as Merge Dialog — desktop/tablet centered 480px, mobile full-screen. `bg-0`, 1px `rule-strong`, zero-radius.

**Contents:**
- Kicker `§ 07 · DELETE`.
- Title — **Newsreader 300 28 ivory** per design-lead §2.5.6 serif reframe: `"Strike {N} titles from the record?"` (or `"Strike this title from the record?"` N=1). Destructive copy reads as editorial act (striking-through), matches metaphor.
- Body: **Newsreader 400 italic 15 sand** (ux-specialist §4.2 — destructive copy reads gravely in serif italic): `"This cannot be undone after the 5-second grace window."`
- Preview list: up to first 3 display_names (`- ` prefix dust + name Newsreader 400 14 ivory). If N>3, `AND {N-3} MORE` Inter 500 10.5 UPPERCASE dust.
- Actions right-aligned: `CANCEL` Inter 500 10.5 UPPERCASE dust 44px. `STRIKE {N}` oxblood 44px (48 mobile). Enter activates CANCEL first (destructive convention — ux-auditor §9.6).

**Server contract:**

```ts
POST /api/library/bulk-delete
body: { ids, client_ids }  // one client_id per deletion per I11
response: { deleted_count }
cache: updateTag(TAGS.userLibrary(uid)) + updateTag(TAGS.userEntries(uid, day)) — affected days
```

Per tiebreaker #4's scope (bulk-delete IS undoable within 5s): server `UPDATE food_library_items SET deleted_at = now() WHERE id = ANY(ids)`. **Architecture note (flagged for integration with architecture.md):** add `deleted_at timestamptz null` column to `food_library_items` schema — specifically for bulk-delete tombstone. Merge-loser still hard-deletes.

**Optimistic UI + undo (I4/I8):**
- Cards disappear via `ink-fade` 120ms; grid reflows 180ms.
- Toast `"{N} ITEMS DELETED · UNDO 5s"` — LIFO per I8, ember left rule per tiebreaker #7, 5-bullet countdown per tiebreaker #12.
- Undo: `POST /api/library/bulk-delete/undo` with `{ client_ids }` → `UPDATE ... SET deleted_at = NULL WHERE client_id = ANY(...)`.
- After 5s: background job permanent-deletes tombstoned rows.

**A11y:** `role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-body"` (ux-auditor A18). Focus on CANCEL (destructive-default-safe). Escape closes.

#### 7.3.9 Keyboard paths to context menus

Per tiebreaker #20 + ux-auditor M1/M2:

- **Meals bulletin entry rows** (§7.1.4): `Menu` key + `Shift+F10` on focused entry opens `<EntryRow>` context menu (Edit / Delete / Copy to today).
- **Library cards** (§7.3.4): same — `Menu` + `Shift+F10` on focused card opens `LOG NOW / EDIT / DELETE` menu.
- `aria-haspopup="menu"` on both targets.
- Long-press on mobile pairs with same menu (both paths reach same Radix `ContextMenu`).

---

### 7.4 Progress (`/progress`)

#### 7.4.1 Progress Page Overview

The **Almanac** — analytical retrospective of last 7/30/90/365 days. Replaces dashboard's real-time chronometer with 5 ruled analytical sections; signature piece is the 7-nutrient × N-day heatmap.

**Rendering:** PPR shell + Cache Components per section. Each section is an RSC with `'use cache'` + `cacheTag([TAGS.userProgress(uid, range)])` + `cacheLife('hours')`. Mutations invalidate all 4 range caches per user (cheap and predictable).

**Auth:** middleware-protected (I6). Anonymous redirects to login.

**Accessibility baseline:** every chart ships `<details><summary>View as data table</summary>` drawer with raw values in accessible `<table>`. Screen reader announces via `aria-describedby` linking chart SVG → table.

**Section order:**

| # | Section | Kicker | Title |
|---|---|---|---|
| 1 | Range toolbar + masthead | `§ 04 · THE ALMANAC` | "Thirty days, in the aggregate" |
| 2 | Calorie Adherence | `§ 05 · CALORIE ADHERENCE` | "Calories, a ledger" |
| 3 | Macro Distribution | `§ 06 · MACRO COMPOSITION` | "Protein, carbohydrate, fat, by day" |
| 4 | Weight Trajectory | `§ 07 · WEIGHT` | "A trajectory" |
| 5 | Water Adherence | `§ 08 · WATER` | "Adherence, by the glass" |
| 6 | Micronutrient Heatmap | `§ 09 · THE MINOR ELEMENTS` | "The minor elements, in thirty" |
| 7 | Weekly Review Island | `§ 10 · FROM THE EDITOR` | "Week of 12 April 2026" |

#### 7.4.2 Range toolbar

**Component:** `<ProgressRangeToolbar range />` — Client (URL-synced via `<Link replace>` — no `useRouter().push()`, no client-refetch; Next.js 16 handles PPR re-segment).

**Visual spec:**
- Layout: `flex justify-between items-center border-b border-rule pb-6 mb-8`.
- Chips (per design-lead §2.6.1 — lowercase italic-serif replaces uppercase `7D/30D`): `seven d. · thirty d. · ninety d. · one y.` — Newsreader 400 italic 13 sand default; active ivory bg with bg-0 text (inverted — matches mockup); hover `bg-2` tonal.
- Focus: 2px **ivory** outline 2px offset (tiebreaker #1; ux-auditor §1.4 — on ivory-bg active chip, use bg-0 outline interior + ivory exterior composite).
- Chip padding 10×22; **min-height 44px** (ux-auditor §8.1).
- Right side caption: `showing <span class="k">{startDate} → {endDate}</span> · {label}` — Newsreader italic 15 sand with bright ivory date span.

**State + URL sync:** held in URL `?range=30d`; chips use `<Link>` push without losing scroll. Default 30d (signature heatmap view). On 375–479px width, force `?range=7d` (heatmap cell constraint). URL-first so range survives refresh + is shareable. **NOT in Zustand** (per tiebreaker #17 — server state truth).

**Responsive:**
- Desktop: full toolbar one row.
- Tablet: same; caption may wrap.
- Mobile: caption hides (replaced by section meta); chips full-width equal.

**A11y:** `role="tablist"` wrapping; each chip `role="tab" aria-selected={active} aria-controls="progress-sections"`. Left/Right arrow navigates chips per WAI-ARIA tablist.

#### 7.4.3 5 chart sections (6 Suspense boundaries per react-perf)

Per tiebreaker #10: all Recharts components go through `next/dynamic(() => import('./RechartsCharts'), { ssr: false })`. Water Adherence uses inline SVG instead.

All chart tooltips get **2px `oxblood` LEFT rule** per design-lead §2.6.3 — unifies tooltip + weekly-insight + undo-toast as "commentary chrome" signature.

**Section 1 — Calorie Adherence (AREA chart per ux-specialist #5.2):**

Per tiebreaker applied to ux-specialist §5.2 recommendation: **composed area chart** instead of bar chart (surfaces trend-over-time better for "am I on track this month?"):
- Area fill (ivory 20% opacity) under actual-kcal line.
- Target reference line (ivory dashed at target).
- Over-target area (oxblood 30% opacity) above target where line exceeds.
- Projection dashed continuation of line (`ember`, `strokeDasharray='4 4'`).

**Component:** `<CalorieAdherenceChart range data />` — Split (RSC shell + `<RechartsWrapper>` client via dynamic).

**Visual spec:**
- Container `.chart-card`: 1px `rule-strong` border, bg-1, padding 24. Half-width desktop.
- Header row (c-head): border-bottom 1px rule, padding-bottom 14, margin-bottom 18.
  - Title (c-title): Newsreader 400 **24px** (bumped from 22 per ux-specialist §1.1 audit — was orphan) ivory letter-spacing -0.01em. Text: `Calories,` + italic `the last thirty` (sand).
  - Meta (c-meta): JetBrains Mono 10.5 **sand** (escalated from dust on bg-1 per ux-auditor V5). Format: `target 2,180 kcal / day`.
- Chart: Recharts `<ComposedChart>` height 220.
- Y-axis ticks: **mono 10.5** `dust-2` (raised from 9 per ux-auditor §1.5 WCAG readable-font-size floor).
- X-axis labels: mono **10.5** `dust`; format `S · 12`. Today: ivory bolder.
- Legend (c-legend): swatches with `<i>` 10×2px — "on target" (moss), "over target" (oxblood), "under target" (ochre), "projected" (dashed ember). Each legend entry is `<button aria-pressed>` for **legend-interactive toggle series visibility** (ux-specialist §5.4).
- Summary stat: `avg 2,040 kcal · on target 5 of 7 days` Newsreader 14 ivory `.num`.

**States:**

| State | Trigger | Visual |
|---|---|---|
| Loading | Suspense | Skeleton 7 bars 40% opacity + title visible |
| Empty (0 days) | `data.length === 0` | Italic serif centered sand `"Nothing to chart yet. Log a meal to begin the record."` + oxblood `BEGIN LOGGING →` |
| Sparse (<3 days) | `data.length < 3` | Banner `§ SPARSE DATA · at least three days produces a reading` italic + bars shown + hide averaged stat |
| Today-only | single bar in progress | Dashed ember projection; no adherence count (`—` placeholder) |

**Hover/focus:**
- Tooltip container: bg-1, **2px oxblood LEFT rule** (design-lead §2.6.3), 1px rule-strong, padding 10×12, ivory text.
- Content: day/date (mono 10.5 dust); kcal (newsreader 16); delta vs target (mono 11 sand color-coded).
- **Keyboard:** ArrowLeft/Right navigates bar-by-bar focus; tooltip announced via `aria-live="polite"` on visually-hidden companion region. Applies to **all charts** (ux-specialist §5.4).

**A11y:** `role="img"` + `aria-label="Calorie adherence, last 30 days, averaged 2,040 kcal per day, on target 5 of 7 days."` + `<details>` data-table drawer. `prefers-reduced-motion`: bar animations disabled.

**Section 2 — Macro Distribution (stacked bar):**

Full-width (`grid-column: 1/-1`).
- Title: `Protein, carbohydrate, fat,` + italic `by day`.
- Stack order bottom→top: Protein `ivory` (tiebreaker #6 — per Agent 1 canonical; NOT oxblood as mockup suggests); Carbs `ochre`; Fat `ember`.
- Reference lines: cumulative target grams (ivory dashed 0.5px 40% opacity).
- **Legend-interactive** (ux-specialist §5.4): click legend to toggle series visibility.
- **Pattern textures on stack segments** (ux-auditor §9.2 color-blind support): Protein plain; Carbs diagonal 45° hatch; Fat dot pattern.
- Tooltip: per-day full macro breakdown `Protein 110g · Carbs 245g · Fat 68g · Total 2,040 kcal`.
- Trend commentary italic right-aligned — derived server-side from linear-regression (NOT Gemini — deterministic, cheap).
- Summary stat `avg protein Xg · carbs Yg · fat Zg · calories N`.

**Section 3 — Weight Trajectory (line + projection):**

Half-width desktop. Per design-lead §3.2 `plum` token: projection-beyond-goal segment uses `plum` (previously-unused token assigned).

- Title: `Weight,` + italic `a trajectory`.
- Meta: `{start} → {current} kg · {delta} over {range}` + inline quick-add `+ LOG WEIGHT TODAY` (oxblood-soft uppercase link).
- Line (measured): `oxblood` 1.5px stroke. Dots: r=2.5 ivory with 1.5px oxblood stroke. Today: r=4 oxblood fill + 2px ivory stroke (emphasized).
- Trend line (linear regression, ≥5 data points): dashed `dust` 0.75px 0.5 opacity.
- Goal line: horizontal `ochre` 0.75px dashed + right label italic.
- Projection from last measurement along trend slope: **ember dashed** until goal reached; `plum` dashed **beyond goal** (design-lead §3.2).
- Legend + summary stat never uses oxblood for "wrong direction" (Agent 1 §2.2 reserved oxblood for over-target + error).

**States:** no measurements / 1 measurement / <5 measurements (hide trend + projection) / gap >14 days (dashed break + `14-day gap` annotation).

**Section 4 — Water Adherence (inline SVG, NOT Recharts per tiebreaker #10):**

Per tiebreaker #7: **`slate` fill** (NOT oxblood — matches dashboard water bullet semantic). Simpler bar pattern → inline SVG, zero Recharts bundle impact.

- Title: `Water,` + italic `by the glass`.
- Meta: `target {target}ml / day · unit {volume_unit}`.
- Horizontal bars one per day, 12px tall on bg-2 track.
- **Bar fill: `slate`** (not oxblood per tiebreaker #7).
- Target marker: vertical 1px dashed `rule-strong` at 100%.
- Overfilled portion (>100%): `moss` fill (bonus hydration, friendly).
- **`✓` glyph on bars ≥100%** (ux-auditor §9.2 — second channel for status).
- Y-axis: day labels mono 10.5 (ux-auditor §1.5 raised from 9). Today ivory bold.
- X-axis hidden (bar length self-evident).

**Section 5 — (reserved — skipped number for continuity)**

#### 7.4.4 Micronutrient Heatmap (7 nutrients per tiebreaker #8)

Per tiebreaker #8: **7 nutrients** (Fibre, Protein, VitA, VitC, VitD, Iron, Calcium) — Agent 6 canonical matches design-doc §10.8.

**Row order (fixed, NOT user-reorderable in MVP):**

| # | Nutrient | DV target | Why top 7 |
|---|---|---|---|
| 1 | Fibre | 30 g | High-signal diet quality |
| 2 | Protein | user target | Primary macro |
| 3 | Vitamin A | 900 μg RAE | Common deficiency target |
| 4 | Vitamin C | 90 mg | Common, strong signal |
| 5 | Vitamin D | 20 μg (800 IU) | Chronic shortfall |
| 6 | Iron | 18 mg | Common deficiency, gender-sensitive |
| 7 | Calcium | 1000 mg | Bone health, common shortfall |

**Visual spec:**

Container `.heatmap-card`: full-width (`grid-column: 1/-1`), 1px `rule-strong`, `bg-1`, padding **32** (normalized per ux-specialist §2.3 — was 30/32).

**Header:** 3-col grid `2fr · 1fr · 1fr` (asymmetric per design-lead §2.6.2):
- Left title block: Newsreader 300 32 ivory letter-spacing −0.02em. `The <em>minor elements</em>, in thirty` (em italic sand). Substitute "seven"/"ninety"/"three-sixty-five" per range.
- Middle sub: Newsreader italic 14 sand — `"Seven nutrients, traced across the last thirty days — each cell a reading, taken at day's end, colored by share of the target met."`
- Right meta (JetBrains Mono 11 sand per ux-auditor V5 escalation) — `LAST SCAN · APR 17 22:03` + `NEXT RECALC · APR 18 00:00` + `DATA POINTS · 847` (design-lead §5.2 — density fill).

**Table structure:** `<table class='heatmap-table' role="grid">`, width 100%, border-collapse, mono 10.5.

- `<thead>` two rows: month band (Inter 10 UPPERCASE tracking 0.18em sand colspan per month), day numbers (mono 10.5 dust, today ivory bold).
- `<tbody>` 7 rows:
  - Name cell (`role="rowheader"`): Newsreader 400 italic 13 ivory (or 15px for top-3 rows per §7.1.6 priority-weighting parallel).
  - Data cells (`role="gridcell"`): padding 0, height 28px, thin column rules (1px bg-0). Contains `<button>` with cell-fill.

**Color ramp (c0-c9):** stored in `lib/tokens.ts` under `colors.heatmap.c{0..9}`. Per ux-auditor §1.4 retuned so **adjacent step contrast ≥1.8:1** (was 1.11 on c0/c1 — essentially invisible):

| Class | Hex (retuned) | % DV |
|---|---|---|
| c0 | `#2E1F1A` | 0–10% |
| c1 | `#3E1C16` | 10–25% |
| c2 | `#5A261A` | 25–40% |
| c3 | `#7A3523` | 40–55% |
| c4 | `#8B5A2D` | 55–65% |
| c5 | `#A97B3F` | 65–80% |
| c6 | `#7A7A42` | 80–90% |
| c7 | `#5C6B3D` (moss) | 90–100% |
| c8 | `#718041` | 100–115% |
| c9 | `#8B9A50` | >115% |

**Today cell overlay:** 1px `ivory` border + `aria-label` suffix `"· today, in progress"`.

**Footer:** flex space-between, margin-top 24, border-top 1px rule, padding-top 18.
- Left: `under` label + 9-swatch gradient legend + `at target` label.
- Right: italic serif 13 sand editorial note — server-generated from simple rules (NOT Gemini — deterministic, cheap). Template: if lowest-avg row <50% DV: `— {Nutrient} trends low, entire {range}. A {suggestion} would shift the field.`

**Mobile heatmap WCAG 2.5.5 AA (tiebreaker #9):**

Ux-auditor flagged mobile 12×20 cells as WCAG 2.5.5 AA fail (requires 24×24). **Correction applied:**
- Mobile cells: **minimum 24×24** (NOT 12×20).
- At 375–479px: force `range=7d` (cell constraint).
- At 480–767px with range=30d: trigger transposed layout (days on Y-axis, nutrients on X-axis) so 30 days stack vertically scrollable.
- 90d/365d disabled on mobile with tooltip `"rotate device for longer ranges"`.
- Transpose earlier — reduce days-visible to 7 at narrow widths.
- Cells remain buttons; tooltips still appear; arrow-keys still navigate.

**Row labels, column headers, hover tooltips:**
- Row labels: Newsreader italic, row hover highlights in bg-2 (subtle row emphasis).
- Column headers: mono day numbers + month-band Inter UPPERCASE.
- Tooltip: bg-1, **2px oxblood left rule**, 1px rule-strong, padding 10×12. Content 3 lines: nutrient (serif italic 14 sand), weekday/date (mono 10.5 dust), value/unit/pct (serif 15 ivory; pct mono color-coded — oxblood-soft <50, ivory 50-90, moss ≥90).

**Text-alternative `<details>` table for screen readers:**

```html
<details>
  <summary>View heatmap as table</summary>
  <table aria-label="Micronutrient heatmap data">
    <!-- 7 rows × N days, raw values + % -->
  </table>
</details>
```

**Interaction:**
- Cell hover: brightness +6% (tonal, no scale).
- Tap (mobile): same tooltip; second tap / tap-outside dismisses. Position flips above/below based on viewport.
- Focus: cell `<button>` with 2px **ivory** inset ring (per tiebreaker #1; offset −2px since offset 2 would clip adjacent cells — ux-auditor §2.1).
- Keyboard nav: arrow keys 2D grid with `aria-activedescendant`; Enter/Space opens tooltip; Escape closes. **Tab enters grid at first cell** (not per-cell; per WAI-ARIA grid pattern).

**Motion:**
- First paint: rows fade top-to-bottom `rowFadeIn 180ms ease-editorial forwards` with `animation-delay: calc(var(--row-index) * 40ms)`. Total 7 × 40 + 180 = 460ms.
- Cell hover: 120ms brightness crossfade.
- Reduced-motion: all rows render instantly.

**Heatmap empty state** (ux-auditor §8.1 must-have): 0 days data → all cells `c0` + caption `"Log 3+ days to see the heatmap fill in."`

#### 7.4.5 Weekly Review Island (shared `WeeklyReviewCore`; PPR hole)

**Component:** `<WeeklyReviewIsland userId weekStartOn />` — RSC inside dedicated `<Suspense fallback={<WeeklyReviewSkeleton/>}>` at bottom of progress page.

**Shared core (tiebreaker #22):** both Dashboard `WeeklyInsightCard` (§7.1.7) and this island consume `<WeeklyReviewCore>` primitive. Island is full variant (hero + bullets + mini charts); card is compact.

**Route + entry:**
- Embedded (default): Section 7 of Progress when `range=30d/90d`.
- Focused drill-in (`/progress?focus=weekly-review`): scroll-anchors + expands.
- Dashboard link: `/progress#weekly-review` with smooth scroll.

**PPR Suspense pattern:**

```tsx
<ProgressRangeToolbar />
<CalorieAdherenceChart />
<MacroDistributionChart />
<WeightTrajectoryChart />
<WaterAdherenceChart />
<MicronutrientHeatmap />
<Suspense fallback={<WeeklyReviewSkeleton />}>
  <WeeklyReviewIsland />
</Suspense>
```

Rationale: `/api/ai/weekly-review` can take 2–6 seconds for cache-miss (Gemini Flash first-paint). PPR renders everything else instantly and streams this section when ready.

**Fetching:**
- Server reads `weekly_reviews` by `(user_id, week_start_on)`.
- Cache hit (fresh, `expires_at > now`): returns stored `insights.body_markdown`. Zero Gemini call.
- Cache miss: fires `POST /api/ai/weekly-review` → Gemini → Zod-validate → insert row → return insights.
- Sparse-data (<3 logged days past 7): stub row with `sparse_data: true`; template copy (no Gemini).
- Cache tag: `TAGS.weeklyReview(uid, weekStartOn)`.

**Visual spec:**
- Container `.chart-card` full-width; padding **48×32** (normalized per ux-specialist §2.3 — was 40/32).
- Kicker `§ 10 · FROM THE EDITOR` Inter 10.5 UPPERCASE tracking 0.22em `oxblood-soft`.
- Masthead row: flex space-between. Left title `WEEKLY REVIEW — WEEK OF {date}` (sans 10.5 UPPERCASE dust) + next line serif 32 ivory `{Month} {day}–{day}, {year}`. Right meta JetBrains Mono 10.5 **sand** (ux-auditor escalation) — `generated {date}` + `via Gemini Flash`.
- **Hero insight (drop cap):** Newsreader 400 24 line-height 1.5 ivory, margin-bottom 28, max-width 68ch.
  - **Drop cap — rendered in `ember`** (ux-auditor §10.3; oxblood 2.19:1 on bg-1 fails large-text floor). Newsreader 400 82px float-left, line-height 0.85, margin-right 8, margin-top 4. **Used exactly once across app.**
- Body insights (3–5 bullets) `<ul class='insights'>`:
  - Each `<li>`: Newsreader 400 16 ivory, line-height 1.6, margin-bottom 12, padding-left 18.
  - Oxblood em-dash prefix `—` via `::before { content: '—'; position: absolute; left: 0; color: oxblood-soft }`. **Em-dash fades in 60ms BEFORE bullet text** (design-lead §6.3 — "editor writes each dash then fills in the sentence").
- Chart highlights (2 mini-charts side-by-side):
  - Grid 2-col, gap 24, margin-top 32, border-top 1px rule.
  - Left: 7d calorie adherence mini (reuses `<CalorieAdherenceChart>` 7d scoped).
  - Right: 7d macro composition mini (reuses `<MacroDistributionChart>` 7d).
  - Both render at 60% scale: height 140, font-sizes -1px.
  - **Mini-charts inherit `<details>` data-table drawer** (ux-auditor §5.5).
- Footer:
  - Left: `generated {datetime} · via Gemini Flash · cached until {expires_at}` (JetBrains Mono 10.5 dust).
  - Right: `REGENERATE REVIEW` link (uppercase sans 10.5 oxblood-soft, hover oxblood). Enabled only (a) cache within 12h expiry, or (b) admin mode. Otherwise disabled with tooltip `"Review regenerates automatically each Monday."`

**Skeleton (`<WeeklyReviewSkeleton>`):**
- Kicker + masthead + bottom rule visible.
- Hero paragraph: 3 lines of placeholder bars (height 18, bg-2, margin-bottom 12) progressively narrower.
- Bullets: 4 skeletons (height 14, bg-2, margin-bottom 10).
- Chart region: two 140-tall bg-2 blocks side-by-side.
- Shimmer: `animation: shimmer var(--motion-shimmer) infinite ease-in-out` — opacity pulse 0.6↔1.0. **Stagger 150ms apart per card** (ux-specialist §6.2 — prevent disorienting sync across 6 charts). Reduced-motion: solid bg-2 blocks.

**Sparse-data fallback (<3 logged days past 7):** italic serif 18 sand centered `"Too little logged this week to draw conclusions. A review is produced when at least three days have entries."` + oxblood-soft link `BEGIN LOGGING →`. No drop cap, no bullets, no mini-charts.

**Failure fallback (Gemini error, F12 retry exhausted):** kicker + masthead + mini-charts only + italic serif sand `"Insights unavailable at the moment. The chart record still stands."` + enabled REGENERATE link + `role="alert"` (ux-auditor A21). Sentry breadcrumb logged. **User can still see their data** (I7 principle).

**Motion:**
- Hero fades in via `ink-fade` 120ms after data arrives.
- Bullets stagger 60ms intervals after hero.
- Each em-dash fades 60ms BEFORE its bullet text.
- Mini-charts `page-settle` 320ms opacity crossfade.
- Reduced-motion: instant final position.

**A11y:**
- Hero `role="article" aria-labelledby="weekly-review-heading"`.
- Bullets proper `<ul><li>` semantics; drop cap CSS-only pseudo-element (doesn't pollute screen-reader output).
- Regenerate link `aria-disabled="true"` when gated; tooltip via `aria-describedby`.
- Mini-charts inherit a11y from their component definitions.

---

### 7.5 Onboarding

**Route:** `/onboarding`. Guard: redirects authed users with incomplete profile; redirects to `/dashboard` once `profiles.onboarding_completed_at` is set.

**Component tree:** `<OnboardingLayout>` compound + 8 named step variants (architecture §7.4).

```tsx
<OnboardingLayout.Root step={n}>
  <OnboardingLayout.ProgressDashes total={8} current={n} />
  <OnboardingLayout.StepContent>
    {n === 1 && <StepWelcome />}
    {n === 2 && <StepName />}
    {/* ... through StepTarget */}
  </OnboardingLayout.StepContent>
  <OnboardingLayout.ActionRow>
    {n > 1 && <OnboardingLayout.BackButton />}
    <OnboardingLayout.NextButton />
  </OnboardingLayout.ActionRow>
</OnboardingLayout.Root>
```

#### 7.5.1 8-step flow + progress indicator

**Shared layout:**
- Full-viewport `min-height: 100dvh; display: flex; flex-direction: column`.
- Background `bg-0` with subtle radial glow from `--decorative-glow`.
- **Top: progress indicator** — 8 dashes in a row. Each dash: height 1px, flex 1, `rule-strong` default; completed/current `oxblood`. **"Step N of 8" text alongside** (ux-specialist §7.4). On step advance, next dash fills left-to-right via `rule-draw` 320ms.
- Middle: step content, `flex: 1; display: flex; align-items: flex-start; padding: 48px; max-width: 640px; margin: 0 auto`. **Content aligned to top-third of viewport** (design-lead §5.3 — tightens wasted whitespace), NOT vertically centered.
- Bottom action row: flex space-between, padding 24×48, 1px rule top.
  - Left BACK: Inter 500 10.5 UPPERCASE tracking **0.18em** (normalized from 0.2em per ux-specialist §1.3) `sand`, padding 12×20, 1px `rule-strong`. Hidden Step 1.
  - Right NEXT / BEGIN / START TRACKING: oxblood primary, padding 14×32, Inter 500 11px 0.2em UPPERCASE `ivory`. Hover `oxblood-soft`. Disabled: opacity 0.4 + cursor not-allowed + `aria-disabled="true"`.
  - Skip link (Step 2 only — optional): top-right of step content, dust 10.5 UPPERCASE dotted underline.

**State management (per Agent 1 §11 + design-doc §11):**
- `useOnboardingStore` Zustand with `sessionStorage` persistence (30-min TTL resume).
- Shape: `{ step: 1..8, name, dob, biologicalSex, heightCm, weightKg, activityLevel, goal, targetAdjustPct, completed: false }`.
- Fires on every field change (throttled 500ms).
- Step advance: store + URL update, progress dash fills.
- Unload without completion: state persists, user can resume.
- Step 8 submit: `POST /api/profile/save` (includes `client_id` per I11) → redirect `/dashboard` with first-time flag.

**Step-by-step specs:**

**Step 1 — Welcome:**
- **Asymmetric composition** (design-lead §2.6.4): wordmark at top-left 104/72/48 Newsreader 300 ivory (NOT centered); tagline indented 104px beneath (Newsreader italic 18 sand, max 52ch); body paragraph indented further (Newsreader 16 ivory, max 58ch): `"To get your calorie target right, we need a few details. This takes less than a minute, and everything can be edited later in Settings."` BEGIN button flush-right on its own row; 1px hairline `rule` above spanning full width. Reads like the opening page of a broadsheet.

**Step 2 — Name:**
- Title Newsreader 44 ivory centered: `What should we call you?`
- Subtitle italic 16 sand: `First name only. Used in your ledger masthead and weekly reviews.`
- Input: 56px tall, max 420, Newsreader 20 ivory, bg-1, 1px rule-strong. Focus: border oxblood + 2px **ivory** outline 2px offset. **`<label for="name">NAME</label>`** (ux-auditor §7.1). `autocomplete="given-name"`. Error caption `! Please enter a name, or tap SKIP.` Inter 10.5 oxblood — `aria-describedby="name-error" aria-invalid={isError}`.
- NEXT disabled if empty + skip not used. SKIP enables NEXT. Defaults name to "friend" if skipped.

**Step 3 — Date of Birth:**
- Title: `When were you born?`
- Subtitle italic: `Used to compute your BMR — stays private.`
- Input `type="date"`, 56px, Newsreader 18 ivory, bg-1 + rule-strong border. Placeholder `YYYY-MM-DD` mono dust. Max date: today − 13 years. Min: today − 120 years. `<label for="dob">DATE OF BIRTH</label>`. `autocomplete="bday"`. `aria-required="true"`.
- Error: `! Enter a valid date of birth.` Inter 10.5 oxblood with `aria-describedby`.
- Privacy note: mono 10.5 dust `Not shared, not displayed — used only in the Mifflin-St Jeor equation.`

**Step 4 — Biological Sex:**
- Title: `Biological sex`
- **Two-column layout with serif-rule between** (design-lead §5.1): `[FEMALE block — full description + button] | hairline vertical | [MALE block — full description + button]`. Reads like two pages of a reference book.
- Chips: `role="radiogroup" aria-labelledby="sex-label"` wrapping `<input type="radio">` with `<label for>` (ux-auditor §7.1).
- Chip content: Sans 13 UPPERCASE tracking 0.18em ivory `FEMALE` / `MALE`.
- Hover: `bg-2` tonal. Selected: 3px oxblood top rule + bg-2 background. Focus: 2px **ivory** outline + 2px offset.

**Step 5 — Height:**
- Title: `How tall are you?`
- Number input `type="number" inputmode="decimal"`, 56px, Newsreader 20 ivory, width 180.
- Unit toggle chips: cm / in (segmented, 32px → **44px** per ux-auditor §8.1).
- Default cm (I6). Storage always `height_cm`. Conversion 1 in = 2.54 cm.
- Validation range 100–250 cm. Error on blur: `! Enter a height between 100 and 250 cm.` (ux-specialist §4.2 — inline-on-blur).

**Step 6 — Current Weight:** same pattern as Step 5. Units kg / lb default kg. Storage `weight_kg`. Range 30–300 kg.

**Step 7 — Activity Level:** 5 vertical chips. `role="radiogroup"`. Each chip: first line Inter 11 UPPERCASE (SEDENTARY/LIGHT/MODERATE/ACTIVE/VERY ACTIVE); second Newsreader italic 13 sand description. Selected: 3px oxblood left border + bg-2.

**Step 8 — Your Target (final reveal):**
- Title: `Your daily target`
- **Calorie display** per design-lead §2.6.5: `— 2,180 —` with italic-serif em-dashes in sand at 48px flanking the 82px Newsreader 300 ivory target value. Below: italic serif 15 sand caption `"your daily budget, by the equation of Mifflin & St Jeor"` — citation-style attribution.
- Goal selector 3 chips: MAINTAIN (default) / LOSE (-15%) / GAIN (+10%).
- Adjustment slider:
  - Label `ADJUSTMENT` sans 10.5 UPPERCASE dust tracking 0.18em.
  - Range −20% to +20%.
  - Track 2px `rule-strong`; filled portion `oxblood`.
  - **Thumb: 16×16 zero-radius square** (Ledger rule §4.1 — documented onboarding exception to platform-native circle). Native `<input type="range">` with `aria-valuenow/min/max`. **Hit area padded to 44×44 via `hitSlop`-equivalent** per ux-auditor §8.1. Live-announces via `aria-live="polite"` (Step 8 live-computed target).
- "How we calculated this" disclosure:
  - Collapsed: `HOW WE CALCULATED THIS` oxblood-soft link.
  - Expanded — **all JetBrains Mono 13 sand** (ux-specialist §4.2 — literal math reads mono), ivory operators, oxblood-soft `=`:
    ```
    BMR = 10 × weight + 6.25 × height − 5 × age + s
      (s = +5 for male, −161 for female)
    TDEE = BMR × activity multiplier
      (sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very active 1.9)
    target = TDEE × (1 + adjustment%)
    ```
  - Your values line-by-line: `BMR = 1,650 kcal` / `TDEE = 2,560 kcal` / `target = 2,180 kcal (TDEE −15%)`.
  - Surface: **`bg-quote`** (design-lead §3.2 — footnote-commentary tier).
- Action: `START TRACKING` (oxblood, 56px tall).

#### 7.5.2 Form field conventions (proper labels per ux-auditor WCAG 3.3.2)

Per tiebreaker #21: all inputs have proper `<label for>` association + `aria-describedby` error linking + `aria-required` + `autocomplete`. Placeholder-only inputs fail WCAG 3.3.2.

Applied to: TYPE textarea (log), Library search, Log-Library search, Onboarding name/DOB/height/weight, Account-delete email, Login email/password.

#### 7.5.3 Target recalc with manual override

**Step 8 recalc logic:** server computes Mifflin-St Jeor from captured values; response populates chronometer ring target.

**Post-onboarding in Settings (see §7.6):** target mode toggleable AUTO / MANUAL per design-doc §10.9. MANUAL → AUTO: immediate recalc + dashboard nudge card. AUTO → MANUAL: copies current auto-value into override field (no nudge).

**Focus management:** on step entry, focus first input (not NEXT). On validation error, focus the failing input (ux-auditor §2.4).

**A11y:**
- Each step `<form>` with proper labels, `aria-required` on mandatory fields.
- Focus order: input(s) → BACK → NEXT.
- Enter on NEXT submits step.
- Progress indicator: `role="progressbar" aria-valuenow aria-valuemin aria-valuemax aria-label="Onboarding, step {N} of 8"`.
- Live-computed target on Step 8: `aria-live="polite"` announces slider changes.
- **Each step `<h1>` level heading** (ux-auditor §5.2 — step is single-purpose route).

---

### 7.6 Settings (`/settings`)

#### 7.6.1 Section structure

**Layout pattern:** sidebar subsections + main content (desktop/tablet); vertical-scroll sections stacked (mobile).

**Desktop/tablet layout:**
- 2-col grid `220px 1fr; gap: 48px; max-width: 1280px; padding: 48px`.
- Left subsection rail: 5 links Inter 11 UPPERCASE tracking 0.18em; default sand; active ivory + 2px oxblood left border + padding-left 14px; hover `bg-2` row. 1px hairline separator.
- **Right marginalia column** (design-lead §5.1 — 3-col variant `[220 rail | 1fr content | 180 marginalia]`): contextual notes per subsection in italic-serif 14 sand. E.g., on §TARGET: `"Auto-recalc uses Mifflin & St Jeor — an equation dating to 1990."`. Reads like textbook margin.

**Mobile layout:** single column, padding 16. Each subsection `<details>` collapsible with chevron affordance + current-value preview in summary row.

**Subsection 1 — PROFILE (`§ 01 · PROFILE`):**
- Title: `Who you are` (Newsreader 44 ivory).
- Fields (24px vertical gap):
  - Name — text input Newsreader 18 ivory 56px tall. `<label>`. `autocomplete="given-name"`.
  - Date of birth — date input mono 14 ivory 56px. `<label>`. `autocomplete="bday"`.
  - Biological sex — 2-chip toggle `role="radiogroup"`.
  - Height — number + unit toggle (cm/in).
  - Weight — link `MANAGE WEIGHT HISTORY →` (oxblood-soft uppercase) — emphasizes weight as a log, not a single value.
  - Activity level — 5-chip vertical `role="radiogroup"`.
- **Target recalc side effect:** changing DOB/sex/height/activity triggers banner — `"Changing this will update your daily target from 2,180 to 2,240 kcal. Confirm below."` ember-toned italic serif with explicit APPLY CHANGES button.
- **Save:** autosave on blur for name (no side-effect); explicit APPLY for side-effect fields. Autosave writes `updateProfileAction({ client_id })` + toast `"Saved."` (moss check, 3s dismiss).

**Subsection 2 — TARGET (`§ 02 · TARGET`):**
- Title: `Your daily calorie budget`
- Current target Newsreader 82 ivory centered `.num`.
- 2-chip row: `AUTO (Mifflin-St Jeor)` / `MANUAL OVERRIDE`.
- AUTO mode: `"Recalculated from profile — last recalc {date}"` + `RECALCULATE NOW` button.
- MANUAL mode: number input + mono caption `Auto-computed suggestion: 2,180 kcal`.
- Transitions (design-doc §10.9): MANUAL→AUTO immediate recalc + dashboard nudge. AUTO→MANUAL copies current auto into override.
- Recalc threshold dropdown: `2% | 5% (default) | 10% | never` → `profiles.recalc_threshold_pct`.

**Subsection 3 — DISPLAY (`§ 03 · DISPLAY`):**
- Title: `Units and locale`
- Weight unit toggle `kg / lb` (display pref only; DB metric per I6).
- Volume unit `ml / fl oz`.
- Timezone `<select>` IANA list; default from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Show Roman hour numerals on chronometer toggle.
- **Reduce motion toggle** (mirrors `prefers-reduced-motion`; overrides OS preference if explicitly set — Agent 1 §7.9; additive, never cancels user preference per ux-auditor §6.3).
- **DISABLE KEYBOARD SHORTCUTS toggle** per tiebreaker for WCAG 2.1.4 compliance + §6.5.

#### 7.6.2 Keyboard-shortcut disable toggle (per ux-specialist + Agent 1)

Under Display subsection. Turns off all single-char shortcuts (`/`, `n`, `?`); leader-based `g d/l/p/s` and standard keys remain.

#### 7.6.3 Skip-confirmation toggle (power user)

Under Data subsection: `ALWAYS SAVE WITHOUT REVIEW` (off by default). When ON:
- TYPE: after PARSE, skips confirmation and fires save with auto-parsed items at portion=1 and auto-inferred meal slot.
- SNAP: same (thumbnail persists to library if save-to-library also on).
- LIBRARY: already skippable by default.
- Undo Toast still fires — user has 5s revert window without confirmation step.
- Stored on `profiles.always_save_without_review`.

#### 7.6.4 Data export (CSV/JSON)

**Subsection 4 — DATA (`§ 04 · DATA`):**
- Title: `Your records`
- Two buttons side-by-side:
  - `EXPORT AS CSV` — oxblood primary 44px.
  - `EXPORT AS JSON` — hairline-strong secondary 44px.
- Caption: *`Includes all entries, library items, weight log, water log. ISO 8601 timestamps in UTC with your timezone column.`*
- Above caption: `ALWAYS SAVE WITHOUT REVIEW` toggle per §7.6.3.

**Export flow modal** (triggered by CSV/JSON click):
- Standard modal shell (scrim + bg-1 card 440px).
- Kicker `§ EXPORT` (sans 10.5 UPPERCASE oxblood-soft).
- Title: `Preparing your archive.` (Newsreader 28 ivory).
- Body serif 15 sand: `"{N} entries, {L} library items, {W} weight entries, {X} water entries. Your complete ledger."`
- Progress indicator: spinner-like oxblood 1px arc 1.2s rotate + mono caption dust `"reading records..." → "serializing..." → "ready"`.
- Est. time: mono 11 dust `"this usually takes 2–6 seconds"`.
- Actions: `CANCEL` until ready; replaced by `DOWNLOAD` (oxblood) on completion.

**Download mechanics:**
- `GET /api/export/csv` or `/api/export/json`.
- `Content-Disposition: attachment; filename="kalori-export-{userId}-{YYYYMMDD}.{ext}"`.
- Streams directly (no blob client-side buffering — large archives work).
- Browser native download UI takes over; modal shows `DOWNLOAD COMPLETE` for 2s then auto-closes.

**File structure:**
- CSV: ZIP bundle — `entries.csv` (flat), `weight.csv`, `water.csv`, `library.csv`. Timestamps UTC + user-TZ column.
- JSON: single file `{ profile, library, entries, logs: {weight, water}, weekly_reviews, schema_version: 'v1' }`.

**Failure:** modal shows oxblood `!` + `"Export failed."` + RETRY. Timeout >30s: `"This is taking longer than expected — continue waiting or cancel?"`

**A11y:** `role="dialog" aria-modal="true"`. Focus trap. Escape cancels. Progress `aria-live="polite"`. Download triggers via temporarily-visible `<a href download>`.

**Subsection 5 — ACCOUNT (`§ 05 · ACCOUNT`):**
- Title: `Credentials and closure`
- Email read-only serif 16 ivory + mono 11 dust caption `Signed in · {datetime}`.
- `SIGN OUT` hairline-strong secondary 44px.
- **Danger zone** (hairline top rule, 32px above): kicker `§ DANGER` (sans 10.5 UPPERCASE oxblood tracking 0.22em). `DELETE ACCOUNT` oxblood link. Opens §7.7 flow.

**Settings save behavior:**
- Autosave on blur (non-side-effect): optimistic + `client_id` + rollback on 4xx/5xx.
- Explicit APPLY (side-effect fields): DOB/sex/height/activity/target mode/goal/threshold.
- Toast pattern: success moss ✓ + `"Saved."` 3s; failure oxblood ! + `"Couldn't save — try again."` assertive aria-live.

**Settings a11y:**
- Each subsection `<h2>` with matching id; sidebar rail links via hash + smooth scroll.
- All inputs `<label for>` pattern.
- All toggles `<button role="switch" aria-checked>` per WAI-ARIA.
- Focus order follows visual order.

---

### 7.7 Account Delete

#### 7.7.1 3-step flow

3 sequential modals — explicit breaks keep user aware of each gate.

**Shared modal base:**
- Scrim `rgba(14, 10, 8, 0.72)` 72% bg-0 (no blur per §4.5).
- Card max 520px, bg-1, 1px rule-strong, padding 48×40. Centered.
- Close `×` allowed on Step 1+2; Step 3 closing via CANCEL only.
- Kicker top-left `§ DANGER` sans 10.5 UPPERCASE oxblood tracking 0.22em.
- `<FocusTrap>` applied; Escape closes Step 1+2 only.

**Step 1 — Warning:**
- Title: `This cannot be undone.` (Newsreader 28 ivory).
- Body serif 16 ivory: `"Deleting your account removes everything you have ever logged. There is no recovery. There is no export after the fact."`
- Bulleted consequences (mono-dashed oxblood-soft):
  - All food entries
  - All library items and their thumbnails
  - All weight log entries
  - All water log entries
  - Your profile — name, DOB, target, settings
  - Your email and password
  - Your weekly reviews and AI call logs
- Actions: CANCEL (sand 44px) | `I WANT TO CONTINUE` (oxblood 44px) → Step 2.

**Step 2 — Email confirmation:**
- Title: `Confirm by typing your email.` (Newsreader 24 ivory).
- Body serif 15 sand: `"Enter the email you signed up with. Case must match exactly."`
- Input: 56px, mono 14 ivory, bg-1, rule-strong, placeholder hidden by default (user types blind). `<label for="delete-email">` (ux-auditor §7.1). `autocomplete="off"` (ux-auditor §7.4).
- Live validation: moss ✓ glyph appears on exact match (case-sensitive); otherwise silent (prevents brute-guess via UI). **Additional "email confirmed" sub-text** on match (ux-specialist §10.7 — success feedback).
- Actions: CANCEL | `DELETE MY ACCOUNT` oxblood disabled until match.

**Step 3 — Final confirm with countdown:**
- Title: `Last chance.` (Newsreader 24 oxblood).
- Checkbox row: `<input type='checkbox' id='understand'>` 16×16 zero-radius bg-1 + rule-strong (checked: oxblood fill + ivory check glyph) + `<label for>` Newsreader italic 14 ivory: `"I understand that my ledger and its entries will be permanently destroyed."`
- **Countdown redesign** per design-lead §2.6.7: **10-bullet tolling ruler** horizontal, fills left-to-right one bullet per second (oxblood). Paired with italic serif counter *"ten seconds…"* *"nine seconds…"* underneath — reads church-bell tolling, matches gravity. Replaces digit-clock (00:10 → 00:00). On t=10: bullets full + counter `"READY"` moss ✓.
- Actions: CANCEL only visible during countdown. `DELETE NOW` oxblood disabled until countdown 0.
- `aria-live="polite" aria-atomic="true"` on countdown (ux-auditor A24 — full string re-announces each second).
- **Focus DOES NOT auto-shift** on button enable (ux-auditor §2.4 — classic "mis-click" hazard). Stays on CANCEL.

#### 7.7.2 I9 cascade order (Storage → DB → auth.users)

**Deletion execution** on DELETE NOW:

1. **Full-screen progress panel** (modal replaced):
   - bg-0 scrim, no card.
   - Kicker `§ DELETING` oxblood UPPERCASE.
   - Title Newsreader 44 ivory: `"Destroying your ledger."`
   - 3-step progress (serif 16 sand):
     - `⟶ Removing photos...` → animates ivory ✓ when complete.
     - `⟶ Removing records...` → ✓.
     - `⟶ Removing account...` → ✓.
   - Each step: active shows spinner-like 1px oxblood arrow oscillate; complete shows ✓ moss.
   - Bottom caption: mono 11 dust `"please stay on this page until the ledger closes"`.

2. **Backend (`DELETE /api/account/delete` per I9 + architecture §6 Route 14):**
   - Route-handler order (LOAD-BEARING):
     - (a) **Storage objects first** — all under `food-thumbnails/{user_id}/`.
     - (b) **DB rows** — all user-owned tables via `ON DELETE CASCADE` triggered by auth.users deletion.
     - (c) **`auth.users` row last.**
   - Zero-object test (design-doc §18 + `tests/integration/account-delete-cascade.test.ts`) verifies no orphans.

3. **Success:**
   - Sign-out fires (clears session cookies, broadcasts via `BroadcastChannel('kalori-auth')` per F12).
   - Redirect `/` marketing landing.
   - One-time toast on landing (from URL flag `?deleted=1`): `Your account has been deleted.` (sand italic, moss ✓, 8s persist).

4. **Failure:**
   - Progress panel shows oxblood `!` + caption `"The ledger could not be closed. Some data may remain."`
   - CTAs: `TRY AGAIN` (oxblood, retries) + `CONTACT SUPPORT` (hairline-strong, `mailto:support@kalori.app?subject=Account+deletion+failed`).
   - Sentry breadcrumb + `ai_call_log`-style row.

**A11y:**
- Each step modal `role="dialog" aria-modal="true" aria-labelledby="{step-title-id}"`.
- Focus moves to first interactive element on open; returns to trigger on close.
- Focus trap.
- Countdown announced at 10s / 5s / ready via aria-live.
- Reduced-motion: spinner replaced with text state `"..."`.

---

### 7.8 Login / Signup

#### 7.8.1 Full-screen editorial takeover

**Route:** `/login`. Unauthed only; authed redirects to `/dashboard` (or `/onboarding` if incomplete).

**Restructured per design-lead §2.6.6 — anti-generic:**
- Wordmark flush LEFT at 72px desktop (NOT centered): Newsreader 300 ivory. First two letters `"ac"` italic oxblood-soft (optional mockup decorative touch).
- 1px horizontal `rule-strong` spanning full page-width at y=240px.
- Form block flush LEFT below rule, max-width 420.
- Italic-serif tagline flush RIGHT of rule at y=240px as pull-quote (Newsreader italic 18 sand): `"A record of what you eat, kept like a journal."`
- Footer centered italic serif 12 sand bottom-margin: `"Private. Owner-only. No ads, no tracking."`

Reads like cover of a broadsheet, NOT a SaaS signup form.

#### 7.8.2 Email+password + Google OAuth

**Form block:**
- Mode toggle top-right of form: `SIGN IN` / `CREATE ACCOUNT` — sans 10.5 UPPERCASE dust; active ivory with oxblood underline.
- **Email input:**
  - Label above: `EMAIL` Inter 10.5 UPPERCASE dust tracking 0.18em.
  - Field: 56px, mono 14 ivory, bg-1, rule-strong.
  - `<label for="email">`. `autocomplete="username email"`. `aria-required="true"`. `type="email"`.
- **Password input:**
  - Label: `PASSWORD`.
  - Field: 56px, `type="password"`, mono 14 ivory.
  - **Helper on focus** (ux-specialist §4.1): `"at least 8 characters"` Inter 10.5 dust.
  - Reveal button right-inside: `Eye`/`EyeOff` Phosphor, 44×44 `aria-label='Show password' | 'Hide password'` + `aria-pressed={revealed}` (ux-auditor §7.6). Explicit ivory focus ring.
  - `autocomplete="current-password"` (sign-in) / `"new-password"` (signup). `aria-required="true"`.
- **Primary button:** `SIGN IN` or `CREATE ACCOUNT` — oxblood fill 56px 100% width, sans 11 UPPERCASE tracking 0.2em (normalized → 0.18em per ux-specialist §1.3).
- Secondary links centered:
  - Sign-in mode: `FORGOT PASSWORD?` (oxblood-soft underlined).
  - Signup mode: byline italic 12 sand `"By creating an account you agree to the Privacy Notice."` link to `/privacy`.
- **Divider:** max-width 420, flex with left hairline + `OR` (sans 10.5 UPPERCASE dust) + right hairline, margin 32×0.
- **OAuth buttons:** `CONTINUE WITH GOOGLE` — 56px, bg-2 fill + rule-strong border, 20×20 Google G icon left, sans 13 ivory center. **Explicit ivory focus ring** (ux-auditor §11.6). Apple OAuth deferred post-MVP.

**Errors:**
- Inline field errors: 1px oxblood underline + 10.5 oxblood caption `! Invalid email format.` — `aria-describedby` + `aria-invalid="true"` (ux-auditor §7.2).
- Form-level (auth failure): single-line oxblood banner above form — `role="alert" aria-live="assertive"` (ux-auditor §7.2).
- Success: toast `Welcome back, {name}.` sand italic 3s + redirect.

**Auth contracts:**
- Sign in: POST Supabase auth via `@supabase/ssr`; cookies set; redirect `/dashboard`.
- Sign up: POST Supabase signup. Email verification if enabled. Redirect `/onboarding`.
- Google OAuth: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })`.
- Forgot password: `/forgot-password` stub with magic-link UI.

#### 7.8.3 Form field accessibility (proper labels + autocomplete per ux-auditor)

Per tiebreaker #21 + ux-auditor §7: all inputs have visible labels (NOT placeholder-only), `autocomplete` attrs, `aria-required`, `aria-describedby` error linking.

**Responsive:**
- Desktop: wordmark 104, padding generous.
- Tablet: wordmark 72, padding 32.
- Mobile: wordmark 48, padding 16, form fills viewport, OAuth full-width.

**A11y:**
- All inputs `<label>` (visible, not placeholder-only).
- Form `aria-labelledby` points to wordmark.
- Keyboard Enter submits.
- Focus order: email → password → reveal → submit → mode toggle → forgot-password → divider → Google OAuth.
- Reduced-motion: no page-settle crossfade on load.

---

### 7.9 PWA Install Prompt

**Trigger sources:**
1. Chrome/Edge automatic `beforeinstallprompt` — captured + deferred.
2. iOS Safari manual (no `beforeinstallprompt`) — illustrated instructions.

**Deferral:** capture `deferredPrompt` in Zustand `useUIStore` on page load. **DO NOT auto-show.** Contextual moments only:
- (a) After user's 3rd log (meaningful engagement).
- (b) Settings persistent affordance under Display: `ADD KALORI TO HOME SCREEN`.
- (c) Manual discrete oxblood-soft link.

**Modal visual — folded-letter metaphor** per design-lead §2.6.8:
- Standard modal (scrim + bg-1 card 440px padding 32).
- **Top edge: 2px dotted `rule` reading as perforated tear-line.**
- **Body: 3px indent on left-side reading as typewriter left-margin.**
- **Install button: styled as ribbon-tab** (inset 6px on right side where library-card pocket would be).
- Content:
  - Kicker `§ INSTALL` sans 10.5 UPPERCASE oxblood-soft.
  - Title `Keep Kalori close.` Newsreader 28 ivory.
  - Body serif 15 sand: `"Add Kalori to your home screen for offline-ready ledger access. No App Store, no installs — it's already here."`
  - Small app-icon preview 48×48 Kalori mini-mark on bg-2 with rule-strong border.
  - What-you-get list (serif 14 ivory, 3 bullets):
    - *Offline access to your library and last 7 days*
    - *Quick launch from home screen*
    - *Native-like photo capture*
- Actions: `NOT NOW` (sand secondary) | `INSTALL` (oxblood — calls `deferredPrompt.prompt()`).

**iOS-specific:** `navigator.userAgent.includes('iPhone|iPad')` detection. Same modal; INSTALL replaced with illustrated instructions:
- Serif 16 ivory: `"On iPhone: tap the share button {share-icon} in Safari, then 'Add to Home Screen.'"`
- SVG illustration of share-sheet menu item (kept simple, aria-described).
- Button row: `GOT IT` (oxblood) + `NOT NOW` (sand).

**Persistence:** dismissal writes `localStorage.setItem('kalori.pwa-prompt.dismissed', '1')` — never shown again automatically. Settings affordance remains. Same flag on `appinstalled` event.

**A11y:**
- `role="dialog" aria-modal="true"`.
- Focus trap; Escape cancels.
- Install button `aria-label="Install Kalori as a home screen app"`.
- iOS illustration `aria-label="Share sheet opened with 'Add to Home Screen' option highlighted"`.
- **Reduced-motion fallback explicit** (ux-auditor M6.1 gap): no fade/slide; opacity-only 120ms.

**Responsive:** desktop 440 centered; tablet 440 centered; mobile full-width (16px margin), illustration 60% scale.

---

## 8. Shared Components Detail (primitives from §4.1)

Nine primitives live in `components/primitives/` (tiebreaker #15). ESLint-enforced imports; ad-hoc duplication fails review. Shipped in Task 1.1.

### 8.1 Button (variants + states via discriminated union)

```tsx
interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'outline' | 'text' | 'danger' | 'oxblood-soft';
  size?: 'sm' | 'md' | 'lg' | 'fab';   // 36 / 44 / 56 / 56×56
  tone?: 'default' | 'sand' | 'dust';
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  asChild?: boolean;                   // Radix-style polymorphism
}
```

**Variants:**
- `primary`: oxblood fill + ivory label. Hover `oxblood-soft`. Press: `+` → `✓` ink-fade (if applicable).
- `outline`: 1px `rule-strong` border + sand label + bg-1 fill. Hover bg-2.
- `text`: no border, no fill, sand/dust label. Hover oxblood.
- `danger`: same as primary but semantic-red context (delete actions).
- `oxblood-soft`: oxblood-soft label + optional underline.

**States:**
- Default / Hover / Focus (2px ivory ring + 2px offset) / Active pressed / Disabled (opacity 0.4 + cursor not-allowed + `aria-disabled="true"` — uses `dust-2` text for contrast per ux-auditor §1.3).
- Loading: `useFormStatus().pending` integration + spinner replacing leadingIcon.

**Polymorphism via `asChild`:**

```tsx
<Button asChild variant="primary">
  <Link href="/log">NEW LOG</Link>
</Button>
```

Delegates render to single child (Radix-style). Cleaner than `as={Component}` for TypeScript.

### 8.2 Input (label+input+helper+error — WCAG 3.3.2 compliant)

Discriminated-union `kind` — required data binds to input type:

```ts
type InputProps =
  | { kind: 'text'; value; onChange; label: string; placeholder?; error? }
  | { kind: 'email'; value; onChange; label; error?; autoComplete? }
  | { kind: 'password'; value; onChange; label; error?; reveal?; onToggleReveal? }
  | { kind: 'number'; value: number; onChange; label; min?; max?; step?; unit? }
  | { kind: 'date'; value; onChange; label; min?; max? }
  | { kind: 'textarea'; value; onChange; label; placeholder?; rows?; autoResize? };
```

**Structure (every kind):**
- Visible label ABOVE input — Inter 10.5 UPPERCASE tracking 0.18em dust. `<label for={id}>`. Never placeholder-only.
- Input: 56px (44px on compact surfaces). `bg-1`, 1px `rule-strong`, zero radius.
- Focus: border becomes `oxblood`; 2px **ivory** outline + 2px offset.
- Helper text below (on focus or always): Inter 10.5 dust.
- Error caption: `!` glyph (mono oxblood) + Inter 10.5 oxblood message. `aria-describedby={errorId} aria-invalid={!!error}`.

### 8.3 Chip

```ts
interface ChipProps {
  selected?: boolean;
  onToggle?: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: 'outline' | 'inverted' | 'oxblood-left';
}
```

**Variants:**
- `outline`: 1px rule-strong border + sand label. Active: oxblood border + bg-2. Used in: meal-slot radios, preset chips, filter pills.
- `inverted`: ivory background + bg-0 text (active-state of range toolbar).
- `oxblood-left`: 2px oxblood left border + ivory label + bg-2 fill (used in confirmation meal-slot kicker-row pattern).

44×44 min tap. Inter 10.5 UPPERCASE tracking 0.22em or Newsreader italic per variant.

### 8.4 MacroBar (shared across Dashboard + Food Detail + Weekly Review + Confirmation)

```ts
type MacroBarData =
  | { status: 'under' | 'approaching' | 'on-target' | 'over';
      consumedG: number; targetG: number;
      macro: 'protein' | 'carbs' | 'fat' }
  | { status: 'loading' | 'error'; macro: 'protein' | 'carbs' | 'fat' };

interface MacroBarProps {
  data: MacroBarData;
  size?: 'compact' | 'default' | 'detail';
  showLabel?: boolean;
  showValue?: boolean;
}
```

**Sizes:**
- `compact`: 4px tall track, 240px max width, small labels. Used in Food Detail.
- `default`: 8px track, full-width. Used in Dashboard.
- `detail`: 6px track + rich labels. Used in Confirmation per-item strip + Weekly Review mini.

Consistent colors: Protein `ivory`, Carbs `ochre`, Fat `ember`. On-target: 2px `moss` outline. Over: fill→`oxblood` + `!` glyph.

`role="meter" aria-valuenow aria-valuemax aria-label`.

### 8.5 Card

```ts
interface CardProps {
  tone?: 'bg-0' | 'bg-1' | 'bg-2';
  border?: 'none' | 'hairline' | 'strong' | 'grid-cell';
  accent?: 'none' | 'oxblood-left' | 'ember-left';
  padding?: 'tight' | 'default' | 'generous';
  as?: ElementType;
  children: ReactNode;
}
```

**Uses:**
- Chart card (Agent 6 chart sections).
- Modal cards (log, merge, delete, delete-account, export, PWA).
- Library grid cells (`border='grid-cell'` — shares grid rules).
- Settings sections.
- Weekly Insight Card (`accent='oxblood-left'`).
- Undo Toast (`accent='ember-left'`).

Mostly the same rectangle; tone/border/accent composition.

### 8.6 RuleDivider (hairline + strong)

```ts
interface RuleDividerProps {
  weight?: 'default' | 'strong' | 'dotted';
  double?: boolean;                           // masthead 2×1px + 4px gap
  orientation?: 'horizontal' | 'vertical';
  color?: 'default' | 'oxblood';
  length?: 'full' | 'short';
}
```

Enforces: no raw `<hr>` or `border-top: 1px` outside this primitive. Lint rule flags raw borders.

### 8.7 UndoToast (consumed by log flow, library, dashboard water-add)

Consumed-of-context primitive — never rendered directly. Consumers use `UndoQueueContext.pushToast()`.

Implements §7.2.7 spec: ember left rule, 5-bullet countdown, LIFO stack, cleared-on-nav.

### 8.8 Kicker (uppercase Inter 10.5 tracking 0.22em — editorial chrome)

```ts
interface KickerProps {
  sectionNumber?: number;                    // prefixes "§ 03"
  children: ReactNode;
  accent?: 'default' | 'oxblood' | 'oxblood-soft';
}
```

The characterful `§ 03 · THE DAY'S ENTRIES` marker. Used across every section heading app-wide. Inter 500 10.5 UPPERCASE tracking 0.22em. JetBrains Mono 10.5 for the `§ NN` prefix.

### 8.9 DropCap (editorial flourish)

Runtime-singleton primitive. Dev-mode `console.error` if `<DropCap>` renders twice on a page.

```tsx
<DropCap color="ember">A</DropCap>
```

Newsreader 400 82px 3-line float. Color `ember` (per tiebreaker #2 — oxblood at 2.12:1 on bg-quote fails large-text; ember 4.84:1 passes).

Used exactly once in the Weekly Review pull-quote. CSS-only pseudo-element implementation (so screen readers read the full first word intact — ux-auditor §7).

**Additional primitives in `components/ledger/` (existing, per architecture §5):**
- `PullQuote` — bg-quote wrapper for pull-quote body.
- `LetterMark` — computed letter-mark algorithm from §7.3.4.

---

## 9. Motion System

### 9.1 Named timings table

All durations flow from the single `--ease-editorial: cubic-bezier(0.2, 0.8, 0.2, 1)` curve.

| Token | Duration | Use |
|---|---|---|
| `motion-micro` | 120ms | Hover, focus, opacity crossfade, press feedback |
| `motion-standard` | 180ms | Modal open/close, toast appear, nudge pulse |
| `motion-expressive` | 320ms | Rule-draw, page-settle, shared-element |
| `motion-chrono` | 600ms | Chronometer arc first paint |
| `motion-page-turn` | 480ms | **Tablet rail expand, route change "page turn"** (anti-generic non-power-of-two per design-lead §2.1) |
| `motion-shimmer` | 1600ms | Skeleton pulse (staggered 150ms across adjacent cards per ux-specialist §6.2) |

**Named transitions:**

| Name | Property | Duration | Use |
|---|---|---|---|
| `ink-fade` | opacity | micro | Hover, focus, nav swap, number crossfade |
| `rule-draw` | transform: scaleX 0→1 from left | expressive | Hairline entering, bar fill |
| `chrono-draw` | SVG stroke-dashoffset | chrono | Chronometer consumed arc first paint |
| `ember-pulse` | transform: scale(1→1.02→1) | standard | Save confirm, nudge card |
| `page-settle` | opacity 0→1 on main | expressive | Route change |
| `page-turn` | mixed (opacity + width) | page-turn | Tablet rail expand, onboarding step |

### 9.2 Dashboard choreography (t=0→1200ms stagger)

Per §3.3 above. `lib/motion/dashboard-choreography.ts`:

```ts
export function getDashboardStaggerDelay(element: DashboardElement): number {
  if (prefersReducedMotion()) return 0;
  const stages: Record<DashboardElement, number> = {
    masthead: 0,
    kicker: 150,
    chronometer: 300,
    macroBars: 400,
    mealsBulletin: 600,
    waterTracker: 800,
    microPanel: 800,
    chronometerProjection: 1000,
    weeklyInsight: 1200,
  };
  return stages[element];
}
```

Consumers apply via Framer Motion `transition.delay` or CSS `animation-delay`.

### 9.3 Reduced-motion fallback (1ms + crossfades only)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Transforms/scales/translates: 1ms (instant).
- Opacity crossfades: still allowed (no spatial motion).
- Chronometer: renders fully drawn on first paint.
- Heatmap cells: render instantly (no row stagger).
- Page transitions: hard cut.
- FAB hover: no scale; color-only swap.

Settings `Reduce motion` toggle (Display subsection) additively enforces this regardless of OS preference.

WCAG 2.3.3 Animation from Interactions AAA — honored.

### 9.4 Framer Motion LazyMotion + m pattern

Per tiebreaker #11 — every Framer consumer imports `LazyMotion` + `m` (not `motion`):

```tsx
import { LazyMotion, domAnimation, m } from 'framer-motion';
<LazyMotion features={domAnimation}>
  <m.div animate={{ opacity: 1 }} />
</LazyMotion>
```

Saves ~27KB on every route using motion.

Shared config: `lib/motion/defaults.ts`:

```ts
export const EASE_EDITORIAL = [0.2, 0.8, 0.2, 1] as const;
export const motion = {
  micro: { duration: 0.12, ease: EASE_EDITORIAL },
  standard: { duration: 0.18, ease: EASE_EDITORIAL },
  expressive: { duration: 0.32, ease: EASE_EDITORIAL },
  chrono: { duration: 0.6, ease: EASE_EDITORIAL },
  pageTurn: { duration: 0.48, ease: EASE_EDITORIAL },
} as const;
export const variants = {
  inkFade: { initial: { opacity: 0 }, animate: { opacity: 1, transition: motion.micro }, exit: { opacity: 0, transition: motion.micro } },
  emberPulse: { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1, transition: motion.standard }, exit: { opacity: 0, scale: 0.98, transition: motion.micro } },
  pageSettle: { initial: { opacity: 0 }, animate: { opacity: 1, transition: motion.expressive }, exit: { opacity: 0, transition: motion.standard } },
} as const;
```

`useReducedMotion()` hook wrapped in `lib/motion/use-motion.ts` (client-only — marked `'use client'` per react-perf §11) returns micro hard-capped at 1ms when reduced.

---

## 10. Accessibility Rules (consolidated)

### 10.1 Contrast (corrected ratios — contrast matrix §2.2)

Per tiebreaker #1 + #2: ratios recomputed; authoritative matrix in §2.2. Key rules:
- `oxblood` never as text (2.28:1 fails everywhere).
- `oxblood-soft` large-text only (2.96:1 on bg-0 borderline; with 0.22em tracking aid).
- `dust-2` never on bg-2 (2.90:1 fails).
- Hairlines are decorative only (1.28:1 `rule` on bg-0 — ok since WCAG 1.4.11 exempts decorative).
- Load-bearing dividers get a heading above them so dividers become decorative (per ux-auditor V12).

### 10.2 Focus management (ivory focus ring — tiebreaker #1)

**Global focus ring:** 2px `ivory` outline + 2px offset (`#F4EBDC` at 16.67:1 vs bg-0 — passes WCAG 1.4.11 UI contrast 3:1 floor).

Agent 1's original `oxblood` (2.28:1) and ux-specialist's `oxblood-soft` (2.96:1) both fail WCAG 1.4.11. Design-doc §15 line 773 correctly specifies `ivory`. Ux-auditor recomputation is authoritative.

Utility:
```css
.focus-editorial {
  @apply focus-visible:outline-2 focus-visible:outline-ivory focus-visible:outline-offset-2;
}
```

ESLint `no-outline-none` expanded per ux-auditor §2.3 to catch `outline: 0`, `outlineWidth: 0`, Tailwind `outline-none` / `outline-0` / `focus:outline-0`.

**Focus management specifics:**
- Modal focus trap via `<FocusTrap>` primitive + `inert` attribute on background routes.
- Destructive modal dialogs (bulk-delete, account-delete): first focus on CANCEL (not DESTROY) — standard convention.
- On step entry (onboarding): focus first input (not NEXT).
- On button enable (account-delete Step 3 countdown reaches 0): focus DOES NOT auto-shift — stays on CANCEL to prevent mis-click.
- Skip link: `<main id="main-content" tabindex="-1">`; programmatic `.focus({preventScroll: false})` on click (Chromium scrolls but doesn't move focus without this).

### 10.3 Keyboard navigation (all shortcuts + escape hatches + context menu paths)

**Global shortcuts** (toggleable via Settings → Display → DISABLE KEYBOARD SHORTCUTS):
- `/` focus search
- `n` open log modal
- `g d/l/p/s` nav to destinations (leader sequence, 1200ms window)
- `?` shortcuts help overlay
- `Escape` close modal, defocus search
- `Tab`/`Shift+Tab` native

**Component-local keyboard nav:**
- Log modal tabs: ArrowLeft/Right between tabs; Home/End first/last (WAI-ARIA tablist).
- Library tab grid: ArrowDown/Up/Left/Right (listbox); Enter selects.
- Confirmation meal slot: `1`/`2`/`3`/`4` jumps (focus-scope guarded — WCAG 2.1.4 compliant).
- Library card keyboard: Enter opens drill-in (non-select); Space toggles selection (select mode).
- Tools rail: `/` focus search; `m` merge (guarded); `Delete/Backspace` bulk-delete.
- Progress range chips: Left/Right arrows (tablist).
- Heatmap: arrow keys 2D grid with `aria-activedescendant`; Enter/Space opens tooltip.
- Sidebar: ArrowUp/Down cycle nav items.

**Context menu keyboard paths** (tiebreaker #20):
- Meals bulletin entry rows: `Menu` key + `Shift+F10` on focused entry.
- Library cards: `Menu` key + `Shift+F10` on focused card.
- `aria-haspopup="menu"` on both targets.

**Missing path fixes** (ux-auditor §3.3):
- M4 Swipe-dismiss sheets: keyboard Escape + `Shift+F10` alternative.
- M5 Portion Picker stepper: ArrowUp/ArrowDown on focused value also steps.
- M7 Water Tracker: keyboard Enter on focused chip (standard).

### 10.4 ARIA (live regions, roles, labels, expanded)

**Live regions** (`<LiveRegion>` shared component at `lib/a11y/LiveRegion.tsx` — polite vs assertive; created at app start, not on-demand):
- Undo toast: `role="status" aria-live="polite"`.
- Save confirmation: `aria-live="polite"`.
- Save failure: `role="alert" aria-live="assertive"`.
- Offline banner: `aria-live="polite"`.
- AI latency warning (>8s): `aria-live="polite"`.
- Chart tooltips (keyboard nav): `aria-live="polite"` companion region.
- Export/Delete progress: `aria-live="polite"`.
- Account delete countdown: `aria-live="polite" aria-atomic="true"`.

**Roles:**
- Modals: `role="dialog" aria-modal="true" aria-labelledby={title_id}`.
- Menus: `role="menu"` + `role="menuitem"` + arrow navigation.
- Tablists: `role="tablist"` + `role="tab" aria-selected`.
- Meters: `role="meter" aria-valuenow/min/max`.
- Switches: `role="switch" aria-checked`.
- Grid (library, heatmap): `role="grid"` + `role="row"` + `role="gridcell"` + `role="rowheader"` / `role="columnheader"`.

**Labels:**
- Icon-only buttons always have `aria-label`: FAB ("New log entry"), modal close ("Close"), back chevron ("Back to Library" / "← INDEX"), meals ⋯ ("More actions for {food name}"), water correct ("Correct latest water entry"), trash icons ("Delete this item"), password reveal ("Show password" / "Hide password").
- Charts have `role="img"` + summary `aria-label` + `<details>` data-table drawer (ux-auditor §5.5).

**Expanded:**
- Tablet rail: `aria-expanded` reflects keyboard-focus state (not visual-hover).
- Why-panel disclosure: `<button aria-expanded aria-controls="why-body">`.
- "+N MORE" overflow: `aria-expanded` + `aria-controls`.

### 10.5 Semantic structure + heading hierarchy

**Landmarks:**
- `<header>` wraps masthead.
- `<nav aria-label="Primary">` on sidebar/rail/bottom-tab (only one mounted at a time per breakpoint).
- `<main id="main-content" tabindex="-1">` wraps primary content.
- `<aside aria-label="Daily audit">` wraps dashboard right-panel (water + micros + insight — ux-auditor §5.1 gap fix).

**Heading hierarchy:**
- Dashboard: `<h1>` Kalori wordmark → `<h2>` section kickers (`§ 01 · TODAY'S INTAKE`) → `<h3>` card titles.
- Library: `<h1>` "THE LIBRARY" → `<h2>` `§ 03 · PERSONAL LIBRARY` → drill-in injects `<h2>` for food name.
- Progress: `<h1>` "THE ALMANAC" → `<h2>` section kickers `§ 05–§ 10` → `<h3>` chart titles.
- Onboarding: `<h1>` each step title (single-purpose route).
- Settings: `<h1>` "Settings" → `<h2>` subsection titles.
- Login: `<h1>` wordmark.

### 10.6 Touch target 44×44 minimum

Per tiebreaker + ux-auditor §8.1 — WCAG 2.5.5 AA + 2.5.5 AAA enforced.

**Fixes applied throughout artifact:**
1. User strip SIGN OUT persistently visible 44×44.
2. Skip link padding to 44×44.
3. Meals bulletin `+add to X`: 44×44 (was 44×32).
4. Water chip buttons: 44×44 (was 44×32).
5. Save-to-library toggle hit area: 44×44 (visual 48×24).
6. Weekly insight "VIEW FULL REVIEW" link: 44×44 hit area.
7. Library card context menu items: 44px (was 40px).
8. Progress range chips: 44px min-height.
9. Weight chart quick-add link: 44×44.
10. **Heatmap mobile cells: 24×24 minimum** (tiebreaker #9 — was 12×20 fails WCAG 2.5.5 AA). Transpose earlier, reduce days-visible to 7 at narrow widths.
11. Onboarding slider thumb: `hitSlop` 16px all sides for 48×48 effective touch.
12. Settings chip toggles: 44×44 (was 32).
13. Confirmation stepper: 44×44 (was 36×28).

#### 10.6.1 Mobile wheel picker — a11y contract (tiebreaker #23)

Authoritative for `MobileWheelPicker` (§4.1.10) and every consumer that hosts it (Portion Picker §7.2.5, Confirmation ItemList §7.2.6, TimeEditor §7.2.6).

**Roles & ARIA wiring:**
- Container: `role="listbox"` + `aria-label` (consumer supplies — e.g., `"Portion in portions"`, `"Hours"`).
- Each row: `role="option"` + `aria-selected={index === activeIndex}` + a stable `id` so the container can target it via `aria-activedescendant`.
- Container: `aria-activedescendant={ids[activeIndex]}` and `tabIndex={0}` so keyboard users land on the wheel as a single composite widget (matches §7.3.1 Library Grid pattern).
- When wrapped in a Radix Dialog sheet, the dialog supplies `aria-modal` + `aria-labelledby` for the sheet title (e.g., `"Edit portion"`).

**Keyboard contract:**
- `ArrowUp` / `ArrowDown` — move active row by one (clamped to bounds; no wrap).
- `PageUp` / `PageDown` — move by 5 rows (one viewport).
- `Home` / `End` — jump to first / last row.
- `Enter` — commit current row → fire `onCommit?.(value)` and close the host sheet (consumer wires the close).
- `Escape` — close the sheet WITHOUT firing `onChange` / `onCommit` (no commit on cancel). Required so accidental opens are recoverable.
- The wheel must NOT trap Tab; Tab/Shift+Tab leave the wheel and move to the sheet's `DONE` / dismiss buttons. Internal navigation is arrow-key only.

**Pointer / touch contract:**
- Vertical scroll snaps to the nearest row at the snap-end event. The active row is always the row whose center crosses the wheel's center axis.
- `onChange` fires on snap-end (NOT during the gesture) — preventing flicker of intermediate values into form state.
- Tapping a non-active row scrolls it into the center and fires `onChange`.

**Reduced motion (§9.3):**
- When `useReducedMotion()` returns `true`, the wheel renders the static end-state (no inertial spring, no rotational fade). Programmatic value changes snap instantly. Pointer scroll still uses the browser-native scroll-snap (which is itself instant under `prefers-reduced-motion: reduce`); the additional motion the picker would otherwise add (`transform: rotateX` on far rows) is suppressed.
- The visible-row count, hairlines, and oxblood center underline are unchanged — the picker is still a recognizable wheel; the *animation* is what's removed, not the *affordance*.

**Sizing & touch targets (§10.6):**
- Each row ≥ 44px tall (default 44; consumer may raise but never lower).
- Visible rows: 5 (default; one center + two faded above + two faded below). Container height = `itemHeight × visibleRows`.
- Active row: 2px `oxblood` underline only — no row-fill, no rounded highlight (Ledger §3.4 hairlines-only).
- Faded rows: opacity ramp `0.4 → 1 → 0.4` across the visible window via `useTransform`.

**Commit / cancel grammar:**
- A bottom-sheet host MUST render an explicit `DONE` button (full-width, 56px, oxblood). Outside-tap or Escape = cancel (no commit). Snap-end fires `onChange` so consumers can preview the value live, but the form-state change is not persisted until `DONE` (consumer holds an in-sheet draft and commits on `DONE`).
- This split avoids the "scroll-out commits an unintended value" footgun on touch devices.

**High-cardinality cap:**
- ≤ 50 rows. Above that, the wheel UX degrades (users can't reach extremes without long flicks). Portion 0.25–10 step 0.25 = 40 rows ✓. Hours 24 ✓. Minutes step 5 = 12 ✓. If a future consumer needs > 50 items, fall back to a Radix Dialog + filtered listbox (NOT the wheel).

**No-op exceptions:**
- `<input type="time">` and `<input type="date">` ALREADY render an OS-level wheel on iOS/Android — do NOT shim them. The §7.5 timezone `<select>` likewise renders the OS picker on mobile and is left as-is.

### 10.7 Motion safety + prefers-reduced-motion

Per §9.3 + ux-auditor §6.

- All animations have reduced-motion fallbacks.
- PWA install modal explicitly adds reduced-motion fallback per ux-auditor M6.1 (was gap).
- Settings "Reduce motion" toggle additively enforces (never cancels OS preference).
- WCAG 2.3.1 Three Flashes — verified: no animation >3 Hz. Weekly Review "DRAFTING..." pulse at 0.83 Hz (under 3 Hz floor).
- WCAG 2.3.3 AAA Animation from Interactions — honored via reduced-motion fallback.

### 10.8 Form accessibility (labels, error linking, autocomplete, aria-required)

Per tiebreaker #21. Every input:
- Visible `<label for>` above (NOT placeholder-only).
- `aria-describedby={errorId}` linking input to error message.
- `aria-invalid={hasError}`.
- `aria-required` on required fields.
- `autocomplete` for known fields: email (`username email`), password (`current-password` / `new-password`), name (`given-name`), DOB (`bday`).
- Input types: `type="email"`, `type="password"`, `type="date"`, `type="number" inputmode="decimal"`, `type="search"` (iOS keyboard optimization — ux-auditor §7.5).
- Inline validation on blur + re-validate on submit (ux-specialist §4.2).
- Password reveal `aria-pressed={revealed}` or `role="switch" aria-checked`.

Specific applications: TYPE textarea (label `"DESCRIBE YOUR MEAL"`), Library search, Log-Library search, Onboarding name/DOB/height/weight, Account-delete email, Login email/password, all Settings inputs, Portion Picker stepper.

### 10.9 Color never sole signal

Per Agent 1 §7.7 — every color-coded state pairs with a second channel:

| State | Color | Second channel |
|---|---|---|
| On-target macro | moss | "on target" label + `✓` glyph |
| Approaching | ember | "approaching" label |
| Over-target | oxblood | `!` glyph + "over" text |
| Active nav | oxblood border | ivory text + `aria-current="page"` |
| Error inline | oxblood text | `!` glyph + 1px oxblood top rule |
| Form-field error | oxblood underline | oxblood caption + `aria-invalid="true"` |
| AI confidence low | (no color) | italic serif "estimate" footnote |
| Heatmap cell | c0-c9 gradient | tooltip with numeric value + % + aria-label |
| Water bar ≥100% | moss | `✓` glyph (ux-auditor §9.2) |
| Macro stack colors | ivory/ochre/ember | position + label + **texture patterns** (carbs diagonal hatch, fat dot) per ux-auditor §9.2 color-blind support |
| Selected library card | oxblood inset border | checkbox glyph + scale 0.95 |
| Progress over-budget | oxblood | "OVER TARGET" text |

### 10.10 Dark-mode specific concerns

Per ux-auditor §10:

- **Pure-black / pure-white avoidance:** bg-0 `#0E0A08` warm near-black (not pure); ivory `#F4EBDC` warm cream (not pure). Reduces OLED flicker + eye strain.
- **No glow/bloom:** glassmorphism, shadows, `backdrop-filter: blur()` all banned. Single radial-gradient at masthead top is static fill (decorative, not bloom).
- **Large oxblood saturation management:**
  - FAB (56×56): single focal point — acceptable.
  - Oxblood button fills (56px × full-width): pair with outline secondaries, never stack two oxblood buttons side by side.
  - Letter-mark backgrounds: **bg-2 + oxblood TOP rule + sand letter** (tiebreaker #7) — prevents the oxblood-flood on a 4-col grid.
  - Drop cap: rendered in `ember` (4.84:1 vs bg-quote) — NOT oxblood (2.12:1 fails large-text).
- **OLED black-pixel:** `#0E0A08` ≈ 5% brightness ~on-pixel. Acceptable battery trade-off for warmth.

**Risk mitigation (design-lead §9):**
- **"Oxblood flood" prevention rule** in Agent 1 §2.1: *"Oxblood is the SIGNATURE. It appears on at most 2–3 non-transient elements per screen."* Lint proposal: count `--color-oxblood` references per page's rendered CSS, warn at >4.
- **"Radius creep" prevention:** ESLint `no-radius-other-than-zero-or-full` ships Task 1.1. Ledger Inviolables documented: no radii, no shadows, no backdrop-blur, no gradient structure, no Material ripple, no bouncing spring physics.
- **"Inter creep" prevention:** `next/font` `display: "swap"`; cascade Tiempos Display → Georgia; NEVER substitute Inter for Newsreader body. Visual regression test flags `<p>` rendering Inter.
- **"Safe-symmetric grid relapse" prevention:** asymmetric dashboard composition documented explicitly; Playwright visual regression against mockup reference.

---

## 11. Screen Inventory Table

| Screen | Route | Auth | Composition (primitives + compounds) | Breakpoints | RSC/Client |
|---|---|---|---|---|---|
| Landing | `/` unauthed | No | Masthead + 2 auth CTAs | Centered single-col | RSC |
| Auth (Login/Signup) | `/login` | No | Wordmark + LoginForm compound + OAuth button | Centered 420 / full-mobile | Split (RSC shell + LoginForm client) |
| Onboarding | `/onboarding` | Auth | `OnboardingLayout` compound + 8 `<Step*>` | Centered 640 | Client (Zustand + sessionStorage) |
| Dashboard | `/` authed | Auth | Masthead + Chronometer + MacroBars + MealsBulletin + WaterTracker + MicronutrientPanel + WeeklyInsightCard + Compound choreography | 3-col desktop / 2-col tablet / 1-col mobile | Split (majority RSC + client islands) |
| Log Flow | `/log` modal | Auth | `LogModal` compound (Tabs + 3 Panes + Confirmation) + PortionPicker | Full-screen mobile / 720 centered tablet+desktop | Client (lazy-loaded) |
| Library | `/library` | Auth | Masthead + ToolsRail + LibraryGrid (4/3/2 col ruled) + `LibraryCard` compound + BulkActionBar | 4/3/2 col | Split (RSC grid + client islands) |
| Food Detail | `/library/[id]` | Auth | `FoodDetail` compound (Thumbnail/Name/Macros/History/Actions) | Right-sheet desktop / full-sheet mobile | Client (shared-element + inline edits) |
| Progress | `/progress` | Auth | RangeToolbar + 5 chart sections + MicronutrientHeatmap + `WeeklyReviewIsland` | 2-col desktop / 1-col mobile; heatmap transposes mobile | Split (6 Suspense boundaries) |
| Settings | `/settings` | Auth | 5 subsections + marginalia column | 3-col desktop (rail + content + marginalia) / stacked mobile | Split (page RSC + form-control clients) |
| Weight Log Entry | `/weight` | Auth | Weight log form + history list | Single-col | Client |
| Weekly Review | `/review` OR `/progress#weekly-review` | Auth | `WeeklyReviewIsland` full variant (shared `WeeklyReviewCore` with Dashboard card) | Full-width | RSC inside Suspense |
| Account Delete Flow | Modal on /settings | Auth | `AccountDeleteFlow` compound (3 step variants) | Centered modal | Client (state machine + countdown) |
| Export Flow | Modal on /settings | Auth | `ExportModal` + progress + download | Centered modal | Client |
| PWA Install | Modal (contextual trigger) | Any | Folded-letter modal (tear-line + typewriter indent + ribbon-tab) | Centered modal | Client |
| Shortcuts Overlay | `?` keypress | Any | 2-col table of key/action pairs | Centered 560 | Client (lazy) |

---

## 12. Implementation Notes

### 12.1 Task sequencing implications

- **Task 1.1 (Foundation):** ships `components/primitives/` (all 9), `lib/tokens.ts`, `lib/motion/defaults.ts`, `lib/cache/tags.ts`, `lib/motion/use-motion.ts` (`'use client'`), 7 ESLint rules, `app/globals.css` with `@theme` block, font loader in `app/layout.tsx`.
- **Task 2.x (Onboarding + Auth):** `LoginForm`, `OnboardingLayout` compound, 8 steps, Mifflin-St Jeor math module.
- **Task 3.x (Dashboard + Log Flow):** ChronometerRing + MacroBars + MealsBulletin + WaterTracker + MicronutrientPanel, `LogModal` compound, `Confirmation` compound, `UndoToast` + `useUndoable` headless primitive, dashboard choreography module.
- **Task 4.x (Library + Progress):** `LibraryCard` compound, `MergeDialog` compound, `FoodDetail` compound, `BulkDeleteModal`, 5 charts + Heatmap, `WeeklyReviewIsland` + shared `WeeklyReviewCore`.
- **Task 5.x (Polish + PWA):** `PWAInstallPrompt`, `AccountDeleteFlow` compound, `ExportModal`, `FirstTimeDashboardCoachmark`, `OfflineQueue` primitive.

**Playwright visual baselines captured per phase:**
- Phase 1: landing, skeleton states.
- Phase 2: auth + onboarding 8 steps.
- Phase 3: dashboard (8 variants) + log flow (3 tabs + confirmation).
- Phase 4: library (4-col + drill-in + merge + bulk-delete) + progress (5 charts + heatmap).
- Phase 5: PWA install + delete flow + export.

Total: 18 baselines (6 screens × 3 breakpoints) per design-doc §13.

### 12.2 ESLint rules

7 rules ship in Task 1.1 per §4.1:

1. **`no-hardcoded-hex`** — string literals matching `/#[0-9A-Fa-f]{3,8}/` outside `lib/tokens.ts` + `app/globals.css`.
2. **`no-outline-none`** — AST + Tailwind-class coverage per ux-auditor §2.3.
3. **`no-radius-other-than-zero`** — border-radius values other than 0, `var(--radius-none)`, `50%`, `var(--radius-full)`.
4. **`no-inline-cache-tag`** — `cacheTag`/`updateTag` args must be `TAGS.*` constants (I12).
5. **`no-boolean-prop-proliferation`** — reviewer flag at >3 boolean props on a component.
6. **`no-direct-button-element`** — raw `<button>` outside `components/primitives/`.
7. **`no-server-state-in-zustand`** — bans `useEntriesStore`, `useLibraryStore`, `useProfileStore` imports (tiebreaker #17).

Additional warnings:
- Barrel imports of `@phosphor-icons/react` (use `/dist/ssr/{Icon}` SSR path).
- More than 4 `--color-oxblood` references per rendered CSS file (oxblood-flood prevention).
- Raw `<p>` / pull-quote rendering in Inter (Inter-creep prevention).

### 12.3 Testing hooks (data-testid conventions for Playwright)

Every interactive element that Playwright must target gets `data-testid`:

- Nav items: `data-testid="nav-{destination}"`.
- FAB: `data-testid="log-fab"`.
- Log modal: `data-testid="log-modal-{tab}"`, `data-testid="log-parse-button"`, etc.
- Confirmation: `data-testid="confirmation-{item|meal|save}"`.
- Library: `data-testid="library-card-{id}"`, `data-testid="merge-dialog"`, `data-testid="bulk-delete-modal"`.
- Charts: `data-testid="chart-{section}"`.
- Heatmap cell: `data-testid="heatmap-cell-{nutrient}-{dateISO}"`.
- Undo toast: `data-testid="undo-toast"`, `data-testid="undo-action"`.

**Axe-core assertions** per ux-auditor §12: every E2E includes `new AxeBuilder({ page }).include('#main-content').analyze()` — `expect(results.violations).toEqual([])`.

**Keyboard-only flow tests** (per ux-auditor §12.3): log-flow, library-merge, account-delete, heatmap-cell, dashboard keyboard — zero mouse events.

**Reduced-motion tests:** every E2E with `{ reducedMotion: 'reduce' }` context; assert animations ≤1ms.

**200% zoom test:** `tests/e2e/zoom-200.spec.ts` — assert `scrollWidth <= innerWidth` at 375/768/1280.

**Contrast unit tests on `lib/tokens.ts`:** compute every color pair via `color-contrast-checker`; assert declared ratios.

---

## 13. Reconciled Conflicts Log

Every reconciliation decision documented with tiebreaker source.

| # | Conflict | Resolution | Source |
|---|---|---|---|
| 1 | **Focus ring color** — Agent 1 said `oxblood` (2.28:1 fails); ux-specialist said `oxblood-soft` (2.96:1 fails per ux-auditor recomputation) | Use **`ivory`** 2px outline + 2px offset (16.67:1 vs bg-0) | design-doc §15 line 773 + ux-auditor §1.1 |
| 2 | **Contrast ratios** — Agent 1 published off-by-0.3-to-0.9 | Use ux-auditor's recomputed ratios (oxblood 2.28, oxblood-soft 2.96, dust-on-bg-1 4.92). Corrected contrast matrix in §2.2 | ux-auditor §1.1 |
| 3 | **FAB shape** — design-doc §9 says "circular 56×56"; Agent 1 + Agent 2 + Ledger brief say zero-radius square | **Zero-radius square**. Brief + mockup override design-doc §9. Note in §6.4 | Brief canonical visual source |
| 4 | **Merge reversibility** — Agent 5 proposed 5s undo with `deleted_at` schema addition; design-doc §18.3 says "cannot be undone" | **NON-undoable per design-doc §18.3.** Delete Agent 5's merge-undo scheme + schema addition. Keep bulk-delete undo via tombstone (different operation) | design-doc §18.3 authoritative |
| 5 | **Palette size** — 13 tokens in `03-pre-artifacts.md` vs 14 in Agent 1 mockup-extraction (adds `bg-quote`, `dust-2`) | **14 tokens** | Agent 1 mockup canonical |
| 6 | **Macro colors** — Agent 6 reads mockup as "protein oxblood"; Agent 1 §2.2 canonical is protein ivory | **Protein = ivory, Carbs = ochre, Fat = ember** | Agent 1 single-source-of-truth |
| 7 | **Oxblood consolidation** (design-lead anti-diffusion) | **5 signature moments retained** (chronometer over-target, FAB, save buttons, active nav, drop cap). **4 diffusion points bound down:** letter-mark = bg-2 + oxblood top rule + sand letter; water chart fill = slate; undo toast left rule = ember; "VIEW FULL REVIEW" = ivory text + oxblood-soft underline | design-lead §3.1 + §3.2 |
| 8 | **Heatmap nutrient count** — Agent 6 prompt suggested 10–12; design-doc §10.8 + mockup lock 7 | **7 nutrients** (Fibre, Protein, VitA, VitC, VitD, Iron, Calcium) | design-doc §10.8 |
| 9 | **Heatmap mobile cells** — Agent 6 specced 12×20; ux-auditor flags WCAG 2.5.5 AA fail (24×24 min) | **24×24 minimum** on mobile. Transpose earlier. Reduce days-visible to 7 at narrow widths | ux-auditor §8.1 WCAG 2.5.5 |
| 10 | **Recharts bundle cost (~120KB)** | Dynamic-import (`next/dynamic ssr:false`) for all charts. Water Adherence uses inline SVG (simpler bar) | react-perf §7 + §10 |
| 11 | **Framer Motion import pattern** | LazyMotion + `m` (not full `motion`). ~27KB saving per route | react-perf §7 |
| 12 | **Log Flow redesigns (3 design-lead anti-generic)** | Portion Picker flush-serif `VALUE × [UNIT]` layout (not stepper); Meal-slot kicker-row radio (not 4-chip row); Undo Toast 5-bullet tolling countdown (not depleting bar) | design-lead §2.4 |
| 13 | **Dashboard choreography** | Single orchestrated t=0→1200ms entrance. Extract to `lib/motion/dashboard-choreography.ts`. Signature moment | design-lead §6.2 |
| 14 | **Compound components** | Ship all 6: LogModal, Confirmation, MergeDialog, FoodDetail, LibraryCard, OnboardingLayout. Full TypeScript APIs in §4.2 | architecture §2 |
| 15 | **Primitives layer location** | `components/primitives/` (9 primitives) + `lib/primitives/` (4 headless). ESLint-enforced imports. Ships in Task 1.1 | architecture §5 |
| 16 | **Discriminated unions for status states** | Applied to 8 components: ChronometerRing, MacroBars, MealsBulletin, Confirmation, SnapDraft, LoginForm, AccountDelete, WeeklyInsightCard. Pattern: `{status:'loading'} \| {status:'ready', data:T} \| {status:'empty', onCTA} \| {status:'error', error}` | architecture §8 |
| 17 | **Server state location** | Remove `useEntriesStore` / `useLibraryStore`. Server state stays on server (Cache Components + PPR). Zustand reserved for ephemeral UI (modals, tabs, drafts, undo queue) | react-perf §9 |
| 18 | **Server Actions + useOptimistic** | All mutations (log save, water add, weight add, library edit/delete/merge, bulk delete) use Server Actions + `useOptimistic`. `client_id` generated before optimistic insert | react-perf §4 |
| 19 | **TanStack Query** | **Deferred** (per `03-pre-artifacts.md`). Do NOT add. Server Actions + `updateTag` covers Approach C. If cross-component client cache coordination emerges in Phase 3, revisit | design-doc §6 L119 |
| 20 | **Keyboard context menu paths** | Meals bulletin + Library cards MUST have `Menu` key + `Shift+F10` path to context menu | ux-auditor M1/M2 |
| 21 | **Form labels (WCAG 3.3.2)** | All inputs have proper `<label for>` + `aria-describedby` + `aria-required` + `autocomplete`. Placeholder-only inputs banned. Applied to: TYPE textarea, Library search, Log-Library search, Onboarding name/DOB/height/weight, Account-delete email, Login email/password | ux-auditor §7.1 |
| 22 | **Weekly Review duplication** | Dashboard `WeeklyInsightCard` + Progress `WeeklyReviewIsland` share `<WeeklyReviewCore>` primitive. Card is compact variant; Island is full | architecture §9 |
| 23 | **Mobile wheel picker for portion + time-of-day** | Hand-rolled `<MobileWheelPicker>` (§4.1.10) on the already-prescribed `LazyMotion + m` foundation (no new dependency). Used on `<768px` for: Portion Picker §7.2.5 (replaces the flush-serif primary surface; stepper preserved on ≥768px so #12 stays intact on desktop), Confirmation §7.2.6 ItemList portion stepper (replaces inline `[−][n][+]`), Confirmation §7.2.6 TimeEditor `HH:MM` (two-column hours+minutes-step-5 wheel). Native `<select>` (timezone §7.5) and native `<input type="date">` are NOT migrated — the OS already renders an OS-level wheel for those. Breakpoint is `(max-width: 767px)` via `useIsMobile()` (`lib/hooks/use-is-mobile.ts`). A11y contract in §10.6.1 (role="listbox" + aria-activedescendant + arrow-key nav + Escape cancel + reduced-motion instant-snap). | bugfix-tomi 2026-05-08 mobile-ui-overhaul Bug 4 |
| 24 | **Mobile FAB pair (food + water)** | The single 56×56 oxblood FAB grows into a side-by-side PAIR: food primary (oxblood ground, ivory `+` crosshair, opens log-flow modal — unchanged from #3) + water secondary (`bg-1` ground, 1px `ivory` border, ivory water-drop polygon glyph, navigates to `/dashboard` for the existing `<WaterTracker />` chip — Path A user decision). Both 56×56 zero-radius, 8px gutter, total wrapper width 120px, centre offset shifts from `calc(50% - 28px)` (single) to `calc(50% - 60px)` (pair). Speed-dial / expanding-FAB / long-press still forbidden — pair = exactly two equally-primary buttons. Distinct aria-labels (`"Log food"` / `"Log water"`); food FAB testid renamed `log-fab` → `log-fab-food` in one rename round. Spec amendment in §6.4 + §2.4 + §6.6. Tiebreaker #3 stays canonical for the food FAB shape; #24 governs the pair. | bugfix-tomi 2026-05-08 mobile-ui-overhaul Bug 5 + user Phase 2 Path A decision |

**Additional sub-decisions applied but not numbered as top-level tiebreakers:**

- **Macro Distribution legend texture patterns** (carbs diagonal, fat dot) per ux-auditor §9.2 color-blind support.
- **Chart axis labels raised to 10.5px** (from 9px, ux-auditor §1.5 WCAG readable-font-size).
- **Offline banner token** at top of viewport when offline — `bg-2`, 1px rule-strong bottom, ember-toned text (ux-specialist §3.3).
- **Em-dash fades 60ms BEFORE bullet text** in weekly review bullets (design-lead §6.3).
- **Skeleton shimmer stagger 150ms across cards** (ux-specialist §6.2).
- **Stepper buttons + slider thumb 44×44 hit area** via hitSlop padding (ux-auditor §8.1).
- **`type="search"` on search inputs** for iOS keyboard optimization (ux-auditor §7.5).
- **Confirmation entry motion reduced to 320ms** (was 600ms; too slow for repeat — ux-specialist §7.1).
- **`$REUSE EXISTING$` weighted as primary** in dedup prompt (ux-specialist §7.1).
- **`← EDIT INPUT` tertiary link** on confirmation (ux-specialist §7.1 — back-nav with preserved draft).
- **Login form restructured asymmetrically** (design-lead §2.6.6 anti-generic).
- **PWA modal folded-letter metaphor** (design-lead §2.6.8 — tear-line + typewriter indent + ribbon-tab).
- **Account delete Step 3 countdown → tolling bullets** (design-lead §2.6.7 — 10-bullet ruler + italic serif counter).
- **OpenType ligatures + optical sizing** on `.serif` utility (design-lead §4.4 — free polish).
- **Persistently-visible SIGN OUT** in user strip (not hover-only — ux-auditor §11.2).
- **Nav icons 18×18 right-aligned with labels flush-left** (design-lead §2.2.2 anti-generic flip).
- **Spacing normalizations:** water-tracker bullet gap 10→8; meals-bulletin row gap 14→16; library card padding 22/20/24→24/20/24; heatmap card padding 30/32→32; weekly-review card 40/32→48/32.
- **Tracking normalizations:** onboarding 0.20em → 0.18em (ux-specialist §1.3).
- **Textarea line-height 1.4 → 1.5** per ux-specialist §1.4.
- **`§ FIND` kicker above library search** (design-lead §2.5.1 — classifieds header).
- **`§ NAVIGATION` kicker above sidebar nav list** (design-doc §9 ASCII sketch + design-lead §2.2.1).
- **Heatmap ramp retuned** for ≥1.8:1 adjacent-step contrast (ux-auditor §1.4 — was 1.11 on c0/c1).
- **Bulk-delete preview list pagination** for N>10 (ux-specialist §10.5).

**Decisions flagged for architecture.md update:**

- Add `deleted_at timestamptz null` column to `food_library_items` — **ONLY for bulk-delete tombstone** (merge still hard-deletes per tiebreaker #4). Add `POST /api/library/bulk-delete/undo` route.
- Add `profiles.always_save_without_review` column for skip-confirmation setting.

**Decisions flagged for testing-strategy.md:**

- 5 keyboard-only flow tests per ux-auditor §12.3.
- 200% zoom test per Agent 1 §7.8.
- `prefers-reduced-motion` test matrix per Agent 1 §6.4.
- Axe-core pass on every E2E.
- Color-contrast-checker unit test on `lib/tokens.ts`.
- Contrast assertions per ux-auditor §12.1.

---

**End of artifact.**

All 13 top-level sections present. Section inventory: Overview · Design Tokens · Design Principles · Component Architecture · React 19 + Next.js 16 Architecture · Navigation System · Screen-by-Screen Component Specs (9 sub-sections: Dashboard · Log Flow · Library · Progress · Onboarding · Settings · Account Delete · Login · PWA) · Shared Components Detail · Motion System · Accessibility Rules · Screen Inventory Table · Implementation Notes · Reconciled Conflicts Log.

24 reconciled conflicts. 14 palette tokens. 9 primitives + 6 compound components + 4 headless primitives. 27 RSC / 38 Client / 14 Split classification. 6 Suspense boundaries on Progress + 1 on Dashboard Weekly Insight. 18 Playwright visual baselines. 7 ESLint rules ship in Task 1.1. 21 WCAG clauses cited throughout §10.

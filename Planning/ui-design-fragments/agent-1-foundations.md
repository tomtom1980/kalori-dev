## 1. Overview of The Ledger Direction

Kalori's visual system is "The Ledger" — a **dark editorial archival broadsheet**. Oxblood and ivory on warm near-black. Zero radii. Serif display and numerals (Newsreader), sans labels (Inter), mono timestamps (JetBrains Mono). Depth comes from hairline rules, tonal card stacks, and whitespace — never shadows or glass. The app should read like a private evening broadsheet, a journal you have been keeping for years, not a fitness dashboard.

**Mood-board tags:** *archival newspaper · bibliophile library · turn-of-century printer's ledger · candlelit bedside notebook · set-in-type daily.*

**Aesthetic constraints (LOAD-BEARING — enforced in every component spec):**

- **Dark-only.** No light mode, no mode toggle, no `@media (prefers-color-scheme: light)` branches. Ever.
- **No shadows.** Depth is rules + tonal backgrounds (`bg-0` → `bg-1` → `bg-2`) + whitespace. `box-shadow: none` is the default for every card, button, menu, and modal.
- **No glassmorphism.** No `backdrop-filter: blur()`, no translucent surfaces, no frosted overlays. Modals use opaque `bg-1` over a 72% `bg-0` scrim.
- **No rounded corners** — `border-radius: 0` is the site-wide default. Two documented exceptions only: (a) the chronometer ring, data dots, and water bullet (circles, `border-radius: 50%`); (b) the mobile FAB (`56×56px`, zero-radius square with oxblood fill, per design-doc §9 — **note: design-doc §9 mentions "circular" FAB, but this agent applies the zero-radius Ledger rule per brief.md §"Shape language" — if reconciliation is needed, the Ledger brief wins; flag to Agent 2 Navigation**).
- **Hairlines only.** 1px `#2A2320` dividers, 1px `#3A3029` card frames, 1px dotted for sub-rows. No gradients as structure (gradients allowed only as the single radial glow at the top of `body`, per the mockup).
- **Grid is visible.** Column and row rules are drawn, not implied. 3-col dashboard, 5-col meals bulletin, 4-col library, 30-col heatmap — every one shows its rules.

> **Token-source authority:** All tokens below extracted from `Design/mockups-brainstorm/direction-1-editorial/index.html` (`:root` block) and reconciled against `Planning/design-doc.md §8` and `Planning/brainstorm-context/03-pre-artifacts.md §"Design Direction"`. Where specs diverge, the **mockup `:root` block is canonical** because it is the visual reference; divergences are noted inline.

---

## 2. Color Token System

### 2.1 Palette (14 colors — mockup :root canonical)

| Token | Hex | Semantic role | WCAG AA contrast vs `bg-0` (`#0E0A08`) |
|---|---|---|---|
| `bg-0` | `#0E0A08` | Page void — deep warm black, slight red cast | — (baseline) |
| `bg-1` | `#15100D` | Card field, editor pane, sidebar | 1.14:1 (non-text surface) |
| `bg-2` | `#1E1815` | Inset, "Why these numbers?" panel, meter track | 1.37:1 (non-text surface) |
| `bg-quote` | `#1A1310` | Pull-quote background (mockup-only; subtle warmer tier) | 1.22:1 (non-text surface) |
| `rule` | `#2A2320` | Hairline 1px dividers | 1.82:1 (non-text surface) |
| `rule-strong` | `#3A3029` | Card frames, masthead bottom rule, section boundaries | 2.71:1 (non-text surface) |
| `ivory` | `#F4EBDC` | Primary text (warm cream) | **15.86:1** — passes AAA for all text sizes |
| `sand` | `#C9BDA8` | Secondary text, italic pull-quote body | **10.18:1** — passes AAA |
| `dust` | `#8A8173` | Metadata, labels, section-meta mono | **4.68:1** — passes AA for ≥14px text; **fails** small-text AA (<14px regular, <18.66px bold). Lint rule: `.label` at 10.5px uses `dust` only for UPPERCASE tracked letters where the tracking + cap-height boosts legibility; any narrative `<p>` body at 10.5px must use `sand` or `ivory`. |
| `dust-2` | `#6B6156` | De-emphasized meta (mockup only — avoid for body text; **fails** AA below 18pt) | 2.90:1 (use only for non-essential decorative glyphs, e.g., disabled-state icons with adjacent text) |
| `oxblood` | `#8A2A1F` | **Signature accent.** Chronometer consumed arc, drop cap, primary CTA fill, active-nav border, insight-highlight, over-target warning | 2.86:1 as text on `bg-0` — **fails** AA for body text. Usage restricted to: (a) fills (button backgrounds — text on top is `ivory`), (b) borders/arcs (non-text), (c) single-glyph accents (drop cap on `bg-quote` background where contrast is decorative, not informational). **Never use oxblood as the sole signal for a status** — always paired with a label or icon (see §7 "Color never sole signal"). |
| `oxblood-soft` | `#A13A2C` | Hover of oxblood CTAs, wordmark italic accent, section-kicker text | 3.70:1 — passes AA for large text (≥18pt / 14pt bold). Use for kickers (10.5px UPPERCASE 0.22em tracking — tracking-boosted legibility accepted). |
| `ember` | `#C8693B` | Projections (dashed chronometer arc), "approaching target" (80–100%), fat macro bar | 5.60:1 — passes AA |
| `ochre` | `#B8894A` | Carb macro bar, inner fiber arc, heatmap mid-range | 6.48:1 — passes AA |
| `moss` | `#5C6B3D` | On-target data, micronutrient ≥ target, adherence-good | 3.48:1 — passes AA for large text (≥18pt / 14pt bold); as data-viz fill, paired with ivory label text |
| `slate` | `#4A5764` | Neutral 4th chart series, optional series | 2.68:1 — data-viz fill only, never text on bg-0 |
| `plum` | `#5D3A44` | Reserved 5th series, decorative tint | 2.62:1 — data-viz only |

### 2.2 Semantic role mapping (single source of truth for downstream agents)

| Role | Token | Note |
|---|---|---|
| Protein macro bar | `ivory` | Primary macro gets the strongest text color as fill |
| Carbs macro bar | `ochre` | |
| Fat macro bar | `ember` | |
| Water bar / bullet | `slate` | |
| On-target (≥ target %) | `moss` | |
| Approaching target (80–100%) | `ember` | Same token as fat — disambiguated by context + label |
| Over-target warning (>100%) | `oxblood` | Paired with icon + "over" text (§7) |
| Insight highlight (pull-quote drop cap, editor's voice) | `oxblood` | |
| Error state body text | `oxblood` | Paired with mono `!` glyph prefix |
| Success / saved confirmation | `moss` | Paired with check glyph |
| Active nav indicator | `oxblood` | Paired with ivory text weight change (never color-alone) |
| Disabled control | `dust-2` fill, `dust` text | |
| Focus ring | `oxblood` | 2px outline, 2px offset (§7) |

### 2.3 Tailwind v4 `@theme` block

Downstream components consume tokens exclusively via CSS custom properties. Hardcoded hex is a lint error (see §9.3).

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  /* Surfaces */
  --color-bg-0: #0E0A08;
  --color-bg-1: #15100D;
  --color-bg-2: #1E1815;
  --color-bg-quote: #1A1310;

  /* Rules */
  --color-rule: #2A2320;
  --color-rule-strong: #3A3029;

  /* Text */
  --color-ivory: #F4EBDC;
  --color-sand: #C9BDA8;
  --color-dust: #8A8173;
  --color-dust-2: #6B6156;

  /* Accents */
  --color-oxblood: #8A2A1F;
  --color-oxblood-soft: #A13A2C;
  --color-ember: #C8693B;
  --color-ochre: #B8894A;
  --color-moss: #5C6B3D;
  --color-slate: #4A5764;
  --color-plum: #5D3A44;

  /* Typography families */
  --font-serif: "Newsreader", "Tiempos Display", Georgia, serif;
  --font-sans: "Inter", "Söhne", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Söhne Mono", ui-monospace, monospace;

  /* Breakpoints (§8) */
  --breakpoint-mobile: 375px;
  --breakpoint-tablet: 768px;
  --breakpoint-desktop: 1280px;
}
```

Tailwind v4 auto-generates utilities (e.g., `bg-bg-0`, `text-ivory`, `border-rule`, `font-serif`). All component specs by Agents 2–6 must reference these utility names or the raw `var(--color-*)` custom property — never a literal hex.

---

## 3. Typography System

### 3.1 Three typefaces

| Role | Family | Weights loaded | Axes | Google Fonts URL param |
|---|---|---|---|---|
| **Serif display + numerals** | **Newsreader** | 200, 300, 400, 500, 600, 700 + italics 300, 400, 500 | `opsz` 6–72 (optical size) | `Newsreader:ital,opsz,wght@0,6..72,200;0,6..72,300;0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,300;1,6..72,400;1,6..72,500` |
| **Sans labels + chrome** | **Inter** | 300, 400, 500, 600, 700 | weight | `Inter:wght@300;400;500;600;700` |
| **Mono timestamps + codes** | **JetBrains Mono** | 300, 400, 500 | weight | `JetBrains+Mono:wght@300;400;500` |

### 3.2 Type scale

| # | Use | Family | Weight | Size | Letter-spacing | Line-height | Notes |
|---|---|---|---|---|---|---|---|
| T1 | Wordmark (masthead) | Newsreader | 300 | 104px | −0.035em | 0.88 | Italic "acc" overlay with `oxblood-soft`. Desktop only; tablet 72px; mobile 48px. |
| T2 | Section title (`§ 01 · …`) | Newsreader | 300 | 44px | −0.02em | 1.0 | Italic span `color: sand` for narrative phrases. Mobile 28px. |
| T3 | Heatmap / hero section title | Newsreader | 300 | 32px | −0.01em | 1.1 | |
| T4 | Calorie hero value | Newsreader | 300 | 82px | −0.02em | 0.95 | `font-variant-numeric: tabular-nums lining-nums`. Mobile 58px. |
| T5 | Body serif (entries, pull-quotes) | Newsreader | 400 / italic 400 | 14–22px | 0 | 1.55 | Italic for food names, direct quotes, editor's voice. |
| T6 | Drop cap | Newsreader | 400 | 82px (3-line float) | 0 | 0.85 | Used **exactly once**, in the weekly review pull-quote. `color: oxblood`. |
| T7 | Body sans | Inter | 400 | 14px | 0 | 1.55 | Default paragraph fallback (non-editorial copy). |
| T8 | Buttons | Inter | 500 | 13px | 0.08em | 1.0 | UPPERCASE on primary; sentence case on text buttons. |
| T9 | Labels (section-kicker, form label) | Inter | 500 | 10.5px | 0.18–0.22em | 1.2 | UPPERCASE. `color: dust` default; `oxblood-soft` for kicker. |
| T10 | Nav items | Inter | 500 | 11px | 0.18em | 1.2 | UPPERCASE. |
| T11 | Masthead meta (top eyebrow) | Inter | 500 | 10.5px | 0.14em | 1.3 | UPPERCASE, `dust`. |
| T12 | Mono timestamp | JetBrains Mono | 400 | 10.5–11px | 0.02em | 1.4 | |
| T13 | Mono section-number (`§ 03`) | JetBrains Mono | 400 | 10.5px | 0.04em | 1.2 | |
| T14 | Caption / footnote | Inter | 400 | 11px | 0 | 1.45 | `color: sand`. |

### 3.3 Tabular numerics — mandatory rule

Every numeric display (calorie sum, macro grams, water count, timestamps, edition number, weight kg, chart axis ticks) uses:

```css
font-variant-numeric: tabular-nums lining-nums;
font-feature-settings: 'lnum' 1, 'tnum' 1;
```

Utility class `.num` declared in `app/globals.css`:

```css
.num {
  font-variant-numeric: lining-nums tabular-nums;
  font-feature-settings: 'lnum' 1, 'tnum' 1;
}
```

Downstream components that render any number MUST apply `.num` (or inline equivalent). Rationale: column alignment is load-bearing for The Ledger aesthetic — ragged proportional figures break the broadsheet grid.

### 3.4 Next.js `next/font` loader config

Declare fonts once in `app/layout.tsx`. Never use `<link>` in `<head>` — `next/font` self-hosts and prevents layout shift.

```tsx
// app/layout.tsx
import { Newsreader, Inter, JetBrains_Mono } from "next/font/google";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
```

The `@theme` block in §2.3 then references these CSS variables:

```css
@theme {
  --font-serif: var(--font-newsreader), "Tiempos Display", Georgia, serif;
  --font-sans: var(--font-inter), "Söhne", -apple-system, sans-serif;
  --font-mono: var(--font-jetbrains-mono), "Söhne Mono", ui-monospace, monospace;
}
```

### 3.5 Small-text AA note

The 10.5px `dust` label pattern (`color: #8A8173` on `bg-0`) is below WCAG AA small-text threshold (4.68:1 vs 4.5:1 — passes; but borderline when bg-1 used, which is 3.91:1 — **fails**). Rule: labels on `bg-1` or `bg-2` surfaces must use `sand` (`#C9BDA8`, 8.92:1 on bg-1, 7.49:1 on bg-2). Lint rule (see §9.3): `.label` class on `bg-1`/`bg-2` containers is an error unless `color: sand` is explicit.

---

## 4. Shape System

### 4.1 Radii: `0` everywhere

```css
@theme {
  --radius-none: 0;
  --radius-full: 9999px; /* circles only — chronometer, data dots, water bullet */
}
```

Default `border-radius` on every shadcn component override: `0`. A PR that introduces a non-zero radius on anything other than the documented exceptions below fails code review.

### 4.2 Circle exceptions (exhaustive list)

| # | Component | Shape | Rationale |
|---|---|---|---|
| 1 | **Chronometer ring** (dashboard hero) | `<circle>` SVG + `border-radius: 50%` for aperture mask | The single signature affordance; replaces fitness ring |
| 2 | **Data points on charts** (line series, scatter) | 4px `<circle>` | Standard Recharts dot primitive |
| 3 | **Water bullet** (`+glass` / `+bottle` indicator) | 9px `<span>` with `border-radius: 50%; background: slate` | Visual shorthand for a drop of water |
| 4 | **Status dots** (wordmark bullet, nav indicator dots, kicker accent) | 6–9px `background: oxblood; border-radius: 50%` | Print-journal typographic bullet (cf. masthead wordmark bullet in mockup) |
| 5 | **Avatar glyph** (profile menu) | 32px `border-radius: 50%` + 2-letter monogram | Platform-native affordance — documented exception |
| 6 | **Loading spinner** (async states) | SVG circle with stroke-dashoffset animation | Only used during in-flight AI calls; duration-bounded |

### 4.3 FAB — the zero-radius exception

**Binding:** The mobile FAB is a `56×56px` **zero-radius square** with `background: oxblood` and ivory `+` icon at 24px. This is the **only** large interactive affordance that breaks the circle-affordance convention.

```tsx
// components/nav/log-fab.tsx — skeleton only
<button
  className="fixed w-14 h-14 bg-oxblood text-ivory
             flex items-center justify-center
             focus-visible:outline-oxblood focus-visible:outline-offset-2
             focus-visible:outline-2"
  style={{
    borderRadius: 0,
    bottom: "calc(56px + env(safe-area-inset-bottom) + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
  }}
  aria-label="New log entry"
>
  <PlusIcon size={24} />
</button>
```

**Reconciliation note for Agent 2 (Navigation):** `Planning/design-doc.md §9` describes the FAB as "circular 56×56". `Design/mockups-brainstorm/direction-1-editorial/brief.md` "Shape language" says "radii `0` across the board — the only circles are the chronometer ring, data points, water bullet" (FAB is NOT listed as a circle exception). The Ledger brief is the canonical visual source. This fragment declares the FAB as a **zero-radius square**. If Agent 2 reads design-doc §9 and disagrees, flag to main agent at synthesis; main agent resolves to zero-radius-square per Ledger brief authority.

### 4.4 Borders

| Use | Thickness | Color | Style |
|---|---|---|---|
| Standard divider | 1px | `rule` (`#2A2320`) | solid |
| Card frame, section boundary, masthead bottom | 1px | `rule-strong` (`#3A3029`) | solid |
| Double-rule (masthead frame) | 1px top + 1px bottom (4px gap between) | `rule-strong` | solid |
| Sub-row (table dense rows) | 1px | `rule` | dotted |
| Focus ring | 2px | `oxblood` | solid outline (+ 2px offset) |
| Active nav indicator | 2–3px | `oxblood` | solid (top on mobile tab, left on sidebar) |
| Form-field error underline | 1px | `oxblood` | solid |

Cards that sit inside hairline-ruled grids (e.g., the 5-column meals bulletin) use the grid's rules as their frame — they do not draw their own border. Cards standing alone (dashboard widget, weight log entry) use a 1px `rule-strong` frame.

### 4.5 Shadows: NONE

`box-shadow: none` is the default for every surface. Modals, popovers, tooltips, and menus use the `bg-0 → bg-1 → bg-2` tonal step for depth. Modals render on a 72%-opacity `bg-0` scrim (no blur).

### 4.6 Hairlines as information hierarchy

- **Vertical 1px `rule`** separates data columns (5-col meals bulletin, 4-col library, 3-col dashboard, 30-col heatmap).
- **Horizontal 1px `rule`** separates sub-sections (entries within a meal column).
- **Horizontal 1px `rule-strong`** separates top-level sections (`§ 01` → `§ 02`).
- **Double 1px `rule-strong`** frames the masthead (top and bottom, 4px gap).
- **Dotted 1px `rule`** separates dense-table sub-rows.

---

## 5. Spacing + Grid

### 5.1 Spacing scale (8px base)

| Token | px | Tailwind class | Common use |
|---|---|---|---|
| `space-0` | 0 | `p-0` | flush |
| `space-1` | 4 | `p-1` | tight icon-to-label |
| `space-2` | 8 | `p-2` | default internal pad |
| `space-3` | 12 | `p-3` | list row |
| `space-4` | 16 | `p-4` | card inner |
| `space-6` | 24 | `p-6` | card/section gutter (desktop) |
| `space-8` | 32 | `p-8` | section top padding |
| `space-12` | 48 | `p-12` | hero section vertical |
| `space-16` | 64 | `p-16` | masthead-to-section-1 gap |
| `space-24` | 96 | `p-24` | page top/bottom margin (desktop) |

Declared in `@theme`:

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
}
```

### 5.2 Column grid

| Breakpoint | Columns | Gutter | Margin | Max content width |
|---|---|---|---|---|
| Mobile (375–767px) | 4 | 12px | 20px | fluid |
| Tablet (768–1279px) | 8 | 16px | 28px | fluid |
| Desktop (1280px+) | 12 | 24px | 48px | 1280px |

All hairlines align to the 8px grid. Column rules align to grid-line positions — never offset.

### 5.3 Container tokens

```css
@theme {
  --container-page: 1280px;
  --gutter-desktop: 24px;
  --gutter-tablet: 16px;
  --gutter-mobile: 12px;
}
```

---

## 6. Motion System

### 6.1 Duration ramps

| Token | ms | Use |
|---|---|---|
| `motion-micro` | 120 | Hover state, focus swap, opacity crossfade |
| `motion-standard` | 180 | Modal open/close, toast appear, nudge pulse |
| `motion-expressive` | 320 | Rule-draw (hairline entering), page-transition crossfade |
| `motion-chrono` | 600 | Chronometer ring stroke-dashoffset on first paint |

```css
@theme {
  --motion-micro: 120ms;
  --motion-standard: 180ms;
  --motion-expressive: 320ms;
  --motion-chrono: 600ms;
}
```

### 6.2 Easing

One easing curve across the system:

```css
@theme {
  --ease-editorial: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

All transitions use `--ease-editorial` (ease-out-expressive). No spring physics. No bounce. No `ease-in` (feels like tapping, not turning a page).

### 6.3 Named transitions

| Name | Property | Duration | Easing | Use |
|---|---|---|---|---|
| `ink-fade` | `opacity` | `motion-micro` (120ms) | `ease-editorial` | Hover, focus, nav-item state swap, number crossfade |
| `rule-draw` | `width` or `transform: scaleX()` from 0→1 | `motion-expressive` (320ms) | `ease-editorial` | Hairline entering on section reveal |
| `chrono-draw` | `stroke-dashoffset` | `motion-chrono` (600ms) | `ease-editorial` | Chronometer arc on first paint |
| `ember-pulse` | `transform: scale(1 → 1.02 → 1)` | `motion-standard` (180ms) | `ease-editorial` | Undo-toast appear, save confirmations, nudge card entry |
| `page-settle` | `opacity: 0 → 1` on main content | `motion-expressive` (320ms) | `ease-editorial` | Route change |

### 6.4 `prefers-reduced-motion` fallback

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

Under reduced-motion:

- All motion collapses to **1ms** (effectively instant).
- Opacity crossfades are still allowed (they imply no spatial movement). Transforms (`scale`, `translate`, `rotate`) are disabled.
- Chronometer ring: renders fully drawn on first paint (no `chrono-draw`).
- Heatmap cells: render instantly (no row-by-row fade-in).
- Page transitions: hard cut, no `page-settle` crossfade.
- FAB hover: no scale, color-only swap.
- WCAG 2.3.3 Animation from Interactions AAA — honored.

### 6.5 Framer Motion default config

Every component that uses Framer Motion consumes the shared config from `lib/motion/defaults.ts`:

```ts
// lib/motion/defaults.ts
import type { Transition } from "framer-motion";

export const EASE_EDITORIAL = [0.2, 0.8, 0.2, 1] as const;

export const motion = {
  micro: { duration: 0.12, ease: EASE_EDITORIAL } satisfies Transition,
  standard: { duration: 0.18, ease: EASE_EDITORIAL } satisfies Transition,
  expressive: { duration: 0.32, ease: EASE_EDITORIAL } satisfies Transition,
  chrono: { duration: 0.6, ease: EASE_EDITORIAL } satisfies Transition,
} as const;

export const variants = {
  inkFade: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: motion.micro },
    exit: { opacity: 0, transition: motion.micro },
  },
  emberPulse: {
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1, transition: motion.standard },
    exit: { opacity: 0, scale: 0.98, transition: motion.micro },
  },
  pageSettle: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: motion.expressive },
    exit: { opacity: 0, transition: motion.standard },
  },
} as const;
```

Components honor `prefers-reduced-motion` automatically via Framer's `useReducedMotion()` hook wrapped in `lib/motion/use-motion.ts`, which returns `motion.micro` hard-capped at 1ms when reduced.

---

## 7. Accessibility Foundations

### 7.1 WCAG AA baseline (WCAG 2.1 §1.4.3 Contrast Minimum)

All text passes AA against its paired background. Palette contrast ratios listed in §2.1. Verified pairs:

| Pair | Ratio | Result |
|---|---|---|
| `ivory` on `bg-0` | 15.86:1 | AAA — all sizes |
| `sand` on `bg-0` | 10.18:1 | AAA — all sizes |
| `dust` on `bg-0` (14px+ regular) | 4.68:1 | AA pass (small-text threshold 4.5:1) |
| `dust` on `bg-1` | 3.91:1 | **AA fail** at <18px — lint rule forbids |
| `oxblood-soft` on `bg-0` (≥18pt / 14pt bold) | 3.70:1 | AA large-text pass |
| `oxblood` as text | 2.86:1 | **Non-text use only** (fills, borders, accents) |
| `ember` on `bg-0` | 5.60:1 | AA pass |
| `ochre` on `bg-0` | 6.48:1 | AA pass |
| `moss` on `bg-0` (data-viz with label) | 3.48:1 | AA large-text; data-viz fill OK with adjacent ivory label |

### 7.2 Focus rings — WCAG 2.4.7 Focus Visible

Every interactive element (button, link, input, select, tab, menu item, FAB, nav item) declares:

```css
:focus-visible {
  outline: 2px solid var(--color-oxblood);
  outline-offset: 2px;
}
```

**NEVER `outline: none` without a replacement focus indicator.** The mockup's `outline: none` on inputs is explicitly overridden. ESLint rule (`no-outline-none`) enforces:

```js
// .eslintrc — custom rule
"no-restricted-syntax": [
  "error",
  {
    selector: "Property[key.name='outline'][value.value='none']",
    message: "Use focus-visible:outline-oxblood instead of outline: none."
  }
]
```

Utility class:

```css
.focus-editorial {
  @apply focus-visible:outline-2 focus-visible:outline-oxblood focus-visible:outline-offset-2;
}
```

### 7.3 Tap targets — WCAG 2.5.5 Target Size (AAA)

All interactive elements have `min-width: 44px; min-height: 44px`. Utility:

```css
.tap-44 { min-width: 44px; min-height: 44px; }
```

Applied to: nav items, tab-bar tabs, FAB (satisfies via 56px), FAB+ buttons on water tracker, all close/back chevrons, all form buttons, date-picker day cells.

### 7.4 Keyboard shortcuts

| Key | Action | Scope | WCAG reference |
|---|---|---|---|
| `/` | Focus global search / library search | Desktop + tablet | 2.1.4 Character Key Shortcuts — `/` is single-char; must be toggleable. Settings → a11y → "disable keyboard shortcuts" toggle. |
| `n` | Open new-log modal | Desktop + tablet only (mobile FAB covers this action) | as above |
| `g d` / `g l` / `g p` | Navigate dashboard / library / progress | Desktop + tablet | leader-style, not single-char — no shortcut conflict |
| `?` | Open shortcuts help overlay | Desktop + tablet | |
| `Esc` | Close modal, cancel edit, dismiss toast | All breakpoints | |
| `Tab` / `Shift+Tab` | Forward / backward focus | All | Follows visual order (skip link + masthead + nav + content + footer) |

### 7.5 ARIA live regions

| Region | Role | Live politeness | Use |
|---|---|---|---|
| Undo toast | `status` | `aria-live="polite"` | "Entry deleted. Undo." — announced but not interrupting |
| Save confirmation toast | `status` | `aria-live="polite"` | "Logged 440 kcal." |
| Optimistic save failure | `alert` | `aria-live="assertive"` | "Couldn't save — try again." interrupts current read |
| Offline mode banner | `status` | `aria-live="polite"` | "You're offline. Library logging works." |
| AI latency warning (>8s) | `status` | `aria-live="polite"` | "Still parsing…" after 8s threshold |

Downstream components use `role="status"` + `aria-live="polite"` as the default; `role="alert"` is reserved for interruption-warranted errors (save failure, auth expired).

### 7.6 Skip-to-content link — WCAG 2.4.1 Bypass Blocks

First focusable element on every page:

```tsx
// app/layout.tsx or components/nav/skip-link.tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2
             focus:z-50 focus:px-3 focus:py-2 focus:bg-bg-1 focus:text-ivory
             focus:outline-2 focus:outline-oxblood focus:outline-offset-2
             font-sans text-sm uppercase tracking-[0.18em]"
>
  Skip to content
</a>
```

`<main id="main-content">` wraps every page's primary content.

### 7.7 Color never sole signal — WCAG 1.4.1 Use of Color

No state is communicated by color alone. Every color-coded state pairs with a second channel (text label or icon):

| State | Color | Second channel |
|---|---|---|
| On-target macro | `moss` fill | "on target" label or `✓` glyph |
| Approaching target | `ember` fill | "approaching" label |
| Over-target | `oxblood` fill | `!` glyph prefix + "over" text |
| Active nav | `oxblood` border | `ivory` text (weight change) |
| Error inline | `oxblood` text | mono `!` glyph prefix + 1px oxblood top rule |
| Form-field error | `oxblood` underline | `oxblood` caption text with error message |
| AI confidence low | (no color) | italic serif "estimate" footnote |

### 7.8 Zoom — WCAG 1.4.10 Reflow

200% browser zoom must not trigger horizontal scroll on any page. All layouts use `max-width` constraints and flex/grid that reflow. Test added to Playwright visual suite at `tests/e2e/zoom-200.spec.ts`: screenshot at 200% zoom across all 10 screens; assert `document.documentElement.scrollWidth <= window.innerWidth`.

### 7.9 Additional a11y rules (propagate to downstream agents)

- **Form labels:** every input has an associated `<label>` (never placeholder-only). Labels are `T9` (10.5px UPPERCASE Inter tracked 0.18em, `dust` on `bg-0`, `sand` on `bg-1`/`bg-2`).
- **Icon-only buttons:** always have `aria-label`. Example: `<button aria-label="Add glass of water">…</button>`.
- **Chart text-alternative:** every chart (chronometer, macro bars, heatmap, line series) has a `<details><summary>Data table</summary>…</details>` drawer below it, containing the numeric values in an accessible `<table>`. Screen readers announce via `aria-describedby` linking chart → table.
- **Motion opt-out:** settings screen has explicit "Reduce motion" override (mirrors `prefers-reduced-motion`) — respects user preference set at OS level, but also allows per-app override.
- **Color-only filter:** none. Filter chips on library use text + active-state color + bold weight change.

---

## 8. Breakpoint Strategy

### 8.1 Three breakpoints

| Breakpoint | Range | Device class | Primary nav | Layout |
|---|---|---|---|---|
| **Mobile** | 375–767px | iPhone 13–14, Android mid-tier, small foldables | Bottom tab bar + center FAB | Single column |
| **Tablet** | 768–1279px | iPad portrait, iPad landscape short edge, small laptops | Collapsible left sidebar (56px rail default) | 2-column |
| **Desktop** | 1280px+ | Laptop + desktop | Persistent left sidebar (240px) | 3-column dashboard; 4-col library |

### 8.2 Tailwind v4 declarations

```css
@theme {
  --breakpoint-mobile: 375px;   /* min-width: 375px (default, always on) */
  --breakpoint-tablet: 768px;   /* md: equivalent */
  --breakpoint-desktop: 1280px; /* xl: equivalent */
}
```

Usage: `class="grid-cols-1 md:grid-cols-2 xl:grid-cols-3"` (Tailwind v4 auto-generates `md:` and `xl:` from the tokens above).

### 8.3 Container queries

Certain components adapt to their container (not the viewport) — library grid cells and chart panel dense-vs-relaxed mode use CSS container queries:

```css
.library-grid { container-type: inline-size; }

@container (width < 640px) {
  .library-cell { /* compact variant */ }
}
@container (width >= 640px) {
  .library-cell { /* grid variant */ }
}
```

Components that use container queries (for Agents 5 and 6 to note):

- Library grid (4-col / 2-col / 1-col depending on container width, independent of viewport)
- Chart panels (dense-stack vs. side-by-side within 2-col dashboard layout)

### 8.4 Viewport meta

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

`viewport-fit=cover` enables `env(safe-area-inset-*)` for notched devices (iPhone 14+, Android cutouts). Mobile FAB uses `env(safe-area-inset-bottom)` per §4.3.

---

## 9. Component Primitives Token Reference

### 9.1 `lib/tokens.ts` module

Single source of truth for TypeScript-side token access. Every downstream component spec references token names from this module — never hardcoded values.

```ts
// lib/tokens.ts

export const colors = {
  bg: {
    0: "#0E0A08",
    1: "#15100D",
    2: "#1E1815",
    quote: "#1A1310",
  },
  rule: {
    default: "#2A2320",
    strong: "#3A3029",
  },
  text: {
    ivory: "#F4EBDC",
    sand: "#C9BDA8",
    dust: "#8A8173",
    dust2: "#6B6156",
  },
  accent: {
    oxblood: "#8A2A1F",
    oxbloodSoft: "#A13A2C",
    ember: "#C8693B",
    ochre: "#B8894A",
    moss: "#5C6B3D",
    slate: "#4A5764",
    plum: "#5D3A44",
  },
} as const;

export const typography = {
  family: {
    serif: "var(--font-serif)",
    sans: "var(--font-sans)",
    mono: "var(--font-mono)",
  },
  size: {
    wordmark: "104px",
    sectionTitle: "44px",
    heroSection: "32px",
    calorieValue: "82px",
    body: "14px",
    bodySerif: "16px",
    button: "13px",
    label: "10.5px",
    nav: "11px",
    mono: "11px",
    caption: "11px",
  },
  weight: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  tracking: {
    wordmark: "-0.035em",
    sectionTitle: "-0.02em",
    label: "0.18em",
    kicker: "0.22em",
    mastheadMeta: "0.14em",
    button: "0.08em",
    mono: "0.02em",
  },
  lineHeight: {
    tight: 0.88,
    display: 1.0,
    body: 1.55,
    label: 1.2,
  },
  numericFeatures: {
    fontVariantNumeric: "tabular-nums lining-nums",
    fontFeatureSettings: "'lnum' 1, 'tnum' 1",
  },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const;

export const radii = {
  none: 0,
  full: 9999, // circles only: chronometer, data dots, water bullet, avatar, status dots
} as const;

export const motion = {
  duration: {
    micro: 120,
    standard: 180,
    expressive: 320,
    chrono: 600,
  },
  ease: {
    editorial: [0.2, 0.8, 0.2, 1] as const,
  },
} as const;

export const breakpoints = {
  mobile: 375,
  tablet: 768,
  desktop: 1280,
} as const;

export const zIndex = {
  base: 0,
  raised: 10,           // tonal card on tonal card
  stickyHeader: 20,     // masthead sticky
  sidebar: 30,          // desktop sidebar
  dropdown: 40,         // profile menu, select
  modalBackdrop: 50,    // bg-0 scrim
  modal: 51,            // log modal, confirmation
  toast: 60,            // undo, save confirmation
  fab: 70,              // mobile FAB — above content, below toast
  skipLink: 100,        // focused skip-to-content
  shortcutsOverlay: 110, // `?` help
} as const;

export const container = {
  page: 1280,
  gutter: {
    mobile: 12,
    tablet: 16,
    desktop: 24,
  },
  margin: {
    mobile: 20,
    tablet: 28,
    desktop: 48,
  },
} as const;
```

### 9.2 Downstream consumption pattern

Every component spec by Agents 2–6 uses the token name, e.g.:

```ts
// GOOD — references tokens
import { colors, motion } from "@/lib/tokens";
const activeColor = colors.accent.oxblood;
const duration = motion.duration.standard;

// BAD — hardcoded hex/px (lint error)
const activeColor = "#8A2A1F";
const duration = 180;
```

### 9.3 ESLint rules enforcing token discipline

Three custom rules (configured in `.eslintrc.js`, implementation in Task 1.1 or 1.2):

1. **`no-hardcoded-hex`** — Any string literal matching `/#[0-9A-Fa-f]{3,8}/` in `.tsx`/`.ts` files outside `lib/tokens.ts` and `app/globals.css` is an error. Whitelist the token file and design-system defs; everything else uses `colors.*`.
2. **`no-outline-none`** — Any `outline: none` / `outlineStyle: "none"` assignment is an error unless accompanied by a `focus-visible` replacement in the same block. Enforces §7.2.
3. **`no-radius-other-than-zero-or-full`** — `border-radius` values other than `0`, `var(--radius-none)`, `50%`, or `var(--radius-full)` are errors. Enforces §4.1.

Rules 1–3 ship in Task 1.1 (foundation) per `tasks.md`; all PRs after that fail CI on violation.

---

## 10. Cross-agent references

Every downstream agent (2–6) must:

1. Import color, typography, motion, spacing, radii, z-index, and breakpoints from the tokens listed in §9.1 — never hardcode.
2. Apply `.num` class (§3.3) to every numeric display.
3. Apply `.focus-editorial` (§7.2) or equivalent `focus-visible:` classes to every interactive element.
4. Apply `.tap-44` (§7.3) to every interactive element.
5. Declare `aria-label` on every icon-only button.
6. Pair every color-coded state with a second-channel label or glyph (§7.7).
7. Use `motion.micro` / `.standard` / `.expressive` / `.chrono` tokens for every transition — never an ad-hoc duration.
8. Honor `prefers-reduced-motion` via the `useMotionProfile()` hook in `lib/motion/use-motion.ts` (§6.4, 6.5).
9. Respect zero-radius default; document any circle-affordance usage against the §4.2 exception list.
10. Align hairlines to the 8px grid (§5.1).

See `ui-design.md#section-N` for component-level specs (anchors renumbered on assembly).

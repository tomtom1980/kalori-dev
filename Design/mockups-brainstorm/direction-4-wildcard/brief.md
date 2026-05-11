# Direction 4 — Flight Deck

## Concept picked
**E — Atmospheric Terminal.** I picked it because the other three directions cover warmth (Editorial), reduction (Industrial) and drama (Cinematic) — none of them occupy the "operator cockpit" territory. Flight Deck takes the dense instrumentation of a Bloomberg terminal, filters it through the cold film of Blade Runner / Alien Nostromo CRTs, and makes the act of tracking food feel like reading telemetry. It is the only direction where the interface is visibly an instrument.

## Mood statement
Cold tungsten panels, phosphor-amber readouts, measurement as reassurance. The numbers are not decorated — they are *metered*. This is the app your nutrition-engineer best friend would build: rigorously instrumented, a little bit retrofuturist, quiet confidence in the tabular layout.

## Palette
- **Void** `#05080B` — document black
- **Deck / panel** `#0A1015` → `#0F161D` → `#131B23` — cool tungsten gradient
- **Storm / Night / Dusk tints** `#0C141B` / `#0D1419` / `#161013` — subtle panel washes to differentiate zones
- **Rules** `#243341` (soft) / `#36495B` (hard) — hairline dividers
- **Phosphor Amber (primary signature)** `#F0A53E` with highlight `#FFC36B`, soft `#FFE0A6`, dim trace `#6E4A18`
- **Cool Cyan (readouts, cool data)** `#4DB6C4` / trace `#1B3F47`
- **Rust (warning, outliers)** `#D96A4B` / trace `#4B2218`
- **Bone (foreground text)** `#D6D2C2` / dim `#7A776E` / trace `#3A3930`

Intentionally avoids all three reserved zones: no oxblood/sienna (Editorial), no sage/safety-orange (Industrial), no teal/purple gradient (Cinematic). Amber-on-tungsten is a distinct third-axis choice.

## Typography
- **Display / wordmark** — **Space Grotesk** 300/400/500. Geometric but slightly humanist; reads as "engineering-grade" without the literary heft of a serif. Sizes: hero wordmark `clamp(64px, 11vw, 148px)` at weight 300; section titles 26px/300; panel headers 16–22px/400.
- **Body / labels / readouts** — **JetBrains Mono** 400/500/600. Mandatory for tabular numbers, coordinates, status chips, meal entries, heatmap values. Sizes: 10–13px with generous letter-spacing (0.08em–0.28em) on labels.
- **Sans fallback** — Inter Tight (reserved; not heavily used).
- Explicitly **not** Fraunces, not Geist, not DM Sans.

## Shape language
Hard rectangles. Every content zone is a labelled panel with **corner brackets** (`┌ ┐ └ ┘` drawn as CSS corners) that signal framed data. Hairline `1px` borders everywhere, some solid, some dashed to encode hierarchy (solid = rule, dashed = divider). Circular elements are reserved for instruments: the calorie "ring" is reimagined as a **crescent gauge** with measurement ticks around its rim, a notch at the current value, and four cardinal percent markers — more altimeter than progress ring.

## Motion philosophy
Motion is **telemetric, not expressive**. The clock in the top rail ticks, the mini-plot cursor nudges on new data, the crescent gauge fills with a slow phosphor bloom (opacity-only, no bouncy easing). No slide-in cards, no parallax. When the AI co-pilot returns, a line draws left-to-right like a plotter rendering. Global CRT atmosphere: a near-imperceptible scanline overlay and vignette pinned over the whole page, establishing "this is a display, not a canvas" without becoming a costume.

## How it complements directions 1/2/3 without overlapping
- **vs. #1 Editorial** — Editorial is paper, warmth, serif grace. Flight Deck is glass, cold, mono precision. Shared respect for typography; opposite surfaces.
- **vs. #2 Industrial** — Both use monospace, but Industrial is *Swiss restraint* (clean grid, much white, measured silence). Flight Deck is *instrumented density* (layered panels, active readouts, corner brackets, status rails). Industrial is a ruler; Flight Deck is an oscilloscope.
- **vs. #3 Cinematic** — Both use atmosphere, but Cinematic's gradients are *organic, dramatic, warm-to-cool*. Flight Deck's atmosphere is *cold, CRT-grade, data-overlaid*. Cinematic says "feel." Flight Deck says "read."

## What to notice
1. The **crescent dial** — altimeter-style ticks, cardinal percent labels, a notch at current — replaces the Apple-Fitness ring without copying it.
2. The **status rail** at top: a persistent ticker that makes the app feel like a trading terminal, always-on.
3. The **"Why These Numbers?" audit panel** — reframed as an inference *trace* with four named steps (PARSE → MATCH → COMPOSE → FLAG), landing on a composite-confidence meter. This positions Kalori as a transparent instrument, not a black box.
4. The **micronutrient heatmap** — built on a true matrix with amber-saturation cells, flagged deficits (!), and a dashed "today" outline. Reads like a cockpit MFD.
5. The **library thumbnails** use geometric line glyphs on a crosshatch grid (no photography, no emoji), keeping the operator aesthetic consistent.
6. The **food entries** use a tiny 3-bar C/P/F "spark-macro" next to each item plus a `CONF 94` confidence reading — every row is a gauge.

## Why this wins for Kalori
Kalori's core promise is that AI does the heavy lifting. Flight Deck dramatizes that by making every estimate *legible* — confidence values, provenance, audit traces, variance bands are native to the visual language rather than hidden in a settings page. It also ages well: no trend-chasing gradients, no maximalist type. And it hard-differentiates from dark-SaaS defaults (Linear/Vercel) — which Kalori would otherwise drift toward — by committing to an operator-terminal identity nobody in consumer nutrition has claimed.

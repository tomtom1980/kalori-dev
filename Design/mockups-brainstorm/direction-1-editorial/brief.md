# Direction 01 — "The Ledger"

## Mood statement

The Ledger frames Kalori as a private evening broadsheet — a warm, candlelit journal in which each day's meals are set in type, parsed, and signed. It replaces the quantified-self clamor of most fitness apps with the hush of a bedside notebook: cream on near-black, ruled columns, italic pull-quotes, a chronometer in place of a fitness ring. The model speaks as an attentive literary editor, not a coach. Confidence numbers look like footnotes. Nothing shouts; everything is legible.

## Palette

| Role | Hex | Notes |
|---|---|---|
| bg-0 (page void) | `#0E0A08` | deep warm black, very slight red cast |
| bg-1 (card field) | `#15100D` | cards, editor pane |
| bg-2 (inset / quote) | `#1E1815` | insets, why-panel, meter backgrounds |
| hairline rule | `#2A2320` | standard dividers |
| hairline rule strong | `#3A3029` | card borders, section boundaries |
| ivory (text 1) | `#F4EBDC` | primary — warm cream |
| sand (text 2) | `#C9BDA8` | secondary, italic pull-quotes |
| dust (text 3) | `#8A8173` | metadata, labels |
| **oxblood (signature accent)** | `#8A2A1F` | ring arc, drop caps, primary buttons |
| oxblood-soft (accent hover) | `#A13A2C` | hover, secondary |
| ember (warm secondary) | `#C8693B` | projections, "approaching target" |
| ochre (tint) | `#B8894A` | carb bar, inner fiber arc |
| moss (supportive data) | `#5C6B3D` | on-target, adherence good |
| slate (neutral data) | `#4A5764` | optional 4th chart series |
| plum (tint) | `#5D3A44` | reserved |
| status · approaching | `#C8693B` (ember) | 80–100% of target |
| status · over target | `#8A2A1F` (oxblood) | >100%, or deficit used |

**Data viz (6-color):** oxblood, ochre, ember, moss, slate, plum. Heatmap ramp walks c0–c9 from bg-2 through oxblood → ochre → moss.

## Typography

- **Serif display / numerals:** Newsreader (a proxy for Tiempos / PP Mori Serif / Editorial New). Weights 200–400, italic supported. Optical size enabled.
  - Wordmark: 300 / 104px / −0.035em
  - Section titles: 300 / 44px / −0.02em
  - Heatmap title: 300 / 32px
  - Calorie value: 300 / 82px / tabular lining figures
  - Body serif (entries, pull-quotes): 400 / 14–22px, italics for voice
- **Sans (labels, chrome, microcopy):** Inter (proxy for Söhne / ABC Diatype / PP Neue Montreal). Weights 300–600.
  - Labels: 500 / 10.5px / UPPERCASE / tracking 0.18–0.22em
  - Nav: 500 / 11px / UPPERCASE / 0.18em
- **Mono (timestamps, counts, codes):** JetBrains Mono (proxy for Söhne Mono). 400 / 10.5–11px.

All numerals tabular + lining. Drop caps used once, in the editor's pull-quote.

## Shape language

- Radii: `0` across the board — everything is a rule or a rectangle. The only circles are the chronometer ring, data points, and the water bullet.
- Borders: hairline `1px` at `#2A2320`, stronger `1px` at `#3A3029` for card frames; dotted `1px` for sub-rows.
- Shadows: none. Depth is entirely rules + whitespace + tonal cards.
- Grid: 3-col dashboard, 5-col meals bulletin, 4-col library, 30-col heatmap. Column lines are real, visible, drawn.

## Motion philosophy

Motion is calm and paper-like. Transitions are short (120–180ms), easings are soft (`cubic-bezier(.2,.8,.2,1)`). Cards don't lift — they "wet" a touch brighter. Numbers tick into place with a cross-fade, never a count-up. The ring draws once on load, in 600ms, like ink settling. Heatmap cells fade in row-by-row on first view. Hover states are tonal only (no scale). The effect should feel like turning a page, not tapping an app.

## How it differs from the existing (lime) direction

1. **No ring mimicry.** The center device is a hand-drawn chronometer with hour numerals (I/IV/VII/X) and a dual-layer arc — consumption + projection — not a stack of concentric activity rings.
2. **Serif-led numerals and body.** Where the other direction leads with sans + lime pops, here the numerals themselves are the expressive element: Newsreader at 82px for the calorie sum, italic serifs for all food names.
3. **Bulletin grid instead of card stacks.** Meals are five ruled newspaper columns, not five cards. The library is a true grid with drawn column/row lines. Sections are titled with kickers and section numbers (§ 01) like a print journal.

## What to notice in the mockup

1. The **chronometer ring** with Roman hour numerals, a now-indicator triangle, and a dashed ember arc projecting the rest of the day — it does the same job as a fitness ring without mimicking one.
2. The **heatmap** ("The minor elements, in thirty") — 7 nutrients × 30 days, colored on a warm ramp from oxblood (low) through ochre to moss (good), with column rules and italic row names. The vitamin D row tells the story at a glance.
3. The **"From the Editor" weekly note**, set as a pull-quote with a drop cap, and the matching **"Why these numbers?" panel** in the log flow — the model's voice is literary, not clinical.

## Why this wins for Kalori

Kalori's owner wants a premium, literary instrument — an app that earns a place on a nightstand. The Ledger commits to that fully. Fitness apps read like dashboards; The Ledger reads like a journal you've been keeping for years. The heavy serif, the ruled columns, the oxblood drop cap, the chronometer — each element signals that this is a record-keeping practice, not a score to beat. The warm palette flatters dark rooms and evening use. And the archival grid scales effortlessly: every new day slots into the same type system, the same ruled columns, the same voice. It's the only direction here that could plausibly be printed and bound at year's end — which is exactly how a personal food library should feel.

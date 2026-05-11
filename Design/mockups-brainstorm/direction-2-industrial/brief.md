# Direction 02 — Apparatus

## Name & Mood

**Apparatus.** An instrument, not a screen. Kalori framed as a precision measurement device that happens to run in a browser — something you'd find on a spec sheet next to a Braun thermometer, a Teenage Engineering OP-1, or an Oxide service panel. The mood is quiet, confident, deeply tabular. It invites trust through exactness rather than charm. Every number is tabular-figured, every edge is a hairline, every container is labelled with a channel ID (`CH/01`, `LOG/A9F2`). The product does not perform enthusiasm — it reports.

## Palette

All hex codes, named by role.

- **Background tiers** — `#0B0C0D` canvas · `#121315` panel · `#181A1D` raised block · `#1F2226` input/inset
- **Hairline rules** — `#24272B` quiet divider · `#2E3238` visible grid · `#3A3F46` active/focused
- **Text tiers** — `#EFEEE9` primary (warm off-white, not pure white — reduces clinical coldness) · `#9FA2A6` secondary · `#656870` tertiary labels · `#3E4249` disabled/ticks
- **Signature — Safety Orange** — `#FF5A1F` primary · `#FF7A47` hover · tints `rgba(255,90,31,.18)` and `rgba(255,90,31,.08)`. Exactly one accent. Used surgically on pointers, progress, active controls, AI-provenance tags, the heatmap ramp.
- **Status** — `#7EB88E` ok (muted sage) · `#E6B450` warn (cadmium) · `#D1545B` err (signal red) · `#6C94B5` info (cobalt)
- **6-color data viz** — `#FF5A1F` orange · `#6C94B5` cobalt · `#7EB88E` sage · `#E6B450` cadmium · `#B58BD1` mauve · `#C8CBD0` graphite

## Typography

- **Mono dominant** — `JetBrains Mono` (fallbacks: IBM Plex Mono, Berkeley Mono). Weight 400 everywhere. Labels use 10–11px uppercase with 0.14–0.22em letter-spacing. Body copy 12–13px. Tabular numerals are mandatory for every nutrition figure.
- **Display sans** — `Inter` (fallbacks: Söhne, Suisse Int'l, Neue Haas Unica). Weight 500 only. Hero at `clamp(80px, 11vw, 172px)` with `-0.045em` letter-spacing and `0.86` line-height. Section headings 32px / -0.02em. Large values 20–30px with -0.01 to -0.02em tracking. No italics, no lighter-than-500 weights, no serifs.
- **Feature settings** — `"ss01","ss02","zero","tnum","cv11"` on body to lock the slashed zero, dotted i, and straight-six variants on.

## Shape Language

Hard-edged. Radius zero, or 1px at most. Borders do all the work — no blur, no shadow. A persistent 120 px grid ghosts behind the page as a fixed background (`linear-gradient` hairlines), so every section aligns visually against something real. Every panel gets corner registration brackets (`.reg`), a titled head (`CH/01`, unit declaration), and dashed `border-bottom: 1px dashed` between rows. Pills exist for status only (`IN BAND`, `AI`, `LIB`). The hero sits next to a 22px-tall scale ruler with labeled tick marks at 0/25/50/75/100. Food thumbnails are inline-SVG technical drawings — front elevation, section cut, top view — not photos.

## Motion Philosophy

No bounces, no eased exaggerations. Transitions are linear or `ease-out` at 80–120ms — the movement of a relay click, not a tap gesture. The gauge fill seats into position; it does not bloom. The `LIVE` dot in the top bar pulses because telemetry pulses, not because it's cute. Keyboard is a first-class citizen: `↵` commits a log entry, `ESC` discards — and both are printed into the button itself as `.kbd` tags. When a cell in the heatmap is hovered the exact percent resolves over the color — the chart doesn't animate; it reveals.

## Differentiation from Direction 01 (Editorial)

Where Editorial is about *voice* (Fraunces display serifs, lime-green accent, rings, warmth), Apparatus is about *reading*. It rejects every decorative affordance: no ring, no glow, no serif, no soft gradients. The calorie readout is a horizontal precision meter with hatched remaining fill, numeric pointer, target dashed marker, and a scale bar — not a ring. The heatmap is a thermograph with a labeled scale ramp and micronutrient row keys, not a contribution grid. The food library uses technical drawings (front elev / top view / section A-A) instead of photography. Where Editorial whispers *wellness*, Apparatus whispers *instrument*.

## What to Notice

1. The **calorie meter** — horizontal, pointered, with hatched remainder and a target marker in `#FF5A1F`. Scale from 0 to 2 500 kcal with major/minor ticks.
2. The **micronutrient thermograph** (the signature chart) — 7 rows × 30 cols, each cell a row-relative % of target, colored on an orange ramp from `#1A0F06` to `#FFC78A`, with a printed legend bar and exact values on hover.
3. **Channel IDs** on every panel (`CH/01`, `LOG/A9F2`, `K-001`) — a consistent naming scheme that ties the UI to the imaginary service manual.
4. **"Why these numbers?"** — a reasoning trace styled as an expandable spec table with source / basis / Δ kcal columns. The AI explains its math the way a multimeter would print a reading.
5. Food cards as **technical drawings** instead of photos — radically differentiating vs. any fitness product.

## Why This Wins

Premium trackers drift toward wellness iconography, bright rings, and soft gradients — Kalori's owner explicitly does not want that. **Apparatus** translates *ownership-grade quality* into typographic discipline and measurement aesthetic: the same register that makes a Leica, a Linn turntable, or an Oxide rack feel like serious equipment. The data is dense but calm; the product feels engineered to outlast a trend cycle.

# Direction 3 — Kodachrome

**A calorie tracker with a cinematographer's eye.**

## Mood

Kodachrome is the emotional memory of 70mm film: deep sepia shadows, blood-orange light bleeding at the edges of frame, amber highlights that feel like they were lit by a practical lamp just out of shot. It is warm where most dashboards are cool, filmic where most productivity tools are flat, and slow where most AI products feel clipped and tense. It carries the weight of an A24 title card, the generosity of an Apple keynote slide, and the intimacy of flipping through a book of food photography at midnight. The user isn't managing their diet — they are **watching the day unfold in 24 frames per second**.

## Palette (hex + roles)

**Sepia blacks (never pure #000 — every shadow is graded toward warmth):**
- `#0a0604` deepest shadow (page background)
- `#120b07` hero backdrop
- `#1a110b` panel surface
- `#241810` elevated panel
- `#332218` hairlines / borders
- `#4a3024` faint dividers

**Film-stock accents:**
- `#d84a1f` **Blood** — primary (Kodachrome red)
- `#ff6b3d` **Blood Hot** — highlight
- `#c2401a` **Persimmon** — darker primary
- `#e89a3d` **Amber** — sepia gold (secondary)
- `#ffc675` **Amber Hot** — highlight
- `#8a3a1a` **Rust** — saturated shadow
- `#4fbcb0` **Teal** — cool counterpoint (water, confidence, "exact")
- `#7fe6d9` **Teal Hot** — cool highlight
- `#f4e8d0` **Cream** — warm off-white body text
- `#c8b89c` **Cream Dim** — muted cream

Saturated shadows (Rust, Persimmon) carry the color system through the dark regions so nothing ever drifts into cold neutral gray.

## Typography

- **Display** — Tenor Sans (with PP Editorial New / Migra / Tobias as fallbacks): weight 400 only, italic used as a color accent. Sizes clamp 22–128px. Letter-spacing -0.03em at the extremes, near-zero at body display. Line-height 0.95–1.1.
- **Body** — Inter Tight (with Söhne / PP Neue Montreal fallbacks): weights 300 / 400 / 500 / 600. Italic body type is reserved for insight copy only — it reads like a voiceover.
- **Overlines** — Inter 11px, weight 500, letter-spacing 0.24em, uppercase. These act like reel slates.

## Shape language

- **Rounded corners** 12 / 20 / 28 / 36 px. Rarely sharp.
- **The orb** replaces the activity ring: a gradient-filled sphere with a wide halo, a faint tracking arc, and a soft inner highlight — not a stroked doughnut. It reads as a sun dimming toward day's end.
- **Gradients are radial first, linear second.** Every panel carries at least one atmospheric gradient — usually a blood-orange corner wash pulling toward a teal or amber corner wash.
- **Film grain** is an ever-present SVG turbulence overlay at low opacity, plus a soft vignette on page edges.
- **Asymmetric, off-grid compositions** are allowed — the hero sun bleeds off the right edge; the insight card's noise is inherited from the film, not applied.

## Motion philosophy (prose)

Kodachrome moves like a film reel, not a webpage. Everything eases in slowly — 600–900ms for hero arrivals, 400ms for panel reveals, 250ms for interactive feedback — and the easing is always a long exponential tail, never linear. The **orb breathes**: its radial gradient drifts on a 12-second loop, expanding by 2-3% and then contracting, as if it is a sun at dusk. The **spectrograph renders left-to-right** on first view, band by band, 80ms stagger, each row fading in from 0 to full saturation over 700ms — the same physical feeling as watching film develop in a tray. **Micronutrient ramps shimmer**: a faint vertical band of brighter cream travels top-to-bottom on a 6s loop, as if passing under a slow projector. **Hovering a library card** gently warms its thumbnail — contrast rises 8%, saturation rises 4%, the card lifts 4px — and unhovering takes 500ms to settle. **Film grain** itself never stops moving: the background noise overlay shifts imperceptibly on a 0.1s interval to simulate the flicker of projected film. Transitions between scenes use a **fade-through-black** intermediate — never a slide, never a page-swap. The intent is that the product feels lit, not clicked.

## Differentiation from the other three directions

Where Editorial is a magazine, Industrial is a control room, and Wildcard goes somewhere strange — **Kodachrome is cinema**. It is the only direction where the darkness has hue, where gradients do the primary work, where typography italicizes as a color, and where charts are reinterpreted as light (the spectrograph) rather than as geometry. It has the strongest emotional pull of the four.

## What to notice

- The **orb**, not a ring. Filled. Lit from inside.
- The **spectrograph heatmap** — seven horizontal bands, 30 days, brightness as fulfillment. A thermal/filmic reinterpretation of the heatmap.
- **Insight copy** rendered in display italic at 22–30px — it reads like voiceover, not a tooltip.
- **Sepia-tinted shadows everywhere** — no cold gray, ever.
- **The hero sun** bleeding off the page edge, the grain overlay on everything, and the title cards that treat the product as a 4-act film (Today's frame / The edit bay / The archive / The long cut).

## Why this wins

For a premium single-user product, **feeling** is the moat. A calorie tracker lives or dies by whether the owner actually wants to open it. Kodachrome makes the act of logging a meal feel like a ritual — warm, generous, cinematic — rather than a chore. It's the direction that will still feel beautiful on day 900.

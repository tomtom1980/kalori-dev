# Bug 2: Sketch should be colorful and realistic

## Classification

`actually_a_feature`  — but with a strong caveat. The current prompt is an **intentional, deliberate, fully-specced design choice** embedded across `bug-5.md`, the shipped style preamble in `lib/ai/sketch-prompt.ts`, and the design system in `design-doc.md` / `ui-design.md`. The user's bug report directly contradicts the spec. This is a **design-override request**, not a bug — the prompt was working as designed when it emitted single-color line art on near-black.

That said: the user is the product owner; if they want to override the editorial constraint, the fix is mechanically a `known_fix` (rewrite the STYLE_PREAMBLE string). I recommend **pausing and confirming with the user** before flipping the aesthetic — see Open Questions below — but if they confirm "yes, override the editorial design", the implementation path is straightforward.

## Root Cause

The shipped prompt **explicitly forbids color** and **explicitly forbids photographic detail**. Verbatim from `lib/ai/sketch-prompt.ts:30-38`:

```
'Pen-and-ink line drawing on a warm near-black background (#0E0A08). ' +
'Strokes in ivory (#F4EBDC), single-color hand-drawn line art. ' +
'Editorial / archival broadsheet aesthetic, similar to a 19th-century ' +
'botanical or culinary engraving. NO color fill, NO photographic detail, ' +
'NO text, NO captions, NO borders, NO frames. Centered composition with ' +
'generous negative space, medium line-weight, suitable as a 240x180 ' +
'thumbnail. Subject only — no plate, no garnish, no surroundings ' +
'unless intrinsic to the dish.'
```

Specifically:

- **`single-color hand-drawn line art`** → forbids polychrome output.
- **`Strokes in ivory (#F4EBDC)`** → pins all strokes to a single hex.
- **`NO color fill`** → explicit anti-color directive.
- **`NO photographic detail`** → reduces realism / recognizability — pushes the model toward stylized engraving abstraction over food-recognizability.
- **`19th-century botanical or culinary engraving`** → reference frame is etching/woodcut/lithograph, all monochrome.
- **`Editorial / archival broadsheet aesthetic`** → reinforces the muted, archival feel.

This matches `Planning/design-doc.md` "The Ledger" aesthetic (oxblood + ivory + warm near-black, "editorial archival broadsheet"). Bug-5 proposal §86–97 shipped this verbatim. Wave-5 implementation output confirms intent: *"Verbatim style preamble (pen-and-ink, oxblood-on-near-black, no color fill) repeated across calls for cross-batch consistency."*

The user is now asking to invert these constraints.

## Proposed Change (Diff Outline)

If user confirms override (see Open Questions):

- **`lib/ai/sketch-prompt.ts:30-38`** — rewrite `STYLE_PREAMBLE` to request a colorful, recognizable sketch.
  - Drop `single-color`, `Strokes in ivory`, `NO color fill`, `NO photographic detail`, `19th-century botanical engraving`, `Editorial / archival broadsheet`.
  - Add explicit color request (vibrant, naturalistic, true-to-food).
  - Add explicit realism / recognizability request.
  - Keep: subject-only framing, no text/captions/borders/frames, centered composition with generous negative space, thumbnail-friendly composition.
  - Consider: drop the near-black background pin entirely (Gemini sometimes treats background pins as a hard constraint that competes with subject rendering); let the model pick a clean background OR pin to a softer warm-toned canvas.
- **Version bump** — rename function to `v2_sketchPrompt` (or add `v2_` alongside `v1_`) so existing thumbnails generated under v1 aren't re-rendered. The file header comment at line 10 already specifies this versioning protocol: *"Versioned as `v1_` so a later style refresh can ship as `v2_` without cache-busting existing sketches."*
- **Caller update** — `lib/library/sketch-pipeline.ts:268` imports `v1_sketchPrompt` from `@/lib/ai/sketch-prompt`. Update to `v2_sketchPrompt`.
- **Test update** — `tests/unit/lib/ai/sketch-prompt.test.ts` asserts the v1 preamble verbatim across calls (per wave-5 output line 58). Update the assertions to match v2 text, OR add v2 tests alongside v1 if both kept.
- **DO NOT TOUCH** — image-client.ts (no `generationConfig` color params exist; Gemini Flash Image doesn't expose a temperature or palette knob — the only lever is the prompt itself), sketch-pipeline.ts (orchestration is unaffected by prompt content), the WEBP re-encode pipeline (sharp doesn't care about color count), or LibraryCard (renders any image the same way).

## Current Prompt (verbatim)

The shipped prompt is built in `lib/ai/sketch-prompt.ts` and assembled at line 48:

```
${STYLE_PREAMBLE} Subject: "${name}".${regionHint(input.region)}
```

Where `STYLE_PREAMBLE` (lines 30-38) is verbatim:

> Pen-and-ink line drawing on a warm near-black background (#0E0A08). Strokes in ivory (#F4EBDC), single-color hand-drawn line art. Editorial / archival broadsheet aesthetic, similar to a 19th-century botanical or culinary engraving. NO color fill, NO photographic detail, NO text, NO captions, NO borders, NO frames. Centered composition with generous negative space, medium line-weight, suitable as a 240x180 thumbnail. Subject only — no plate, no garnish, no surroundings unless intrinsic to the dish.

`regionHint` (lines 40-44) appends `' Regional context: Vietnamese cuisine.'` or `' Regional context: Western cuisine.'` or empty for `'other'` / unspecified. This stays.

So for "Phở Bò" with region='vn' the model sees:

> Pen-and-ink line drawing on a warm near-black background (#0E0A08). Strokes in ivory (#F4EBDC), single-color hand-drawn line art. Editorial / archival broadsheet aesthetic, similar to a 19th-century botanical or culinary engraving. NO color fill, NO photographic detail, NO text, NO captions, NO borders, NO frames. Centered composition with generous negative space, medium line-weight, suitable as a 240x180 thumbnail. Subject only — no plate, no garnish, no surroundings unless intrinsic to the dish. Subject: "Phở Bò". Regional context: Vietnamese cuisine.

## Proposed Prompt (verbatim)

Two variants depending on how aggressively the user wants to swing the aesthetic. I recommend variant A (moderate swing — keeps it sketchy and recognizable, drops the monochrome constraint and adds color + realism). Variant B is the "more illustrative" version.

**Variant A — Colorful recognizable sketch (recommended):**

```
Colorful hand-drawn sketch of the food/drink subject, rendered in vibrant
naturalistic colors that match the real-life appearance of the dish.
Loose illustrated style with visible pencil/ink linework AND filled color —
think a polished culinary cookbook illustration or a modern food-magazine
spot illustration, NOT a flat icon and NOT a photograph. The subject must
be immediately recognizable as the specific food/drink named. Clean light
background (off-white or soft cream). NO text, NO captions, NO borders,
NO frames, NO watermark. Centered composition with generous negative
space, suitable as a 240x180 thumbnail. Subject only — no plate, no
garnish, no surroundings unless intrinsic to the dish (a bowl for phở is
intrinsic; a tray for a salad is not).
```

**Variant B — More illustrative, photo-adjacent:**

```
Realistic colorful illustration of the food/drink subject, rendered as a
hand-painted watercolor or detailed colored-pencil drawing with accurate,
food-true colors and visible texture. The subject must be immediately
recognizable as the specific food/drink named — proportions, ingredients,
and color should match how the dish actually appears in real life. Clean
soft background (off-white or cream). NO text, NO captions, NO borders,
NO frames, NO watermark. Centered composition with generous negative
space, suitable as a 240x180 thumbnail. Subject only — no plate, no
garnish, no surroundings unless intrinsic to the dish.
```

Both variants preserve: subject-only framing, the "no text/captions/borders/frames" guardrails (Gemini frequently adds those uninvited), thumbnail-aware composition, and the "intrinsic surroundings only" rule that prevents over-stylized presentations.

Both variants drop: near-black background pin (it competes with the subject and forces dark fill), `Strokes in ivory` (monochrome lock), `single-color`, `NO color fill`, `NO photographic detail`, `19th-century botanical engraving`, and `Editorial / archival broadsheet aesthetic`.

The `regionHint()` helper stays unchanged — Vietnamese/Western context still helps the model pick the right rendering.

## Files Affected

- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\sketch-prompt.ts` (rewrite STYLE_PREAMBLE; optional rename `v1_sketchPrompt` → `v2_sketchPrompt`)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts` (update import + call site if function renamed — line 41 + line 268)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\sketch-prompt.test.ts` (update verbatim assertions to match new preamble)

That's it. The image-client, the WEBP re-encoder, the storage upload, the DB write path, the LibraryCard renderer — none of those care about prompt content.

## TDD Required

`yes` — but lightweight.

The prompt itself is a static string, so the change is technically pure-data. **However**, the existing test file `tests/unit/lib/ai/sketch-prompt.test.ts` already asserts:
- The preamble is included in `parts[0].text` (will fail until updated).
- The preamble is **repeated verbatim across calls** for cross-batch consistency (per wave-5 line 58 — this is the consistency contract).
- Region hints for `vn`/`western`/none.
- Whitespace trimming on `displayName`.

So tests already exist and will go RED on the change. The TDD discipline is: **update the test assertions to the new verbatim preamble BEFORE editing the production file**, watch them fail (RED), then edit the production file (GREEN). No new test cases needed unless the user wants to add an assertion that explicitly checks for color-related tokens (e.g. `expect(text).toContain('Colorful')` and `expect(text).not.toContain('single-color')`).

The function-rename to `v2_` is purely a hygiene/versioning step; if the user prefers minimum churn, keep the name `v1_sketchPrompt` and just edit the preamble inline.

## Test Approach

1. **Unit (mandatory):** update `tests/unit/lib/ai/sketch-prompt.test.ts` to assert the new preamble verbatim. RED → GREEN.
2. **Manual visual verification (mandatory, post-merge):** the user generates one new library item from the "Add Item" dialog with a recognizable food name (e.g. "Phở Bò" or "Spaghetti Bolognese"). They visually confirm:
   - Output is colorful (not monochrome).
   - Output is recognizable as the named food (not abstract).
   - Output fits in the 4:3 LibraryCard thumbnail zone without rendering text/borders/frames.
3. **Optional automated visual baseline:** the wave-5 RED/GREEN approach used MSW fixtures to stub Gemini deterministically. Real-Gemini output is non-deterministic, so the existing visual-regression baseline (if any) is intentionally fixture-pinned. No new automated visual baseline is needed for the prompt change — the actual rendering changes only at runtime against real Gemini.
4. **Existing thumbnails:** v1-generated sketches stay on the rows (they're persisted in Storage, paths in `food_library_items.thumbnail_url`, `thumbnail_kind='sketch'`, `sketch_generated_at IS NOT NULL`). The pipeline idempotency gate at sketch-pipeline.ts:232 short-circuits regeneration. **The user's existing sketches will NOT regenerate automatically** — only NEW library inserts get v2 prompts. If the user wants existing sketches refreshed, the bug must include either (a) a one-shot SQL UPDATE that clears `sketch_generated_at`/`thumbnail_kind` for existing sketch rows + a follow-up backfill run, or (b) a "regenerate" affordance per row. **This is a Phase 3 / follow-up scope decision; flag for user.**

## Risk Assessment

`low` for the prompt-change itself; `medium` for the design-override decision.

- **Prompt mechanics risk: LOW.** Pure-data swap. No logic. No new APIs. No new dependencies. Gemini Flash Image accepts the new prompt the same way it accepted the old one.
- **Design-override risk: MEDIUM.** The user is asking to break the curated "The Ledger" editorial aesthetic on a single component. The new colorful sketches will visually clash with the rest of the app (oxblood + ivory on warm near-black, Newsreader serif, no shadows, hairline rules). This is a UX consistency hit. Worth one round of confirmation with the user before merging.
- **Cost risk: LOW.** Same model, same call. Per-image cost unchanged at ~$0.04. The user's existing sketches do NOT regenerate on prompt change (pipeline idempotency), so there is no batch re-bill at prompt-change time.
- **Backfill drift risk: LOW** if the user accepts that v1 + v2 sketches coexist in the library. **MEDIUM** if they want a uniform aesthetic across all library rows, which would require a manual regen flow (out of scope for this bug).

## Regression Sweep Needed

Existing backfill / sign-on-read flow is **unaffected** — the pipeline idempotency gate (sketch-pipeline.ts:232) prevents regeneration of already-sketched rows. Sign-on-read at `lib/storage/sign-thumbnail.ts` is content-agnostic (it just signs paths). Storage RLS is path-based, prompt-independent.

Specifically, no regression risk on:
- Existing library rows with `sketch_generated_at IS NOT NULL` (skipped).
- Existing photo-thumbnail rows (skipped via `thumbnail_kind='photo'` short-circuit).
- WEBP re-encoding to <50KB (sharp doesn't care about color count, but colorful sketches might compress slightly larger than monochrome line art — the existing fallback ladder at sketch-pipeline.ts:301-310 already steps quality down then resizes, so this is handled).
- Storage upload path conventions.
- DB column writes (`thumbnail_url`, `thumbnail_kind`, `sketch_generated_at`, `sketch_attempt_count`).

Touch points to spot-check post-merge:
- `tests/unit/lib/ai/sketch-prompt.test.ts` — must be updated alongside.
- `tests/unit/lib/library/sketch-pipeline.test.ts` — uses fixture mode (`KALORI_SKETCH_FIXTURE_BASE64`), unaffected by prompt content.
- Manual: create one new library item end-to-end; verify the thumbnail renders without errors in LibraryCard at 240×180 and in FoodDetailThumbnail at 320×240. If the new colorful PNG is significantly larger and pushes past the WEBP 50KB ladder, sharp will auto-degrade (existing path).

## UI Touching

`false` — sketches are rendered as plain `<Image>` elements regardless of prompt. LibraryCard.tsx:154 currently sets `data-sketch="true"` on the `<Image>` for sketch-kind items, but no CSS hooks divert sketch styling from photo styling in the shipped code (per wave-5 line 55: *"optional `[data-sketch='true']` opacity override hook (currently same as photo idle; documented for future divergence)"*). The new colorful sketch ships through the exact same render path.

However: **if the user later wants different opacity / treatment for colorful sketches vs monochrome sketches**, the existing `data-sketch="true"` selector is a clean hook to diverge — but that's follow-up styling, not part of this bug.

## Open Questions

1. **CRITICAL — user override confirmation.** The current prompt is a verbatim shipped design decision from `bug-5.md` and aligns with the "The Ledger" archival/editorial aesthetic across the app. The user is asking to break that aesthetic for the sketch component specifically. **Confirm with user: "The current sketch is intentionally monochrome to match the editorial 'Ledger' design system. Do you want to override that and ship colorful sketches even though they will visually contrast with the rest of the app?"** If yes → proceed with this fix. If no → close as `not-a-bug` and document the design rationale.
2. **Variant A vs Variant B prompt.** Variant A is sketchy-but-colorful (recommended; matches user's wording "COLORFUL sketch"). Variant B is more illustrative / watercolor-adjacent. **Which does the user prefer?**
3. **Existing sketch regeneration scope.** Should existing sketches (already in Storage with v1 prompts) be regenerated with v2 prompts, or only NEW library inserts pick up the new style? **Recommend: only new inserts pick up v2 (zero re-spend on regen).** If user wants to regenerate existing sketches, that's a separate follow-up bug (one-shot SQL clear + backfill).
4. **Function rename to `v2_sketchPrompt`?** The file header already specifies this versioning protocol for style refreshes. If the user accepts the convention, the function rename is essentially zero-cost (one import update). If they prefer minimum churn, keep `v1_sketchPrompt` and edit the preamble inline. **Recommend rename.**

## Design System Conflict Check

**YES, this is a direct conflict with the design system.** Specific quotes:

**`Planning/design-doc.md` §1 line 21:**
> "A premium literary aesthetic — 'The Ledger': cream-on-near-black newsprint, Newsreader serif, oxblood signature, chronometer instead of a fitness ring, bulletin-grid meal list. The app reads as a personal journal you've been keeping for years, not a dashboard."

**`Planning/design-doc.md` §1 line 38:**
> "**FAB** on mobile — zero-radius oxblood square with custom-SVG `+` glyph, the only hand-drawn affordance break."

(That last quote is the giveaway — "the ONLY hand-drawn affordance break" means the rest of the app studiously avoids hand-drawn/whimsical illustration. The current monochrome sketch falls inside the editorial-engraving aesthetic; colorful illustrated sketches would be a SECOND hand-drawn affordance break and a more dramatic one.)

**`Planning/bugs/2026-05-16-library-overhaul/proposals/bug-5.md` §85-97 (prompt origin):**
The shipped STYLE_PREAMBLE is verbatim from this proposal. The proposal author (this codebase's prior bugfix-tomi pass) deliberately specced single-color line art "to read as a coherent set (consistency is the hard problem with non-deterministic image models)" — verbatim from `lib/ai/sketch-prompt.ts:5-8`.

**`Planning/bugs/2026-05-16-library-overhaul/outputs/wave-5-sketch-create.md` line 42:**
> "Verbatim style preamble (pen-and-ink, oxblood-on-near-black, no color fill) repeated across calls for cross-batch consistency."

**No language in `ui-design.md` or `design-doc.md` explicitly mandates monochrome for the LibraryCard thumbnail.** The `ui-design.md` §7.3.4 + §4.2.5 references for `LibraryCard.Thumbnail` describe an `<img>` slot with `object-fit: cover` and a 0.85 idle opacity that lifts to 1.0 on hover — those rules are content-agnostic and work for color or monochrome equally.

**Summary:** the muted/editorial aesthetic is a real, intentional, documented design choice — but it lives at the **prompt level** (one file, one string), not at the layout/CSS level. The user can override it by editing one string. **However**, the resulting visual will clash with the rest of the app's editorial aesthetic, and the user should make that override decision consciously. Hence the recommendation to pause for confirmation.

## Stop-the-world trigger

**TRIGGERED** — intentional design choice found at `lib/ai/sketch-prompt.ts:30-38` + `bug-5.md` §85-97 + `wave-5-sketch-create.md` §42. The current monochrome output is **the documented intended behavior**, not a bug.

**Required action:** main agent should pause this bug at the proposal/approval stage and ask the user:

> "The current sketch prompt was intentionally specced as a monochrome pen-and-ink editorial sketch to match 'The Ledger' design system. The output you're seeing is working as designed. Do you want to override the design and ship colorful, illustrated sketches even though they will visually contrast with the rest of the app's editorial aesthetic? If yes, I have two prompt variants ready (sketchy-colorful or watercolor-illustrated). If no, close as not-a-bug."

If user confirms override → proceed with this proposal (low-risk one-string change + test update). If user says "actually keep the editorial style, the recognizability is the real problem" → re-route to a smaller fix that improves realism within the monochrome constraint (add `"clearly recognizable as the named dish, accurate proportions and key visual cues preserved"` to the existing prompt without dropping the single-color constraint).

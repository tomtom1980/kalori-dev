# Bug 5 — AI-generated SKETCH thumbnails for library items (replace letter-mark fallback)

**Batch:** `2026-05-16-library-overhaul`
**Bug ID:** Bug 5
**Classification:** `actually_a_feature` (large new capability — new external Gemini Image API integration, DB write path change, storage upload flow, backfill orchestration, UI render path change, RLS-bounded Storage object handling, cost exposure)
**Scope honesty:** This exceeds typical bugfix-tomi scope. The user explicitly directed all items go through bugfix-tomi for batched handling; flagging classification but producing a full proposal.

---

## One-liner

Replace the per-card `ThumbnailLetterMark` placeholder with a Gemini-2.5-Flash-Image (Nano Banana) generated SKETCH-style line drawing of the food/drink, persisted to the existing `food-thumbnails` Supabase Storage bucket, populated on library item INSERT and back-filled for existing rows.

---

## User intent

> "When we add a new item to the library, instead of just having a first letter there, we want to create a sketch picture of that food item, food or drink item. We just create that sketch picture will use the Gemini Flash image model to create that sketch and add it to the library. That we don't only create it when we add new items to the library."

Two requirements:
1. **New items:** generate sketch at library-row INSERT time.
2. **Existing items:** backfill all `food_library_items` rows with `thumbnail_url IS NULL`.

---

## Affected components

### Files / modules to modify (writes)

- `lib/ai/client.ts` — add image-generation helper (`callGeminiImage`) or new sibling module `lib/ai/image-client.ts`.
- `lib/ai/prompts.ts` — add `v1_librarySketchPrompt(displayName, region)` factory.
- `lib/ai/schemas.ts` — Zod for image-response envelope (`candidates[0].content.parts[].inlineData.data` shape).
- `app/api/entries/save/route.ts` lines ~509–550 — extend save-to-library branch to fire sketch generation **out-of-band** AFTER insert succeeds (do NOT block the entry write).
- New module `lib/library/sketch-pipeline.ts` — orchestrates: prompt → Gemini Image → resize/encode to WEBP <50KB → `supabase.storage.from('food-thumbnails').upload` → `update food_library_items set thumbnail_url = <signedPathOrPublicId>`.
- New module `lib/library/sketch-backfill.ts` — paginated worker that selects rows with `thumbnail_url IS NULL`, calls the pipeline per row with rate-limit.
- New API route `app/api/library/sketch/regenerate/route.ts` — POST `{ library_item_id }` to retry a single row (drives a user-visible "regenerate" affordance in FoodDetail, and is the test harness for backfill).
- New API route `app/api/library/sketch/backfill/route.ts` — POST trigger for one-shot backfill (idempotent; reads remaining-null count + processes a batch).
- `app/(app)/library/_components/LibraryCard.tsx` — already reads `thumbnail_url` via `next/image`; **no logic change** but the visual contract changes (sketch instead of letter-mark when present). Verify aspect-ratio (4/3 per ui-design.md §7.3.4) survives generated content.
- `app/(app)/library/_components/FoodDetail/FoodDetailThumbnail.tsx` — already renders hero from `thumbnail_url`; verify sketch reads cleanly at 320×240 / mobile full-width 4:3.
- New DB column? **NO** — `food_library_items.thumbnail_url text NULL` already exists (architecture §2.4 line 235; verified `supabase/migrations/0003_food_schema.sql`). The existing column was reserved for vision-flow uploaded photos. Re-purpose it to hold the AI-sketch path (Storage path string), with a new boolean `thumbnail_kind` column added if we need to distinguish sketch from real-photo — **OPEN DECISION below**.
- New migration `supabase/migrations/0021_library_sketch_columns.sql` — optional `thumbnail_kind text check (thumbnail_kind in ('photo','sketch'))`, `sketch_generated_at timestamptz`, `sketch_attempt_count int default 0`, `sketch_last_error text` columns to support retry-on-failure UX.

### Existing code paths that already render `thumbnail_url`

- `LibraryCard.tsx` (lines 99–116) — `<Image src={item.thumbnail_url}>` rendered at 240×180, falls back to `ThumbnailLetterMark`. No change needed; the migration will simply route through the existing branch.
- `FoodDetailThumbnail.tsx` — hero renderer.
- `lib/library/fetch.ts` — already SELECTs `thumbnail_url`.
- `lib/library/getItem.ts` — already SELECTs `thumbnail_url`.

### Files NOT touching

- RLS policies (no change — existing path-based RLS on `food-thumbnails` bucket covers `{userId}/sketch_{client_id}.webp`).
- Gemini text-parse / vision routes (separate model).
- Library list / search / sort / filter — they remain unaware of how the thumbnail was produced.

---

## Generation pipeline (proposed shape)

```
POST /api/entries/save  ─► row inserted into food_library_items
                          │
                          ├─ revalidateTag(userLibrary)  ◄── happens synchronously
                          │
                          └─ fire-and-forget enqueue → sketchPipeline(libraryItemId)
                                                      │
                                                      ├─ generate prompt (display_name + region)
                                                      ├─ callGeminiImage({model: 'gemini-2.5-flash-image', prompt})
                                                      ├─ inlineData.data → Buffer → resize <50KB WEBP
                                                      ├─ supabase.storage.upload(food-thumbnails/{uid}/sketch_{client_id}.webp)
                                                      ├─ UPDATE food_library_items SET thumbnail_url = <path>, thumbnail_kind='sketch'
                                                      └─ revalidateTag(userLibrary) — second tick
```

Failure modes:
- Gemini 4xx/5xx → log `sketch_last_error`, increment `sketch_attempt_count`. UI keeps letter-mark fallback. Retry button on FoodDetail card OR auto-retry on next library mutation.
- Storage upload fail → same.
- Size-budget violation → reject, mark error.

Async strategy: **Vercel waitUntil()** (Next.js `after()` API) to keep the request fast while the generation continues server-side. **OPEN DECISION below** — `waitUntil` is preferred over a separate Edge job for simplicity at MVP scale (single user, low traffic).

---

## Prompt template (proposal — refine with user)

```
Pen-and-ink sketch of "{displayName}", drawn as a single-color line drawing
on a warm near-black background (#0E0A08). The strokes should be ivory
(#F4EBDC). Editorial / archival broadsheet aesthetic, like a 19th-century
botanical or culinary engraving. NO color fill, NO photographic detail, NO
text, NO captions, NO borders, NO frames, centered composition, generous
negative space, line-weight medium, suitable for use as a 240×180 grid
thumbnail. Subject only — no plate, no garnish, no surroundings unless
intrinsic to the dish (e.g. a bowl for phở is intrinsic).

Region context: {region|optional, "Vietnamese" or "Western"}.
```

Constraints to test:
- Output transparency: Gemini 2.5 Flash Image returns base64 PNG with no transparency by default. Convert to WEBP on server with a near-black fill matching `--color-bg-1` to avoid double-rendered backgrounds in the card.
- Style consistency across foods is the hard problem. Cross-batch consistency requires the prompt to repeat the style preamble verbatim every call. Cache-busting NOT needed.

---

## Backfill strategy

Existing library items today: per `progress.md` the project is single-user MVP. Worst-case estimate: ~50–150 rows (single user logging a few months of meals at ~1 row/day). Cost at Gemini 2.5 Flash Image pricing (~$0.04/image, public 2026 pricing — verify before committing) = **$2–6 one-shot**, well under any sane ceiling.

Recommended approach:
1. **One-shot trigger from dashboard** — admin/settings button "Backfill library sketches" calls `POST /api/library/sketch/backfill`. The route:
   - SELECTs up to N (e.g. 25) rows with `thumbnail_url IS NULL`, ordered by `log_count DESC` (most-used first).
   - Processes them sequentially with `await sketchPipeline(...)` (no parallelism — Gemini image rate limits are tight; ~1 req/sec is safe).
   - Returns `{processed, remaining}`. Client polls until `remaining === 0`.
2. **No cron**, no background worker, no Edge job. Single-user MVP doesn't justify the orchestration.
3. **No "lazy on view"** — that would mean N concurrent Gemini calls when the user opens the library, blowing the rate limit AND degrading first-paint.

---

## Cost / rate ceiling (OPEN DECISION)

- Per-image cost (public pricing as of late 2025): ~$0.039 (gemini-2.5-flash-image). User to confirm via current billing dash.
- HALT signal: if existing row count > 500 at backfill kick-off, pause and confirm with user before draining (`$20+`).
- New-item generation: 1 sketch per library insert = ~$0.04 each. At single-user volume (~1–3 inserts/day), monthly cost ~$1–4.

---

## TDD plan

- **Unit:** `lib/ai/prompts.test.ts` — sketch prompt factory shape, includes displayName, no concatenation drift.
- **Unit:** `lib/library/sketch-pipeline.test.ts` — MSW-stubbed Gemini image envelope `{candidates:[{content:{parts:[{inlineData:{mimeType, data}}]}}]}` → upload to mocked Supabase → UPDATE row. Verify error paths (Gemini 500, Storage 5xx, oversized image → reject) and that error-path side-effects are exactly: increment `sketch_attempt_count`, set `sketch_last_error`, do NOT set `thumbnail_url`. Pairs with lessons-relevant line 16 (mocks that always succeed hide error branches).
- **Integration:** `tests/integration/library-create-sketch.test.ts` — POST /api/entries/save with `save_to_library: true`, verify (a) entry inserts immediately, (b) library row gets `thumbnail_url` populated within waitUntil deadline, (c) second `revalidateTag` fires. Network mocked, Storage mocked.
- **Integration:** `tests/integration/library-sketch-backfill.test.ts` — seed 5 rows with NULL `thumbnail_url`, POST /api/library/sketch/backfill, assert 5 rows processed + `thumbnail_url` written for each.
- **RLS:** `tests/rls/sketch-bucket.test.ts` — assert User B cannot upload to `{userA}/sketch_*.webp` (existing RLS already covers this; add regression test for the sketch path-naming convention).
- **Component:** `tests/components/library/LibraryCard.sketch.test.tsx` — given `thumbnail_url` populated, card renders `<Image>`, not `ThumbnailLetterMark`.
- **E2E (visual):** `tests/e2e/library/library-sketch.spec.ts` — pixel-diff baseline of card grid with sketch thumbnails (acceptable variance ~5% because Gemini output is non-deterministic). Use MSW + a fixed test fixture sketch byte-blob to keep the visual baseline stable; real Gemini calls gated behind `RUN_GEMINI_LIVE=1` env flag.

**RED-first discipline:** every test above MUST fail first against current code, then green after implementation. Pairs with lessons-relevant line 12 (axe wall-behind-wall) and line 16 (error-path coverage).

---

## Risk

**High.**

- New external API surface (Gemini Image), not yet covered by `lib/ai/client.ts`. SDK shape differs slightly (inlineData parts vs JSON text). Codex R1 likely flags untested error paths.
- Non-deterministic output → visual regression tests need careful baselining.
- Cost exposure if backfill misbehaves.
- I4 (photo originals never persisted) — sketches are NOT user photos; they're synthetic. Confirm with user that this is acceptable.
- Naming-collision risk on the storage path: existing convention is `{uid}/{client_id}.webp` (used by vision uploads). For sketches, distinguish via `{uid}/sketch_{client_id}.webp` OR a separate sub-folder `{uid}/sketches/{client_id}.webp`. **OPEN DECISION below.**
- Privacy: food names are not sensitive (single-user app), but if multi-user post-MVP, sketches stay path-scoped via existing RLS. No new privacy surface.

---

## UI touching

**YES.**

Citations from `Planning/ui-design.md`:
- §7.3.4 LibraryCard compound — Thumbnail zone `aspect-ratio: 4/3`, `bg-2`, 1px `rule` border, `overflow: hidden`. Photo `<img object-fit: cover>` with 0.85 opacity (hover lifts to 1.0). Alt text `{display_name}`.
- §4.2.5 LibraryCard — `LibraryCard.Thumbnail src={item.thumbnail_url} fallback={<LetterMark name={item.display_name} />}`. Letter-mark fallback ALREADY designed as fallback only.
- §7.3.6 FoodDetail Hero Thumbnail — 320×240 desktop / mobile full-width 4:3, bg-2, 1px `rule-strong`. Letter-mark fallback. Layout `layoutId` shared-element transition `motion-expressive` 320ms `ease-editorial`.

Visual integration: sketch fills the existing 4:3 thumb zone. Letter-mark becomes the failure-state fallback only (not the default). The letter-mark code path stays in place — DO NOT delete it, per the surgical-changes principle.

`ui-design.md` line 1162's "Letter-mark fallback (per tiebreaker #7): `bg-2` background + 2px oxblood top rule + `sand` 28px Newsreader 300 letter" remains accurate as the fallback; new sketches occupy the thumbnail slot ABOVE the fallback layer.

---

## TDD required?

**YES.** All logic paths (prompt build, Gemini call, upload, DB write, error paths, backfill orchestration) need failing-test-first coverage. Pure-data UI paths already exist; their visual change is a baseline refresh.

---

## File count

~13 files (5 modified, 8 new):
- Modified: `lib/ai/client.ts`, `lib/ai/prompts.ts`, `lib/ai/schemas.ts`, `app/api/entries/save/route.ts`, `lib/library/fetch.ts` (only if `thumbnail_kind` column added).
- New: `lib/ai/image-client.ts` (if split from client.ts), `lib/library/sketch-pipeline.ts`, `lib/library/sketch-backfill.ts`, `app/api/library/sketch/regenerate/route.ts`, `app/api/library/sketch/backfill/route.ts`, `supabase/migrations/0021_library_sketch_columns.sql`, ~6 test files.

---

## Stop-the-world flags

- **F1.** Feature classification — user explicitly directed bugfix-tomi handling but this is unambiguously a feature add. Confirm with user that bugfix-tomi pathway is acceptable for the scope vs splitting to `brainstorm-tomi` FA.
- **F2.** Cost ceiling — no precedent for paid image generation in this project. Need user to ratify per-call ($0.04) + backfill ceiling.
- **F3.** Storage bucket policy delta — none required if we reuse `food-thumbnails` with a `sketch_` prefix on the filename. Confirm with user.

---

## Open Decisions Requiring User Input

1. **Model name** — `gemini-2.5-flash-image` (Nano Banana) confirmed via context7 (`/googleapis/js-genai` v2.0.1). Returns base64 PNG via `inlineData.data`. **Confirm OK to use this model.**
2. **Generation trigger** —
   - (a) `waitUntil()` after entry-save (recommended; non-blocking, no new infra).
   - (b) Synchronous in the entry-save route (blocks save by 2–5s — REJECT).
   - (c) Lazy on first card render (blows rate limit on library open — REJECT).
   - (d) Dedicated `/api/library/sketch/generate` route invoked client-side post-save (cleaner but adds round-trip).
   - **Recommend (a) with (d) as the retry surface.**
3. **Backfill strategy** —
   - (a) One-shot dashboard/settings button → API → sequential batch (recommended).
   - (b) Cron job (overkill for single-user MVP).
   - (c) Per-card "Generate" affordance the user clicks manually (most UI overhead).
   - **Recommend (a) with (c) as the retry-on-failure UX.**
4. **DB schema additions** —
   - Add `thumbnail_kind`, `sketch_generated_at`, `sketch_attempt_count`, `sketch_last_error` columns? Useful for retry UX + telemetry. Or punt to a single `thumbnail_url IS NULL` retry signal? **Recommend ADD the columns** — minimal cost, big observability win.
5. **Cost ceiling** — set a hard ceiling (e.g. `MAX_SKETCHES_PER_DAY`, `MAX_BACKFILL_SIZE = 200`)? Or trust single-user low volume? **Recommend ceiling = 200 backfill cap + Sentry alert if budget exceeded.**
6. **Storage path convention** — `{uid}/sketch_{client_id}.webp` (one bucket, prefix discriminator) vs `{uid}/sketches/{client_id}.webp` (subfolder). RLS works the same for both. **Recommend prefix** for grep-ability.
7. **Bucket name** — keep `food-thumbnails` or introduce a separate `food-sketches` bucket? Separate bucket = cleaner mental model, more migration work. **Recommend reuse `food-thumbnails`.**
8. **Override or coexist with real photo thumbnails?** If a user later uploads a real photo for a library item (vision flow), should it overwrite the sketch? **Recommend YES** — real photo wins, sketch becomes legacy.
9. **Style consistency vs per-item variance** — accept that 2 sketches of "pho" may look slightly different (Gemini is non-deterministic), OR cache by `normalized_name` so all "pho" instances across users share one sketch? **Recommend accept variance** — single-user app has no cross-user benefit, and seed-based determinism via Gemini is not yet stable API.
10. **Test mode for Gemini image** — MSW stubs return a fixed test fixture PNG (8x8 transparent) so component visual tests stay deterministic. Live calls gated behind `RUN_GEMINI_LIVE=1`. **Recommend YES**.
11. **Manual entries** — current code path inserts to library only when `source === 'text' || source === 'photo'`. Manual entries (source = 'manual') do NOT save to library. Should manual entries now save to library AND get sketches? **OUT OF SCOPE for this bug** — defer to follow-up.
12. **Bugfix-tomi vs brainstorm-tomi FA routing** — given the scope (DB migration + new external API + backfill + cost surface), this is brainstorm-tomi FA territory per `~/.claude/rules/skill-routing.md` Case 7. User directive overrides. Confirm bugfix-tomi continuation OR re-route.

---

## End-of-proposal

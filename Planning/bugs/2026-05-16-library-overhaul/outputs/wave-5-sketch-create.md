# Wave 5 — Add-to-Library + Sketch Cluster

**Batch:** `2026-05-16-library-overhaul`
**Scope:** Bugs 5 (Gemini sketch generation pipeline + backfill + dashboard widget + LibraryCard integration), 6 (manual library add: route + Sheet drawer form + i18n + LibraryClient wiring).
**Result:** BOTH BUGS GREEN. 436/436 tests pass across 59 files (library + dashboard + AI + api + integration). Typecheck clean. Phase 3 complete — all 12 bugs in the batch implemented.

---

## Bug 6 — POST /api/library/create + Add Item drawer

### Files created
- `lib/library/create-schema.ts` — shared Zod schema (client + server). Field shape: `client_id (uuid)`, `display_name (1..120 trim)`, optional `default_portion (>0)` + `default_unit`, required `nutrition.kcal (int >=0)` + 4 macros (`protein_g/carbs_g/fat_g/fiber_g`, finite nonnegative). `.strict()` rejects unknown keys.
- `app/api/library/create/route.ts` — POST endpoint. Auth fence (`requireProfileOrJson401` + `deleting-fence`). I11 idempotency: same `client_id` → 200 + `replayed:true`. Normalized-name dedup via `normalizeName()`: collision → 409 + `existing` row. Otherwise INSERT with `created_from='manual'` + `user_edited_flag=true` → 201. Cache invalidation only on success leg (`revalidateTag(TAGS.userLibrary(uid))` + `revalidatePath('/library')`). Fires `enqueueSketchGeneration` after INSERT.
- `app/(app)/library/_components/LibraryAddDialog.tsx` — Radix Dialog rendered as right-side Sheet (`data-shape='sheet'` + slide-in animation). Native React form (no react-hook-form; matches project convention). Stable `client_id` via `useRef(crypto.randomUUID())` — same across retries. Raw `fetch` (not `authPost`) so 409 responses can be inspected. Three response paths: 201/200 → close + `onCreated`; 409 → duplicate banner with link to existing item; 4xx/5xx → server-error banner, button rearms for retry, `client_id` preserved.

### Files modified
- `app/(app)/library/_components/LibraryClient.tsx` — dynamic-imports `LibraryAddDialog`, adds `addOpen` state, renders Add Item action bar above the tools rail (hidden in selectMode), wires `router.refresh()` on `onCreated`.
- `lib/library/fetch.ts` — widened `LibraryItem.created_from` union to include `'manual'`, added optional `thumbnail_kind`, added `thumbnail_kind` to the SELECT column list.
- `lib/library/getItem.ts` — added `thumbnail_kind` to the SELECT column list.
- `lib/i18n/en.ts` — 22 new i18n keys (add-item button, dialog title, labels, error messages, sketch-backfill widget strings).
- `app/globals.css` — Sheet drawer styles (`[data-shape='sheet']` + `kalori-sheet-slide-in` keyframe with reduced-motion gating), form layout tokens (`kalori-library-add-form`, `kalori-library-add-row`, `kalori-library-add-input`).

### Tests added
- `tests/unit/lib/library/create-schema.test.ts` — 12 cases: minimal valid, optional portion/unit omitted, empty-name reject, length cap, negative macros, negative kcal, non-int kcal, missing macros, non-UUID client_id, unknown keys (strict), negative portion, zero portion.
- `tests/unit/api/library-create.test.ts` — 8 cases: 201 + manual created_from + user_edited_flag, 200 + replayed:true on duplicate client_id, 409 + existing on normalized-name collision, 400 on invalid Zod, sketch enqueue fired, revalidateTag fired on success, NO revalidateTag on insert error (error-path discipline), 401 from fence Response.
- `tests/components/library/LibraryAddDialog.test.tsx` — 5 cases: renders all fields, submit blocked on empty name, valid submission posts shaped payload, retry preserves client_id, 409 surfaces duplicate banner with link.

### RED → GREEN
- RED: schema + route + dialog all non-existent; tests failed for the right reason (module not found / element not found).
- GREEN: 25/25 Bug 6 tests pass.

### Deviations
- Project uses native React forms — `react-hook-form` is not in deps. Form state is `useState`-driven; `useRef` holds idempotent `client_id`. Mirrors `app/(app)/onboarding/_components/StepHeight.tsx` precedent.
- Dialog uses raw `fetch` (not `authPost`) so the 409 dedup branch is observable. 401 is handled at the page level (route fence already returns 401 → client redirect by the existing auth chain).
- Add Item action bar lives at the LibraryClient top-of-page level rather than embedded in `LibraryMasthead.tsx` to keep the masthead a pure RSC presenter (no client state).

---

## Bug 5 — Gemini sketch generation pipeline

### Files created
- `lib/ai/sketch-prompt.ts` — `v1_sketchPrompt({ displayName, region? })` factory. Verbatim style preamble (pen-and-ink, oxblood-on-near-black, no color fill) repeated across calls for cross-batch consistency. Optional Vietnamese/Western region hint.
- `lib/ai/image-client.ts` — `callGeminiImage()` REST wrapper. Targets `gemini-2.5-flash-image` (confirmed via Context7). Parses `candidates[0].content.parts[].inlineData.{mimeType, data}`. **Fixture mode**: when `KALORI_SKETCH_FIXTURE_BASE64` is set, returns the fixture bytes verbatim — used by route + pipeline tests to avoid live API calls.
- `lib/library/sketch-pipeline.ts` — server-only orchestrator. Re-reads the row → idempotency gates (already-sketched → skip; photo-present → skip; max_retries → skip) → Gemini call → `sharp` PNG→WEBP re-encode capped at <50KB → upload to `food-thumbnails/{userId}/sketch_{client_id}.webp` → UPDATE row with `thumbnail_url`+`thumbnail_kind='sketch'`+`sketch_generated_at=now()`+bumped attempt count. Failure path: `sketch_last_error` + `sketch_attempt_count++`, NO thumbnail fields touched (Sentry captureException with component=sketch-pipeline). Returns `SketchPipelineOutcome` envelope.
- `lib/library/sketch-enqueue.ts` — thin helper using Next.js 16 native `after()` from `next/server` (chosen over `@vercel/functions` waitUntil since that package isn't installed; `after()` maps to the same Vercel waitUntil lifecycle). Lazy-imports `sketch-pipeline` inside the deferred callback so test files don't have to mock `server-only` at the route level. Skips in `NODE_ENV==='test'` or when `KALORI_SKETCH_DISABLED=1`.
- `app/api/library/sketch/generate/route.ts` — POST single-row retry. Auth-fenced. Returns 200 on `generated`/`skipped` (idempotent), 503 on `failed`. Revalidates cache only on the `generated` leg.
- `app/api/library/sketch/backfill/route.ts` — POST one-shot dashboard-triggered batch. Selects up to `MAX_BACKFILL_PER_INVOCATION = 200` items where `deleted_at IS NULL AND sketch_generated_at IS NULL AND (thumbnail_kind IS NULL OR thumbnail_kind='sketch') AND sketch_attempt_count < 3`, ordered by `log_count DESC` (most-used first). Sequential processing (Gemini rate limits). Returns aggregated `{generated, failed, skipped, remaining, processedBatchSize}`. Cache revalidation only when `generated > 0`.
- `app/(app)/dashboard/_components/SketchBackfillButton.tsx` — minimal dashboard widget. Hidden when `initialPendingCount === 0` and no prior report. Click → POST → render report + decay pending count via response.remaining. Rearms when remaining > 0 so user can drain the queue in batches.

### Files modified
- `app/api/entries/save/route.ts` — save-to-library branch now (a) infers `thumbnail_kind='photo'` for `source==='photo'` so the sketch pipeline's photo-wins guard short-circuits, (b) fires `enqueueSketchGeneration` for `source==='text'` library inserts (photo inserts skip).
- `app/(app)/library/_components/LibraryCard.tsx` — image now carries `data-sketch="true"` when `item.thumbnail_kind === 'sketch'`. Absent for photo / unknown (not `"false"`).
- `lib/library/fetch.ts` + `lib/library/getItem.ts` — added `thumbnail_kind` to the SELECT (already typed in LibraryItem).
- `lib/i18n/en.ts` — 7 keys for the sketch backfill widget.
- `app/globals.css` — sketch backfill widget styles + optional `[data-sketch='true']` opacity override hook (currently same as photo idle; documented for future divergence).

### Tests added
- `tests/unit/lib/ai/sketch-prompt.test.ts` — 7 cases: includes displayName, repeats preamble across calls (consistency), single contents array role=user, region hints for vn/western, region omitted for unspecified/other, trims whitespace.
- `tests/unit/lib/ai/image-client.test.ts` — 7 cases: fixture mode returns deterministic bytes without network, real fetch parses inlineData + URL contains model name, returns null when no inlineData, throws on non-2xx, throws when API key missing, accepts custom model name.
- `tests/unit/lib/library/sketch-pipeline.test.ts` — 7 cases: happy path generates+uploads+updates, idempotent skip on `already_generated`, photo-wins skip on `photo_present`, retry cap at >=3 attempts, missing row skip, upload failure records error WITHOUT writing thumbnail_url, Gemini no-image failure path.
- `tests/unit/api/library-sketch-generate.test.ts` — 5 cases: successful pipeline → 200 + revalidate, failed → 503 + no revalidate, skipped → 200 + no revalidate (idempotent), invalid body → 400, pipeline invoked with right args.
- `tests/unit/api/library-sketch-backfill.test.ts` — 6 cases: respects 200-item cap, sequential processing, aggregated counts, zero candidates branch, NO revalidate when generated=0, revalidate when generated>0.
- `tests/unit/api/entries-save-sketch-enqueue.test.ts` — 3 cases: text source fires enqueue, photo source does NOT fire (and row marked thumbnail_kind='photo'), save_to_library=false does NOT fire.
- `tests/components/dashboard/SketchBackfillButton.test.tsx` — 4 cases: hidden when pendingCount=0, renders when pendingCount>0, click POSTs + renders report, rearms when remaining > 0.
- `tests/components/library/LibraryCard.test.tsx` — 2 new cases (under `sketch attribute (Bug 5)` describe): image carries `data-sketch="true"` for sketch kind, NO `data-sketch` for photo kind.

### RED → GREEN
- RED: Gemini wrapper non-existent, pipeline non-existent, routes non-existent, dashboard widget non-existent, LibraryCard had no sketch attribute. Tests failed for the right reason.
- GREEN: 41/41 Bug 5 tests pass (including cross-bug entries-save sketch enqueue chain).

### Deviations
- Used Next.js 16 native `after()` from `next/server` instead of `@vercel/functions` waitUntil (package not installed; `after()` maps to the same Vercel waitUntil lifecycle and works in `next dev`).
- Sketch pipeline is invoked DIRECTLY via the enqueue helper (server-side function call, lazy-imported inside `after()`) rather than via internal HTTP round-trip to `/api/library/sketch/generate`. The `/generate` route is preserved for client-driven manual retries (out of scope for this batch but exposed for future UI). This is cleaner — no auth cookie round-trip needed.
- Sketch storage path: `{userId}/sketch_{client_id}.webp` (prefix discriminator per Open Decision #6). Existing `food-thumbnails` RLS policies already key off the first path segment, so user isolation is enforced without policy changes.
- `thumbnail_url` is set to a long-lived (7-day) signed URL so the `next/image` render path can use it directly. Falls back to `publicUrl` if signing fails (though the bucket is private — this is defensive).
- Cost ceiling enforced server-side at the route level (`MAX_BACKFILL_PER_INVOCATION = 200`) AND at the pipeline level (`MAX_RETRIES = 3` per item). The UI button is a thin wrapper that surfaces remaining count; doesn't gate cost.

---

## Cluster regression check

- **Wave 5 + adjacent surfaces:** 436 / 436 pass across 59 files (`tests/components/library`, `tests/components/dashboard`, `tests/unit/lib/library`, `tests/unit/lib/ai`, `tests/unit/lib/nutrition`, `tests/unit/library`, `tests/unit/api`, `tests/integration/library-create.test.ts`, `tests/integration/library-page.test.tsx`).
- **Wave 4 lock-in (separator + pagination + sort default):** GREEN (`LibraryGrid.test.tsx`, `LibraryClient.pagination.test.tsx`, `library-page.test.tsx`).
- **Wave 3 lock-in (LibraryCard role+menu, hover/focus, pending state):** GREEN — adding `data-sketch` attribute did not affect any existing assertions.
- **Wave 2 lock-in (FoodDetail route mode, mutation block, macro DV, micros expand):** GREEN (179 library + nutrition tests in tests/components/library + tests/unit/lib/nutrition).
- **Wave 1 migration test:** 6/6 pass (env-gated, skipped here but ran previously).
- **Typecheck:** `npx tsc --noEmit` clean.
- **Anticipated visual diffs (not regenerated this wave; flagged for Phase 7 visual sweep):**
  1. New Add Item button in a thin action bar above the tools rail.
  2. New Sheet drawer dialog (right-side, 420px max width) on Add Item click.
  3. New sketch-backfill widget on dashboard (only renders when pending > 0).
  4. LibraryCard image carries `data-sketch="true"` for sketch kind (no visible change unless CSS diverges from the existing 0.85 idle opacity).

---

## Production deployment notes (Phase 8)

**Required prod actions before shipping Wave 5 to production:**

1. **Apply migration 0021 to prod** — Wave 1 only applied to `kalori-dev`. Run:
   ```bash
   node scripts/apply-migration-0021.mjs Planning/apikeys.txt
   ```
   This widens the `created_from` CHECK to accept `'manual'` and adds the four sketch-tracking columns (`thumbnail_kind`, `sketch_generated_at`, `sketch_attempt_count`, `sketch_last_error`).

2. **Confirm `GEMINI_API_KEY` is set on Vercel for Production scope** — already in env per `Planning/setup-state.md`; verify by `vercel env ls`. Image generation reuses the same key as text generation (shared model family billing).

3. **No new Storage bucket needed** — reuses existing `food-thumbnails`. RLS policies (path-based, first-segment UUID = auth.uid) already cover the `sketch_{client_id}.webp` filename convention.

4. **First-time backfill** — after deploy, log into the live app, navigate to `/dashboard`, click **Generate sketches** to backfill existing library rows. The button rearms while `remaining > 0`. Single-user MVP volume estimate (~50–150 rows) = ~$2–6 one-shot at ~$0.04/image.

5. **`KALORI_SKETCH_DISABLED=1`** — optional env var to globally disable the sketch enqueue (e.g. during a quota incident). Skip path is in `sketch-enqueue.ts`.

**No production migration rollback needed** — column additions are additive (no DROP); CHECK widening is a superset. Failure scenarios revert to the letter-mark fallback (which Wave 3 preserved verbatim).

---

## Hand-off to Phase 4 (Codex adversarial review)

Wave 5 covers two big surfaces — Bug 5 (external Gemini API, storage upload, sequential backfill, cost cap) and Bug 6 (auth-fenced route, idempotency, dedup, new dialog UI). Areas for adversarial scrutiny:

1. **Sketch pipeline error path** — verify that the `failed` leg writes `sketch_attempt_count++` + `sketch_last_error` but never touches `thumbnail_url`/`thumbnail_kind`/`sketch_generated_at`. Already covered by `sketch-pipeline.test.ts` case 6 (upload failure path).
2. **Idempotency under concurrent INSERTs** — if two browser tabs submit the same `client_id` simultaneously, the route's pre-insert SELECT-by-client_id race is currently not protected by a DB-level partial unique on `client_id`. The race window is small (microseconds between SELECT and INSERT); existing partial unique on `(user_id, normalized_name) WHERE deleted_at IS NULL` (migration 0020) catches normalized-name duplicates but not client_id races. Codex should flag whether to add a partial unique on `(user_id, client_id)`.
3. **Photo-overrides-sketch rule** — relies on the entries-save route correctly stamping `thumbnail_kind='photo'` at INSERT time. The sketch pipeline's `photo_present` short-circuit reads that field. Codex should verify both legs agree (entries-save test case 2 covers this).
4. **Storage path RLS** — `{userId}/sketch_{client_id}.webp` lands in the `food-thumbnails` bucket where existing path-based RLS policies extract the first segment via `split_part(name, '/', 1)::uuid`. Codex should verify the sketch path correctly populates User A's segment (not via prefix injection).
5. **Backfill query** — uses `.or('thumbnail_kind.is.null,thumbnail_kind.eq.sketch')` to include both never-sketched rows and rows with a stale sketch needing retry. Codex should confirm Supabase's `.or()` shape is correct under the JS client.

---

## Halts / stop-the-world flags

None during Wave 5 execution. All defaults from the briefing were honored:
- ✅ Model: `gemini-2.5-flash-image`
- ✅ Trigger: async via `after()` (Next.js 16 native deferred-execution, mapped to `waitUntil` lifecycle on Vercel)
- ✅ Backfill: one-shot dashboard button + sequential + 200-item cap (enforced server-side)
- ✅ Max 3 retries per item
- ✅ Photo overrides sketch (entries-save sets `thumbnail_kind='photo'`; pipeline guards on it)
- ✅ Fixture-based tests via `KALORI_SKETCH_FIXTURE_BASE64` (no live Gemini calls)

The Wave 3 hand-off note about `.kalori-library-card-thumb img` idle opacity 0.85 was honored — added a `[data-sketch='true']` override hook in globals.css set to the same value (documented for future divergence).

The `@vercel/functions` package isn't installed; switched to `next/server` `after()` (Next.js 16 native) which maps to the same Vercel waitUntil lifecycle. This was the cleanest path forward (no new dependency, no install step needed for prod).

End of Wave 5.

# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-16-library-overhaul`
**Baseline:** `68a39497c081d5db9ecf78e4ce4b89454dd8ba58`
**Verdict:** needs-attention
**Diff size:** 136 KB tracked + ~178 KB untracked production/test = ~295 KB total (within safe budget)
**Auto-retry signals detected:** NONE — review is complete and authoritative.

**Total findings:** 4 — 3 Critical, 1 Improvement, 0 Minor.

---

## Critical (3)

### [Critical] — Persisted sketch URLs expire while the row is marked permanently generated
- **File**: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts`
- **Lines**: 167-190
- **Issue** (verbatim from Codex):
  > "The pipeline stores a 7-day signed Supabase URL directly in `thumbnail_url`. The library read paths render that column directly, and this code marks the row `thumbnail_kind='sketch'` with `sketch_generated_at`, so later `/generate` calls skip it as already generated. After the signed URL expires, all generated sketches become broken images with no automatic refresh path."
- **Affected bug(s)**: Bug 5 (Gemini sketch generation)
- **Recommended fix** (verbatim):
  > "Persist the storage object path or a durable public URL, and sign/refresh URLs on read; do not let `already_generated` suppress repair of expired thumbnail URLs."
- **Verification**: Confirmed in source — sketch-pipeline.ts:157 builds path, lines 175-178 sign for 7 days, line 187 stores the signed URL directly in `thumbnail_url`, and the idempotency check at lines 117-120 short-circuits permanently once `sketch_generated_at` is set. After 7 days every sketch becomes a broken image with no repair path.

### [Critical] — Retry and cost caps are not atomic under concurrent sketch generation
- **File**: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts`
- **Lines**: 112-194
- **Issue** (verbatim from Codex):
  > "`runSketchPipeline` reads the row once, checks `sketch_attempt_count < 3`, then performs the Gemini call and upload before writing `sketch_attempt_count + 1`. Concurrent `/generate`, backfill, or `after()` jobs can all pass the same pre-check and hit Gemini in parallel, then overwrite the same path and lose attempt increments. The advertised 3-retry cap and rate/cost guard are therefore per invocation, not per row under concurrency."
- **Affected bug(s)**: Bug 5 (Gemini sketch generation — concurrency/cost guard)
- **Recommended fix** (verbatim):
  > "Add an atomic claim/lock before calling Gemini, such as a conditional update/RPC or advisory lock keyed by library item, and increment attempts as part of that claim."
- **Verification**: Confirmed in source — sketch-pipeline.ts:111-115 reads the row, 128-130 checks the retry cap, and the attempt count isn't incremented until lines 184-194 AFTER Gemini and Storage I/O complete. Three concurrent invocations all see `sketch_attempt_count=0`, all proceed to call Gemini, and only the last write wins on the increment.

### [Critical] — Photo save-to-library rows are marked as photos without storing a photo URL
- **File**: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts`
- **Lines**: 531-580
- **Issue** (verbatim from Codex):
  > "The photo branch inserts `thumbnail_kind='photo'` but does not set `thumbnail_url`; generation is only enqueued for text rows. Since the sketch pipeline skips every row with `thumbnail_kind === 'photo'`, a photo-derived library item can be left with no thumbnail and also be ineligible for sketch fallback. This is reinforced by the log flow discarding the uploaded signed URL before confirmation, so the server has no photo URL to persist."
- **Affected bug(s)**: Bug 5 (photo-overrides-sketch contract violation)
- **Recommended fix** (verbatim):
  > "Only mark `thumbnail_kind='photo'` when a durable thumbnail reference is persisted, or allow sketch fallback when `thumbnail_kind='photo'` has a null `thumbnail_url`."
- **Verification**: Confirmed in source — entries/save/route.ts:538 sets `inferredThumbnailKind` to `'photo'` when source is photo, line 548 inserts that into the row, but no `thumbnail_url` is included in the INSERT. Combined with sketch-pipeline.ts:122-125 (skip if `thumbnail_kind === 'photo'`), this creates the trap.

---

## Improvement (1)

### [Improvement] — Add-to-library idempotency does not survive reloads mid-submit
- **File**: `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryAddDialog.tsx`
- **Lines**: 87-110
- **Issue** (verbatim from Codex):
  > "The create form keeps `client_id` only in a `useRef` and regenerates it on remount/close. If the browser reloads or the tab crashes after the POST commits but before the client sees the response, the retry uses a new `client_id`; the server no longer replays the successful create and will fall into duplicate-name handling instead. That violates the stated I11 retry-persistence concern and produces a conflict UX for a successful write."
- **Affected bug(s)**: Bug 6 (Add-to-Library form — I11 retry-persistence contract)
- **Recommended fix** (verbatim):
  > "Persist the in-flight `client_id` with the draft until a terminal server response is observed, and reconcile same-body duplicate responses as successful replays."
- **Verification**: Confirmed in source — LibraryAddDialog.tsx:89-91 generates client_id in a useRef (memory-only), line 102-112 regenerates on close. On a reload mid-submit, the new mount creates a fresh UUID, so a successful first POST that landed server-side will return a 409 to the second attempt (different client_id → falls through to display_name conflict path) rather than the idempotent 200/201 replay the contract promises.

---

## Minor (0)

None.

---

## Affected files for auto-fix dispatch (deduplicated)

For Phase 5 auto-fix sub-agent dispatch (Critical + Improvement):

1. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts` (2 Critical — durability + concurrency; touches the same function so one sub-agent)
2. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts` (1 Critical — photo contract)
3. `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\library\_components\LibraryAddDialog.tsx` (1 Improvement — client_id persistence)

**Note for main agent:** Fix #1 (sketch-pipeline durability) likely requires schema rethink — storing the path instead of a signed URL means library read paths (`LibraryCard`, `FoodDetail`, anywhere `thumbnail_url` is rendered) need a sign-on-read helper. This is broader than a single-file fix. Surface to user before dispatching the auto-fix sub-agent if the change crosses the 3-file/30-line guardrail for Phase 5 auto-fix.

**Cross-finding interaction:** Fix #1 and Fix #3 (photo contract) interact — once the pipeline stores paths instead of signed URLs, the photo-branch null `thumbnail_url` becomes the rule rather than the exception, and `thumbnail_kind === 'photo'` alone (without a URL) is what the pipeline must check for sketch fallback. Recommended: assign both to the same auto-fix sub-agent OR coordinate via Phase 5 plan brief.

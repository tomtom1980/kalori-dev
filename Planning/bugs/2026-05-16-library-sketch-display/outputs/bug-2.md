# Bug 2 — Implementation Output

## Files Touched
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\ai\sketch-prompt.ts` — `STYLE_PREAMBLE` constant rewritten to the user-selected colorful preamble (Variant A); file header comment updated to record the override rationale; `v1_sketchPrompt` export name preserved in-place (no version bump, no caller-update churn — surgical change).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\ai\sketch-prompt.test.ts` — updated the verbatim-cross-batch-consistency assertion to anchor on `'Colorful hand-drawn sketch'` (was `'Pen-and-ink line drawing'`); added one new test case asserting the presence of the new colorful tokens AND the absence of the old monochrome/editorial tokens (regression-lock against silent revert).

## NOT Touched (per surgical-change directive)
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\sketch-pipeline.ts` — no change needed. Import is `import { v1_sketchPrompt } from '@/lib/ai/sketch-prompt';` at line 41 and call site is at line 268; both depend on the export NAME, which is unchanged.

## Tests Added/Modified
- **Modified** `tests/unit/lib/ai/sketch-prompt.test.ts`:
  - `it('repeats the style preamble verbatim across calls ...')` — startsWith assertion flipped from `'Pen-and-ink line drawing'` to `'Colorful hand-drawn sketch'`.
- **Added** `tests/unit/lib/ai/sketch-prompt.test.ts`:
  - `it('uses colorful naturalistic styling (not monochrome engraving)', ...)` — asserts presence of `Colorful`, `Vibrant naturalistic colors`, `Visible pen/ink strokes`, `immediately recognizable`, `Clean light background`; asserts absence of `Pen-and-ink line drawing`, `single-color`, `ivory`, `engraving`, `NO color fill`, `NO photographic detail`, `archival broadsheet`. Belt-and-suspenders so a future careless edit can't silently revert the override without flipping the test red.

## Test Run Result (after RED-GREEN)

**RED step** (test file updated; production preamble still v1 monochrome):
- Command: `npx vitest run tests/unit/lib/ai/sketch-prompt.test.ts`
- Result: **2 failed / 6 passed / 0 skipped** (out of 8 total)
- Failed tests:
  1. `repeats the style preamble verbatim across calls (cross-batch consistency)` — `expected false to be true` on the `startsWith('Colorful hand-drawn sketch')` assertion because the production string still started with `'Pen-and-ink line drawing'`.
  2. `uses colorful naturalistic styling (not monochrome engraving)` — `expected 'Pen-and-ink line drawing on a warm ne…' to contain 'Colorful'`.
- Both failures were for the correct reason (production code still emitted the old preamble, not a test-author typo).

**GREEN step** (production preamble swapped to the colorful preamble):
- Command: `npx vitest run tests/unit/lib/ai/sketch-prompt.test.ts`
- Result: **8 passed / 0 failed / 0 skipped**
- Duration: 802ms

**Broader sweep** (regression check on the whole `lib/ai/` test directory):
- Command: `npx vitest run tests/unit/lib/ai/`
- Result: **24 passed / 0 failed / 0 skipped** across 2 test files (`image-client.test.ts` + `sketch-prompt.test.ts`)

**Sketch pipeline spot-check** (confirms surgical change didn't break orchestration):
- Command: `npx vitest run tests/unit/lib/library/sketch-pipeline.test.ts`
- Result: **14 passed / 0 failed / 0 skipped**

## Deviations from Proposal
- **Skipped the `v1_sketchPrompt` → `v2_sketchPrompt` rename.** The proposal recommended renaming the export for hygiene/versioning (proposal §47, §178). The user's directive for this implementation said *"If the file uses a versioned export (e.g. `v1_sketchPrompt`), bump to `v2_sketchPrompt` ONLY if the existing convention is established; otherwise overwrite in-place (surgical change, no speculative versioning)."* The convention is documented in the file header but has never been exercised (there is no `v0_` predecessor, no `v2_` precedent), so per the surgical-change instruction I overwrote `v1_sketchPrompt` in place. The file-header comment now records why (`"The current edit is treated as an in-place preamble swap (no callers affected), so the export name stays v1_sketchPrompt"`), so a future reviewer sees the rationale and can still bump to `v2_` cleanly if a third style refresh ever ships.
- **Did NOT modify `lib/library/sketch-pipeline.ts`.** Because the export name didn't change, the import line is unaffected — surgical-change principle dictates touching nothing that doesn't need to change.
- **Preamble wording** — used the user-selected text verbatim, formatted as 6 short sentences across 6 concatenated string literals to match the existing multi-line template convention in the file. Semantic content matches the user's selection exactly.

## Verbatim NEW preamble (final shipped string)

```
Colorful hand-drawn sketch in the style of a food illustration. Vibrant naturalistic colors. Visible pen/ink strokes. Subject must be immediately recognizable as the specific food/drink named. Clean light background. No photographic realism.
```

Full prompt sent to Gemini (with `regionHint` for `vn` and `displayName='Phở Bò'`):

```
Colorful hand-drawn sketch in the style of a food illustration. Vibrant naturalistic colors. Visible pen/ink strokes. Subject must be immediately recognizable as the specific food/drink named. Clean light background. No photographic realism. Subject: "Phở Bò". Regional context: Vietnamese cuisine.
```

## Idempotency / regeneration check
Re-read `lib/library/sketch-pipeline.ts` lines 232–244. Confirmed:
- Line 232: `if (row.thumbnail_kind === 'sketch' && row.sketch_generated_at !== null) { return { status: 'skipped', reason: 'already_generated' }; }` — short-circuits ANY library item that already has a successful sketch on the row.
- Line 237: `if (row.thumbnail_kind === 'photo') { return { status: 'skipped', reason: 'photo_present' }; }` — photos never re-render.
- Line 242: `if (row.sketch_attempt_count >= MAX_RETRIES) { return { status: 'skipped', reason: 'max_retries' }; }` — dead-row guard.
- No background-rerun trigger, no cron, no time-based refresh in the pipeline. Existing sketches are safe; only library inserts after this commit will hit the new colorful preamble.

## Stop-the-world triggers
None hit:
- RED step failed for the correct reason (matched expected mismatch).
- The preamble is consumed only by `sketch-pipeline.ts:268` (one call site) — no other code reads it.
- No `Object.freeze` or other immutability in either file.

## Status
implemented

# Bug 3 — Implementation Output

## Files Touched

Production:
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\library\[id]\update\route.ts` — added `signThumbnailUrl` import, added `thumbnail_kind` to the `.select(...)` column list, signed `data.thumbnail_url` before returning the response payload.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\library\fetch.ts` — raised `SIGN_LIMIT` constant from 10 → 500; updated the rationale comment block.

Tests (added):
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\library\fetch.test.ts` — NEW unit test for SIGN_LIMIT cap (Tests F and G).

Tests (modified):
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\library-item-update.test.ts` — added `vi.mock('server-only', ...)` shim and a new `Bug 3 — sign-on-write + thumbnail_kind column` describe block (Tests A, B, D, E).
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\unit\lib\library\sign-on-read.test.ts` — rewrote two pre-existing tests that hard-coded the old `SIGN_LIMIT=10` invariant to assert the new cap of 500 instead. The proposal explicitly authorized this: "Old test '12 items → first 10 signed, last 2 null' should be updated/removed."
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\library-item-update-round1.test.ts` — added `vi.mock('server-only', ...)` so the route's new sign-thumbnail import resolves in the node test env.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\library-update-refresh.test.ts` — added `vi.mock('server-only', ...)` for the same reason.
- `C:\Users\tamas\Documents\AI projects\Calorie tracker webapp\tests\integration\dashboard-orphan-profile.test.ts` — added `vi.mock('server-only', ...)` because its AC2 endpoint matrix imports the update route.

## Tests Added/Modified

New tests in `tests/integration/library-item-update.test.ts`:
- Test A — `signs path-based thumbnail_url (photo kind) before returning` — asserts response `thumbnail_url` is the signed URL and the sign helper was called with the path + 3600s TTL.
- Test B — `signs sketch-kind thumbnail_url before returning` — same assertion for sketch-kind rows.
- Test D — `returns thumbnail_url null when no thumbnail path is set` — asserts null pass-through and that `signSpy` was never invoked (short-circuit).
- Test E — `SELECT column list includes thumbnail_kind (parity with fetch.ts)` — asserts the column string passed to `.select()` contains `thumbnail_kind` AND the response surfaces `thumbnail_kind`.

New tests in `tests/unit/lib/library/fetch.test.ts`:
- Test F — `signs items at positions 11-500 (previously null past 10)` — builds 500 rows, asserts every row gets a signed URL (previously rows 10+ came back null).
- Test G — `items at position 501+ fall back to thumbnail_url=null past the cap` — builds 502 rows, asserts rows 500 and 501 are null'd-out and exactly 500 sign calls were made.

Modified tests in `tests/unit/lib/library/sign-on-read.test.ts`:
- The `signs only the first 10 rows when library has 100 items` test was rewritten to assert the new `SIGN_LIMIT = 500` cap (all 100 rows now sign).
- The `null thumbnails do not count against the signLimit budget` test was rewritten to assert that 12 thumbnail-bearing rows in a 22-row mix sign exactly 12 times under the raised cap.

Test C ("photo overrides sketch when both exist") from the orchestrator's contract was **not** added — the codebase does not have separate `photo_path`/`sketch_path` columns. The schema has a single `thumbnail_url` column (storage path) and a `thumbnail_kind` discriminator. The photo-vs-sketch rule is enforced upstream by the sketch pipeline (`backfill/route.ts` line 56 filters out `thumbnail_kind = 'photo'` rows). The proposal §"Photo-overrides-sketch rule" confirmed: "The card itself does NOT need to enforce this — it just renders whatever `thumbnail_url` resolves to. NO change." Recorded as a deviation below.

## Test Run Result

**RED step:** 5 failed for the right reasons:
- Test A: response `thumbnail_url` = raw path `u-1/photo_*.webp`, not the expected signed URL.
- Test B: response `thumbnail_url` = raw path `u-1/sketch_*.webp`, not the expected signed URL.
- Test E: SELECT column string did not contain `thumbnail_kind`.
- Test F: `items[10].thumbnail_url` was `null` (old SIGN_LIMIT=10 cap).
- Test G: `items[499].thumbnail_url` was `null` (old SIGN_LIMIT=10 cap).

Test D passed even before the fix because it exercised the null short-circuit path (no signing needed).

**GREEN step (targeted):**
- `npx vitest run tests/unit/lib/library/fetch.test.ts tests/integration/library-item-update.test.ts` → 12 passed, 0 failed.

**Broader sweep (tests/unit/):**
- `npx vitest run tests/unit/` → 1216 passed, 0 failed, 0 skipped.

**Broader sweep (tests/integration/):**
- `npx vitest run tests/integration/` → 697 passed, 33 skipped, 0 failed.

**Combined sweep (tests/unit/ + tests/integration/):**
- `npx vitest run tests/unit/ tests/integration/` → 1913 passed, 33 skipped, 0 failed.

## Deviations from Proposal

1. **Test C ("photo overrides sketch when both exist") not added.** Reason: the codebase does not have separate `photo_path` and `sketch_path` columns. The schema is unified as `thumbnail_url` (storage path) + `thumbnail_kind` (discriminator). The proposal explicitly documented this: the photo-vs-sketch rule lives upstream in the sketch pipeline, not in the read/write path of the library item. Test E covers the equivalent contract: the discriminator (`thumbnail_kind`) survives the round-trip on response, so downstream consumers can branch on photo/sketch.

2. **Five test files received a `vi.mock('server-only', ...)` shim.** Reason: adding `signThumbnailUrl` to the update route pulled `server-only` into the route's import graph, which breaks node-environment tests that import the route module. The standard `vi.mock('server-only', () => ({}))` pattern (already used by sibling tests in `tests/unit/lib/library/` and `tests/integration/library-item-detail-fetch.test.ts`) was applied. Files: `library-item-update.test.ts`, `library-item-update-round1.test.ts`, `library-update-refresh.test.ts`, `dashboard-orphan-profile.test.ts`. No production behavior changed.

3. **Two pre-existing `sign-on-read.test.ts` tests rewritten** (not deletion) to assert the new `SIGN_LIMIT = 500` cap. The proposal authorized this in §"TDD Required" Test #3: "Old test '12 items → first 10 signed, last 2 null' should be updated/removed."

No deviations on the production-file changes themselves — both `route.ts` and `fetch.ts` match the proposal's intent precisely. The sign-thumbnail helper signature was not modified.

## SIGN_LIMIT value

**500** (per user decision passed via the orchestrator).

## ui-design prescription cited

From `Planning/ui-design.md` §7.3.4 lines 1527-1535 (LibraryCard compound — Thumbnail anatomy):

> "Thumbnail zone: `aspect-ratio: 4/3`, `bg-2`, 1px `rule` border, `overflow: hidden`. Photo `<img object-fit: cover>` with 0.85 opacity (hover lifts to 1.0). Alt text `{display_name}`."

> "Letter-mark fallback (tiebreaker #7): **`bg-2` background + 2px `oxblood` TOP rule + `sand` letter** (Newsreader 300 48 tablet+ / 32 mobile, tabular lining, centered)."

From `~/.claude/skills/ui-design/web-ui-guide.md` §1 Quick-Pick Decision Table — no specific row for raster image rendering (the table covers animations/interactions). The proposal §"ui-design Prescription" confirmed the relevant guidance is implicit: "From `web-ui-guide.md` Quick-Pick Decision Table — image rendering for Next.js: `next/image` is already in use (LibraryCard line 141). No library swap needed."

The fix preserves both prescriptions verbatim: `LibraryCard.tsx` markup is unchanged (4:3 aspect ratio at `kalori-library-card-thumb`, `next/image` with width 240 × height 180, `priority={index < 8}`, `sizes` for responsive density, `data-sketch` discriminator attribute, ThumbnailLetterMark fallback when `thumbnail_url` is null). The bug was purely in the data layer that feeds those existing components.

## Status

**implemented**

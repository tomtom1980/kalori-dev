# Security Review: 2026-05-17-dashboard-food-fixes

## Scope

Reviewed the batch-owned diffs for:

- Dashboard and progress data-table/editor-note rendering.
- Duplicate-log confirmation flows in log confirmation, library quick-log, and food detail.
- Library serving/default-portion hydration and nutrition scaling.
- Camera/upload file-input split and image-analysis path.
- Supabase writes in `/api/entries/save` and `/api/library/[id]/log-now` as they relate to duplicate logging and library item ownership.
- XSS/HTML injection, AI text rendering, modal accessibility bypasses, and privacy handling for image upload/analysis.

CodeRabbit CLI was unavailable locally (`coderabbit` not installed), so this was a manual/local security pass.

## Critical

None.

## High

None.

## Medium

None.

## Low

None.

## Informational

- `SnapTab` now correctly separates camera and upload inputs: the camera path keeps `capture="environment"`, while upload has no `capture` attribute. Both paths still run through the existing compression and authenticated `/api/ai/vision` plus `/api/storage/thumbnail` pipeline. Server-side thumbnail upload keeps size, base64, MIME regex, and magic-byte checks.
- Duplicate-log confirmations now use in-app Radix AlertDialog surfaces instead of `window.confirm`. Confirmed retries only add `allow_duplicate: true` after explicit user action, and the server continues to scope duplicate checks and writes by authenticated `user_id`.
- Library re-log paths preserve owner checks. `/api/entries/save` validates `library_item_id` against `(id, user_id, deleted_at IS NULL)`, and `/api/library/[id]/log-now` reads the live library row server-side before inserting. The batch also prevents `save_to_library` enrichment from running when a library item is already being logged.
- Editor notes and data-table cells render strings through React text nodes. No `dangerouslySetInnerHTML` or markdown-to-HTML rendering was introduced in reviewed diffs.
- AI-generated weekly/progress text remains rendered as plain text. New daily dashboard note content is deterministic from aggregate values and does not include raw user-entered food names.
- Modal changes use Radix Dialog/AlertDialog primitives, preserving focus trapping and escape/overlay behavior. I did not find an accessibility bypass that creates a security-relevant confirmation skip.

## Non-Blocking Observation

- The working tree contains unrelated or pre-existing dirty/generated files, including screenshot artifacts and `.codex/`. Those were not treated as security findings for this batch.

## Result

Blocking findings: none.

## Final Delta Review - 2026-05-18

### Scope

Reviewed changes made after the first clean security review, with focus on:

- Round 1 fix for bulk library duplicate logging in `LibraryClient.tsx`.
- New `allow_duplicate: true` retry paths for confirmed duplicate rows.
- Test-only fixes in `FoodDetail-LogNow*.test.tsx` and `nav-shell.test.tsx`.
- Final dirty diff signals in generated/local files, including `public/sw.js`, `next-env.d.ts`, and `supabase/.temp/*`.

### Blocking Findings

None.

### Delta Notes

- Bulk duplicate retry only retries rows that first received a `409 duplicate_food_entry` response and only after the in-app confirmation resolves true. The retry reuses the original per-row `client_id`, `logged_at`, and `meal_category`, adding only `allow_duplicate: true`.
- The client-provided `allow_duplicate` flag remains a duplicate-warning bypass, not an authorization bypass. `/api/library/[id]/log-now` still authenticates the caller, validates the request body, re-reads the library item by `(id, user_id, deleted_at IS NULL)`, inserts with server-derived `user_id`, and rechecks tombstone state after insert.
- Bulk row IDs are still untrusted input, but unauthorized or deleted IDs resolve through the existing uniform server-side not-found path; the client-side retry does not expose cross-user library data.
- The test fixes only align mocks and expectations with current source behavior. I did not find production code changes in those patches.
- The regenerated service worker still routes `/api`, `/api/auth`, auth pages, and navigations through `NetworkOnly`; the only cached app data surface I saw in the generated worker is the existing public food-thumbnail storage matcher.

### Non-Blocking Observations

- `supabase/.temp/*` includes local project metadata such as the pooler host/project ref. I did not treat this as a batch blocker because these files are untracked local artifacts, but they should not be staged for production unless the repository explicitly expects them.
- `public/sw.js` and `next-env.d.ts` remain generated dirty artifacts. I did not find a security issue in the inspected service-worker routes, but staging scope should be reviewed before the final commit.

### Final Delta Result

Blocking findings: none.

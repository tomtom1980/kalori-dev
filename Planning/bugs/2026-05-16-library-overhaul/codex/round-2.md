# Codex Adversarial Review — Round 2 (Verbatim)

**Batch:** `2026-05-16-library-overhaul`
**Base SHA:** `68a39497c081d5db9ecf78e4ce4b89454dd8ba58`
**Date:** 2026-05-16
**Invocation:** `codex-companion.mjs adversarial-review --wait --base 68a394...`
**Auto-retry signals detected:** NONE

---

## Pre-flight diff context

- Tracked-file changes: 35 files, +1640 / -331 lines, ~140 KB
- Untracked code/test files: 39 files, ~219 KB (excluding screenshots + supabase temp)
- Total in-scope diff: ~359 KB — well under 500 KB safe threshold
- Screenshots and `supabase/.temp/cli-latest` excluded as noise

---

## Codex output (verbatim)

```
# Codex Adversarial Review

Target: branch diff against 68a39497c081d5db9ecf78e4ce4b89454dd8ba58
Verdict: needs-attention

No-ship: the claimed atomic sketch fix still permits duplicate Gemini work under real concurrent UPDATE behavior, and sign-on-read now adds a blocking per-row storage fan-out before pagination.

Findings:
- [critical] Claim step is not a one-winner lock (lib/library/sketch-pipeline.ts:116-134)
  `claimSlot` sets `sketch_attempt_count` to `currentAttempts + 1`, where `currentAttempts` came from the earlier preflight read. Under concurrent calls, both workers can read 0; the first UPDATE sets 1, then while Gemini is still running the second UPDATE rechecks the WHERE predicate against `sketch_attempt_count < 3` and `sketch_generated_at IS NULL`, still matches, writes 1 again, returns a row, and also calls Gemini. RLS does not prevent this because both updates are authorized for the same user. The loser only exits when the UPDATE affects 0 rows, but this pattern can affect 1 row for multiple workers.
  Recommendation: Make the claim establish an exclusive in-progress lease/state in the row, or move the claim into a Postgres RPC/advisory-lock path that atomically transitions from eligible to claimed and returns exactly one winner; do not base the write on a stale preflight attempt count.
- [medium] Thumbnail signing fans out for every row before client pagination (lib/library/fetch.ts:93-109)
  `fetchLibraryPage` selects all active rows, then calls `signThumbnailUrl` inside `Promise.all` for every non-null thumbnail before returning to the RSC page. The client only renders 10 items per page, so a backfilled library with 100-200 thumbnails will issue 100-200 storage signing calls on every `/library` render before the first page can display. React `cache()` only dedupes within a single render tree; it does not remove this cross-request storage dependency, and a slow signing backend delays the whole page.
  Recommendation: Sign only the visible page's thumbnails, or use Supabase bulk signed URL creation with bounded concurrency and pagination-aware fetching so the RSC path is not blocked by every thumbnail in the library.

Next steps:
- Rework the sketch claim as a true single-winner operation and add a concurrency test that models real row-state evolution instead of a mock boolean gate.
- Reassess sign-on-read cost with realistic library sizes; keep the 1-hour TTL, but avoid signing off-screen rows during the initial page render.
```

# Codex Round 1 — Categorized Findings

**Batch:** `2026-05-16-library-sketch-display`
**Date:** 2026-05-16
**Reviewer:** Codex Adversarial Review (companion script, `--wait --base HEAD`)
**Diff size:** 39.1 KB (well under 500 KB safe threshold; no split needed)
**Review completion status:** CLEAN — no auto-retry signals detected in stdout
**Verdict:** `needs-attention` (NO-SHIP recommendation from Codex)

---

## Bucket Summary

| Severity | Count |
|---|---|
| Critical | 2 |
| Improvement | 1 |
| Minor | 0 |
| **Total** | **3** |

---

## Critical Findings (block-shipping; auto-fix in round 2)

### C1. Signed display URLs can be persisted as canonical thumbnail data
- **Severity:** Critical (high in Codex output)
- **File:** `lib/library/fetch.ts:60` (and merge UI/route call chain)
- **Bug bundle origin:** Bug 3 (SIGN_LIMIT raise from 10 → 500)
- **Description:** Raising `SIGN_LIMIT` means `fetchLibraryPage` now returns signed `thumbnail_url` values for up to 500 rows. The merge UI then copies `a.thumbnail_url` / `b.thumbnail_url` into the merge payload, and the merge route accepts that field and passes it to the RPC. Because `signThumbnailUrl` treats any `https://` value as legacy and returns it unchanged, an expiring 1-hour signed URL can be stored permanently in the database and will never be renewed. This data-corruption path was already possible for the first 10 signed rows, but this change expands the exposure 50x and leaves the skipped unified-schema test gap unclosed.
- **Codex recommendation:** Do not expose the writable canonical thumbnail field as a signed display URL. Keep raw storage path/kind server-side, return a separate signed display URL, or make merge/update choose thumbnails by item id and resolve the raw path on the server.

### C2. Library render now fans out up to 500 unbounded thumbnail signing calls
- **Severity:** Critical (high in Codex output)
- **File:** `lib/library/fetch.ts:145-153`
- **Bug bundle origin:** Bug 3 (SIGN_LIMIT raise from 10 → 500)
- **Description:** `fetchLibraryPage` signs rows with `Promise.all(rows.map(...))` and now allows the first 500 thumbnail-bearing rows through. That makes every `/library` render wait on up to 500 concurrent storage signing operations with no concurrency cap, timeout, batching, or degradation boundary. The tests assert 500 instant mock calls, but they do not exercise realistic storage latency, rate limiting, or one hung signing request. Under load, the page can become slow or time out for larger libraries, and the failure is user-visible on the main library surface.
- **Codex recommendation:** Use visible-page or cursor-based signing, add a small concurrency limit and per-sign timeout, or serve thumbnails through a bounded server endpoint/cache. Add tests that simulate slow and failing signing calls.

---

## Improvement Findings (auto-fix in round 2)

### I1. Post-edit save success is coupled to thumbnail signing after the database write
- **Severity:** Improvement (medium in Codex output)
- **File:** `app/api/library/[id]/update/route.ts:185-187`
- **Bug bundle origin:** Bug 3 (sign-on-write added to update route)
- **Description:** The update route commits the database update, then awaits `signThumbnailUrl`, and only after that calls `revalidateTag` and returns 200. If thumbnail signing stalls or times out, the user can receive a failed save after the row was already updated, while cache invalidation is skipped. This creates stale UI and retry ambiguity around a durable mutation for a best-effort display URL.
- **Codex recommendation:** Move cache invalidation immediately after the successful DB write and bound or decouple thumbnail signing from the mutation response, returning a separately nullable signed display URL rather than making save completion depend on storage signing.

---

## Minor Findings

_None._

---

## Concerns Codex did NOT flag (silence is signal)

The original adversarial-review prompt explicitly asked Codex to challenge these. Codex did not raise findings on:

- **Bug 1 negative-match assertion** — no concerns raised. Test-only defensive lock is accepted.
- **Bug 2 colorful prompt removing 'NO color fill / NO photographic detail' constraints** — no findings raised. Codex did not see this as a model-output risk in the context provided.
- **`vi.mock('server-only')` pattern across 5 test files** — no finding raised. Pattern accepted as test convention or no concrete drift observed.
- **Bug 2 pipeline idempotency claim (existing sketches not regenerating)** — no challenge raised.
- **UI focus addendum** (library/pattern drift, token drift, reduced-motion, a11y, Quick-Pick) — no UI-surface findings raised; consistent with card markup being unchanged.
- **Test C skip from Bug 3 proposal (split schema)** — Codex referenced "unified-schema test gap unclosed" in finding C1 but did not raise this as a separate finding.

---

## Recommended round-2 actions

Per the two-round Codex cap and the auto-fix protocol:

1. **C1 (data-corruption path):** This is architectural — the merge UI/route copying `thumbnail_url` is the load-bearing problem. A round-2 fix should either:
   - Strip `thumbnail_url` from the merge payload before sending to the RPC and resolve raw path server-side by item id (preferred), OR
   - Have the merge RPC explicitly ignore the `thumbnail_url` field and always re-resolve from a raw column.
   The "do not expose signed URL as canonical" framing matters — this fix scope expands beyond the original Bug 3 proposal.

2. **C2 (unbounded fanout):** Add a concurrency cap and per-sign timeout to the `Promise.all` site, OR switch to lazy/visible-page signing. The 50x cap raise was the wrong primitive — a queue/cap is the right one.

3. **I1 (mutation/signing coupling):** Reorder the update route so `revalidateTag` happens immediately after the DB write succeeds, BEFORE the signing call. If signing fails, return the row with `thumbnail_url: null` (or pre-existing value) rather than failing the whole mutation.

**Round 2 expectation:** All three findings auto-fixed via implementation sub-agent. After auto-fix, re-run Codex round 2 for verification. If round 2 surfaces NEW critical/improvement findings, escalate to user per the two-round cap.

---

## Verbatim Codex output reference

Full Codex stdout captured at: `Planning/.tmp/bugfix-2026-05-16-library-sketch-display/codex/round-1.md`

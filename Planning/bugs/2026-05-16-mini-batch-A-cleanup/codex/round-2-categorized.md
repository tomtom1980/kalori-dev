# Codex Round 2 — Categorized Findings

**Verdict shape:** `critical_present` (1 Critical + 1 Improvement)
**Two-round cap:** EXHAUSTED — escalation to user required

## Critical (1)

### C-R2-1 — readBodyWithCap Content-Length fast path bypasses streaming counter
**Severity:** Critical
**File:** `lib/ai/image-client.ts:179-197`
**Surface:** Gemini image-client response handling
**Risk:** Original C2 OOM/heap-amplification bypass via gzip/br responses

**Issue:** `readBodyWithCap` treats `Content-Length <= MAX_RESPONSE_BYTES` as an early-accept signal and calls `response.json()` directly. But `Content-Length` is the COMPRESSED wire size when Content-Encoding is gzip/br. fetch/json then decodes to a potentially much larger heap allocation, completely skipping the byte-counted stream path. This preserves the exact OOM/heap-amplification failure mode that C2 in Round 1 was meant to fix.

**Recommendation (Codex):**
- Use Content-Length ONLY as an early-reject when it exceeds the cap (compressed-size oversize implies decoded-size oversize)
- Never use Content-Length as an early-accept
- Stream and count `response.body` for ALL accepted responses, counting decoded bytes before JSON parsing
- Add a gzip/content-encoding regression test

**Root cause of escalation:** The C2 auto-fix implementer assumed Content-Length equals decoded size. It does not under HTTP content encoding. The fast path was added for performance but defeats the cap's correctness guarantee.

## Improvement (1)

### I-R2-1 — restore_name_conflict 409 response is silently swallowed by callers
**Severity:** High (categorized as Improvement per bugfix-tomi taxonomy; auto-fix candidate)
**File:** `app/api/library/bulk-delete/undo/route.ts:147` and callers (`LibraryClient`, `FoodDetail`)
**Surface:** Library bulk-delete undo client flow

**Issue:** The route now returns `409 { error: 'restore_name_conflict', conflicts }` (an improvement over Round 1's bare 500), but `authPost` throws a generic `Error` for any non-2xx and discards the response body. The revert closures in `LibraryClient` and `FoodDetail` catch and swallow the error without UI surface. Net user-visible state: same as before (silent failure, deleted item proceeds toward permanent loss).

**Recommendation (Codex):**
- Update undo client path to inspect non-2xx response payloads, OR add an `authPost` variant that preserves the error body
- Surface `restore_name_conflict` with an actionable toast/dialog
- Add caller-level test covering the conflict path

**Note:** This was not flagged in Round 1 because Round 1 focused on the server-side 500 → 409 transition. The client-side swallow pattern is a pre-existing issue surfaced by the partial fix.

## Minor (0)
None.

## Verdict
- **Verdict shape:** `critical_present`
- **Two-round cap:** EXHAUSTED — main agent MUST escalate to user
- **Outcomes per Phase 5 protocol:**
  - Force-commit despite Critical (user accepts the OOM risk)
  - Round-3 override (user authorizes an exceptional third Codex round after a targeted re-fix)
  - Abort batch (revert all mini-batch A fixes and re-plan)

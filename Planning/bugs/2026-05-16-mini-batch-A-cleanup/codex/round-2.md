# Codex Round 2 Adversarial Review — Verbatim

**Target:** branch diff against `1d0d04f76f769109f482620d67b153a3dee7adc9`
**Verdict:** needs-attention
**Auto-retry signals scanned:** none detected — review is complete

## Headline
No-ship: the response-size cap still has a heap-amplification bypass, and the undo conflict fix returns a structured error that existing callers discard.

## Findings (verbatim from Codex)

### [critical] Content-Length fast path bypasses the cap for compressed Gemini responses
**File:** `lib/ai/image-client.ts:179-197`

`readBodyWithCap` treats any finite `Content-Length <= MAX_RESPONSE_BYTES` as safe and immediately calls `response.json()`. That only bounds the encoded wire body, not the decoded body consumed by fetch/json. If Gemini or an intermediary returns gzip/br with a small compressed Content-Length and a much larger decoded JSON/base64 payload, this path materializes the oversized decoded body in heap and skips the streaming byte counter entirely. This preserves the original OOM/heap-amplification failure mode under a normal HTTP encoding edge case.

**Recommendation:** Use Content-Length only as an early reject when it is over the cap; do not use it as an early accept. Stream and count `response.body` for all successful responses, counting decoded bytes before JSON parsing, and add a gzip/content-encoding regression test.

### [high] 409 restore_name_conflict is not actually surfaced to undo callers
**File:** `app/api/library/bulk-delete/undo/route.ts:147`

The route now returns `409 { error: 'restore_name_conflict', conflicts }`, but the existing undo callers go through `authPost`, which throws a generic `Error` for any non-2xx and discards the response body; their revert closures then catch and swallow the error. Inference from the inspected callers: `LibraryClient` catches the undo POST failure without UI recovery, and `FoodDetail` has the same pattern. The server no longer emits a 500, but the user-visible failure remains silent and the deleted item still proceeds toward permanent loss.

**Recommendation:** Update the undo client path to inspect non-2xx responses or add an `authPost` variant that preserves error payloads, then surface `restore_name_conflict` with an actionable toast/dialog and cover it with a caller-level test.

## Next Steps (per Codex)
- Rework `readBodyWithCap` so every accepted body goes through the byte-counted stream path before parsing.
- Wire the new undo conflict response through the client instead of swallowing the `authPost` failure.

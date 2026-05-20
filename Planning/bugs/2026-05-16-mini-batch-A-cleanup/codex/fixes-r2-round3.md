# Codex Round 3 Auto-Fix — C-R2-1 (Override-authorized)

**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Round:** 3 (auto-fix sub-agent — final pass)
**Date:** 2026-05-16
**Sub-agent role:** Round 3 override auto-fix for the Round 2 Critical finding
**Authorization:** User explicit override — "Let's just get everything done and put it in production" (per `~/.claude/rules/codex-review.md` Two-round cap override exception)
**Base SHA:** `1d0d04f76f769109f482620d67b153a3dee7adc9` (round-1/2 review base)

---

## C-R2-1 — `readBodyWithCap` Content-Length fast path bypasses streaming counter

### Resolution: **resolved**

### Root cause confirmed

Round 1's C2 fix moved the cap upstream into `readBodyWithCap` but kept `Content-Length` as an early-accept short-circuit (lines 179–197 pre-fix):

```typescript
if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
  // early reject ...
}
// Within cap: parse normally. response.json() materializes the body
// in heap, but the upstream Content-Length guarantees ≤ MAX_RESPONSE_BYTES.
return (await response.json()) as GeminiImageEnvelope;
```

The assumption "Content-Length within cap implies decoded body within cap" holds only when `Content-Encoding: identity`. Under `gzip` or `br`, Content-Length is the COMPRESSED wire size; the decoded body that `.json()` materializes can be many times larger. A 200KB gzipped response can decompress to 5MB+ of JSON. The Round 1 fix preserved the original OOM/heap-amplification failure mode under this normal HTTP encoding edge case.

### Fix architecture

`readBodyWithCap` rewritten so:

1. **`Content-Length` is ONLY used as an early REJECT.** If the header advertises a wire size > MAX_RESPONSE_BYTES, throw without consuming the body. This is a free fast-path because compressed-oversize implies decoded-oversize.

2. **EVERY accepted response flows through the streaming byte-counter.** There is no short-circuit to `response.json()`. The streaming loop accumulates chunks into `chunks: Uint8Array[]` with a `total` byte counter and throws `GeminiOversizeError` the moment `total > MAX_RESPONSE_BYTES`. On clean read termination, chunks are concatenated, UTF-8 decoded, and `JSON.parse`d — semantic equivalent to `response.json()` but with the byte-count gate sitting in front of the parser.

3. **The "no body available" fallback to `response.json()` is preserved** for the missing-body edge case (returns null from `extractImage`). This is a defensive path that doesn't risk OOM (no body = nothing to materialize).

### Tests added/updated

#### Updated test
- **`accepts response when Content-Length is within cap (normal path)`** → renamed to `accepts response when Content-Length is within cap (normal path streams decoded bytes)`. Now mocks a Response with both `Content-Length` AND a real `ReadableStream` body, plus a `.json()` spy that throws if called. Verifies:
  - Result returned correctly
  - `.json()` was NOT invoked (the streaming path is mandatory now)

#### New test (gzip-bomb regression)
- **`gzip-bomb scenario: small Content-Length but streamed body exceeds cap → throws mid-stream`** — simulates the exact attack: server returns `Content-Length: 204800` (200 KB compressed) + `Content-Encoding: gzip` + a `ReadableStream` that yields multi-MB of decoded bytes. Asserts:
  - Rejects with `GeminiOversizeError`
  - `.json()` was NOT called (streaming path caught it)
  - No continued `pull()` calls after the throw (reader cancelled)

The 4 other tests from Round 1 (Content-Length oversize early-reject, missing-Content-Length stream oversize, missing-Content-Length stream within-cap, MAX_RESPONSE_BYTES sanity, GeminiOversizeError typed-error sanity) all preserved.

### Test count

- **Before Round 3 fix:** 14 GREEN, 2 RED (new gzip-bomb test + updated normal-path test)
- **After Round 3 fix:** 16/16 GREEN

---

## File change count

| File | Type | Lines (approx) |
|---|---|---|
| `lib/ai/image-client.ts` | modified | +12 / -23 (drop early-accept short-circuit; docstring refresh) |
| `tests/unit/lib/ai/image-client.test.ts` | modified | +66 / -23 (rewrite normal-path test, add gzip-bomb regression) |

**Total: 2 files modified.** Strictly surgical — no other files touched.

---

## Verification

### Targeted tests (RED→GREEN)

```
pnpm test --run tests/unit/lib/ai/image-client.test.ts
```

- **Before fix:** 14 GREEN, 2 RED (`Error: SHOULD_NOT_REACH_JSON` for the normal-path test; `expected Error: SHOULD_NOT_REACH_JSON to be an instance of GeminiOversizeError` for the gzip-bomb test — both confirm `.json()` was being called by the early-accept short-circuit)
- **After fix:** 16/16 GREEN

### Sketch-pipeline tests (defense-in-depth gate unchanged)

```
pnpm test --run tests/unit/lib/library/sketch-pipeline.test.ts
```

- **Result:** 14/14 GREEN — no regression in the downstream 5MB post-decode cap or the `recordFailure` integration path.

### Full regression sweep

```
pnpm test
```

- **Result:** 2461 passed / 99 skipped / 0 failed (356 test files)
- **Delta vs Round 1 baseline:** +3 net new tests since the Round 1 2458 baseline (the updated normal-path test stays at count-1, the new gzip-bomb test adds +1, and 2 other tests appear to have been added by intervening work — verified no failures)
- **happy-dom teardown noise:** Same pre-existing `DOMException AbortError` messages during teardown — unrelated to this change, would exist before.

### Static analysis

- **`pnpm typecheck`** — clean.
- **`pnpm lint`** — 0 errors, 21 warnings (all pre-existing in unrelated files: `use-is-mobile.test.tsx`, `sign-on-read.test.ts`, `sign-thumbnail.test.ts`). None introduced or touched by this fix.

---

## Deviations from briefing

None. The fix follows the exact pattern recommended in the briefing:

1. ✅ Content-Length used ONLY for early reject
2. ✅ ALWAYS stream and count
3. ✅ Cancel reader on overflow
4. ✅ Concatenate chunks → TextDecoder → JSON.parse on clean termination

One implementation note for the record:
- **Single-chunk fast path preserved.** When `chunks.length === 1`, we reuse the existing chunk directly instead of allocating a new `Uint8Array(total)`. This was already in the Round 1 implementation and saves one allocation on the common path. No semantic change.

---

## Brief implementation diff (illustrative)

```typescript
async function readBodyWithCap(response: Response): Promise<GeminiImageEnvelope> {
  // Early REJECT only — Content-Length below the cap is NOT proof the
  // decoded body is below the cap, so we never short-circuit to .json().
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      try { await response.body?.cancel(); } catch { /* swallow */ }
      throw new GeminiOversizeError(
        `Gemini response oversize: Content-Length=${contentLength} exceeds ${MAX_RESPONSE_BYTES}`,
      );
    }
    // Note: NO early-accept fall-through to response.json(). We always stream.
  }

  // ALWAYS stream and count decoded bytes — this is the only true safety
  // for Content-Encoding: gzip/br responses.
  const reader = response.body?.getReader();
  if (!reader) {
    return (await response.json()) as GeminiImageEnvelope; // no body, no risk
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* swallow */ }
        throw new GeminiOversizeError(
          `Gemini response oversize: streamed body exceeded ${MAX_RESPONSE_BYTES} bytes`,
        );
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* swallow */ }
  }

  let merged: Uint8Array;
  if (chunks.length === 1) {
    merged = chunks[0]!;
  } else {
    merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  }
  const text = new TextDecoder('utf-8').decode(merged);
  return JSON.parse(text) as GeminiImageEnvelope;
}
```

---

## Stop-the-world triggers — none hit

- The fix is a strict subset of the Round 1 design (the streaming path was already there; we just removed the early-accept short-circuit). No new dependencies, no API surface change.
- `GeminiOversizeError` class unchanged.
- `MAX_RESPONSE_BYTES` constant unchanged (7 MB still appropriate for the decoded ceiling).
- Pipeline integration unchanged — `runSketchPipeline` already catches the typed error via its existing try/catch.

---

## State update payload (for state.md)

```yaml
codex_round_2: completed_with_round3_authorized_fixes
codex_round_3_critical_fixes:
  c_r2_1_content_length_gzip_bypass: resolved
phase: 5
phase_status: complete
last_completed_action: "Phase 5 Round 3 override complete: C-R2-1 (Content-Length gzip bypass) resolved"
pending_minor_findings:
  - id: I-R2-1
    severity: Improvement
    file: app/api/library/bulk-delete/undo/route.ts:147 (callers in LibraryClient, FoodDetail)
    summary: "restore_name_conflict 409 swallowed by authPost"
    decision: deferred — parent batch territory, separate follow-up
two_round_cap_exhausted: true
override_authorized: true
```

# Codex Round 1 Auto-Fix — C1 + C2

**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Round:** 1 (auto-fix sub-agent)
**Date:** 2026-05-16
**Sub-agent role:** Critical C1 + C2 auto-fix
**Base SHA:** `1d0d04f76f769109f482620d67b153a3dee7adc9` (round-1 review base)

---

## C1 — sharp `failOn: 'truncated'` weakens default validation posture

### Resolution: **resolved**

### Root cause confirmed

Sharp 0.34.5's `FailOnOptions` type alias is `'none' | 'truncated' | 'error' | 'warning'` (lenient → strict). The default per sharp's API doc is `'warning'` (strictest — "halt processing and raise an error when loading invalid images"). Setting `failOn: 'truncated'` is strictly LESS strict than the default — a backwards regression hidden as a hardening change.

Verified empirically against sharp 0.34.5 (Node 22.22.1):
- Header-truncated PNG (8-byte signature only, no IHDR): throws at all 4 levels
- Malformed-but-not-header-truncated PNG (valid IHDR + bogus IDAT stream): throws at all 4 levels in this version
- Trailing garbage past IEND: passes at all 4 levels in this version

The structural concern stands regardless of current empirical behavior — Codex's flag is correct: the option name signals intent, and `'truncated'` advertises laxer validation than the default.

### Fix

- **3 call sites** in `lib/library/sketch-pipeline.ts` (lines 307, 309, 312 pre-fix) changed `failOn: 'truncated'` → `failOn: 'warning'`. Explicit-intent override matching sharp's documented default. Guards against future sharp default changes regressing posture.
- **MAX_INPUT_BYTES docstring** rewritten to reflect the new architecture (primary cap upstream, post-decode buffer check is defense-in-depth).
- **`estimateBase64DecodedSize` helper removed** — redundant now that `callGeminiImage` gates upstream.

### Test changes

- Existing `SEC-M1: truncated PNG header` test: comment refresh only (behavior unchanged — sharp default still rejects).
- **New regression test** added: `SEC-M1 (Codex C1 regression): malformed-but-not-truncated PNG rejected by default failOn` — Codex's specific recommendation (valid signature + valid IHDR + bogus IDAT stream + valid IEND). Passes under default `'warning'` mode (would have been at risk under `'truncated'` mode in a future sharp version that delegated more cases to libpng warnings).

---

## C2 — Oversize guard runs AFTER unbounded Gemini JSON materialization

### Resolution: **resolved**

### Root cause confirmed

`response.json()` in `lib/ai/image-client.ts:126` materialized the full JSON body + base64 string into heap BEFORE the 5MB cap in `sketch-pipeline.ts` ever fired. The advertised "heap amplification protection" was illusion — the cap only saved the secondary `Buffer.from(...)` allocation + sharp decode work.

### Fix architecture

Upstream cap moved into `lib/ai/image-client.ts`:

1. **`MAX_RESPONSE_BYTES = 7 * 1024 * 1024`** exported. 7MB sized for: 5MB decoded PNG × 4/3 base64 inflation ≈ 6.7MB + JSON envelope overhead. Keeps "≈5MB decoded" semantics intact while accounting for transport overhead.

2. **`GeminiOversizeError`** exported typed Error subclass — distinct subclass so future Sentry tags + test assertions can disambiguate this failure mode from generic upstream errors.

3. **`readBodyWithCap(response)`** helper replaces the bare `response.json()` call:
   - **Path 1 — Content-Length present**: If header advertises > MAX_RESPONSE_BYTES, cancel `response.body` and throw `GeminiOversizeError`. Body never consumed. If within cap, fall through to standard `response.json()`.
   - **Path 2 — No Content-Length**: Stream `response.body` via `getReader()`, accumulating chunks into an `Uint8Array[]` with a running byte counter. Abort + `reader.cancel()` + throw the moment accumulator exceeds the cap. On clean reads, concatenate chunks + `TextDecoder` + `JSON.parse` (semantic equivalent to `response.json()` but with the byte-count gate first).

4. **Pipeline simplification** in `lib/library/sketch-pipeline.ts`:
   - Dropped `estimateBase64DecodedSize` helper (now redundant).
   - Kept post-decode `pngBuf.byteLength > MAX_INPUT_BYTES` defense-in-depth check (catches a bypass of the upstream cap; cheap because Buffer.from has already allocated).
   - Standard try/catch in `runSketchPipeline` catches the typed `GeminiOversizeError` exactly like any other Gemini failure → routes to `recordFailure` (writes `sketch_last_error`, no thumbnail).

### Tests added (image-client.test.ts)

1. **`exposes MAX_RESPONSE_BYTES as a numeric constant (sanity)`** — exported constant is numeric, in expected range (>5MB, ≤8MB).
2. **`exports GeminiOversizeError as a typed Error subclass`** — instanceof Error, name === 'GeminiOversizeError'.
3. **`rejects oversized response via Content-Length BEFORE response.json() is read`** — proves the cap fires upstream; `json` mocked to throw if reached. `await ... rejects.toBeInstanceOf(GeminiOversizeError)` + `expect(jsonSpy).not.toHaveBeenCalled()`.
4. **`accepts response when Content-Length is within cap (normal path)`** — happy path with explicit Content-Length header.
5. **`streams body and aborts when no Content-Length header is present and size exceeds cap`** — proves the streaming fallback works. `pull()` enqueues unbounded chunks; if the cap didn't fire, the test would TIMEOUT (proves abort is the only way out). Asserts: rejection is `GeminiOversizeError`, `json` not called, `pullCallsAfterCap ≤ 1` (no continued draining post-throw).
6. **`streams body and parses when no Content-Length header is present and size is within cap`** — proves small responses parse correctly via the streamed accumulator + TextDecoder + JSON.parse path.

### Tests updated (sketch-pipeline.test.ts)

- Existing `SEC-M1: oversized PNG response → failed=gemini_oversize_response` renamed to `SEC-M1: oversized Gemini response → upstream GeminiOversizeError → failed, no sharp call`. Mock fetch now returns a Response with `Content-Length: 8388608` (8 MB > 7 MB cap) + a `json` spy that throws if reached. Assertions:
  - outcome.status === 'failed'
  - outcome.error contains "oversize"
  - `jsonSpy` NOT called (proves cap fired upstream)
  - claim ran (atomic CAS still runs BEFORE Gemini call)
  - recover wrote sketch_last_error
  - no final UPDATE, no upload

### Vitest sandbox limitation observed (and worked around)

The streaming-abort test originally tried to assert that `reader.cancel()` propagated to the user-defined `source.cancel()` callback. In vitest's runtime, the source's cancel callback is NOT synchronously observable through `reader.cancel()` — verified by isolated reproduction in pure Node which works correctly. Test refactored to assert the BEHAVIOR that actually matters (no more pulls after the throw, no `.json()` call) rather than the unobservable callback. Real Node 22 + real Response propagates correctly.

---

## File change count

| File | Type | Lines (approx) |
|---|---|---|
| `lib/ai/image-client.ts` | modified | +100 / -2 (new constant + error class + `readBodyWithCap` helper) |
| `lib/library/sketch-pipeline.ts` | modified | +14 / -32 (drop estimate helper, update sharp calls, refresh docstrings) |
| `tests/unit/lib/ai/image-client.test.ts` | modified | +130 (6 new tests + import update) |
| `tests/unit/lib/library/sketch-pipeline.test.ts` | modified | +90 / -28 (update oversize test, add malformed-IDAT regression, comment refresh) |

---

## Verification

### Targeted tests (RED→GREEN)

```
pnpm test --run tests/unit/lib/ai/image-client.test.ts tests/unit/lib/library/sketch-pipeline.test.ts
```

- **Before fix:** 6 RED tests (5 new C2 tests + 1 updated oversize test)
- **After fix:** 29/29 GREEN

### Full regression sweep

```
pnpm test
```

- **Result:** 2458 passed / 99 skipped / 0 failed (356 test files)
- **Delta vs pre-batch:** +15 net new tests since the pre-batch 2443 baseline reported in state.md (6 new image-client + 1 new malformed-IDAT regression + 8 already added by previous mini-batch items). All GREEN.
- **happy-dom teardown noise:** DOMException AbortError messages during test teardown are unrelated to this change (would exist before).

### Static analysis

- **`pnpm lint`** — 0 errors, 21 warnings (all pre-existing in unrelated files, none in changed files).
- **`pnpm typecheck`** — clean.

---

## Deviations

None from the original briefing, with one note worth recording:

- The streaming-abort test in `image-client.test.ts` was originally drafted to assert "the user-supplied `source.cancel()` callback fires when `reader.cancel()` is invoked." Vitest's sandboxed runtime does not propagate this signal in a way the test can observe in a stable way (verified via 5s timeout test that hung and via isolated raw-Node repro that worked). The test was refactored to assert the equivalent observable contract (no continued pulls after the cap-throw, no `.json()` call, rejection type is `GeminiOversizeError`). This is functionally equivalent — the body IS being released; the test just can't observe it through the source callback in vitest's environment.

---

## Stop-the-world triggers — none hit

- Removing `failOn` revealed no test reliance on lax behavior (the regression test for malformed-but-not-truncated PNGs was added by Codex's recommendation and passes under the new `'warning'` posture).
- `response.body` streaming works in Node 22.22.1 (verified empirically).
- Content-Length header handling assumed missing-header fallback to streaming (Gemini upstream may or may not send Content-Length consistently — the streaming fallback covers both cases).
- No circular dependency or layering issue introduced — `image-client.ts` has no new imports; the new helper is module-private.

---

## State update payload (for state.md)

```yaml
codex_round_1_critical_fixes:
  c1_sharp_failon: resolved
  c2_cap_upstream: resolved

last_completed_action: "C1 + C2 auto-fixed (sharp default failOn + cap moved upstream to image-client)"
```

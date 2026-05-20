# Item 2 — F-LIBOVR-SEC-M1-PNG-DECODE-CAP — Bound PNG decode buffer in sketch-pipeline

**Status:** Analysis complete — ready for user approval gate.
**Classification:** `known_fix` (small surgical, ~15-25 lines production + ~60-80 lines test).
**Priority:** Medium (security hardening — defense-in-depth, not actively exploited).
**TDD required:** YES (security-relevant logic — RED→GREEN mandatory).
**UI touching:** NO (server-side pipeline only).
**Risk:** Low — additive guards, no API/contract change, no DB schema change.
**Stop-the-world flags:** NONE — investigation confirmed all baseline assumptions hold.

---

## Root cause (one-liner)

`lib/library/sketch-pipeline.ts:262` decodes the Gemini base64 PNG response into a Node Buffer with **no upper bound on the input size**, then hands it to `sharp(pngBuf).webp(...)` which has been the historical surface for libwebp/libpng OOB-read CVEs against malformed inputs.

## Attack surface (from security-review.md §M1)

The wrapper has a soft 50 KB ceiling on the OUTPUT WEBP only (lines 264-269 step quality down + downscale if `webpBuf.byteLength > TARGET_WEBP_MAX_BYTES`). It does NOT cap the raw PNG that `sharp` receives. A drifting Gemini response (or a model that, under prompt-injection attack, returns a 20 MB PNG) would be fully decoded into Node memory, then passed to `sharp`. The retry-cap of 3 means a malicious item can burn 3× (Gemini cost + memory allocation) per cap exhaustion before the row is permanently fenced.

The Codex Round 3 CAS predicate (`lessons-relevant.md` line 13) guards against concurrent multi-tab amplification on the same row, but the per-call heap allocation cost is unbounded.

## Investigation findings

### Q1 — Where does the buffer get materialized?

`lib/ai/image-client.ts:114`: `const payload = (await response.json()) as GeminiImageEnvelope`. The Gemini wrapper materializes the **entire JSON body** into memory first, then extracts `inlineData.data` (the base64-encoded PNG string) at line 66. The pipeline then re-decodes that base64 into the actual PNG Buffer at `sketch-pipeline.ts:262` via `Buffer.from(image.base64, 'base64')`.

**Conclusion:** The chokepoint with a usable size signal is line 262 — by then `image.base64` is in memory but the decoded byte count is still only computable post-`Buffer.from`. Upstream `Content-Length` checks are unreliable because the HTTP response body is JSON wrapping the base64; the base64 string is ~33% larger than the decoded bytes, and the JSON envelope adds further overhead. A header-level check would have a noisy threshold.

**Decision:** Cap at the materialized-Buffer boundary (line 262 immediately after `Buffer.from`). This matches the briefing's recommendation and the `app/api/storage/thumbnail/route.ts:166-177` "best-practice mirror" pattern (which checks `base64DecodedSize(bare) > MAX_THUMBNAIL_BYTES` BEFORE invoking `Buffer.from`). For the sketch-pipeline we have a slight twist: we don't pre-have the raw base64 string in a route handler — it comes from `callGeminiImage()` — so the cap fires immediately after the `Buffer.from(image.base64, 'base64')` decode. The wasteful allocation is bounded by the JSON parse upstream (already happened), not by the additional Buffer.from (which is the same byte count).

**Pre-decode optimization (deferred):** A more aggressive variant would check `image.base64.length * 0.75 > MAX_INPUT_BYTES` BEFORE `Buffer.from(...)` to avoid the second allocation. **Add this**: the mirror in `route.ts:58-61` (`base64DecodedSize()`) does exactly this and rejects with 413 before any decode. We follow the same pattern: estimate decoded size from base64 length, reject if oversized, decode only after the cap passes.

### Q2 — What's the right MAX_INPUT_BYTES cap?

Briefing default: **5 MB**.

Validation:
- `gemini-2.5-flash-image` (Nano Banana) typically emits **~150-500 KB PNGs** for 512×512 line-art outputs per published Gemini API docs and the existing fixture (`tests/unit/lib/library/sketch-pipeline.test.ts:47-48` 1×1 transparent PNG = 70 bytes, used as fixture).
- Worst-case legitimate emission: ~1.5-2 MB for a full-quality 1024×1024 PNG (highly unusual for line-art).
- 5 MB is **3-10× the realistic worst case** — comfortably above any legitimate response but well below the heap-allocation pressure threshold on Vercel Hobby (~2 GB available RAM, but cold-start cost matters).

**Recommendation:** `MAX_INPUT_BYTES = 5 * 1024 * 1024` (5 MB). Matches briefing default. No reason to deviate.

### Q3 — Does sharp's `failOn: 'truncated'` work for PNG?

YES. sharp@0.34.x supports the `failOn` option in the constructor: `sharp(input, { failOn: 'truncated' })`. Valid values are `'none' | 'truncated' | 'error' | 'warning'`. From the sharp docs (verified for the 0.34.x line):

- `'none'` — never fail on input warnings (default for safety-critical workloads in older sharp versions)
- `'truncated'` — fail on truncated images and below (catches partial PNG headers, missing IDAT chunks, etc.)
- `'error'` — fail on errors (current default in 0.34.x — equivalent to truncated for our case)
- `'warning'` — strictest; fails on any libpng/libwebp warning (overly aggressive for our line-art workload)

**Recommendation:** Use `failOn: 'truncated'`. It's the minimal hardening that catches the partial-PNG attack surface (a malformed PNG with a valid header but truncated IDAT could cause sharp to over-allocate or hang on some libpng versions). The current code uses the implicit default (`'error'` in 0.34.x but historically was `'warning'`), so making it explicit is a defense-in-depth move with no behavior regression on legitimate inputs.

### Q4 — Pre-check Content-Length header?

NO. Reasons:
1. **Not load-bearing** — the JSON parse upstream (`response.json()` in `image-client.ts:114`) has already materialized the whole body by the time the pipeline sees it. A pre-decode check on the wrapped JSON envelope's `Content-Length` would catch the attack but only AFTER the JSON allocation. The win is marginal.
2. **Brittle** — Gemini's response may use chunked encoding without `Content-Length` headers. The check would need a fallback path that defeats the purpose.
3. **Wrong layer** — the cap belongs at the pipeline (consuming the PNG bytes), not at the HTTP wrapper (which is generic for any Gemini response). Keeping `image-client.ts` schema-agnostic preserves its reusability.

**Compromise:** Add `image.base64.length`-based estimate as a pre-`Buffer.from` cheap gate (mirrors `base64DecodedSize()` in route.ts:58-61). This catches the oversized case before the second `Buffer.from` allocation.

## Proposed fix

### Files affected (production)

1. `lib/library/sketch-pipeline.ts` — add `MAX_INPUT_BYTES` constant + guard + `failOn: 'truncated'` on sharp constructors.

### Files affected (tests)

2. `tests/unit/lib/library/sketch-pipeline.test.ts` — add 3 new tests (oversized response, malformed PNG, normal-size passes through).

### Code change — `lib/library/sketch-pipeline.ts`

**Add a new constant near the existing `TARGET_WEBP_MAX_BYTES`:**

```typescript
/** Largest webp we'll let through. Matches the existing 50 KB I4 budget. */
const TARGET_WEBP_MAX_BYTES = 50 * 1024;
/**
 * SEC-M1 — hard upper bound on the RAW PNG bytes accepted from Gemini.
 * Defense-in-depth against a drifted/attacker-influenced Gemini response
 * that emits a large image to amplify heap allocation + sharp decode cost.
 * 5 MB is 3-10× the realistic worst case (Nano Banana typically emits
 * 150-500 KB PNGs for line-art at 512×512). See Planning/bugs/
 * 2026-05-16-library-overhaul/security-review.md §M1.
 */
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Estimate decoded byte length from a base64 string (no allocation). */
function estimateBase64DecodedSize(s: string): number {
  // Strip trailing padding for the estimate. Off-by-1-or-2 is acceptable
  // because the cap is in MB and the slack is bytes.
  const clean = s.endsWith('==') ? s.slice(0, -2) : s.endsWith('=') ? s.slice(0, -1) : s;
  return Math.floor(clean.length * 0.75);
}
```

**Replace lines 262-269 with:**

```typescript
    // 7. Decode + re-encode to WEBP. Cap to <50 KB by stepping quality
    // down if the first pass overshoots (rare for line art, but
    // defensive).
    //
    // SEC-M1 — pre-decode size guard. Reject oversized Gemini responses
    // before allocating a second Buffer (the JSON envelope's allocation
    // already happened upstream in image-client.ts; this guard prevents
    // the additional decoded-Buffer allocation AND the sharp decode pass).
    const estimatedBytes = estimateBase64DecodedSize(image.base64);
    if (estimatedBytes > MAX_INPUT_BYTES) {
      throw new Error(
        `gemini_oversize_response: ${estimatedBytes} bytes exceeds ${MAX_INPUT_BYTES} limit`,
      );
    }
    const pngBuf = Buffer.from(image.base64, 'base64');
    // Defense-in-depth: re-check the decoded size in case the estimate
    // was off (padding edge cases, etc.).
    if (pngBuf.byteLength > MAX_INPUT_BYTES) {
      throw new Error(
        `gemini_oversize_response: ${pngBuf.byteLength} bytes exceeds ${MAX_INPUT_BYTES} limit`,
      );
    }
    // SEC-M1 — sharp `failOn: 'truncated'` rejects malformed PNGs early
    // (e.g. valid header + truncated IDAT chunk). The 'error' default in
    // sharp 0.34 already covers most cases; making it explicit documents
    // intent and prevents a future sharp default change from regressing.
    let webpBuf = await sharp(pngBuf, { failOn: 'truncated' }).webp({ quality: 80 }).toBuffer();
    if (webpBuf.byteLength > TARGET_WEBP_MAX_BYTES) {
      webpBuf = await sharp(pngBuf, { failOn: 'truncated' }).webp({ quality: 60 }).toBuffer();
    }
    if (webpBuf.byteLength > TARGET_WEBP_MAX_BYTES) {
      webpBuf = await sharp(pngBuf, { failOn: 'truncated' })
        .resize({ width: 320 })
        .webp({ quality: 60 })
        .toBuffer();
    }
```

The `throw new Error('gemini_oversize_response: ...')` propagates to the existing `catch` block (line 300-312) which calls `recordFailure()` to write `sketch_last_error` AND `Sentry.captureException`. The CAS claim already incremented `sketch_attempt_count` at line 233 (the claim phase, BEFORE Gemini call) — so the retry cap kicks in naturally on subsequent attempts. **No double-bump risk** because the comment at line 186-187 already documents that recordFailure does NOT increment attempt_count.

### Tests — `tests/unit/lib/library/sketch-pipeline.test.ts`

Three new tests appended after the existing concurrency tests:

**Test 1 — oversized Gemini response → failed with gemini_oversize_response:**

```typescript
it('SEC-M1: oversized PNG response → failed=gemini_oversize_response, sketch_attempt_count incremented', async () => {
  // Build a base64 string that decodes to >5 MB.
  // 6 MB raw bytes = 8 MB base64 chars (4/3 ratio).
  const oversizedRaw = Buffer.alloc(6 * 1024 * 1024).toString('base64');
  delete process.env.KALORI_SKETCH_FIXTURE_BASE64;
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: oversizedRaw } }],
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );
  const row: RowState = { /* fresh row attempt_count=0 */ };
  const { supabase, updateCalls } = buildSupabaseMock(row);
  const outcome = await runSketchPipeline({ libraryItemId: LIB_ID, userId: UID, supabase: ... });
  expect(outcome.status).toBe('failed');
  if (outcome.status === 'failed') {
    expect(outcome.error).toContain('gemini_oversize_response');
  }
  // Claim DID fire (atomic claim runs BEFORE Gemini call). Recover wrote the error.
  expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
  const recover = findCallByKind(updateCalls, 'recover');
  expect(recover).toBeDefined();
  expect(recover!.patch.sketch_last_error).toContain('gemini_oversize_response');
  // No final UPDATE — thumbnail_url must NEVER be written on the failure leg.
  expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
  fetchSpy.mockRestore();
});
```

**Test 2 — malformed PNG → sharp failOn:'truncated' triggers:**

```typescript
it('SEC-M1: truncated PNG header → sharp throws, recorded as failure', async () => {
  // Valid PNG signature (8 bytes) + nothing else. sharp will throw
  // with failOn:'truncated' because the IHDR chunk is missing.
  const truncatedPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
  process.env.KALORI_SKETCH_FIXTURE_BASE64 = truncatedPng;
  const row: RowState = { /* fresh row */ };
  const { supabase, updateCalls } = buildSupabaseMock(row);
  const outcome = await runSketchPipeline({ libraryItemId: LIB_ID, userId: UID, supabase: ... });
  expect(outcome.status).toBe('failed');
  expect(findCallByKind(updateCalls, 'claim')).toBeDefined();
  expect(findCallByKind(updateCalls, 'recover')).toBeDefined();
  expect(findCallByKind(updateCalls, 'final')).toBeUndefined();
});
```

**Test 3 — normal-size PNG passes through (regression guard):**

```typescript
it('SEC-M1: normal-sized PNG response → proceeds (no false-positive size rejection)', async () => {
  // The existing FIXTURE_PNG_B64 is a 1x1 transparent PNG (~70 bytes).
  // This is the existing happy-path scenario — re-run it to confirm
  // the new size guard does NOT regress it.
  const row: RowState = { /* fresh row */ };
  const { supabase, uploadSpy } = buildSupabaseMock(row);
  const outcome = await runSketchPipeline({ libraryItemId: LIB_ID, userId: UID, supabase: ... });
  expect(outcome.status).toBe('generated');
  expect(uploadSpy).toHaveBeenCalledOnce();
});
```

### Test approach notes

- Re-uses existing `buildSupabaseMock()` + `RowState` fixtures — no helper churn.
- Test 1 uses real `fetch` mock (the fixture-mode shortcut bypasses the network path that decodes JSON). Specifically tests the "Gemini returned a real oversized response" attack scenario.
- Test 2 uses the fixture-mode shortcut to inject a truncated PNG (this is the cheaper test surface for the sharp `failOn` path).
- Test 3 is a pure regression test ensuring the happy path still works.
- All three tests follow TDD: write tests → they fail (no MAX_INPUT_BYTES guard yet) → implement → tests pass. Project-wide invariant tests (lint, types-fresh) must still pass after.

### TDD execution order

1. **RED 1** — Write Test 1 (oversized). Run `pnpm test sketch-pipeline.test.ts`. Confirm FAIL (status will be 'generated' or 'failed' with wrong error, not 'failed' with 'gemini_oversize_response').
2. **RED 2** — Write Test 2 (truncated PNG). Confirm FAIL (sharp may currently accept partial input with default failOn).
3. **RED 3** — Write Test 3 (normal-size regression). Confirm PASS (this is the baseline).
4. **GREEN** — Implement the production change (constant + estimate + guards + `failOn: 'truncated'`).
5. **VERIFY** — Re-run all tests. All 3 new tests PASS. All 9 existing tests still PASS. No regressions.
6. **PROJECT-WIDE** — Run `pnpm lint` + `npx tsc --noEmit` to confirm no drift (per lessons-relevant.md line 11).

## Acceptance criteria (final implementation)

- [ ] `MAX_INPUT_BYTES = 5 * 1024 * 1024` constant defined in `lib/library/sketch-pipeline.ts`.
- [ ] `estimateBase64DecodedSize()` helper added.
- [ ] Pre-`Buffer.from` guard rejects oversized base64 with error containing `gemini_oversize_response`.
- [ ] Post-`Buffer.from` defense-in-depth check on `pngBuf.byteLength`.
- [ ] All three `sharp(pngBuf)` constructors pass `{ failOn: 'truncated' }`.
- [ ] Existing `try/catch` propagates the error to `recordFailure()` writing `sketch_last_error`.
- [ ] CAS claim already incremented `sketch_attempt_count` — no double-bump.
- [ ] Test 1 — oversized response → status='failed', error contains 'gemini_oversize_response', sketch_attempt_count=1 written.
- [ ] Test 2 — truncated PNG → status='failed' (sharp throws).
- [ ] Test 3 — normal-sized PNG → status='generated' (regression guard).
- [ ] All 9 existing pipeline tests still PASS.
- [ ] `pnpm lint` + `npx tsc --noEmit` clean.

## Risk assessment

**Risk level: LOW.**

- **Surface:** Server-side pipeline only. No client, no API contract change, no DB schema change.
- **Backward compat:** All legitimate Gemini responses (150-500 KB) are FAR below 5 MB. Zero risk of false-positive rejection.
- **Failure mode:** On false-positive rejection (would require Gemini to drift to a ~6 MB response, which violates the model's normal output budget), the pipeline returns `{status: 'failed', error: 'gemini_oversize_response: ...'}`. The row's attempt_count increments and after 3 retries the row is permanently fenced — same dead-row semantics as any other failure. Operator visibility via `sketch_last_error` + Sentry tag.
- **Sharp `failOn` change:** Same behavior as current (sharp 0.34 default is `'error'` which is equivalent for our purposes). Making it explicit prevents future-version regressions.
- **No CAS regression:** The claim happens BEFORE the new guards, so the CAS atomicity contract is preserved (lessons-relevant.md line 13).

## Open questions

**None — investigation answered all four briefing questions:**

1. ✅ Cap at materialized-Buffer boundary (line 262), with a cheaper pre-decode estimate as a fast-fail. Mirror of `route.ts:58-61` pattern.
2. ✅ 5 MB cap (briefing default — validated against Nano Banana's realistic emission range of 150 KB – 2 MB).
3. ✅ `failOn: 'truncated'` works in sharp 0.34.5 (the project's pinned version per `package.json:88`). Valid values are `'none' | 'truncated' | 'error' | 'warning'`.
4. ✅ NOT pre-checking `Content-Length` — Gemini wraps the PNG in JSON so the header is misleading; the right cap layer is the pipeline.

## Stop-the-world triggers — all CLEAR

- [x] Current code uses streaming? **NO** — `Buffer.from(image.base64, 'base64')` materializes the full buffer (line 262). Fix shape is as briefed.
- [x] Sharp's `failOn` option unavailable? **NO** — supported in 0.34.5 (verified against package.json pin).
- [x] Existing tests already cover oversized input? **NO** — checked `sketch-pipeline.test.ts` thoroughly; tests cover happy path, idempotency, photo-wins, retry cap, missing row, upload failure, Gemini no-image, claim_lost (Codex Round 1 #2), CAS predicate stability (Round 3), and 4-parallel cost-cap. NO test exists for oversized PNG response. SEC-M1 is genuinely uncovered.

---

**Estimated effort:** 30-45 min (production change is ~25 lines; tests are ~80 lines; TDD cycle ~20 min; verify+sweep ~15 min).

**Branch context:** Currently on `main`. Implementation can land directly per the bugfix-tomi mini-batch A flow.

**Dependencies:** None — fully self-contained within `lib/library/sketch-pipeline.ts` + its test file. No cross-bug interaction with items 1, 3, 4, or 5.

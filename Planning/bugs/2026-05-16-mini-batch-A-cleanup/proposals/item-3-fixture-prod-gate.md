# Item 3 — F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE — Analysis & Proposal

**Bug ID:** F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE
**Origin:** bugfix-tomi `2026-05-16-library-overhaul` Phase 6 security review (M2)
**Priority:** Medium
**Estimated effort:** 15–30 min
**Classification:** `known_fix` (5–10 lines, mirror of existing pattern)
**UI touching:** NO (server-side image client)
**Risk:** LOW (additive guard; existing call sites continue to work because Vitest auto-sets `NODE_ENV='test'`)

---

## Root cause (one-liner)

`callGeminiImage()` at `lib/ai/image-client.ts:82-85` checks `KALORI_SKETCH_FIXTURE_BASE64` with **no environment gate**, so an operator typo / leftover debug var / supply-chain attacker setting that env in the Production Vercel scope causes every user's sketch to silently become the fixture bytes, and the success path fences the row forever (`thumbnail_kind='sketch'`, `sketch_generated_at=now()`).

---

## Existing prod-gate pattern (verbatim)

`lib/library/sketch-enqueue.ts:55-58`:

```ts
// Skip in test mode — fixture mode is owned by the route tests.
if (process.env.NODE_ENV === 'test' || process.env.KALORI_SKETCH_DISABLED === '1') {
  return;
}
```

**Shape characteristics to mirror:**
- Positive allowlist (`=== 'test'`) for the safe environment, NOT a denylist (`!== 'production'`).
- Kill-switch escape hatch (`KALORI_SKETCH_DISABLED === '1'`) is OR-combined.
- Returns silently (no throw, no log) — the enqueue path has nothing to fall back to here, but our `image-client` path can fall through to the live API.

---

## Failure mode of the current bug

| Stage | Behavior |
|---|---|
| Operator sets `KALORI_SKETCH_FIXTURE_BASE64` in **Production** Vercel scope | Every `callGeminiImage()` returns the fixture bytes. |
| Pipeline succeeds | `sketch-pipeline.ts` uploads fixture as WEBP, sets `thumbnail_kind='sketch', sketch_generated_at=now()`. |
| Subsequent requests | Photo-wins guard short-circuits regen (row is "done"). Every user sees the same image. |
| Recovery | Must `NULL` the column on every affected row + manual re-enqueue. No automatic remediation. |

---

## Recommended fix — Option A (recommended): Positive allowlist mirroring `sketch-enqueue.ts`

**Change at `lib/ai/image-client.ts:82-85`:**

```ts
// BEFORE
const fixture = process.env.KALORI_SKETCH_FIXTURE_BASE64;
if (fixture && fixture.length > 0) {
  return { base64: fixture, mimeType: 'image/png' };
}

// AFTER
// Fixture mode is owned by tests and local dev only. Gating on
// NODE_ENV !== 'production' mirrors the kill-switch pattern in
// `lib/library/sketch-enqueue.ts:55-58` (positive allowlist for safe
// environments). If `KALORI_SKETCH_FIXTURE_BASE64` ever leaks into the
// Production Vercel scope (typo / leftover debug var / supply-chain),
// the gate falls through to the live Gemini call so user-visible
// sketches do not silently become the fixture image.
if (process.env.NODE_ENV !== 'production') {
  const fixture = process.env.KALORI_SKETCH_FIXTURE_BASE64;
  if (fixture && fixture.length > 0) {
    return { base64: fixture, mimeType: 'image/png' };
  }
}
```

**Why this shape is the right mirror:**

The user's prompt asks "should the gate be `NODE_ENV !== 'production'` (simple) OR add a second explicit env var like `KALORI_ALLOW_FIXTURE_MODE=1` for belt-and-suspenders?"

The existing `sketch-enqueue.ts` precedent uses **positive allowlist + kill switch** (not denylist + extra opt-in). Mirroring its shape exactly:
- The `=== 'test'` check in `sketch-enqueue.ts` is the positive-allowlist half. Here our equivalent is `!== 'production'` because we want both `'test'` AND `'development'` to keep working (existing tests use `'test'` via Vitest auto-set, but local-dev fixture runs are also legitimate).
- The `KALORI_SKETCH_DISABLED === '1'` half is a kill switch (force-disable). It is NOT a second opt-in — it is the opposite direction (opt-out). A second opt-in (`KALORI_ALLOW_FIXTURE_MODE=1`) would diverge from the project precedent.
- **Belt-and-suspenders rationale REJECTED:** The fix's whole point is operator-error defense in depth. Adding a second opt-in env var means an operator who already typo'd one var into Production can typo two. The single `NODE_ENV !== 'production'` check is the project standard and the strongest practical guard — `NODE_ENV` is set by Vercel/Next/Vitest as part of platform contract, not as an opt-in flag a human sets.

**Failure-mode when the gate fires (i.e. NODE_ENV='production' AND fixture env is set):**
- The fixture path is silently skipped. Control flow falls through to live Gemini call (`getApiKey()` → `fetch(url, init)`).
- This is the **correct** behavior: in production, even if the fixture env leaked, the real API still serves the real result.
- Optional refinement: emit a Sentry warning via `console.warn` when `NODE_ENV === 'production' && fixture` (env leak detected). **DEFERRED** — keep change surgical per CLAUDE.md §Surgical Changes. The Sentry hook is a logical follow-up, not a fix.

---

## Recommended fix — Option B (NOT recommended): Defense-in-depth dual gate

```ts
if (
  process.env.NODE_ENV !== 'production' &&
  process.env.KALORI_ALLOW_FIXTURE_MODE === '1'
) {
  const fixture = process.env.KALORI_SKETCH_FIXTURE_BASE64;
  if (fixture && fixture.length > 0) {
    return { base64: fixture, mimeType: 'image/png' };
  }
}
```

**Why Option B is rejected:**

1. **Test/dev breakage cost.** Every existing test in `tests/unit/lib/ai/image-client.test.ts` and `tests/unit/lib/library/sketch-pipeline.test.ts` would need to additionally set `KALORI_ALLOW_FIXTURE_MODE=1`. That's noise without security gain (those tests run with `NODE_ENV='test'` already, which Option A also guards).
2. **Diverges from project precedent.** `sketch-enqueue.ts` uses single-gate pattern. The user explicitly asked for mirror shape.
3. **Doesn't increase real safety meaningfully.** An operator who can set one env var in the wrong Vercel scope can set two. The real safety comes from `NODE_ENV` being platform-determined, not human-set.
4. **Heavier change footprint.** ~5–8 test files would need edits; ~30 min of additional work; no security delta.

If the project later wants belt-and-suspenders, the recommendation is to add a **kill-switch** in the opposite direction (e.g., `KALORI_FORCE_LIVE_GEMINI=1` to bypass fixture-mode in non-prod for staged testing). That's a separate followup, not part of M2.

---

## Other env-var "back doors" audited

Searched all `process.env.KALORI_*` references in `lib/` + production source files:

| Env var | Location | Gated? | Risk if leaks to prod? |
|---|---|---|---|
| `KALORI_SKETCH_FIXTURE_BASE64` | `lib/ai/image-client.ts:82` | **NO** (this bug) | High — silent sketch override |
| `KALORI_SKETCH_DISABLED` | `lib/library/sketch-enqueue.ts:56` | OR'd with `NODE_ENV==='test'` | LOW — kill switch is intentional; if set in prod, sketch generation stops (visible failure, not silent corruption) |
| `KALORI_ENV` | `sentry.{edge,server}.config.ts:11/16`, `scripts/seed.ts:22/374`, `lib/sentry/before-send.ts:84`, `Planning/architecture.md:1628` | N/A (Sentry environment tag, not a code-path gate) | LOW — it's a label, not an authority |
| `KALORI_AI_FALLBACK_MODEL` | `lib/ai/fallback.ts:60` | NO env-gate, but only used as a string for the fallback model name; cannot bypass production behavior | LOW — passes through to API; if leaked, just changes which model is called (cost/quality concern, not silent-data-corruption) |

**`KALORI_SKETCH_DISABLED` analysis:** This is the only OTHER fixture-style gate. It's already correctly gated (kill switch in prod = visible "no sketches"; not silent data corruption). No fix needed.

**`KALORI_AI_FALLBACK_MODEL` analysis:** Different risk class — it's a model-name string, not a data-bypass switch. An attacker setting this to `"evil-model"` would just cause Gemini API calls to fail (404 from Gemini) — visible, not silent. Flag for **future hardening** consideration (whitelist of allowed model names) but **not in scope of M2 fix**.

**Conclusion:** No other "production back door" anti-patterns found. M2 is an isolated issue. **No scope expansion needed.**

---

## Files affected

**Production code:**
- `lib/ai/image-client.ts` — single change at lines 82–85; ~5 lines of net diff (wrap existing 4-line block in an additional `if (NODE_ENV !== 'production')` block + add explanatory comment).

**Tests:**
- `tests/unit/lib/ai/image-client.test.ts` — ADD 3 new test cases (RED→GREEN):
  1. Production env + fixture set → uses live API path (does NOT return fixture).
  2. Test env + fixture set → uses fixture (no regression).
  3. Development env + fixture set → uses fixture (no regression).
- `tests/unit/lib/library/sketch-pipeline.test.ts` — NO changes needed. Its `beforeEach` only sets `KALORI_SKETCH_FIXTURE_BASE64`; Vitest auto-sets `NODE_ENV='test'`, so the existing tests continue to hit the fixture path.

**Documentation:**
- `lib/ai/image-client.ts` doc-comment block (lines 18 + 75–77) — add a note that fixture mode is now prod-gated.
- `Planning/followups.md` — mark F-LIBOVR-SEC-M2-FIXTURE-PROD-GATE as resolved (Phase 8 task, not item-3).
- `Planning/CHANGELOG.md` — entry for the fix (Phase 8 task, not item-3).

---

## TDD plan (RED → GREEN)

### New test 1 — `NODE_ENV='production'` blocks fixture (RED)

```ts
it('falls through to live API when NODE_ENV=production even if fixture env is set (prod-gate)', async () => {
  // RED: pre-fix this asserts fetch was called; post-fix this assertion passes.
  process.env.NODE_ENV = 'production';
  process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
  const envelope = {
    candidates: [
      {
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: FIXTURE_PNG_B64 } }],
        },
      },
    ],
  };
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const payload = v1_sketchPrompt({ displayName: 'Grape' });
  const result = await callGeminiImage({ payload });
  expect(fetchSpy).toHaveBeenCalledOnce();        // proves live path, not fixture
  expect(result).not.toBeNull();
  expect(result!.base64).toBe(FIXTURE_PNG_B64);   // happens to match because we mocked the envelope with the same bytes — but the proof is fetchSpy.toHaveBeenCalledOnce
});
```

### New test 2 — `NODE_ENV='test'` keeps fixture working (regression guard)

```ts
it('keeps fixture-mode active when NODE_ENV=test (no regression for unit tests)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
  const payload = v1_sketchPrompt({ displayName: 'Honeydew' });
  const result = await callGeminiImage({ payload });
  expect(result).not.toBeNull();
  expect(result!.base64).toBe(FIXTURE_PNG_B64);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

### New test 3 — `NODE_ENV='development'` keeps fixture working (local-dev regression guard)

```ts
it('keeps fixture-mode active when NODE_ENV=development (no regression for local dev)', async () => {
  process.env.NODE_ENV = 'development';
  process.env.KALORI_SKETCH_FIXTURE_BASE64 = FIXTURE_PNG_B64;
  const payload = v1_sketchPrompt({ displayName: 'Imbe' });
  const result = await callGeminiImage({ payload });
  expect(result).not.toBeNull();
  expect(result!.base64).toBe(FIXTURE_PNG_B64);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

**Note on test setup:** All three tests must explicitly set `process.env.NODE_ENV` because Vitest sets it to `'test'` by default. The `beforeEach` already snapshots `originalEnv` and `afterEach` restores it, so cross-test leak is prevented.

**Note on TypeScript:** `process.env.NODE_ENV` is typed as `'development' | 'production' | 'test'` in some `@types/node` configs. If TS narrows it to readonly, the assignment must use type assertion: `(process.env as any).NODE_ENV = 'production'` OR `Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true })`. The existing test `tests/unit/sentry-test-route.test.ts:11-13` uses `process.env = { ...process.env, NODE_ENV: 'production' }` — adopt the same pattern for consistency.

### Verify RED

Pre-fix run:
```bash
pnpm test tests/unit/lib/ai/image-client.test.ts
```
Expected: Test 1 FAILS (fetchSpy not called — fixture short-circuits). Tests 2 + 3 PASS.

### Implement fix

Edit `lib/ai/image-client.ts:82-85` per Option A above.

### Verify GREEN

Re-run:
```bash
pnpm test tests/unit/lib/ai/image-client.test.ts
pnpm test tests/unit/lib/library/sketch-pipeline.test.ts
```
Expected: All tests PASS, including the three new ones.

### Verify project-wide invariants (per lesson learned from parent batch)

```bash
pnpm lint
pnpm test  # full unit + integration suite
```

Expected: No regression in lint or other test suites.

---

## Stop-the-world flags

None. The investigation surfaced no scope changes:

- ✅ Existing `sketch-enqueue.ts:55-58` pattern is intact (no refactor since parent batch).
- ✅ Existing fixture-mode tests use `NODE_ENV='test'` via Vitest default — Option A preserves them with no test edits required.
- ✅ No other env-var back doors found in `lib/` (audit complete: `KALORI_SKETCH_DISABLED`, `KALORI_ENV`, `KALORI_AI_FALLBACK_MODEL` all assessed and clear).
- ✅ Scope stays within `lib/ai/image-client.ts` + the corresponding unit test file (Item-3 stays within Medium 15-30 min envelope).

---

## Open questions

1. **Should the gate fire emit a `console.warn` or Sentry event?** Recommendation: NO for the surgical fix. Add a follow-up F-LIBOVR-FIXTURE-LEAK-OBSERVABILITY if operator wants explicit alerting on production env-var leakage. Reasoning: the silent-fall-through to live API is the correct outcome; alerting is a separate concern.
2. **Should `KALORI_AI_FALLBACK_MODEL` get a model-allowlist?** Recommendation: NO in scope. Filed as a parallel observation — not part of M2. Different risk class (visible failure, not silent corruption).
3. **Sentry server config interaction?** `sentry.server.config.ts:16` reads `KALORI_ENV` as Sentry's environment tag. Should it also surface a startup-time warning if `KALORI_SKETCH_FIXTURE_BASE64` is set in `KALORI_ENV='production'`? Recommendation: NO in scope — out of M2's surface; can be filed as a separate followup if desired.

---

## Risk assessment

| Dimension | Assessment |
|---|---|
| Change footprint | 1 production file (~5 lines), 1 test file (~3 new test cases) |
| Test regression risk | NEAR-ZERO — Vitest auto-sets `NODE_ENV='test'`; existing fixture-mode tests unaffected |
| Production behavior change | ONLY when `KALORI_SKETCH_FIXTURE_BASE64` is set AND `NODE_ENV='production'` (currently un-tested condition; the fix correctly converts a silent-corruption path into a live-API path) |
| Rollback complexity | Trivial — single `if` wrapper removal |
| Security improvement | HIGH — closes the M2 silent-fence-all-users attack scenario |
| Operational concern | None — fixture env vars are only used in test/dev environments by design |

---

## Recommendation

**Approve Option A.** Surgical 5-line change at `lib/ai/image-client.ts:82-85`, three new TDD-driven test cases, mirrors `sketch-enqueue.ts:55-58` precedent exactly per project convention. Belt-and-suspenders dual-gate (Option B) explicitly rejected due to test-noise cost and divergence from precedent. No scope expansion. No stop-the-world triggers.

Effort estimate confirmed: **15–30 min** (closer to 20 min including the 3 new tests + verify GREEN + lint sweep).

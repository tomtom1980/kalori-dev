# Bug 4 Proposal — LM-SEC-2: `mintLibraryClientId` v4 fallback uses non-cryptographic `Math.random()`

**Bug ID:** POST-MVP-BUGFIX-2026-05-17-LM-SEC-2
**File:** `app/(app)/log/_components/ConfirmationScreen.tsx`
**Classification:** `known_fix`
**TDD required:** YES

---

## Reachability determination

**Branch B — function IS reachable** (swap fallback to `crypto.getRandomValues`).

The followup note's claim that the function "is effectively dead in the post-`e7400e9` working tree" is **incorrect**. Commit `e7400e9` (POST-MVP-CODEX-R3-C1/C2) did NOT eliminate the call site — it RELOCATED it from the per-attempt save loop to the per-row reducer lazy-init. The function is still invoked once per row at component-mount/reducer-init time and the v4 string it produces becomes the row's `client_id` UUID that is sent to `POST /api/library/create` (with schema `z.string().uuid()` validation) and that the server uses for I11 replay-by-`client_id` dedup.

## Evidence

`grep -rn "mintLibraryClientId" --include=*.ts --include=*.tsx`:

| Location | Kind | Reachable? |
|---|---|---|
| `app/(app)/log/_components/ConfirmationScreen.tsx:303-312` | Function definition | n/a |
| `app/(app)/log/_components/ConfirmationScreen.tsx:645` | **Live call site** inside `useReducer` lazy-init `(seed): State => { ... rows: seed.items.map((item, idx) => ({ ... clientId: mintLibraryClientId(), ... })) ... }` | **YES — runs on every ConfirmationScreen mount, once per row** |
| `app/(app)/log/_components/ConfirmationScreen.tsx:794` | Comment-only reference (`// calling \`mintLibraryClientId()\` per attempt`) inside the library-only save loop, explaining what the code DELIBERATELY does NOT do | n/a (text in a comment) |

No test file imports or mocks `mintLibraryClientId` (`tests/**/*.test.{ts,tsx}` returned no matches), so no test cleanup is required.

The library-only save loop at lines 805+ reads `row.clientId` (the value minted at line 645 and persisted in row state by the reducer lazy-init). That read path is what makes line 645 production-load-bearing — it's the SINGLE mint per row that the rest of the lifecycle reuses across retries to honor the I11 idempotency contract.

**Sibling pattern (out of scope for Bug 4 framing but worth flagging):** `lib/stores/useLogFlowStore.ts:439-448` has an identical `generateClientId` function with the same `Math.random()` fallback. It is also reachable (from `ensureClientId` at line 606, called in the standard non-library-only flow). Bug 4 is scoped to `mintLibraryClientId` only, but the fix here should mirror whatever fallback `useLogFlowStore.generateClientId` ends up using if both functions are eventually unified. For surgical scope, this proposal only changes `mintLibraryClientId`; the `useLogFlowStore` twin is filed as a follow-up consideration (see Follow-up Note section below).

## Proposed Change (Diff Outline)

Replace the `Math.random()`-based v4 generation in the fallback path with a `crypto.getRandomValues()`-based v4 generator. Keep the `crypto.randomUUID` fast path unchanged (it remains the primary path in all modern runtimes).

```diff
 function mintLibraryClientId(): string {
   if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
     return crypto.randomUUID();
   }
-  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
-    const r = (Math.random() * 16) | 0;
-    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
-    return v.toString(16);
-  });
+  // Cryptographically secure v4 fallback. `crypto.getRandomValues` is
+  // present in every runtime that lacks `crypto.randomUUID` (old Safari,
+  // old Node, jsdom), so this branch only fires there. We still fall
+  // back ONE further step to `Math.random()` because tests stub `crypto`
+  // to `undefined` to exercise both branches; in production neither
+  // ConfirmationScreen mount nor the library save loop ever lands on
+  // that final branch.
+  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
+    const bytes = new Uint8Array(16);
+    crypto.getRandomValues(bytes);
+    // Per RFC 4122 §4.4: set version to 4 (bits 12-15 of time_hi_and_version)
+    // and variant to 10xx (bits 6-7 of clock_seq_hi_and_reserved).
+    bytes[6] = (bytes[6] & 0x0f) | 0x40;
+    bytes[8] = (bytes[8] & 0x3f) | 0x80;
+    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
+    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
+  }
+  // Last-resort fallback. Only reachable from environments without ANY
+  // crypto API (vanishingly rare); preserved so the function never
+  // throws and the schema-validation contract (z.string().uuid()) still
+  // gets a syntactically-valid UUID string even there.
+  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
+    const r = (Math.random() * 16) | 0;
+    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
+    return v.toString(16);
+  });
 }
```

**Lines touched in ConfirmationScreen.tsx:** 307-311 (3-line replacement → ~14-line block; everything else in the function unchanged). The JSDoc at lines 291-302 stays (still accurate — "Mirrors `generateClientId` in `useLogFlowStore`" still holds because `useLogFlowStore` has the same fallback shape; we're only hardening the entropy source).

**Bit-twiddling sanity check:** `bytes[6]` gets bits 4-7 cleared then bit 6 set → high nibble = `4` (version 4). `bytes[8]` gets bits 6-7 cleared then bit 7 set → top two bits = `10` (RFC 4122 variant). Output format matches `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where `y` is one of `8/9/a/b`. Output passes the `z.string().uuid()` regex in `lib/library/create-schema.ts`.

## TDD plan

Add to a unit test file co-located with ConfirmationScreen (or `tests/unit/log/mint-library-client-id.test.ts` if a new file is preferred — `mintLibraryClientId` is currently not exported, so either expose it for test OR test it indirectly via reducer init). Recommended: **export it as a named export** (zero behavior change in production callers) and write a dedicated unit test. The export change is one line and keeps the test surface clean.

### Test cases

1. **`crypto.randomUUID` available → uses it (fast path).** Stub `crypto.randomUUID` to return a fixed sentinel; assert the function returns the sentinel.
2. **`crypto.randomUUID` undefined, `crypto.getRandomValues` available → uses getRandomValues and returns valid v4.** Stub `crypto.randomUUID` to undefined; stub `crypto.getRandomValues` with a deterministic byte fill (`(buf) => buf.fill(0xff)` then assert output starts with the right version/variant nibbles); verify output matches `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/` AND that `crypto.getRandomValues` was called.
3. **Both `crypto.randomUUID` and `crypto.getRandomValues` undefined → falls through to `Math.random()` last-resort branch; still returns valid v4 shape.** Stub `crypto` to `{}`; verify output still matches the v4 regex (entropy is weak but format is preserved).
4. **Schema-validation pairing.** Call `mintLibraryClientId()` in all three branches and feed the result to `CreateLibraryBodySchema.shape.client_id.parse()` (or to a hand-rolled `z.string().uuid()` check); all three must parse without throwing.

### Mock strategy

Use `vi.stubGlobal('crypto', ...)` (Vitest) or equivalent to swap the `crypto` object per test; restore in `afterEach`. Mirror whatever pattern the existing `useLogFlowStore.test.ts` uses if there's a test for `generateClientId` already (grep for it during impl).

### Failing-first verification

Write all 4 tests against the current `Math.random()` fallback. Test 2 will FAIL (current code does not call `getRandomValues`); Tests 1, 3, 4 will pass against the unchanged code. Then apply the diff above; Test 2 starts passing. All 4 green at end.

## Risk assessment

- **Risk:** LOW. The fast path (`crypto.randomUUID`) is unchanged and that's >99% of runtime hits. The fallback path's behavior change is "more entropy, same UUID shape, same schema validity" — strictly an improvement.
- **Compatibility:** `crypto.getRandomValues` is available everywhere `crypto.randomUUID` could be missing (Safari ≤15.4, Node ≤14.17, jsdom). The triple-fallback covers any pathological environment.
- **Server contract preservation:** UUID v4 shape preserved → `z.string().uuid()` still passes → I11 replay-by-`client_id` semantics unchanged → row-level idempotency contract from POST-MVP-CODEX-R3-C1 intact.
- **No state-file changes:** No `Planning/setup-state.md`, no schema migration, no env var.

## Coordination with Bug 3

Bug 3 also touches `ConfirmationScreen.tsx`. **Coordination zones:**

- **Bug 4 (this proposal)** touches lines **307-311** (the function body of `mintLibraryClientId`, defined at 303-312).
- Bug 3 needs to declare which lines it touches; if Bug 3's diff is anywhere in the 400+ line range (the component body), there is **no overlap**.
- If Bug 3 touches the JSDoc at 291-302 or the function body 303-312, sequence Bug 3 before Bug 4 (or vice-versa) — the bugfix-tomi orchestration layer already plans `Bug 3 → Bug 4` as sequential in the task list, so this is handled.
- **Recommendation:** apply Bug 3 first, then re-anchor Bug 4's diff against the post-Bug-3 line numbers (the line numbers in my diff above are pre-Bug-3; after Bug 3 they may shift).
- **Export change for testability:** the proposed `export function mintLibraryClientId` (one-character change) is a non-conflicting surgical edit. Bug 3 should not need to know about it.

## Follow-up Note (out of scope for this bug)

`lib/stores/useLogFlowStore.ts:439-448` `generateClientId` has the identical `Math.random()` fallback and is also reachable from `ensureClientId` at line 606. It's a sibling instance of the same defect class. Two options for the bugfix-tomi orchestrator:

1. **In-scope expansion:** include the `generateClientId` fix in this same bugfix batch (one extra file edit, two extra test cases — Tests 5+6 mirroring Tests 2+3 against `generateClientId`). Low marginal cost.
2. **Defer:** file as a separate followup `POST-MVP-BUGFIX-2026-05-17-LM-SEC-2-twin` and address in the next batch.

Recommend Option 1 (in-scope expansion) since both functions are 95% identical and the security argument is the same — patching one without the other is incomplete. Surface to the user at the Phase 2 approval gate.

## Stop-the-world flags

None. Reachability is unambiguous (Branch B is the right call), there is no feature-flag gating, and the fix is purely a hardening swap with zero behavior change on the fast path.

---

## Summary

- **Branch:** B (reachable; swap fallback to `crypto.getRandomValues`).
- **Files touched:** 1 (`app/(app)/log/_components/ConfirmationScreen.tsx`); +1 if the `generateClientId` twin is included.
- **LoC delta:** ~+14 / -3 inside `mintLibraryClientId`; export-keyword change is +7 chars.
- **TDD:** 4 unit tests (Test 2 is the failing-first that drives the change).
- **Coordination with Bug 3:** Apply Bug 3 first; line numbers in this diff are pre-Bug-3.
- **Risk:** LOW; strictly a hardening swap, fast path unchanged.

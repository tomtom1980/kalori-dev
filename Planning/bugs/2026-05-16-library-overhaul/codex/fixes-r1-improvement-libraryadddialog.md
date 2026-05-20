# Phase 4 Auto-Fix — Improvement #1 (Codex Round 1)

**Finding:** `client_id` doesn't survive reloads mid-submit (LibraryAddDialog.tsx)
**Bug:** Bug 6 (Add-to-Library form — I11 retry-persistence contract)
**Status:** RESOLVED

---

## Resolution Summary

Replaced the `useRef`-only `client_id` with a `sessionStorage`-persisted
identity keyed by `kalori:library-add:client-id`. On dialog open the
component restore-or-mints the id; on definitive 2xx success or dialog
close it clears the stored id; on retryable failure (5xx / network /
409 dedup banner) it KEEPS the stored id so the next click replays the
same idempotency token.

This honors the I11 SELECT server-replay contract across reloads /
crashes — the second submit after a reload-during-submit now uses the
SAME `client_id`, so the server returns the existing row (idempotent
200/201) instead of falling into the 409 duplicate-name branch.

Pattern matches `lessons-relevant.md` line 9 (shape (b): "Zustand
`partialize`+sessionStorage … cleared ONLY on `commitSaveSuccess` (2xx)
… more robust because survives component remount, navigation, and
accidental retry from a different button instance"). Cosmetic
difference: bare `sessionStorage` helpers rather than a Zustand store,
since this is a single component with a single in-flight submission.

---

## Files Changed

### `app/(app)/library/_components/LibraryAddDialog.tsx`

1. **Top-of-file helpers (added, lines ~42-75)** — Four pure helpers:
   - `loadStoredClientId()` — SSR-safe read of stored id.
   - `storeClientId(id)` — SSR-safe + quota-rejection-safe write.
   - `clearStoredClientId()` — SSR-safe remove.
   - `mintClientId()` — `crypto.randomUUID()` with `cid-${Date.now()}` fallback.
   - Constant `CLIENT_ID_STORAGE_KEY = 'kalori:library-add:client-id'`.

2. **Component body — `clientIdRef` semantics (lines ~131-170)** —
   Changed from `useRef<string>(eager-mint)` to
   `useRef<string | null>(null)` and moved the mint into the
   open/close effect:
   - On `open === true`: if ref is null, restore-or-mint and persist.
   - On `open === false`: reset form state, clear stored id, null
     the ref so the NEXT open re-runs restore-or-mint.

3. **Submit handler — defensive seed (lines ~178-190)** — If the ref
   is somehow still null (race against the open-effect — impossible in
   practice but easy to harden), restore-or-mint inline before sending.

4. **Submit handler — success path (lines ~213-225)** — On 200/201
   response: `clearStoredClientId(); clientIdRef.current = null;`
   BEFORE calling `onCreated` / `router.refresh` / `onOpenChange(false)`.
   This means the in-flight contract is closed immediately on success;
   the subsequent close-effect's clearing is then a no-op.

5. **JSDoc header updated** to document the new contract.

**Diff scope:** Single file, ~70 net new lines (helpers + comments).
Pre-existing JSX, form state, server-error / duplicate banners,
validation, and the 5xx-retry contract are untouched.

### `tests/components/library/LibraryAddDialog.test.tsx`

Added a new describe block `client_id sessionStorage persistence (Codex
R1 Improvement)` with **6 new specs** at the bottom of the existing
suite (no edits to existing tests).

| # | Spec | Coverage |
|---|------|----------|
| 1 | `on first mount with no stored client_id, generates one AND persists it` | Mint-and-persist path |
| 2 | `when sessionStorage has an existing client_id, the dialog uses it on submit` | Restore-on-mount path |
| 3 | `on successful submit (2xx), clears the sessionStorage entry` | 201 cleanup |
| 4 | `on successful 200 idempotent replay, clears the sessionStorage entry` | 200 replay cleanup (server returns existing row) |
| 5 | `on dialog close (open → false), clears the sessionStorage entry` | Dismiss cleanup |
| 6 | `reload-after-server-commit replay: a remount with stored client_id replays the SAME id (I11)` | Codex-finding canonical scenario |

---

## TDD Cycle Evidence

- **RED:** 3/6 new specs failed on the first run (the other 3 incidentally
  passed because the eager-useRef mint coincidentally satisfied "client_id is
  a UUID" without any persistence behind it). Confirmed RED for the correct
  reasons (no stored entry after mount; mount with stored entry didn't use
  it; remount didn't replay the stored id). Two of the failing specs initially
  used non-UUID storage values that the client-side `CreateLibraryBodySchema`
  rejected before any fetch — fixed by using valid UUID-format strings, which
  exposed the actual missing-persistence behavior.
- **GREEN:** 11/11 specs pass after implementation (5 existing + 6 new).
- **Regression sweep:** `tests/components/library/` + `tests/unit/api/library-create.test.ts`
  = 176/176 across 28 files. No regressions.
- **TypeScript:** `tsc --noEmit` clean.

---

## Test Count

- **Tests added:** 6
- **Tests modified:** 0
- **Regression-sweep total:** 176/176 GREEN (28 files)

---

## Coding-Principle Adherence

- **Surgical change** — single production file + single test file. No
  touched-but-not-required modifications elsewhere; the existing
  `useRef` / `useState` / `useEffect` skeleton, form fields, banner
  markup, dialog primitives, and 5xx-retry semantics are untouched.
- **Simplicity first** — bare sessionStorage helpers (4 small pure
  functions) rather than a Zustand store. Single-component scope didn't
  warrant the abstraction.
- **Pattern match** — key naming `kalori:<feature>:<purpose>` follows
  project conventions (`kalori:onboarding:v1`, `kalori:log-flow:v1`,
  `kalori:target-nudge:announced:*`, `kalori:reduce-motion-change`).
  SSR / quota / privacy-mode guards mirror those in
  `lib/stores/useLogFlowStore.ts` and `lib/auth/cross-tab-signout.ts`.

---

## False-Positive Determination

Not a false positive. The Codex finding is confirmed by the original
source (line 89-91 useRef-only mint, lines 102-112 close-effect
regenerates) and the I11 contract documented in `create-schema.ts`
header (server-side `select by (user_id, client_id)` only replays when
the SAME id arrives — a fresh UUID after reload falls through to
normalized-display-name dedup and surfaces 409).

---

## Stop-the-World Triggers — None hit

- The existing `useRef` placement was easy to refactor (just changed the
  initial value and moved the mint into the open-effect).
- `sessionStorage` is available in the test environment (happy-dom,
  per the `@vitest-environment happy-dom` pragma at the top of the
  test file).
- The schema (`CreateLibraryBodySchema`) requires `client_id` to be
  UUID-format — the stored id is therefore always UUID-format
  (mint path always uses `crypto.randomUUID()`). Test fixtures use
  valid UUIDs.

No false-positive determination required.

---

## State.md Update

Per the briefing's instruction, the `bugs[6]` entry in
`Planning/.tmp/bugfix-2026-05-16-library-overhaul/state.md` should be
augmented with:

```yaml
    auto_fix_round_1_improvement: "1 finding resolved — client_id persisted to sessionStorage (kalori:library-add:client-id)"
```

(Main agent will write this and update `last_completed_action` after
both parallel auto-fix sub-agents complete.)

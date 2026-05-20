# Security Review — bugfix batch 2026-05-17-followups

## Scope

Aggregate diff `07273a3..origin/main` — 8 commits in scope (Bug 1–4 + R1 fix + 3 sibling Add-Food feature commits flagged by Codex R2 as dead code, included for completeness but no production render path).

- `e496627` Bug 1 (LM-I1) — `FoodDetailMacros.resolveSodiumMg` canonicalization
- `42126c0` Bug 2 (LM-I2) — `useFoodDetailEdit` unconditional dedup
- `d579fbe` Bug 3 (LM-SEC-1) — `ConfirmationItemMicros` 3-layer input bound
- `8d4a07f` + `0e4d39d` Bug 4 (LM-SEC-2) — UUID v4 fallback in 2 sites
- `fd1e3fc` R1 fix — universal legacy preservation + validation banner

Source-file diff stats (after excluding `tests/screenshots`, `tests/lighthouse`, and `planning/`):
- 11 source files changed: `lib/library/micros-bounds.ts` (new), `lib/library/create-schema.ts`, `app/api/entries/save/route.ts`, `app/api/library/[id]/update/route.ts`, `app/api/library/merge/route.ts`, `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`, `app/(app)/library/_components/FoodDetail/FoodDetail.tsx`, `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`, `app/(app)/log/_components/ConfirmationScreen.tsx`, `lib/stores/useLogFlowStore.ts`, `lib/i18n/en.ts`.

---

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Informational

**INFO-1 — Math.random() last-resort UUID fallback retained.**
Both UUID call sites (`mintLibraryClientId` in `ConfirmationScreen.tsx`, `generateClientId` in `useLogFlowStore.ts`) keep the legacy `'xxxxxxxx-xxxx-4xxx-yxxx-…'.replace(/[xy]/g, Math.random)` branch as a tertiary fallback after `crypto.randomUUID()` then `crypto.getRandomValues()`. In practice this branch is unreachable in every supported browser/runtime (jsdom, happy-dom, Node 16+, Safari ≥15.4, Chrome, Firefox all expose `getRandomValues`). The branch exists only to keep the function total (never throws) so `z.string().uuid()` still gets a syntactically valid string. **No action required** — defense-in-depth pattern, the comments document this explicitly.

**INFO-2 — Sentry `extra: { userId, loserId }` in `library/merge`.**
Pre-existing logging; UUIDs are not PII per project policy. Not introduced by this batch. Surfaced only because the prompt asked about PII-in-logs.

---

## Special-focus area results

### Bug 3 — input upper bound (3-layer defense)

**Verdict: PASS.** All three layers verified intact.

- **Layer 1 — `max="999999"` (`ConfirmationScreen.tsx:1721`).** HTML attribute on the `<input type="number">`. Browser-side native validation; can be bypassed via devtools paste or programmatic `dispatchEvent`. As designed — declarative + a11y signal only, not a security boundary.
- **Layer 2 — `Math.min(parsed, 999999)` (`ConfirmationScreen.tsx:1744`).** Runs unconditionally inside `onChange` BEFORE the `actions.editMicro` dispatch. Reducer (`EDIT_ITEM_MICRO`, line 455) does NOT independently cap; it only applies `roundNutrition`. **Layer 2 is the bulwark.** Verified there is no alternate dispatch path: only call sites of `editMicro` are line 1728 (sets value to literal `0` on empty input) and line 1745 (capped). No reducer cases write to `item.micros` from external action types. Scientific notation `1e300` -> `Number()` = `1e300` (finite) -> `Math.min(1e300, 999999)` = `999999`. Scientific notation `1e600` -> `Infinity` -> `isFinite` false -> discarded. Negative `-1e10` -> `>= 0` false -> discarded. **No scientific-notation escape.**
- **Layer 3 — Zod `.max(MAX_MICRO_VALUE)` (= 1_000_000).** Verified applied at all 4 server mutation routes: `lib/library/create-schema.ts:65` (POST /api/library/create), `app/api/library/[id]/update/route.ts:82` (POST /api/library/[id]/update), `app/api/library/merge/route.ts:77` (POST /api/library/merge), `app/api/entries/save/route.ts:67` (POST /api/entries/save). Schemas are imported AND consumed via `.parse()` / `.safeParse()` in each route handler — confirmed not just defined. Shared constant prevents drift.

**Sibling client clamp** in `useFoodDetailEdit.setMicro` (line ~696) caps at `MAX_MICRO_VALUE` = 1,000,000 (not 999,999 — matches the server bound exactly; comment explains the 1-unit headroom rationale for the Confirmation flow's `roundNutrition` rounding). Server-side `.finite()` rejects `Infinity`/`NaN`. `.nonnegative()` rejects negatives. **No bypass via direct authenticated POST.**

### Bug 4 — UUID fallback

**Verdict: PASS.** RFC 4122 v4 compliance verified for both sites.

- **Byte twiddling:**
  - `bytes[6] = (bytes[6] & 0x0f) | 0x40` -> clears top nibble, sets it to `0x4`. High nibble of byte 6 = `4` (version 4 marker). OK
  - `bytes[8] = (bytes[8] & 0x3f) | 0x80` -> clears top 2 bits (`0xc0` mask), sets top bit to `1`. Top 2 bits of byte 8 = `10` (RFC 4122 variant marker). OK
- **If-cascade correctness:** Both functions use cascaded `if … return; if … return; return …` blocks. `crypto.randomUUID` branch returns immediately on hit; `getRandomValues` branch returns immediately on hit; fallback only reached when both checks fail. **No Math.random fall-through when `crypto.getRandomValues` exists.** Tests `mint-library-client-id.test.ts` + `useLogFlowStore.test.ts` (8 tests total) cover the cascade explicitly with `vi.stubGlobal('crypto', ...)`.
- **Export safety:** Both functions newly `export`ed. No barrel re-export reorders; named exports cannot be shadowed by import order. Verified there is no `export default` change that would let a caller silently get a different implementation.

### Bug 1 + Bug 2 — canonicalization

**Verdict: PASS.**

- **PII echo:** `canonicalizeMicroKey` (in `lib/dashboard/micros-rda-resolver.ts:123`) is a pure lookup against three frozen allowlists (`LEGACY_MICRO_KEY_ALIASES`, `CANONICAL_MICRO_CODES`, `DISPLAY_NAME_TO_CANONICAL_CODE`). Returns `string | undefined`. Never logs, never throws, never echoes input. **No PII surface.**
- **TOCTOU:** The dedup-merge loop in `useFoodDetailEdit.buildFieldsPatch` runs entirely client-side inside a single React render frame on `commit`. No async boundary between read of `initMicros` and write of `mergedMicros`. Server-side merge is atomic (`library_merge_atomic` RPC) and updates are single-row writes under RLS. **No concurrent-edit race producing inconsistent canonical-vs-legacy state.**
- **Universal legacy preservation (R1-C1 fix):** Walks `initShapes` map once; the per-canonical decision (legacy vs canonical vs drift) is pure and deterministic given the initial snapshot. Drift case is intentionally resolved by collapsing to canonical (preserving the higher-value canonical entry by `canonicalizeMicrosBag` pass 1). Sodium and user-edited canonical keys correctly excluded from the preservation loop. **No silent shape mutation on unrelated edits.**

---

## Standard checklist

- **Input validation:** PASS. New `MAX_MICRO_VALUE` bound applied at all 5 surfaces (4 server + 1 client). `.finite().nonnegative().max(1_000_000)` rejects NaN/Infinity/negative/oversized. `validateMicroValue` surfaces invalid values to UI rather than silently coercing.
- **authn/authz:** PASS. No changes to authentication, authorization, RLS policies, route gates, profile fences, or `requireProfileOrJson401`. Schema changes are additive (tighter bounds only).
- **PII handling:** PASS. No new logs containing emails/names/free-text user input. Error banners are fixed i18n strings (`saveFailedBanner = "Couldn't save changes. Try again."`). Per-micro error strings are also i18n constants (`errMicroNumber`, `errMacroNonneg`). No raw user input reaches Sentry from changed code paths.
- **Injection vectors:** PASS.
  - SQL/NoSQL: no raw query construction; all writes via Supabase client + RPC.
  - Command/template: no shell-out, no template eval.
  - JSX-rendered error strings (`{microErr}`) are auto-escaped by React.
  - Generated DOM ids interpolate only `row.code` from frozen `DEFAULT_MICROS_LIST` — closed allowlist.
- **Secret leakage:** PASS. No env vars, tokens, or service-role keys touched. Sentry tags use only fixed component names.
- **XSS / CSRF:** PASS. New string rendering paths (`microErr`, banner text) are i18n constants or canonical micro names — never user input. No new raw-HTML insertion paths. CSRF model unchanged (Supabase session cookies + same-origin POST).
- **Race conditions:** PASS. Client-side merge loop is synchronous within a single render. Server-side merge uses atomic RPC. Confirmation reducer is React useReducer — single-thread.
- **a11y/security crossover:** PASS. `aria-describedby={errorId}` where `errorId = ${inputId}-error` and `inputId = fd-edit-micro-${row.code}` — `row.code` from frozen allowlist. `aria-invalid={Boolean(microErr)}` — coerces to boolean. No attribute injection.

---

## Verdict

**clean** — zero Critical, zero High, zero Medium, two Informational notes (both no-action defense-in-depth observations).

Bug 3 and Bug 4 are explicit security-surface fixes and both verify correctly. The R1 fix (`fd1e3fc`) extending legacy preservation to all canonical/legacy pairs has no security regression — it tightens a data-integrity invariant without weakening any input boundary.

Two improvement-class residuals from Codex R2 (I-R2-1 stale-banner-on-no-op-save and I-R2-2 same-value-micro-not-touched) are UX-class issues, not security issues, and remain deferred per the bugfix-tomi 2-round-cap. No fix sub-agent needed for security.

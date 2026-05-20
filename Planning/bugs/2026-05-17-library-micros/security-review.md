# Security Review — bugfix batch 2026-05-17-library-micros

## Scope

- Aggregate diff `60e85c5..origin/main` (HEAD `8dc799f` at start; HEAD now `e7400e9` — `e7400e9` is a sibling POST-MVP-CODEX-R3 fix on the same `ConfirmationScreen.tsx` that further hardens the `client_id` minting and dedup-banner wiring this review covers).
- Four in-scope commits:
  - `b51cad1` — Bug 2 + Bug 3 (canonical unit/RDA helpers, DV comparison, `role="meter"`, `MicroRowDisplay`, `FoodDetailMacros` integration)
  - `45376f8` — Bug 1 production (`ConfirmationScreen` library-only micros collapsible, `EDIT_ITEM_MICRO` reducer action, `ConfirmationItemMicros` component)
  - `9361fe6` — `sugar_g` typecast push-unblock (test typing only)
  - `8dc799f` — R1-C1 sodium canonical/legacy alignment in `useFoodDetailEdit`
- Production source files inspected:
  - `app/(app)/log/_components/ConfirmationScreen.tsx`
  - `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx`
  - `app/(app)/library/_components/FoodDetail/useFoodDetailEdit.ts`
  - `app/(app)/library/_components/FoodDetail/foodDetail.format.ts`
  - `app/globals.css`
  - `lib/dashboard/aggregate.ts`
  - `lib/dashboard/micros-rda-resolver.ts`
  - `lib/nutrition/micros-rda.ts`
  - `lib/i18n/en.ts`
  - `lib/library/create-schema.ts` (downstream contract verification only — unchanged)
  - `app/api/library/create/route.ts` (downstream contract verification only — unchanged)
- Tests / screenshots / lighthouse intentionally excluded from primary inspection.

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Informational

**I-1 — `EDIT_ITEM_MICRO` has no upper bound on input (defense-in-depth)**
- File: `app/(app)/log/_components/ConfirmationScreen.tsx` — `ConfirmationItemMicros` onChange handler around L1493 → `roundNutrition` L355 → reducer `EDIT_ITEM_MICRO` case L430
- Nature: The `<input type="number" min="0" step="any" inputMode="decimal">` accepts arbitrary positive finite numbers. `Number(next)` parses scientific notation (e.g. `1e308`). `roundNutrition` rejects NaN / `<= 0` (coerces to 0) but does not cap the upper bound. The persisted body funnels into `CreateLibraryBodySchema.nutrition.micros` (Zod `z.record(z.string(), z.number().nonnegative().finite())`), which itself has no upper bound either. A user can persist `1e300 mg sodium`, which would render as `1e+300 mg` in the library detail meter.
- Severity rationale: **Informational, NOT Medium.** This is a user-supplied value into their own library row, gated by RLS to their own `user_id`. There is no privilege boundary crossed, no DoS surface (numeric storage in JSONB is constant cost), no UI float-underflow (we render with `formatMilligrams` which never normalizes to scientific notation under realistic values; pathological values render verbatim but degrade gracefully). The user can only sabotage their own UX, and the existing `aria-valuenow` clamp at `Math.max(0, Math.min(100, dvPct))` in `MicroRowDisplay` already prevents AT meter announcements from exposing the absurd number.
- Recommendation (defer to Phase 8 followup): Add a soft cap at `999999` per-input in `ConfirmationItemMicros` onChange + a `max="999999"` HTML attribute. Mirror at the Zod schema level (`.max(1_000_000)` on the micros record values). Non-blocking — file as a future polish item.

**I-2 — `mintLibraryClientId` v4 fallback uses non-cryptographic randomness**
- File: `app/(app)/log/_components/ConfirmationScreen.tsx:260-269`
- Nature: The fallback path when `crypto.randomUUID` is unavailable uses `Math.random()`, which is not cryptographically strong. The function is defined in this batch to mint per-row idempotency tokens for `/api/library/create`.
- Severity rationale: **Informational.** `client_id` is NOT a secret — it is an idempotency token scoped to a single authenticated user's `food_library_items` table, validated server-side as `z.string().uuid()` and used only for I11 dedup-by-`client_id` replay. Collision risk is the only relevant security property, and `Math.random()`-derived v4 is acceptable for that. No JWT, no session token, no CSRF token is derived from this RNG. Additionally, the actual ConfirmationScreen path in the current HEAD (`e7400e9`) uses `row.clientId` minted at row-creation time via `useLogFlowStore`'s `generateClientId` (which has its own primary `crypto.randomUUID()` path), so `mintLibraryClientId` is effectively dead in the post-`e7400e9` working tree.
- Recommendation: Verify in Phase 7 whether `mintLibraryClientId` is reachable from any code path. If not, consider removing in a future cleanup commit.

## Inspection checklist (per criterion above)

- **Input validation:** **pass**. `EDIT_ITEM_MICRO` reducer wraps the value through `roundNutrition` which guards against NaN / non-finite / negative (coerces to 0). The onChange handler in `ConfirmationItemMicros` further guards: empty string -> 0, otherwise `Number.isFinite(parsed) && parsed >= 0` before dispatch. Server-side, `CreateLibraryBodySchema` enforces `z.number().nonnegative().finite()` on every micros value in `.strict()` mode. Defense-in-depth is present at three layers (input, reducer, schema). The lack of upper-bound is informational only (I-1).
- **authn/authz:** **pass**. `ConfirmationItemMicros` writes to local React reducer state only — no direct DB write. The eventual persistence goes through `authFetch('/api/library/create', ...)` (refresh-interceptor) -> `requireProfileOrJson401` -> `rejectIfDeletingOrUnavailable` -> Zod `.safeParse()` -> Supabase server client (`getServerSupabase()`) with `user_id` scoped to the authenticated session. RLS still ultimately gates the INSERT. No new auth bypass surface. `useFoodDetailEdit` changes (sodium canonical/legacy dedup) operate on already-authenticated edit drafts and do not introduce a new write path.
- **PII handling:** **pass**. No new logging of emails, names, or IDs. The single Sentry capture in the create route (`extra: { userId, normalized }`) is pre-existing and intentional (admin visibility for DB failures). `dispatch({ type: 'SAVE_ERROR', message: <res.status>: <res.statusText> })` echoes server-controlled HTTP status strings, NOT user input. The new `aria-label` in `MicroRowDisplay` is constructed from i18n / canonical display names + numeric values, not user input.
- **Injection vectors:** **pass**. No SQL/NoSQL/command/template/prompt injection paths added. The `/api/library/create` body is composed via `JSON.stringify(libraryBody)` from typed Zod-shaped values; the server route uses parameterized Supabase queries (`.eq('client_id', body.client_id)`, etc.) — no string concatenation into queries. No new shell calls, template renderers, or AI prompt edits in scope. No new regex changes.
- **Secret leakage:** **pass**. No new env vars echoed. No tokens logged. The `client_id` values emitted in the library-only save loop are per-row UUIDv4 idempotency tokens scoped to one user, not secrets. The Bug 1 collapsible's `data-testid` attributes leak no PII (they encode index + canonical micro code).
- **XSS / CSRF:** **pass**. No raw-HTML-string injection sinks introduced (no use of React's escape-bypass prop, no `innerHTML`/`outerHTML` assignments, no `eval`, no dynamic-Function-constructor calls). All new rendering is via React JSX text interpolation (auto-escaped) and prop-bound `aria-*` attributes. CSRF: the new POST shape funnels through the existing `authFetch` refresh-interceptor (R1 contract, comment lines 22-27 of `ConfirmationScreen.tsx`) — same protected path the existing `/api/entries/save` and `/api/library/dedup-check` calls use. No raw `fetch` introduced.
- **Race conditions:** **pass**. `EDIT_ITEM_MICRO` reducer case is immutable: `const rows = state.rows.map((r) => { ... return { ...r, item: { ...r.item, micros } }; })` — new object refs on every dispatch, no shared mutation. `Collapsible.Root` (Radix) is React-19 compatible; the existing library codebase already uses `Collapsible.Root` extensively in `FoodDetailMacros.tsx::EditMicrosCollapsible` and `MicrosReadOnly`'s extras toggle without documented concurrent-rendering issues. The library-only save loop iterates rows sequentially (`for (const ... of rowsToPersist)`), avoiding partial-failure interleaving. The new `useFoodDetailEdit::buildFieldsPatch` sodium canonical/legacy convergence runs entirely synchronously within React render — no shared async state.
- **a11y/security crossover:** **pass**. `role="meter"` + `aria-valuenow={ariaValueNow}` where `ariaValueNow = Math.max(0, Math.min(100, dvPct))` — clamped to [0, 100], no attacker-controlled aria-attribute injection. `aria-valuemin={0}` and `aria-valuemax={100}` are literal numeric constants. `aria-label` is composed from i18n display name + formatted numeric value (auto-escaped JSX prop). No SSR-attacker-controlled paths into `aria-*`. The `name` parameter to `MicroRowDisplay` originates from `humanizeMicroKey()` (deterministic, key-shape based) or `t.library.detail.microSodium` (i18n literal) — never raw user input.

## Verdict

**clean** — no Critical, High, or Medium findings. Two Informational items (I-1 upper-bound, I-2 non-crypto RNG fallback) are non-blocking defense-in-depth observations suitable for the Phase 8 `pending_minor_findings` rollup. No fix sub-agents required.

The aggregate diff demonstrates good security discipline:
- Defense-in-depth on numeric input (three validation layers)
- Auth fence preserved on all write paths
- All new rendering uses React-default-escaped JSX text
- All new POST traffic routes through the existing `authFetch` CSRF-protected interceptor
- ARIA attributes use clamped numeric values, not user-controlled strings
- The `useFoodDetailEdit` canonical/legacy sodium convergence ADDS dedup safety rather than weakening any existing validation

# Security Review — bugfix-tomi 2026-05-08-mobile-ui-overhaul

## Scope

- Production-code diff (excluding lockfile, screenshots, sw.js, next-env.d.ts): **18 modified files / 931 insertions / 265 deletions** + **8 new untracked production files** (4 source + 4 test). Total scope ~1.2K LOC.
- New production source files reviewed in full:
  - `lib/motion/defaults.ts` (290 lines)
  - `lib/motion/MotionProvider.tsx` (31 lines)
  - `lib/hooks/use-is-mobile.ts` (72 lines)
  - `components/primitives/MobileWheelPicker.tsx` (370 lines)
  - `components/primitives/MobileWheelSheet.tsx` (218 lines)
- Touched production files reviewed via diff:
  - `app/layout.tsx`, `app/(app)/onboarding/_components/WizardShell.tsx`, `app/(app)/log/_components/LogFlowModal.tsx`, `app/(app)/log/_components/LibraryTab.tsx`, `app/(app)/log/_components/ConfirmationScreen.tsx`, `components/nav/log-fab.tsx`, `components/nav/nav-shell.tsx`, `lib/i18n/en.ts`
- Diff size well under 1 MB Codex budget; no split needed.

## Findings

### Critical
None.

### High
None.

### Medium
None.

### Informational

**I-1 — Mobile wheel-picker bypass of `setQuantity` runtime sanitization (LibraryTab)**
- **File:** `app/(app)/log/_components/LibraryTab.tsx` lines 260-262 vs lines 247-251
- **Issue:** Desktop branch goes through `setQuantity(id, raw)` which coerces non-numeric / non-positive values to `1` via `Number.isFinite(parsed) && parsed > 0 ? parsed : 1`. The new mobile branch wires the wheel commit straight to `setQuantityNumber(id, n)` with NO equivalent guard.
- **Severity reason:** **Informational only** — `MobileWheelPicker<T extends string|number>` is a typed generic over a static `LIBRARY_QUANTITY_WHEEL_OPTIONS` array (0.25–10 step 0.25, all positive finite numbers). The user has no path to inject NaN / Infinity / negative / zero / string into the wheel — the option set is hardcoded. Server-side validation also remains in place at the API write path.
- **Recommended fix (optional):** Add a `Number.isFinite(n) && n > 0` guard inside `setQuantityNumber` for defense-in-depth (prop-injection from a future caller). One-line change.

**I-2 — `useIsMobile` does not cover `(prefers-reduced-data: reduce)` or DPR-tracking surfaces**
- **File:** `lib/hooks/use-is-mobile.ts`
- **Issue:** The hook reads `window.matchMedia('(max-width: 767px)')`. No third-party tracking integration exposes user-agent / screen size to a remote service from this hook.
- **Severity reason:** **Informational only** — verified the hook only feeds local React state (`useSyncExternalStore`). No fetch / fetch-like / `navigator.sendBeacon` calls. No PII surface.

**I-3 — Two pre-existing low/moderate transitive advisories unrelated to this batch**
- `tmp@<=0.2.3` — Low (CVSS 2.5) — only in `@lhci/cli` dev-dependency chain. Not in production runtime.
- `postcss@8.4.31` — Moderate — pulled in via `next`. Pre-existing; not introduced by this batch.
- **Severity reason:** **Informational** — neither advisory was newly introduced by this bug bundle. They are framework-level / tooling supply-chain concerns the project already lives with. Recommend tracking for future Next.js minor upgrades to pick up the patch.

**I-4 — Four orphaned `@keyframes` declarations remain in `app/globals.css`**
- **File:** `app/globals.css`
- **Issue:** `kalori-log-enter-mobile` / `kalori-log-exit-mobile` / `kalori-log-enter-desktop` / `kalori-log-exit-desktop` keyframes still defined but no longer referenced (Bug 3 migrated to Framer Motion). Already noted in `bug-3.md` Open Concern #4. Not a security concern; pure dead-code informational.

## Per-bug security observations

- **Bug #1 (mobile-responsive layout):** No security concerns. Pure className / globals.css / inline-style edits. No raw-HTML injection sinks introduced (zero matches in the entire repo for the React unsafe-HTML prop). No user data interpolated into class names.

- **Bug #2 (i18n labels):** No security concerns. Strings `'Dashboard'` / `'Library'` / `'Progress'` / `'Settings'` are static literals rendered as text-children of React `<a>` elements (auto-escaped). No raw-HTML injection sinks, no innerHTML, no user-supplied concatenation.

- **Bug #3 (motion infrastructure):**
  - Supply-chain: `framer-motion@12.38.0` pinned (caret-range `^12.38.0` in package.json — major-version bump blocked, minor/patch allowed). Lockfile pins to `12.38.0` exactly with sha-512 integrity hash. Transitive deps `motion-dom@12.38.0`, `motion-utils@12.36.0`, `tslib@2.8.1` — none of these have advisories per `pnpm audit`.
  - Listeners cleanup: verified `subscribeAppReduce` in `lib/motion/defaults.ts` returns a teardown function that calls `observer?.disconnect()`, `removeEventListener('storage', ...)`, `removeEventListener('kalori:reduce-motion-change', ...)`. `useSyncExternalStore` invokes the teardown on unmount. **No memory leak / late-firing listener risk.**
  - Storage key namespace: `'kalori.reduce-motion'` is consistent across `lib/motion/defaults.ts`, `lib/offline/network-state.tsx`, `app/(app)/settings/_components/ReduceMotionToggle.tsx` — single source of truth, no collision risk.
  - Import-path typo check: `@/lib/motion/defaults` confirmed. No accidental `@/lib/auth/...` or other security-sensitive directory typo.
  - No `console.log` / `console.error` introduced in the motion module (zero matches).

- **Bug #4 (wheel picker):**
  - Wheel input flow: `MobileWheelPicker<T>` only emits values from its static `options` array (typed contract). User cannot inject arbitrary input. Both `ConfirmationScreen` and `LibraryTab` consumers wire the wheel through pre-existing `editPortion` / `setSelection` mutators which are the same paths used by desktop. **No validation regression** on the API write path — server still validates.
  - `MobileWheelSheet` is a Radix Dialog: focus-trap, Escape, outside-click-to-close all delegated to `@radix-ui/react-dialog`. `aria-describedby={undefined}` deliberately suppresses the Radix warning when no description is supplied; not a security concern.
  - No third-party tracking integration — `useIsMobile` reads only `window.matchMedia` locally.
  - Repo-wide audit: zero React unsafe-HTML-prop usages.

- **Bug #5 (dual FAB):**
  - `router.push('/dashboard')` is a hardcoded literal, not interpolated from props/state/URL. No path-injection risk.
  - `t.fab.logFoodA11y` / `t.fab.logWaterA11y` are static strings rendered as `aria-label` (HTML-attribute escaped by React).
  - `data-testid="log-fab-water"` / `log-fab-food` — fingerprinting concern is theoretical; testids are visible in DOM regardless of surface, no user data exposure.

## Supply chain verification

- **`framer-motion@12.38.0` audit result: CLEAN** — no advisories listed in `pnpm audit` output. Package itself has no historical CVEs reported via the npm advisory database. Pinned via caret range; lockfile resolves to a single version with cryptographic integrity hash.
- **Transitive deps with advisories (newly added in this batch):** NONE.
  - `motion-dom@12.38.0` — clean
  - `motion-utils@12.36.0` — clean
  - `tslib@2.8.1` — clean (pre-existing transitive, version unchanged)
- **Pre-existing advisories (not introduced by this batch):**
  - `tmp@<=0.2.3` (low, CVSS 2.5, CVE-2025-54798) — under `@lhci/cli` dev-only
  - `postcss@8.4.31` (moderate, CVE-2026-41305 XSS via `</style>`) — under `next`
  - Neither is a regression. Recommend tracking on the next Next.js / lighthouse-ci upgrade window.

## Cross-cutting observations

- **No raw-HTML injection sinks anywhere in the repo** (post-batch grep returns zero matches for the unsafe React prop name across all files).
- **No new `console.log` / `console.error`** in production paths (verified across `lib/motion/`, `lib/hooks/`, `components/primitives/`).
- **No PII / secrets in test fixtures.** Integration test (`tests/integration/mobile-wheel-picker-consumers.test.tsx`) uses synthetic data: name `'eggs'`, fake server id `'srv-row-1'`. No real emails, names, IDs, tokens, env-var values.
- **No new env vars echoed.** Diff contains zero references to `SUPABASE_*`, `GEMINI_*`, `VERCEL_*`, `SENTRY_*`, `process.env.*` introductions.
- **Storage-key namespace discipline:** `'kalori.reduce-motion'` reused consistently; new keys `LIBRARY_QUANTITY_WHEEL_OPTIONS` / `PORTION_WHEEL_OPTIONS` are module-local constants, not localStorage keys. No namespace collision with another lib (vetted across all `localStorage.getItem|setItem` callsites).
- **Listener lifecycle:** the `MutationObserver` + `storage` + `kalori:reduce-motion-change` listeners in `lib/motion/defaults.ts subscribeAppReduce()` are properly disposed on unmount via the returned teardown closure. `useIsMobile` listeners likewise.
- **Race-condition surface:** new `MobileWheelPicker` `handleScroll` deliberately uses pure equality `clamped === activeIndex` to no-op programmatic scroll events vs user touches — no time-window race, resilient to React 18 strict-mode double-invocation. Documented in source comments.
- **AuthN/AuthZ surface:** UNCHANGED. No edits to `authFetch`, `refresh-interceptor`, RLS policies, middleware, or session boundaries. Privilege boundaries respected.
- **Injection vectors:** No new string concatenation into queries / commands / templates. All numeric portions / quantities are typed `number` from a closed option set.
- **CSRF/XSS:** No new HTML rendering of user-provided strings. All user-visible strings flow through React JSX (escaped) or `aria-label` (attribute-escaped).

## Verdict

**PASS** (with informational findings only)

- 0 Critical
- 0 High
- 0 Medium
- 4 Informational (none requires action before Phase 7; all four can be tracked as P2 follow-ups)

The bugfix batch introduces no new security risk. Supply chain is clean for the newly-introduced `framer-motion` and its transitive deps. Existing security boundaries (auth, RLS, server validation, escaping) are untouched. No PII, no secret leakage, no XSS / CSRF surface, no race conditions detected.

**Recommendation to main agent:** PROCEED to Phase 7 (E2E / UI testing). No fix-first sub-agent spawn required.

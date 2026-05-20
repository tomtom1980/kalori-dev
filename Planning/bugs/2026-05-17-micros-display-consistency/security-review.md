# Security Review — Bug Bundle 2026-05-17-micros-display-consistency

## Scope reviewed

Display-layer batch only. No new mutations, API endpoints, authn/authz, or PII flows.

Production files (8):
- `lib/nutrition/display-micros.ts` — new `sortAndFilterMicrosByRdaPct` helper; `microStatus` now returns `'unknown'` for `rda === null || rda === 0` (was `'low'`)
- `lib/dashboard/aggregate.ts` — adopts shared helper; `includeUnknownRda: true` (was `pct < 1` continue-filter)
- `lib/dashboard/types.ts` — `MicroStatus` enum extended to 5-tuple (`'low' | 'mid' | 'good' | 'over' | 'unknown'`)
- `app/(app)/log/_components/ConfirmationScreen.tsx` — `useState` lazy-init pins editable sort order; live amounts still bind to `row.item.micros`
- `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx` — single unified list driven by helper; sodium no longer pinned, canonical-key dedup preserved
- `components/dashboard/MicronutrientPanel.tsx` — NOT touched (only the renderer subcomponents below)
- `components/dashboard/MicrosOverflowToggle.tsx` — extends `FILL_COLOR` / `PCT_COLOR` records with `'unknown'`; new `MeterContent` branch (em-dash placeholder + `barFillScale = 0`); new `Row` aria branch (`rowAriaLabelUnknown` template)
- `components/dashboard/MicroBreakdownDialog.tsx` — extends `MICRO_TEXT_COLORS` record with `'unknown'` → `var(--color-dust)`
- `lib/i18n/en.ts` — 3 new keys: `pctUnknownLabel`, `rowAriaLabelUnknown`, `statusUnknown`

Test files (~6) reviewed for parity, no security impact.

## Findings by category

1. **Input validation** — N/A. No new inputs or schemas. `formatMicroPercent` already guards `Number.isFinite(value)` and `rda > 0`. Helper partition handles `pct === null` explicitly.
2. **Authn / Authz** — N/A. No auth surfaces touched. Aggregation reads only the authenticated user's own `weekEntries`, unchanged.
3. **PII handling** — Nutrient amounts per food item are not PII (calorie tracker context). `formatAmountForAria` emits numeric strings (integer or `toFixed(1)`) — no user-identifiable content leaks to `aria-label`.
4. **Injection vectors** — Clean. All new i18n strings are interpolated via `String.prototype.replace('{token}', value)` into JS strings that are then passed to React JSX text nodes (`{pctLabel}`) and JSX attribute values (`aria-label={valueText}`, `aria-valuetext={valueText}`). React auto-escapes both contexts. `row.name`, `row.unit`, `formatAmountForAria(row.consumed)` all originate from either DB-stored food entries (already-stored) or the closed-allowlist `DISPLAY_NAME_TO_UNIT` map.
5. **Secret leakage** — N/A. No env vars, tokens, or credentials touched.
6. **XSS / CSRF** — Raw-HTML injection sinks are absent from every touched file and from the entire `components/dashboard/`, `app/(app)/library/`, and `app/(app)/log/` trees (verified via Grep for unsafe innerHTML props). The em-dash `'—'` literal in `pctUnknownLabel` is a plain Unicode codepoint (U+2014), not HTML — rendered as text. CSRF N/A — no state-changing operations added.
7. **Race conditions** — The `useState(() => …)` lazy initializer in `ConfirmationItemMicros` snapshots `DEFAULT_MICROS_LIST + initial micros` exactly once at mount, which is the documented React idiom for "compute once, never recompute" (see React 19 `useState` docs). Parent re-renders that mutate `row.item.micros` cannot replace the snapshot — only an unmount/remount cycle (e.g. `rowId` change) would, and that's the intended reset trigger. The displayed `display` value reads from live `micros` via `(micros as Record<...>)[micro.code]`, so user keystrokes still propagate; only iteration ORDER is frozen. No race. Note: if a future change adds a dependency requiring re-snapshot, a `useEffect` cleanup or `useMemo([rowId])` would be required — but for the current contract (per-mount snapshot), the implementation is correct.
8. **Open redirects** — N/A. No navigation surfaces touched.
9. **Resource exhaustion** — Row count bounded by canonical `DEFAULT_MICROS_LIST` (30 entries) for Surface B (`ConfirmationItemMicros` iterates `DEFAULT_MICROS_LIST` directly). Surface A (dashboard) iterates `weekEntries[].items[].micros`, where each item's `micros` is a user-owned DB JSON object — a malicious item with 100+ micro keys would be authored only by the authenticated user themselves (no adversary path) and would be O(items × micros) memory at worst. Helper does ONE sort over the partitioned arrays — O(n log n). No recursion, no unbounded growth, no DOS surface. Surface C (`FoodDetailMacros`) iterates `allMicros` from a single Food row — same bounds. RDA-unknown rows from canonicalKey misses pass through but cannot multiply (one row per unique key).
10. **Type safety** — `MicroStatus` extension to 5-tuple is enforced exhaustively: (a) `statusWord` switch covers all 5 cases; (b) `FILL_COLOR`, `PCT_COLOR`, `MICRO_TEXT_COLORS` are typed `Record<MicroStatus, string>` — TypeScript compile-fails if any union member is missing; (c) all other branches use discriminated `row.status === 'unknown'` checks with explicit fallthrough. No `default` branches that could mask a missing case. Production typecheck reported clean (state.md line 83). No untyped status comparisons across the touched files.

## Severity summary

- Critical: 0
- High: 0
- Medium: 0
- Informational: 0

## Recommended actions

None. Batch is clean. The display-layer changes do not expand the attack surface in any category. The lazy-`useState` snapshot pattern in `ConfirmationItemMicros` is defensible and matches React 19 idioms; documented in the inline comment (already done at lines ~1641–1670 of `ConfirmationScreen.tsx`).

Working-tree note: per `state.md` lines 96–98, the working tree carries unrelated concurrent-session changes (`useFoodDetailEdit.ts`, nav components, `globals.css`, etc.) that are explicitly OUT OF SCOPE for this batch. The Phase 8 commit MUST stage only the 8 production files + ~6 test files listed in this review, per the existing isolation directive in state.md. This is a process note, not a security finding.

Advance to Phase 7 (E2E + visual baseline refresh).

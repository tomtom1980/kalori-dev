# Security Review — Bug Bundle 2026-05-17-mobile-bottom-nav

**Reviewer:** security-review sub-agent
**Date:** 2026-05-17 04:08 GMT+7
**Round:** 1 (mandatory single round; no Critical/High found → no round 2)
**Scope:** uncommitted working-tree diff vs `HEAD` (b51cad1)

## Scope reviewed

- `components/nav/primary-destinations.ts` — added `icon: LucideIcon` field + 4 static lucide imports (LayoutDashboard / BookOpen / LineChart / Settings)
- `components/nav/bottom-tab-bar.tsx` — render `<Icon>` above label; removed inline `style.color`; added `className="kalori-bottom-tab"` + `data-active` attribute
- `app/globals.css` — added `.kalori-bottom-tab` rule block (3 cascading rules: default dust / `[data-active='true']` ivory / `:focus-visible` ivory)
- `tests/components/nav/bottom-tab-bar.test.tsx` — 11 new test cases (icon presence, ARIA, DOM order, cascade contract, regression guards, CSS contract via `fs.readFileSync`)

**Aggregate diff size:** ~11 KB (well within Codex budget; no split needed for a security pass).

**Concurrent-session check:**
- `git status` shows exactly the 4 expected modified files + the 3 expected untracked paths (`.lighthouseci/`, `tests/unit/components/log-flow/ConfirmationItemMicros.test.tsx`, `tests/unit/lib/dashboard/canonical-micro-unit.test.ts`). No unexpected files.
- All 3 bug-1 source files present on disk and contain the post-fix content. No stash interference detected during this review.

## Findings by category

### Input validation
**N/A — no user-input code path in diff.** All new values (`icon`, `data-active`, `className`) are derived from compile-time-static sources: `LucideIcon` component references imported from `lucide-react`, internal boolean `isRouteActive(destination.href, pathname)`, and a string literal class name. No new validation surface; no existing validation weakened.

### Authn/Authz
**N/A — no auth changes.** The diff does not touch session, JWT, RLS, route guards, or middleware. `<BottomTabBar>` is a stateless rendering component that takes `pathname: string` as its only prop and emits Next.js `<Link>` elements. No privilege boundary altered.

### PII handling
**N/A — no logging, no error messages, no PII surface.** No `console.*`, no `Sentry.captureException`, no error rendering that could echo user input. Tab labels (`shortLabel`) come from `@/lib/i18n/en` — static translation strings, no PII.

### Injection vectors
**N/A — no string interpolation into DOM-execution sinks.** lucide-react icons render fixed `<svg>` markup from compile-time path data. `className`, `data-active`, `aria-current`, and `style` are React-handled bindings (auto-escaped). No SQL, NoSQL, command, template, or prompt-injection surface. No raw-HTML escape hatches introduced or extended. Note: `data-active={active ? 'true' : 'false'}` is a literal ternary on a strict-boolean — string contents are bounded to two known values, safe for CSS attribute-selector matching.

### Secret leakage
**N/A — no secrets or env-var access in diff.** No `process.env.*`, no `sb_secret_*`, no Sentry DSN, no API keys, no tokens. CSS color variables (`--color-dust`, `--color-ivory`, `--color-oxblood`) are public design tokens, not secrets.

### XSS / CSRF
**N/A — no user-string HTML rendering.**
- lucide-react `<Icon>` components emit inline `<svg>` from hardcoded path data; the props passed (`aria-hidden="true"`, `focusable="false"`, `width={22}`, `height={22}`, `strokeWidth={1.75}`, `style={{ pointerEvents: 'none' }}`) are all primitive literals.
- `tab.children` are: (a) the static `<Icon>` element, (b) `destination.shortLabel` (i18n string constant). Neither carries user-supplied content.
- No raw-HTML-injection escape hatches used (no `innerHTML` writes, no string-template HTML construction, no React unsafe-HTML props).
- The test file uses `readFileSync` on a fixed compile-time path (`app/globals.css`) — read-only, no traversal risk, no untrusted input.
- No CSRF surface since no mutation, no form, no fetch, no cookie/header manipulation.

### Race conditions
**N/A — pure synchronous rendering.** No state hooks, no effects, no concurrent fetches, no shared mutable state, no cache, no event-loop sequencing. `<BottomTabBar>` is a stateless function component that returns JSX deterministically given its `pathname` prop. No tearing risk, no double-submit risk, no cache-invalidation surface.

### Open redirects
**N/A — `href` values are static and internal.** Each `<Link>` reads `href={destination.href}` where `destination.href` is sourced from the `PRIMARY_DESTINATIONS` array declared `as const readonly` at module scope in `components/nav/primary-destinations.ts`. The 4 hrefs are compile-time string literals: `/dashboard`, `/library`, `/progress`, `/settings` — all internal, all relative, all start with `/`, none accept user input. Next.js `<Link>` is a client-side router primitive that does not perform external redirects. No way for an attacker to inject an `href` here without a separate code-modification step.

## Severity summary

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Informational:** 0

## Recommended actions

**None.** The diff is presentation-layer UI code with no security-relevant surface. All 8 OWASP-style categories return N/A on inspection.

**Verdict:** Clean. Advance to Phase 7 E2E + visual regression with no fixes required.

## Notes for downstream phases

- Phase 7 (E2E) should add the deferred Playwright assertion for keyboard-Tab focus-visible color flip on inactive bottom-tab (tracked as `R2-playwright-focus-paint` in `pending_minor_findings`). This is a verification gap, not a security finding.
- Phase 8 (lessons append) — no security-pattern lesson to record from this batch; the relevant lessons (CSS cascade priority for state contracts, concurrent-session stash recovery) are functional/process lessons already captured in `last_completed_action`.

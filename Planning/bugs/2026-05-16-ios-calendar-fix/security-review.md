# Security Review — batch 2026-05-16-ios-calendar-fix

**Reviewer:** bugfix-tomi security sub-agent
**Date:** 2026-05-16T18:47:00+07:00 (UTC: 2026-05-16T11:47:00Z)
**Scope:** Aggregate uncommitted diff for the three in-scope files only:
- `components/dashboard/DashboardDateControl.tsx`
- `tests/unit/components/dashboard/DashboardDateControl.test.tsx`
- `app/globals.css`

Pre-existing dirty-tree files excluded per briefing.

---

## Severity counts

- Critical: 0
- High: 0
- Medium: 0
- Informational: 2

---

## Findings

_No findings of Medium+ severity. Diff is purely UI restructuring (replacing a sibling-button + hidden-input + `showPicker()` shim with a single overlaid native `<input type="date">`). No new input flow, no new auth surface, no new outbound network calls, no new outbound IPC, no new event handlers, no new state, no new permissions surface, no new data persistence path._

### Per-class verification

**1. Input validation — PASS**
- `goToDay()` still calls `isIsoDay(day)` as its first guard (line 56 of new file): `if (!isIsoDay(day)) return;` — the regex `/^\d{4}-\d{2}-\d{2}$/` is unchanged. A malicious typed value (e.g., `../../etc/passwd`, `'; DROP TABLE`, `?evil=1`) would fail the regex and be silently dropped before reaching `router.push()`.
- The `max={today}` attribute is preserved on the input. The future-date guard `if (day > today)` remains intact in `goToDay()`.
- **Server-side validation confirmed at `app/(app)/dashboard/page.tsx`** lines 64-72: `isIsoDay(value)` performs both a regex match AND a real-`Date` round-trip check (rejects `2026-02-30`, `2026-13-01`, etc.), then line 102-105 clamps any future date back to `today` and falls through to `today` if validation fails. The server does NOT trust the client value blindly.

**2. authn / authz — PASS**
- No change to auth surface. `app/(app)/dashboard/page.tsx` still calls its existing `requireProfileOrRedirect`/auth fence upstream of the searchParams parsing. The date input cannot bypass auth — it just navigates to the same dashboard route which is already gated.

**3. PII handling — PASS**
- No new logs, no new Sentry breadcrumbs, no new analytics events added by the diff. The aria-label uses the existing `t.dashboard.date.pickerA11y` i18n key. No user input is echoed into observability streams.

**4. Injection vectors — PASS**
- Date value flows: `<input value={viewedDay}>` (controlled, React-escaped) → `onChange` → `goToDay()` → `isIsoDay()` regex guard → `router.push('/dashboard?day=${day}')`. The regex guard makes URL-injection mathematically impossible (only `[0-9]{4}-[0-9]{2}-[0-9]{2}` shapes pass).
- CSS uses only static `var(--color-ivory)`, `var(--color-oxblood)`, `var(--motion-micro)`, `var(--ease-editorial)` tokens. No user input flows into CSS.
- No SQL / NoSQL / shell / template / prompt injection paths added.

**5. Secret leakage — PASS**
- Zero env vars, tokens, keys, or credentials in the diff. All strings are static UI text or design-token references.

**6. XSS / CSRF — PASS**
- `viewedDay` is a server-derived prop (re-validated by `isIsoDay` server-side per finding 1). React escapes the controlled `value` attribute. No raw-HTML insertion APIs are used, no `eval`, no template-literal injection into HTML attributes.
- The date input is a controlled component, not a form submission — no CSRF surface added.

**7. Race conditions — PASS**
- `disabled={isLoading}` is set directly on the actual `<input type="date">` (not on a proxy button as before). A native disabled `<input>` will NOT open the iOS system picker — the browser refuses the gesture at the browser layer, which is stricter than the old proxy-button + early-return-on-`!inputRef.current` pattern.
- The `useDashboardDateTransitionStore` gates `isLoading` from the `loadingDay` selector. A rapid double-tap on the input while `isLoading=true` would be ignored by the browser's native disabled-input handling. Once a date IS selected, `goToDay()` also re-checks `if (day === viewedDay || isLoading) return;` as a JS-level safeguard — defense in depth.
- A synthetic `showPicker()` JS call could in theory bypass the `disabled` attribute on some browsers, but the new code DELETES the only call site of `showPicker()`. The new locked-in test "does not call HTMLInputElement.showPicker during a wrapper click" (test file line ~135) regression-locks this contract.

**8. iOS-specific security considerations — PASS**
- The `opacity: 0; pointer-events: auto; color: transparent` pattern makes the native input invisible-but-tappable within a clearly-bordered 44×44 wrapper that is itself decorated with a visible CalendarDays icon overlay. This is the standard accessible "visually hidden input over icon" pattern (used by `WeightQuickAdd.tsx` and `Confirmation/TimeEditor.tsx` per the briefing).
- **Clickjacking review:** The invisible input is confined to a 44×44 box that the user visually identifies via the calendar icon. The user understands they are tapping a calendar control. There is no overlay rendered above unrelated content. The worst-case "unintended day navigation" is a no-data-write action (just changes `?day=` query) — read-only navigation on an already-auth-gated route. Low risk, acceptable.
- The `type="date"` input opens the iOS wheel picker which requires explicit user confirmation via "Done" — the user cannot accidentally submit a date.

**9. Reduced motion / a11y as security — PASS**
- The new CSS transition is on `border-color` only with `var(--motion-micro)` (a design-token-controlled duration). The existing site-wide `@media (prefers-reduced-motion: reduce)` block (visible at end of globals.css) applies. No new transform or opacity animation that bypasses motion preferences was added.
- Focus-within ring (`outline: 2px solid var(--color-ivory)`) provides keyboard reachability — the previous proxy-button keyboard path is replaced by direct focus on the input, which is a stricter a11y guarantee since the operable element IS the input.

---

## Informational observations

**INFO-1 — Inline `outline: none` on the date input may bypass site-wide focus indicators.**
- File: `components/dashboard/DashboardDateControl.tsx`
- Inline style on the `<input type="date">` includes `outline: 'none'`. This is intentionally overridden by the `.kalori-dashboard-date-trigger:focus-within` rule in `app/globals.css` which paints the focus ring on the WRAPPER instead. The pattern is correct as implemented, but a future refactor that splits the input out of the wrapper would silently lose keyboard focus indication.
- Recommended (defer to a later UI polish pass, not blocking): replace `outline: 'none'` on the input with the `:focus-visible` cascade or add a comment near the inline style pointing at the wrapper rule.
- Severity: Informational. Not blocking.

**INFO-2 — `cursor: 'wait'` on an `opacity: 0` input is invisible to the user.**
- File: `components/dashboard/DashboardDateControl.tsx`
- The input has `cursor: isLoading ? 'wait' : 'pointer'`, but since the input is fully transparent and overlaid on a wrapper that also sets its own `cursor: isLoading ? 'wait' : 'pointer'`, the input's cursor is functionally dead-code (the wrapper's cursor wins via stacking). Not a security issue, just dead CSS.
- Severity: Informational. Not blocking.

---

## Verdict

**approve**

Zero Critical/High/Medium findings. The diff is a defensive UI restructuring that REMOVES a code path (the `showPicker()` shim and proxy-button click handler) rather than adding one. Input validation is preserved at three layers: client regex (`isIsoDay` in `goToDay`), HTML `max` attribute, and server-side `isIsoDay` + future-date clamp in `app/(app)/dashboard/page.tsx`. The new `disabled`-on-input contract is stricter than the previous proxy-button disabled contract because the browser enforces disabled-input picker suppression at a lower layer than React. The two informational items are CSS-hygiene observations, not security findings.

## Notes

- The diff REMOVES `useRef` and the entire `openPicker()` function — a net reduction in attack surface (one fewer programmatic DOM-control path).
- The new locked-in tests "does not call HTMLInputElement.showPicker during a wrapper click" and the geometry-guard test (Codex round-1 I-1 closeout) provide regression locks against re-introducing the bug shape or shrinking the input back to a non-tappable 1×1 box.
- Codex round-2 was blocked by external OpenAI quota (per state.md `codex_round_2: blocked_external_quota`); this security review serves as an independent reviewer pass alongside the round-1-only Codex outcome. Round 1's only finding (I-1 geometry guard) was already auto-fixed and closed.
- No coupling to upstream Supabase/Vercel/Sentry surfaces introduced; no env-var dependency added.

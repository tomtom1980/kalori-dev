# US-STAB-C5 — Evidence narrative

> Task C.5 — `Confirmation.TimeEditor` compound child + 30-day backfill Zod
> refinement (F-VERIFY-203 fix).

Story: **AS a user logging a meal retroactively, WHEN I open the Confirmation
screen and adjust the time, THEN I can pick any timestamp from the last 30
days (default `now()`); the server accepts it and rejects anything older than
30 days.**

The spec at `tests/e2e/web/user-stories/US-STAB-C5.spec.ts` exercises all 5
ACs end-to-end against the running app. Per the Click-Through Mandate, every
AC uses real user actions (`page.fill`, `page.click`, `page.evaluate` for
direct server-contract probes on AC3 / AC4) and asserts against rendered DOM
post-action, NOT against URL alone.

## AC mapping

| AC                                | What it proves                                                                                                                                                                                                                                                                           | User action                                                                                                     | Post-action assertion                                                                                                         | Screenshots                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **AC1** default-now-and-renders   | TimeEditor visible inside the Confirmation compound with default value within 1s of now                                                                                                                                                                                                  | `type-tab-textarea` fill → `type-tab-parse-button` click                                                        | `confirmation-time-editor-input` value matches `YYYY-MM-DDTHH:mm` AND parsed UTC ms ∈ [before-90s, after+90s]                 | `ac1-01-initial.png` (log page) / `ac1-02-result.png` (Confirmation with TimeEditor)          |
| **AC2** backfill-5-days-persisted | Picking 5 days ago round-trips through save() into the request body's `logged_at`                                                                                                                                                                                                        | `confirmation-time-editor-input` `fill(local-5-days-ago)` → `confirmation-save` click                           | Outgoing `/api/entries/save` request body captured via `page.on('request')`; `logged_at` UTC ms within ±5 minutes of intended | `ac2-01-initial.png` (Confirmation pre-pick) / `ac2-02-result.png` (modal closed, save fired) |
| **AC3** rejects-31-days-past      | Server returns 400 + `{error:'logged_at_too_old'}` for 31-days-past `logged_at`. Reproduces F-VERIFY-203 step (d).                                                                                                                                                                       | `page.evaluate(fetch('/api/entries/save', {logged_at: 31d-ago}))` from inside the authenticated browser context | Response status 400 + body `error === 'logged_at_too_old'`; rendered evidence banner injected into the DOM                    | `ac3-01-initial.png` (log page) / `ac3-02-result.png` (rejection banner visible)              |
| **AC4** accepts-exactly-30-days   | Boundary case is inclusive — exact `now() - 30d` is accepted (200) + inserted                                                                                                                                                                                                            | `page.evaluate(fetch('/api/entries/save', {logged_at: exactly-30d-ago}))`                                       | Response status 200 + body `entry.id` truthy; rendered evidence banner visible                                                | `ac4-01-initial.png` (log page) / `ac4-02-result.png` (acceptance banner visible)             |
| **AC5** ledger-tokens-applied     | TimeEditor's computed `border-radius` matches its sibling `Confirmation.SaveToLibraryToggle`. Per briefing §5 reconciliation rule: the local visual context (Ledger zero-radius today) IS the contract, NOT a hardcoded literal. Auto-tracks a future Confirmation-wide token migration. | `type-tab-textarea` fill → `type-tab-parse-button` click                                                        | `getComputedStyle(editor).borderRadius === getComputedStyle(sibling).borderRadius`                                            | `ac5-01-initial.png` (log page) / `ac5-02-result.png` (Confirmation showing both controls)    |

## Anti-pattern avoidance

- **No `goto → toHaveURL` smoke tests.** Every AC has either a real
  user-action click + rendered-DOM assertion (AC1 / AC2 / AC5) or a direct
  server-contract probe with a rendered evidence banner (AC3 / AC4 — the
  bug being fixed is a server contract gap; the AC's "rejection" / "accept"
  cannot be inferred from any pre-fix UI surface).
- **No reliance on dashboard read-back for AC2.** The original AC test plan
  in the briefing suggested asserting the new entry on `/dashboard?date=...`.
  That couples the AC to the dashboard cache invalidation path (deferred
  followups F-UI-3.5-10), so AC2 instead asserts the OUTGOING request body
  directly via `page.on('request')`. The save round-trip + modal close is
  the user-visible THEN; the body capture confirms the picked value did NOT
  get silently overwritten to `now()`.
- **Sibling-token alignment is sibling-relative, not literal.** AC5 reads
  computed styles from BOTH controls and asserts equality, NOT a hardcoded
  `'0px'`. This survives the eventual Confirmation-wide token migration
  intact.

## Out-of-band E2E execution rule

This spec follows the project's E2E Test Execution Isolation rule: the spec
is parsed + typechecked here, but actual browser-run execution happens in a
dedicated E2E sub-agent dispatched by the main agent after Phase 3 review.
The Phase 2 implementation sub-agent does NOT run Playwright directly.

## Cross-references

- Origin bug: `Planning/features/2026-05-01-mvp-stabilization/verification-report.md` §F-VERIFY-203 (P1).
- PRD contract: `Planning/PRD.md` §3.5 + §6 (backfill horizon: 30 days).
- Unit tests: `tests/unit/log/confirmation-time-editor.test.tsx`.
- Integration tests: `tests/integration/entries-save-30day-window.test.ts`.
- Implementation: `app/(app)/log/_components/Confirmation/TimeEditor.tsx` +
  `app/(app)/log/_components/ConfirmationScreen.tsx` reducer extension +
  `app/api/entries/save/route.ts` parallel imperative guard.

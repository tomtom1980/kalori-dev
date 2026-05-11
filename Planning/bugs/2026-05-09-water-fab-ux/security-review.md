# Security Review — Bug Bundle 2026-05-09-water-fab-ux

## Findings

### Critical (count: 0)

_None._

### High (count: 0)

_None._

### Medium (count: 3)

#### M1 — `authPost` has no timeout/abort; permanent FAB latch lockout under stalled network

- **File / line:** `components/nav/nav-shell.tsx:184-267` (`handleLogWater`); `lib/auth/refresh-interceptor.ts:143-197` (`authFetch` / `authPost`).
- **Issue:** The IIFE's `try/finally` guarantees `isFiringRef.current = false` only when the `await authPost(...)` promise either resolves or rejects. `authPost` does not pass an `AbortSignal` and the underlying `fetch` has no timeout, so a network stall (TCP RST without RST, mobile dead-zone, captive-portal hijack, slowloris-style server hang) holds the latch indefinitely. Worse: the optimistic success toast was already pushed synchronously and self-heals at TTL=2 s, so the user sees "logged" → taps again expecting feedback → tap is silently swallowed by the latch. Combined with the optimistic toast, this *amplifies* the original re-tap UX problem under network failure (the very condition the latch is supposed to defend against).
- **Why Medium not High:** Same-origin authenticated user, no data leak, no privilege escalation. The user can recover by reloading the tab. The FAB is one of two log entries (chip path is unaffected). But abuse vector exists: a slow-server-side denial keeps the FAB dark while toasts pretend writes succeeded — falsifies the batch's stated "truthful feedback" premise under exactly the failure mode the redesign was aimed at.
- **Recommended fix:** Wrap the `authFetch` call in an `AbortController` with `~10s` timeout. On abort, run the same catch path (`dismiss(clientId)` + error toast). Resets `isFiringRef` via `finally`. This is also the right shape for the followup. Prior-batch observation already flagged this pattern; the new optimistic-toast layer raises the user-visible cost.
- **Severity rationale:** Bounded to the FAB; recoverable; pre-existing infra gap. Not a Critical because no cross-user / data-integrity surface; not Informational because the optimistic toast actively misleads the user during the exact failure the latch was designed to handle.

#### M2 — Rate limiting absent on `/api/water/log` while optimistic UI hides spam-tap

- **File / line:** `app/api/water/log/route.ts` (entire route).
- **Issue:** No server-side rate limit (no `@upstash/ratelimit`, no Vercel Edge throttle, no in-DB token bucket). With idempotency keyed on `client_id`, a malicious authenticated client can mint a fresh UUID per request and hit the route at full TCP throughput, each call triggering: 1× `auth.getUser()`, 1× orphan-profile fence SELECT, 1× deleting-fence SELECT, 1× pre-insert SELECT, 1× INSERT, 1× SUM aggregation, 1× `revalidateTag`. The new SUM aggregation adds an additional read per call. Scoped per-user, so worst case is self-DoS plus quota burn on Supabase.
- **Why Medium not High:** Authenticated, single-user app (per CLAUDE.md), no cross-user blast radius. SUM scans a `(user_id, date)` index and is bounded to ~12 rows per user-day. Pre-existing issue (flagged in prior batch's security review per the briefing); this batch *amplifies* it because the optimistic toast now hides the per-tap latency, encouraging spam-tap that doesn't visually backpressure.
- **Recommended fix (followup, not blocking):** Add Upstash Redis rate limit at `~6 req/min` per `user_id` on `/api/water/log` (matches realistic worst-case logging cadence: 8 glasses + corrections). Defer to a dedicated security-hardening pass.
- **Severity rationale:** Authenticated abuse only, per-user blast radius, additional read per call but bounded. Re-flagged from prior batch with raised priority due to optimistic-toast amplification.

#### M3 — `computeDayTotalMl` failure swallowed without observability hook; client falls back to local prediction

- **File / line:** `app/api/water/log/route.ts:151-171`.
- **Issue:** When the SUM SELECT errors, the helper returns `null` and the route returns `200 OK { row, totalMl: null }`. The TODO-style comment ("Sentry/observability: non-fatal — caller falls back. Log path retained for ops visibility; intentionally NOT throwing…") explicitly *plans* a Sentry hook but does not wire one. Effect: a Postgres connection blip / RLS misconfig / index regression that breaks the SUM read silently degrades the chip into local-prediction mode for every authenticated user, with no alerting. The chip's fallback path also intentionally drops the resetKey discriminator, so a recurring SUM failure could re-introduce double-count regressions invisibly. The defense-in-depth case for *deferring* the Sentry hook is weak because the log message would be `error.message` only (no PII; user_id is server-side context already attached).
- **Why Medium not High:** No data leak; no exploit vector. Loss is purely observability. The SUM helper failing is statistically rare. The client-side fallback is documented and safe in isolation.
- **Recommended fix (followup, low priority):** Add `Sentry.captureMessage('water_log.sum_failed', { extra: { code: error?.code, message: error?.message } })` in the `if (error || !data)` branch. Avoid logging row data.
- **Severity rationale:** Operational gap, not a security gap; surfaced because the comment explicitly anticipates the hook. No PII risk in the proposed log content. Per-batch convention M3 is acceptable as Informational, but the *interaction with the resetKey-discriminator drop* makes the silent-fallback regression-masking risk material → Medium.

### Informational (count: 5)

#### I1 — SUM query uses parameterized `.eq()` syntax — no SQL injection surface

`computeDayTotalMl` filters via `supabase.from('water_log').select('count, unit').eq('user_id', userId).eq('date', date)`. Both `userId` (server-derived from `auth.getUser()`) and `date` (Zod-validated `^\d{4}-\d{2}-\d{2}$`) flow through PostgREST's parameterized predicate construction. No string concatenation, no template literal, no raw SQL — injection-immune. Defense in depth via RLS `water_log_select_own` (`auth.uid() = user_id`) means even a query-construction bug could not cross-user leak.

#### I2 — `totalMl` rendered via React `{}` interpolation — XSS-safe

`<span>{consumedMl}</span>` and `<span>{eyebrowRight}</span>` in `WaterTracker.tsx` use JSX expression interpolation. React auto-escapes string children; `consumedMl` is a number. No raw-HTML injection sinks (no `innerHTML` access, no `eval`, no `dangerously*` opt-outs). A compromised server returning a malicious `totalMl` payload (e.g., `<img src=x onerror=...>`) could not execute JS in the chip context.

#### I3 — `typeof response?.totalMl === 'number'` correctly excludes NaN/Infinity at the gate, but only by accident

The success-path guard `if (typeof response?.totalMl === 'number')` accepts `NaN`, `Infinity`, and negative values because they all `typeof === 'number'`. Server-side `mlFromWaterRow` cannot produce them under normal flow (`count: z.number().int().positive().max(200)` blocks negatives at insert; `unit` is enum-checked; SUM of valid integer multiplications is finite). But there is no client-side `Number.isFinite(response.totalMl) && response.totalMl >= 0` guard, so a compromised/MITM response could surface a wildly wrong value. **Defense:** add `Number.isFinite(response.totalMl) && response.totalMl >= 0` to the guard. Low priority — TLS + Vercel + RLS makes this a paranoid layer, not a real exploit. Track as defense-in-depth.

#### I4 — `UndoBroadcastChannel` envelope is unsigned; same-origin trust boundary is correct but worth documenting

`useUndoQueueStore`'s `dismiss` broadcast posts `{ type: 'dismiss', clientId, originTabId }` over `BroadcastChannel('kalori-undo')`. Receivers match purely on `clientId` to drop entries from their local stack. The `originTabId` echo-suppression is plain string comparison — there is no signature, nonce, or HMAC. **This is correct** because BroadcastChannel is same-origin-only by browser policy, so an attacker cannot post messages without already controlling JS in the same origin (in which case they have full DOM access and the toast surface is the least of the user's problems). Worth flagging because the comment chain hints at the assumption without documenting it. The receiver in `useUndoQueueStore.cross-tab.ts:71-77` correctly type-guards inbound messages and bails on missing/wrong fields, so a malformed message cannot crash the chip. Worst case: a same-origin XSS could mass-dismiss toasts in sibling tabs, hiding evidence of a parallel exploit — but at that point the attacker already owns the tab.

#### I5 — `client_id` (UUID v4) and `loggedOn` (date) carry low PII risk in error paths

The `catch` branch in `nav-shell.tsx` calls `useUndoQueueStore.getState().pushToast({ description: t.fab.waterLoggedFailed, ... })` with a static i18n string — no error message, no payload, no stack trace echoed to UI. Sentry capture (if eventually wired per M3) would carry: `client_id` (UUID v4 minted client-side; not joinable to auth.users) and `logged_on` (calendar date in user's TZ; mildly identifying as a per-day timestamp). Neither is high-risk. The error toast copy `t.fab.waterLoggedFailed` is a static string — does not echo user input. SessionExpiredError path no longer leaks "logged" feedback for a 401'd write (this batch's C2 fix); confirmed safe.

## Summary

Three Medium findings, no Critical/High. **M1** (no `authPost` timeout) and **M2** (no rate limit) are pre-existing infrastructure gaps amplified by the new optimistic-toast UX — track as security hardening followups; do not block this batch. **M3** (silent SUM failure without Sentry) is a low-priority operational gap with material *regression-masking* risk because the chip's fallback path drops the resetKey discriminator. The new SUM query is correctly user-scoped via `.eq('user_id', userId)` plus RLS defense-in-depth, the `totalMl` field is React-XSS-safe, and the cross-tab dismiss envelope's same-origin trust boundary is correct (browser-enforced). **Verdict: proceed-clean to Phase 7. No security re-fix round required.**

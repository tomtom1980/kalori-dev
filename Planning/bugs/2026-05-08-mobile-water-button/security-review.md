# Security Review — Bug Bundle 2026-05-08-mobile-water-button

**Reviewer:** Phase 6 security sub-agent (independent of Codex production-code review)
**Date:** 2026-05-09 01:19 GMT+7
**Scope:** Aggregate uncommitted diff across files listed in `state.md` `bugs[0].files_touched`
**Methodology:** Direct read of every file in the security surface (small enough to fit in-context), checklist-based assessment per the 8 categories supplied by the orchestrator brief.

---

## Findings

### Critical (count: 0)

_None._ No exploit paths were identified that allow unauthenticated abuse, cross-user data access, secret leakage, or injection.

### High (count: 0)

_None._ No authenticated abuse paths produce material harm beyond what the existing `/api/water/log` exposure already permits (this bundle does not change the API; it only changes who can call it from where).

### Medium (count: 2)

#### M1 — `/api/water/log` has no rate limiting; mobile water FAB makes spam-tap easier
**File / line:** `app/api/water/log/route.ts:43-122` (no rate-limit middleware)
**Issue:** The POST handler enforces validation, RLS, and the orphan/deleting fences, but performs no per-user rate limiting. A malicious or compromised client can fire hundreds of `client_id`-distinct requests per second; each one hits Supabase with an INSERT (or a SELECT-then-INSERT). The new mobile water FAB (`components/nav/nav-shell.tsx:312-315`) makes this trivially reachable from a single tap on every authenticated route, where previously the only entry point was the `WaterTracker` chip on `/dashboard`. Per-tab `isFiringRef` re-entrancy gating prevents only one logical tap per tab; a script-driven attacker can bypass this by mounting multiple tabs or by directly POSTing through `authPost`.
**Severity rationale:** Bounded — RLS limits writes to the attacker's own row set, so this is DoS / data-pollution against the attacker's own account, not cross-user impact. Worst-case scenarios: (a) attacker inflates their own water_log to skew the dashboard heatmap (cosmetic — affects only their UI); (b) attacker performs Supabase quota exhaustion by spamming the project's POST budget (real cost concern given Hobby tier RPC limits). NOT exploitable for cross-user privilege or data harm.
**Pre-existing or new:** PRE-EXISTING for the API surface; MARGINALLY AMPLIFIED by the bundle because the FAB is now reachable from every `(app)` route (not just `/dashboard`). The bundle does not introduce the vulnerability; it widens its surface from one tap target to two.
**Recommended fix (defer to followup):** Add per-user rate limit (e.g., ≤30 inserts/min for `/api/water/log` via a Redis/PG counter or Vercel Edge Config). Track as `F-WATER-LOG-RATE-LIMIT-2026-05-09` in `Planning/followups.md`. Do NOT block this bundle on it — the amplification is incremental and the underlying API has shipped without rate limits since Task 3.5.

#### M2 — `logged_on` accepts any client-supplied date matching the regex; no past/future bounds
**File / line:** `app/api/water/log/route.ts:39` — Zod schema is `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`
**Issue:** The server accepts any past or future date that matches `YYYY-MM-DD`. A user (or a tampered client) can POST `logged_on: '2099-12-31'` or `logged_on: '0001-01-01'` and the row will be inserted with that date. The bundle moves `logged_on` derivation client-side via `userTzToday(timezone)` (`components/nav/nav-shell.tsx:176`), making it tamperable through dev tools, a custom client, or an extension that monkey-patches `fetch`. The chip on `/dashboard` already had this property — the bundle does not introduce client-side `logged_on` derivation, but it normalizes the pattern in a second place.
**Severity rationale:** Bounded — RLS restricts writes to the attacker's own rows; the attack only pollutes the attacker's own dashboard/progress views. NOT exploitable for cross-user or admin impact. The Codex R1 column-rename fix (the original critical) addressed the WRONG-DAY-FOR-CORRECT-USER scenario; this finding addresses the INTENTIONAL-WRONG-DAY scenario. Both have the same blast radius (attacker's own row set).
**Pre-existing or new:** PRE-EXISTING. The chip has had this same shape since Task 3.5. The bundle inherits it.
**Recommended fix (defer to followup):** Add server-side bounds check in the route — reject `logged_on` more than 24h in the future OR more than 7 days in the past. Track as `F-WATER-LOG-LOGGED-ON-BOUNDS-2026-05-09`. Do NOT block this bundle on it — the bundle does not regress the surface.

### Informational (count: 4)

#### I1 — `mintClientId` falls back to `Math.random` when WebCrypto is unavailable
**File / line:** `lib/water/client-id.ts:13-22`
**Observation:** When `crypto.randomUUID` is missing, the helper falls back to a `Math.random`-based UUIDv4 template. Math.random is not cryptographically strong, so two unlucky clients could mint colliding `client_id`s. The DB has a UNIQUE constraint on `water_log.client_id` (per migration `0003_food_schema.sql:164` `client_id uuid not null unique`), so a collision would 23505 → re-SELECT path → return the OTHER user's row. This is mitigated by the I11 pre-insert SELECT (`route.ts:73-78`) which is scoped `eq('user_id', userId)` AND `eq('client_id', body.client_id)` — so even if user A and user B mint the same UUID, user A's POST cannot return user B's row. The 23505 race path also re-SELECTs with the same user_id scope.
**Risk:** None exploitable. Modern browsers (>=2021) all support `crypto.randomUUID`; the fallback is dead code in practice.
**Suggested improvement:** None required. The defense-in-depth (per-user idempotency scope + unique constraint + 23505 race re-select) renders the fallback collision concern moot. Keep as-is.

#### I2 — `description` field on broadcast envelope is forwarded without length cap
**File / line:** `lib/stores/useUndoQueueStore.cross-tab.ts:74,87`
**Observation:** The cross-tab handler validates `typeof data.description === 'string'` but does not cap the length. A malicious page that gains `BroadcastChannel('kalori-undo')` access (only possible if same-origin) could spam huge strings. The receiver renders these via React `{entry.description}` interpolation (`components/toast/UndoToast.tsx:55`), which auto-escapes — no XSS — but a long-string attack could cause CSS overflow or DOM bloat.
**Risk:** Same-origin requirement means this requires a foothold inside the kalori app already; at that point, the attacker has cookies and the FAB attack from M1 above is much more impactful.
**Suggested improvement:** Optionally cap `description` length (e.g., 200 chars). Not required for this bundle — the regression is hypothetical and gated on prior compromise.

#### I3 — `ttlMs` cross-tab forwarding accepts any positive number up to `Number.MAX_SAFE_INTEGER`
**File / line:** `lib/stores/useUndoQueueStore.ts:196` (`ttlMs > 0` guard) and `useUndoQueueStore.cross-tab.ts:96` (forwarded as-is)
**Observation:** The store guard rejects 0, negative, NaN, and non-numbers, falling back to the 5 s default. But `ttlMs: Number.MAX_SAFE_INTEGER` would pass the guard and arm a `setTimeout` with a huge delay. `setTimeout` clamps to ~24.85 days internally, so the practical effect is a toast that lingers ~24 days at most — the entry remains in the LIFO max-5 stack and gets FIFO-evicted on the 6th push, which `clearTimeout`s the timer (`useUndoQueueStore.ts:221`). No memory leak.
**Risk:** None — the FIFO eviction path neutralizes long-armed timers. A cross-tab attacker could not pin a toast forever because the 5-entry cap forces eviction.
**Suggested improvement:** Optionally cap `ttlMs` at, say, 60_000 ms in both `pushToast` and the cross-tab handler. Not required.

#### I4 — `userTzToday(timezone)` accepts any string; invalid IANA names throw on the client
**File / line:** `components/nav/nav-shell.tsx:176` calling `lib/time/day.ts:33`
**Observation:** The `timezone` value comes server-side from `profiles.timezone` (a free-form `text` column per the schema). If a user has somehow stored a malformed value (e.g., `'<script>'`, `'../../etc/passwd'`), `Intl.DateTimeFormat` will THROW `RangeError: Invalid time zone specified`. This would land in the `catch` block in `handleLogWater`, which surfaces a "Could not log water" toast — graceful degradation, not exploitable. There is no path for this string to be evaluated as code or interpolated unescaped (it's only handed to `Intl.DateTimeFormat`'s `timeZone` option which is a documented API contract, not a string template).
**Risk:** None — `Intl.DateTimeFormat` is not an injection sink. The worst case is a thrown `RangeError`, which the FAB handler catches.
**Suggested improvement:** Optionally validate `profiles.timezone` against the IANA tz database on the server when writing it (Task 2.1's profile insert). Not required for this bundle — onboarding (`Task 2.1`) is the correct gate, and the FAB does not write the timezone column.

---

## Summary

This bundle introduces no Critical or High security findings. The two Medium findings (rate limiting absence, `logged_on` bounds absence) are pre-existing properties of `/api/water/log` that pre-date this bundle by months — the bundle marginally amplifies the rate-limit surface by adding a second tap target reachable from every `(app)` route. Both are appropriately scoped by Supabase RLS to the attacker's own row set (no cross-user impact). The four Informational findings are hardening opportunities, not exploitable defects; each is gated either on prior compromise (I2, I3) or on hypothetical browser-environment regressions (I1, I4) that would degrade gracefully.

**Verdict: PROCEED-CLEAN.** The bundle is safe to commit. The two Medium findings should be tracked in `Planning/followups.md` as `F-WATER-LOG-RATE-LIMIT-2026-05-09` and `F-WATER-LOG-LOGGED-ON-BOUNDS-2026-05-09` for prioritization separately from this bundle's lessons-learned. No re-fix round is required.

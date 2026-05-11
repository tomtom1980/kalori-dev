# Fix R1 — `app/(app)/layout.tsx`

## Findings addressed

- **C1 (Critical):** column-name typo + silent UTC fallback hardening
  - `app/(app)/layout.tsx:67` queried `.eq('user_id', user.id)` against a
    table whose primary key is `id` (per `Planning/architecture.md:143-144`).
  - The Supabase error was discarded (only `data` was destructured), so the
    layout silently fell back to `timezone = 'UTC'`. For a non-UTC user near
    midnight, the nav-shell water FAB then posted a `logged_on` derived from
    a UTC day → durable wrong-calendar-day write into `water_log.date`.

## Changes

- **`app/(app)/layout.tsx`**
  - Added `import * as Sentry from '@sentry/nextjs';` at the top of the
    import block (matches the project convention used in
    `lib/auth/orphan-profile-fence.ts:1`, `app/(app)/onboarding/page.tsx:11`,
    and `lib/ai/cost-log.ts`).
  - Changed `.eq('user_id', user.id)` → `.eq('id', user.id)` to match the
    canonical pattern across the repo (`lib/auth/orphan-profile-fence.ts:156`,
    `app/(app)/onboarding/page.tsx:75`, `tests/_helpers/fence-mock.ts:8`).
  - Destructured `error: profileError` from the Supabase response (was
    previously dropped on the floor).
  - Added a `Sentry.captureException(profileError, { tags: { source:
    'app-layout-timezone-lookup', op: 'profile-timezone-fetch' } })` call
    when the lookup errors. UTC fallback is preserved on the post-capture
    path so a transient blip cannot 500 every post-login surface — the
    hardening lives in observability, not in route failure mode.
  - Expanded the inline comment to cite Codex R1 C1, the architecture
    reference, the canonical-pattern call sites, and the rationale for
    capture-then-fallback over capture-then-throw (Option A per the
    sub-agent brief).

- **`tests/unit/app/layout-timezone-derivation.test.ts`** *(new)*
  - 9 source-shape assertions over `app/(app)/layout.tsx`. Uses the same
    `readFileSync` pattern as `tests/unit/app/dashboard-page-responsive.test.ts`
    because the layout is an SSR-only RSC that reads `next/headers` cookies
    and cannot be rendered in happy-dom without a heavy harness. The tests
    pin: column-name fix (regression guard for `'user_id'`), select
    projection minimization, Sentry import, capture call, error
    destructuring, UTC-fallback preservation, and the downstream
    `userTzToday(timezone)` + `loggedOn={loggedOn}` contract.

## Tests added/modified

| Path | Assertions | Outcome |
|---|---|---|
| `tests/unit/app/layout-timezone-derivation.test.ts` (new) | 9 (3 column-name, 5 error-fallback, 2 downstream regression) | 9 passed (RED → GREEN) |

The TDD discipline ran in two distinct passes per the sub-agent brief:

1. Wrote all 9 assertions FIRST against pre-fix source. RED on 5 of 9
   (the 4 that match pre-existing structure — `'UTC'` literal, no `throw`,
   `userTzToday(timezone)`, `loggedOn={loggedOn}` — were already passing).
2. Applied the column-name + Sentry fix. RED → GREEN: 9 of 9 passed.

## Verification

```
$ npx vitest run "tests/unit/app/layout-timezone-derivation.test.ts"
 RUN  v4.1.4 C:/Users/tamas/Documents/AI projects/Calorie tracker webapp
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  747ms

$ npx tsc --noEmit -p tsconfig.json
(clean — no errors)
```

## Deviations from Codex's recommendation

**None on the column-name fix.** Codex specified `.eq('id', user.id)` and that is exactly what landed.

**One stylistic choice on the error-fallback hardening.** Codex's recommendation listed two options: (a) "fail closed on profile lookup errors instead of silently using UTC" and (b) "preferably reuse the existing profile fence with `timezone` selected so missing/error states cannot produce a writeable fallback date." The sub-agent brief (Option A vs B) preferred logging-then-UTC.

I picked **logging-then-UTC** (`Sentry.captureException` + UTC fallback) over both Codex options for these reasons:

1. **Reusing `requireProfileOrJson401` is wrong for a layout.** That fence returns a `Response` object intended for API-route short-circuiting; in an RSC layout there is no return-Response pathway, only `redirect()` or `throw`. The fence call site that includes `timezone` would also force a 422 redirect on transient lookup blips, which would boot every authenticated user mid-session for any DB hiccup.
2. **Throwing would 500 the entire post-login surface.** The layout wraps `dashboard`, `log`, `library`, `progress`, `settings` — a transient Supabase error on a single render would take down all five. The water-FAB write path is the only consumer of `loggedOn`, and a UTC-day write is a recoverable defect (user can re-tap once the blip clears) — far less harmful than a 500 page.
3. **Visibility was the actual masking layer.** The bug was not the UTC fallback; it was that the column-name error was invisible. `Sentry.captureException` makes future drift loud (Sentry alert + dashboard), which is what the brief identified as the root concern.

The Codex recommendation is satisfied in spirit ("fail closed on profile lookup errors" — we now fail visibly closed via Sentry rather than silently closed via swallow). The literal "no writeable fallback date" interpretation would require redesigning the FAB write path itself, which is out of scope for a same-batch column-name fix and overlaps with finding I1 (FAB success path / dashboard refresh).

## False-positive flag

`false_positive: false` — Codex was correct on every point of C1. The schema confirms `profiles.id` is the FK; the canonical pattern across the repo confirms `.eq('id', user.id)`; the silent-catch was real and would have masked any future similar drift.

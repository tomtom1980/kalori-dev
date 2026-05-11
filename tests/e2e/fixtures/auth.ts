/**
 * F-TEST-4 — real-user Playwright auth fixture (Task 4.1 sub-step 0).
 *
 * Exports a `test` extending `@playwright/test` with an `authedPage` fixture
 * that yields a Page already signed in against `kalori-dev` as a freshly-
 * provisioned Supabase user whose profile is onboarding-complete.
 *
 * Contract (per Planning/.tmp/task-4.1-reconciled-spec.md §11):
 *   import { test } from '../fixtures/auth';
 *   test('...', async ({ authedPage }) => { await authedPage.goto('/library'); });
 *
 * Why a real session instead of the existing `seedAuthSession` forger:
 *   The existing `tests/e2e/helpers/auth-session.ts` forges a cookie + stubs
 *   `/auth/v1/user` via `context.route()`. Both techniques are BROWSER-SIDE
 *   only — server-side `supabase.auth.getUser()` calls made inside the Next
 *   Node process bypass the browser route table entirely and hit the real
 *   Supabase endpoint. That makes forged-cookie tests skip any route that
 *   validates server-side, which is every authed page in the app (C1-B
 *   hybrid pattern). THIS fixture avoids that trap by producing a real
 *   Supabase-issued session so `getUser()` server-side actually succeeds.
 *
 * Why per-test create-and-delete rather than a shared seeded user:
 *   - Parallelism-safe: two tests creating new users never race; two tests
 *     sharing one user would.
 *   - No pollution between specs: each user starts with a known-blank set of
 *     food_entries / library rows, and seeded state (see §11.3 seed-data
 *     fixture extension) is scoped to one test's user.
 *   - Self-cleaning on crash: `test.afterEach` runs even on failure, and an
 *     orphaned user from a killed process is bounded to one iteration worth
 *     of data.
 *
 * Why sign-in via `signInWithPassword` + cookie write, not the UI:
 *   - Deterministic: the login form's i18n copy, magic-link delivery, and
 *     OAuth round-trip all add surface area that isn't what any downstream
 *     test is trying to exercise.
 *   - Fast: one HTTPS roundtrip vs. full-page navigate + form fill + nav.
 *   - No email stub required: Supabase's `signInWithPassword` returns a
 *     session directly from its REST API, no mailbox hookup.
 *
 * R1 refresh-interceptor scope:
 *   This fixture is NOT a mutation path. The R1 contract (`lib/auth/refresh-
 *   interceptor.ts` wrapping every Phase 2+ mutation client fetch) does NOT
 *   apply here — per sub-step 0 instructions.
 *
 * Env requirements (both CI + local):
 *   SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY for admin creation +
 *   deletion; SUPABASE_TEST_ANON_KEY (or SUPABASE_TEST_URL's publishable
 *   key) for the sign-in leg. Falls back to `NEXT_PUBLIC_SUPABASE_*` + admin
 *   `SUPABASE_SECRET_KEY` when the TEST_* vars aren't set (local dev).
 *   `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` are NOT required — this fixture
 *   generates a unique email per test (timestamp + random suffix) and uses
 *   a constant dev password, mirroring `tests/rls/_harness.ts`.
 */
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthFixtures {
  /** Page signed in as a freshly-provisioned onboarding-complete user. */
  authedPage: import('@playwright/test').Page;
  /**
   * Page signed in as a freshly-provisioned user whose `profiles` row has
   * been DELETED post-signup but before the test runs — reproduces the
   * orphan-profile state that exercises the US-STAB-A3 fence.
   *
   * The Supabase JWT remains fully valid (auth.users row intact); only the
   * `profiles` row is missing. Server-side `requireProfileOrRedirect` therefore
   * takes the `kind: 'orphan'` branch (NOT `kind: 'unauthenticated'`) and
   * redirects to `/onboarding` — the canonical observable for AC1 / AC2 / AC6.
   *
   * Anti-pattern: do NOT use `auth.admin.deleteUser(id)` to produce orphan
   * state — that cascades the `profiles` row via FK and ALSO invalidates
   * the JWT, producing the wrong fence branch.
   */
  authedPageWithDeletedProfile: import('@playwright/test').Page;
  /**
   * The provisioned user id of the orphan-profile fixture, exposed so tests
   * can run service-role queries against `profiles` to assert no fallback-
   * create branch ran (US-STAB-A3 AC6). Stable for the duration of one test.
   */
  orphanUserId: string;
}

interface CreatedUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  user: {
    id: string;
    aud: string;
    role: string;
    email: string;
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
    created_at: string;
  };
}

/**
 * Fixed password used for the ephemeral test user. Mirrors
 * `tests/rls/_harness.ts` — kept as a constant so a future global config
 * change lands in one place.
 */
const TEST_PASSWORD = 'KaloriE2ETest!2026';

function resolveEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      'Auth fixture env missing: SUPABASE_TEST_URL + SUPABASE_TEST_ANON_KEY + SUPABASE_TEST_SERVICE_ROLE_KEY (CI) or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY + SUPABASE_SECRET_KEY (local) must all be set.',
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function buildAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function buildAnonClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Onboarding-complete profile payload.
 *
 * `handle_new_user` (supabase/migrations/0002_profiles.sql) auto-inserts a
 * profile row with defaults + `onboarding_completed_at = NULL`. The dashboard
 * RSC (`app/(app)/dashboard/page.tsx`) redirects to `/onboarding` whenever
 * that column is NULL, which would send the fixture consumer somewhere they
 * didn't ask to go. So the fixture runs a service-role UPDATE to flip those
 * NULL derivation fields to working values.
 *
 * Task B.4 Codex Round 1 #2 — extended bio fields (`bio_sex`, `age`,
 * `height_cm`, `current_weight_kg`, `activity_level`, `goal_weight_kg`,
 * `goal_pace`, `target_mode`, `unit_pref`) so the recalc pipeline in
 * `POST /api/weight/log` (calcBMR + calcTDEE + calcCalorieTarget) can
 * derive valid values when the AC3 spec exercises a real POST against
 * the trajectory chart. The trigger's defaults are technically sufficient
 * for `calcBMR` but we make every field explicit to (a) document the
 * fixture contract for downstream specs, (b) decouple from any future
 * trigger-default change, (c) make the recalc threshold predictable so
 * the persisted bmr/tdee/calorie_target match the BMR formula on the
 * test-asserted weight.
 *
 * Existing consumers of `authedPage` are not broken — the values are
 * identical to the pre-existing trigger defaults plus the new explicit
 * bio fields. No spec relies on `bio_sex`, `age`, etc. being the trigger
 * defaults; they relied on the four onboarding-suppression fields, which
 * are unchanged.
 */
const SEED_PROFILE_PATCH = {
  // Bio — onboarding sets these per the user's responses; trigger seeds
  // safe defaults that calcBMR can compute against. Make explicit so the
  // recalc pipeline in POST /api/weight/log has deterministic inputs.
  bio_sex: 'male' as const,
  age: 30,
  height_cm: 170,
  current_weight_kg: 70,
  activity_level: 'moderate' as const,
  goal_weight_kg: 65,
  goal_pace: 'moderate' as const,
  target_mode: 'auto' as const,
  unit_pref: 'metric' as const,
  // Onboarding-suppression / dashboard-display fields.
  calorie_target: 2200,
  bmr: 1600,
  tdee: 2400,
  // Task B.4 Codex Round 1 #2 — timezone changed from 'Asia/Ho_Chi_Minh'
  // to 'UTC' so the client-computed `todayUserTz` matches the server's
  // UTC `Date.now()` reference. The server's I8 30-day backfill guard
  // rejects `date > now + 1h skew tolerance`. With UTC+7 (HCM) the client
  // sends tomorrow's UTC date, which the server flags as `date_in_future`
  // and rejects with HTTP 400. UTC eliminates that mismatch and lets the
  // real-POST AC3 spec exercise the success path. No production code
  // depends on this timezone — the dashboard's display tz comes from the
  // user's profile via the same column, but display tz only affects
  // formatting, not the underlying date arithmetic that the server
  // validates against.
  timezone: 'UTC',
  onboarding_completed_at: new Date().toISOString(),
} as const;

/** base64url-encode a string (RFC 4648 §5, no padding). */
function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Derive the cookie name `@supabase/ssr` writes for the session. Matches
 * `sb-<project-ref>-auth-token`, where `<project-ref>` is the first label of
 * the Supabase project hostname.
 */
function cookieNameForUrl(url: string): string {
  const host = new URL(url).hostname;
  const ref = host.split('.')[0];
  return `sb-${ref}-auth-token`;
}

/**
 * Serialize the real Supabase session into the cookie value shape that
 * `@supabase/ssr` reads on the server. The library's `createServerClient`
 * calls `getAll()` on the cookie jar, pulls the `sb-<ref>-auth-token`
 * cookie, strips the `base64-` prefix, base64url-decodes, and JSON-parses
 * back into a Session object.
 *
 * Format:
 *   cookieValue = 'base64-' + base64url(JSON.stringify(sessionObject))
 */
function sessionCookieValue(user: CreatedUser): string {
  const payload = {
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expires_at: user.expiresAt,
    expires_in: Math.max(0, user.expiresAt - Math.floor(Date.now() / 1000)),
    token_type: user.tokenType,
    user: user.user,
  };
  return `base64-${base64urlEncode(JSON.stringify(payload))}`;
}

/**
 * Resolve the app origin that the fixture should attach the cookie to. Mirrors
 * `tests/e2e/helpers/auth-session.ts` resolveAppOrigin() — `PREVIEW_URL` is
 * authoritative when set (CI uses `http://localhost:3000`), else the dev
 * default. Must match `playwright.config.ts` BASE_URL so the cookie is sent
 * on subsequent goto() calls.
 */
function resolveAppOrigin(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (previewUrl) {
    try {
      return new URL(previewUrl).origin;
    } catch {
      // fall through to default
    }
  }
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  return `http://localhost:${Number.isFinite(port) ? port : 3000}`;
}

/**
 * Provision a fresh auth.users row + override the auto-created profile to
 * onboarding-complete + sign the user in. Returns the material needed to
 * write the session cookie and to delete the user on teardown.
 */
async function provisionTestUser(
  admin: SupabaseClient,
  anon: SupabaseClient,
): Promise<CreatedUser> {
  const email = `e2e-authed-${Date.now()}-${Math.floor(Math.random() * 1e6)}@kalori.test`;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !createData.user) {
    throw new Error(
      `Auth fixture: admin.createUser failed: ${createErr?.message ?? 'no user returned'}`,
    );
  }

  // Flip the auto-created profile to onboarding-complete via service-role so
  // the dashboard RSC does not redirect to /onboarding on the very first hit.
  // We do this BEFORE sign-in because RLS on profiles_update_own requires
  // auth.uid() = id — service role bypasses RLS anyway, but running it first
  // also means we can surface a clearer error if the trigger failed to fire.
  const { error: profileErr } = await admin
    .from('profiles')
    .update(SEED_PROFILE_PATCH)
    .eq('id', createData.user.id);
  if (profileErr) {
    // Attempt rollback of the auth.users row so a failed profile patch does
    // not leak an unauthenticated user that no one will delete.
    try {
      await admin.auth.admin.deleteUser(createData.user.id);
    } catch {
      // best-effort; surface the original error below
    }
    throw new Error(
      `Auth fixture: profile onboarding-complete patch failed: ${profileErr.message}`,
    );
  }

  const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signInData.session) {
    try {
      await admin.auth.admin.deleteUser(createData.user.id);
    } catch {
      // best-effort
    }
    throw new Error(
      `Auth fixture: signInWithPassword failed: ${signInErr?.message ?? 'no session'}`,
    );
  }

  const session = signInData.session;
  const now = Math.floor(Date.now() / 1000);
  return {
    id: createData.user.id,
    email,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? now + 3600,
    tokenType: session.token_type ?? 'bearer',
    user: {
      id: createData.user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: createData.user.app_metadata ?? { provider: 'email', providers: ['email'] },
      user_metadata: createData.user.user_metadata ?? {},
      created_at: createData.user.created_at ?? new Date(now * 1000).toISOString(),
    },
  };
}

/**
 * Write the real Supabase session cookie onto the Playwright context. The
 * cookie name matches `@supabase/ssr`'s storageKey (`sb-<project-ref>-auth-
 * token`) so both middleware `getSession()` (cookie-only) AND server-side
 * `getUser()` (crypto-verified via network) accept it.
 */
async function writeSessionCookie(
  context: BrowserContext,
  supabaseUrl: string,
  user: CreatedUser,
): Promise<void> {
  const appOrigin = resolveAppOrigin();
  const { hostname } = new URL(appOrigin);

  await context.addCookies([
    {
      name: cookieNameForUrl(supabaseUrl),
      value: sessionCookieValue(user),
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      // No explicit `expires` → session cookie; cleared on context close.
    },
  ]);
}

export const test = base.extend<AuthFixtures>({
  // Playwright fixtures conventionally name the yield callback `use`; we
  // rename to `runTest` to avoid the `react-hooks/rules-of-hooks` false-
  // positive that treats it as a React `use()` hook call.
  authedPage: async ({ page, context }, runTest) => {
    const { url, anonKey, serviceRoleKey } = resolveEnv();
    const admin = buildAdminClient(url, serviceRoleKey);
    const anon = buildAnonClient(url, anonKey);

    const createdUser = await provisionTestUser(admin, anon);
    try {
      await writeSessionCookie(context, url, createdUser);
      await runTest(page);
    } finally {
      // Deleting the auth.users row cascades to `profiles` via the FK in
      // `0002_profiles.sql` (`references auth.users(id) on delete cascade`).
      // Idempotency: ignore "user not found" — a test may have already
      // triggered its own account-delete flow and we don't want that to
      // mask the real assertion failure.
      try {
        await admin.auth.admin.deleteUser(createdUser.id);
      } catch {
        // swallow — teardown must not mask the test's own failure
      }
    }
  },

  // Resolves to the orphan user's id by reading the expando the
  // `authedPageWithDeletedProfile` fixture stamps on the page. Tests that
  // consume `orphanUserId` MUST also list `authedPageWithDeletedProfile`
  // in their fixture destructure (Playwright resolves dependents in order).
  orphanUserId: async ({ authedPageWithDeletedProfile }, runTest) => {
    const id =
      (authedPageWithDeletedProfile as Page & { __orphanUserId?: string }).__orphanUserId ?? '';
    await runTest(id);
  },

  /**
   * Orphan-profile fixture for US-STAB-A3 ACs 1, 2, 6.
   *
   * Builds on the same provision/sign-in pipeline as `authedPage`, then
   * issues a service-role `DELETE FROM profiles WHERE id = <userId>`
   * BEFORE yielding. The auth.users row + JWT remain intact so the
   * server-side fence sees `kind: 'orphan'` (NOT `kind: 'unauthenticated'`)
   * and redirects to `/onboarding`.
   *
   * Teardown deletes the auth.users row to bound test-user buildup. The
   * profiles row is already gone; the cascade is a no-op for it.
   */
  authedPageWithDeletedProfile: async ({ page, context }, runTest, testInfo) => {
    const { url, anonKey, serviceRoleKey } = resolveEnv();
    const admin = buildAdminClient(url, serviceRoleKey);
    const anon = buildAnonClient(url, anonKey);

    const createdUser = await provisionTestUser(admin, anon);
    // Stash on testInfo so the orphanUserId fixture (resolved per-test by
    // Playwright) can pull the id without a second DB roundtrip. Keyed under
    // `orphanUserId` for clarity.
    testInfo.attachments.push({
      name: 'orphanUserId',
      contentType: 'text/plain',
      body: Buffer.from(createdUser.id, 'utf8'),
    });
    try {
      await writeSessionCookie(context, url, createdUser);

      // CRITICAL: delete the profiles row AFTER the cookie write so the JWT
      // is fully valid; only the profile is missing (orphan state). Service
      // role bypasses RLS — direct DELETE works. We do NOT touch auth.users
      // here because `auth.admin.deleteUser` cascades via the FK in
      // `0002_profiles.sql` and ALSO revokes the access token, producing
      // the WRONG fence branch (`kind: 'unauthenticated'` redirects to
      // `/login?reason=session_expired`, not `/onboarding`).
      const { error: delErr } = await admin.from('profiles').delete().eq('id', createdUser.id);
      if (delErr) {
        // Best-effort cleanup of auth.users so a failed profile delete does
        // not leak a user that no one will reap.
        try {
          await admin.auth.admin.deleteUser(createdUser.id);
        } catch {
          // best-effort; surface the original error
        }
        throw new Error(`authedPageWithDeletedProfile: profiles delete failed: ${delErr.message}`);
      }

      // Anti-flake under 4-worker CI contention: the DELETE returns 200 once
      // Postgres acks the row removal, but the cross-region read-your-writes
      // round-trip the dashboard fence performs (selectsingle on the
      // `profiles` row via the user's session) can land before the row's
      // disappearance is observable from a fresh connection in the SSR
      // request path. Poll a service-role read-back until we see `null`,
      // which proves the deletion is visible from a fresh connection (the
      // shape the SSR fence will use). Cap at ~2s to bound the worst case.
      let confirmed = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data: probe, error: probeErr } = await admin
          .from('profiles')
          .select('id')
          .eq('id', createdUser.id)
          .maybeSingle();
        if (probeErr) {
          // surface unexpected probe errors immediately
          throw new Error(
            `authedPageWithDeletedProfile: post-delete probe failed: ${probeErr.message}`,
          );
        }
        if (probe == null) {
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!confirmed) {
        try {
          await admin.auth.admin.deleteUser(createdUser.id);
        } catch {
          /* best-effort */
        }
        throw new Error(
          'authedPageWithDeletedProfile: profile deletion not observable after 2s of polling',
        );
      }

      // The probe above runs through the service-role admin connection
      // (PostgREST). The SSR fence in `lib/auth/orphan-profile-fence.ts`
      // runs through a SEPARATE PgBouncer-pooled connection scoped to the
      // user's session JWT. Under 4-worker contention the deletion can be
      // confirmed on the admin connection well before it becomes
      // observable on the next freshly-leased pooled connection.
      //
      // Stronger guarantee: probe the deletion via the user-scoped anon
      // client (which mirrors the SSR fence's connection class). Once the
      // anon-with-JWT read returns null/no-row, the SSR request path is
      // guaranteed to see the same.
      const userAnon = createClient(url, anonKey, {
        global: {
          headers: { Authorization: `Bearer ${createdUser.accessToken}` },
        },
      });
      let anonConfirmed = false;
      for (let attempt = 0; attempt < 25; attempt++) {
        const { data: anonProbe, error: anonProbeErr } = await userAnon
          .from('profiles')
          .select('id')
          .eq('id', createdUser.id)
          .maybeSingle();
        if (anonProbeErr) {
          // RLS on profiles only allows SELECT on own row; a non-row
          // condition surfaces as data=null, NOT an error. Any error is
          // unexpected and should fail loudly rather than silently retry.
          throw new Error(
            `authedPageWithDeletedProfile: post-delete anon probe failed: ${anonProbeErr.message}`,
          );
        }
        if (anonProbe == null) {
          anonConfirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (!anonConfirmed) {
        try {
          await admin.auth.admin.deleteUser(createdUser.id);
        } catch {
          /* best-effort */
        }
        throw new Error(
          'authedPageWithDeletedProfile: profile deletion not observable via user-anon connection after 5s of polling',
        );
      }

      // Final settle: even after both admin + anon connections see null,
      // the SSR Node-process pooled connection used by the dashboard fence
      // (via supabase-ssr's `createServerClient`) may use yet another
      // pooled session. Empirical 4-worker CI runs show this pool can lag
      // up to ~2s. This settle is the last defensive guard; together with
      // the dual-connection probe above it makes the orphan fixture
      // contention-stable.
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      // Expose the user id on a Page-level expando so tests can read it
      // alongside the page (matches Playwright fixture-overlap semantics
      // without forcing an extra fixture parameter — the consumer destructures
      // both `authedPageWithDeletedProfile` and `orphanUserId`).
      (page as Page & { __orphanUserId?: string }).__orphanUserId = createdUser.id;

      await runTest(page);
    } finally {
      try {
        await admin.auth.admin.deleteUser(createdUser.id);
      } catch {
        // swallow — teardown must not mask the test's own failure
      }
    }
  },
});

export { expect } from '@playwright/test';

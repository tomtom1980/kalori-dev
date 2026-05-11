/**
 * 2-user RLS test harness (canonical path — testing-strategy.md §10.2).
 *
 * Downstream specs import `setupRlsHarness()` / `RlsHarness` from this file
 * (Task 2.1 profiles, Task 3.1 food schema, Task 4.3b weight regression). The
 * path is load-bearing: do NOT move without updating every importer.
 *
 * Shape:
 *   - `admin` — service-role client (bypasses RLS) for setup/teardown only.
 *   - `userA` / `userB` — { id, jwt, client } where `client` is a per-user
 *     Supabase client whose REST calls carry `Authorization: Bearer <jwt>`.
 *   - `teardown()` — deletes both users via admin; idempotent (safe to call
 *     twice; safe to call after a partial setup failure).
 *
 * Idempotency strategy: emails are timestamped so a stale teardown (e.g. from
 * an aborted CI run) cannot collide with a fresh `setupRlsHarness()` call.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getAdminSupabase } from '@/lib/supabase/admin';

export interface RlsUser {
  id: string;
  email: string;
  jwt: string;
  client: SupabaseClient;
}

export interface RlsHarness {
  admin: SupabaseClient;
  userA: RlsUser;
  userB: RlsUser;
  teardown: () => Promise<void>;
}

const TEST_PASSWORD = 'KaloriRlsTest!2026';

function buildUserClient(url: string, anonKey: string, jwt: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  });
}

async function createAndSignIn(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  label: 'a' | 'b',
  onUserCreated: (id: string) => void,
): Promise<RlsUser> {
  const email = `test-user-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@kalori.test`;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr || !createData.user) {
    throw new Error(
      `RLS harness: failed to create user ${label}: ${createErr?.message ?? 'no user returned'}`,
    );
  }
  // Register the created user with the caller's teardown tracker BEFORE sign-in
  // runs, so a later sign-in failure still produces a teardown of this user.
  onUserCreated(createData.user.id);

  // A per-user client signs in with anon + password to produce a real JWT.
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInErr || !signInData.session) {
    throw new Error(
      `RLS harness: failed to sign in user ${label}: ${signInErr?.message ?? 'no session'}`,
    );
  }

  const jwt = signInData.session.access_token;
  return {
    id: createData.user.id,
    email,
    jwt,
    client: buildUserClient(url, anonKey, jwt),
  };
}

export async function setupRlsHarness(): Promise<RlsHarness> {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_TEST_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'RLS harness: SUPABASE_TEST_URL + SUPABASE_TEST_ANON_KEY (CI) or NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (local) must be set.',
    );
  }

  const admin = getAdminSupabase();

  // Track every admin.createUser() success before a subsequent step throws, so
  // the catch path can delete every auth-store user this call left behind. The
  // earlier design only captured `userA`, which meant a `userB` whose sign-in
  // failed (created but not signed in) leaked into auth.
  const createdIds: string[] = [];
  let userA: RlsUser | undefined;
  let userB: RlsUser | undefined;
  try {
    userA = await createAndSignIn(admin, url, anonKey, 'a', (id) => createdIds.push(id));
    userB = await createAndSignIn(admin, url, anonKey, 'b', (id) => createdIds.push(id));

    const liveIds = new Set<string>(createdIds);
    const teardown = async (): Promise<void> => {
      for (const id of Array.from(liveIds)) {
        try {
          await admin.auth.admin.deleteUser(id);
        } catch {
          // Idempotency: ignore "user not found" etc. — second teardown is a no-op.
        }
        liveIds.delete(id);
      }
    };

    return { admin, userA, userB, teardown };
  } catch (err) {
    // Best-effort teardown of every user this invocation created, regardless
    // of which step failed. Errors are swallowed so the original setup error
    // (which is more informative) surfaces to the caller.
    for (const id of createdIds) {
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        // swallow — original error is more informative
      }
    }
    throw err;
  }
}

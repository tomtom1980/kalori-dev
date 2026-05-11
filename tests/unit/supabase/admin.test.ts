/**
 * `lib/supabase/admin.ts` — service-role client (SERVER/TEST-ONLY).
 *
 * Unit coverage for Task 1.2 CI-fix:
 *   - Prefers `SUPABASE_TEST_*` env vars (CI test harness) and falls back to
 *     `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (local dev).
 *   - Calls `@supabase/supabase-js` `createClient(url, secret, options)` with
 *     `auth.persistSession: false` AND `auth.autoRefreshToken: false` — any
 *     future drift (persistence re-enabled by mistake) is caught by the
 *     `setup the auth options` assertion.
 *   - Does NOT memoize: the RLS harness wants fresh instances per spec so
 *     there's no leaked session state.
 *   - Throws with a message naming the missing env vars when resolution fails.
 *
 * Mocking `@supabase/supabase-js` keeps the test hermetic; we only verify the
 * factory arguments, never call a real Supabase endpoint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AdminClientFactory = (url: string, key: string, options?: unknown) => unknown;

const createClientMock = vi.fn<AdminClientFactory>(() => ({
  __brand: 'admin-supabase-stub',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

describe('lib/supabase/admin.ts', () => {
  const snapshot = {
    SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL,
    SUPABASE_TEST_SERVICE_ROLE_KEY: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  };

  function restoreEnv(): void {
    for (const key of Object.keys(snapshot) as Array<keyof typeof snapshot>) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  beforeEach(() => {
    createClientMock.mockClear();
    vi.resetModules();
    // Start every test from a clean slate; each test sets only what it needs.
    delete process.env.SUPABASE_TEST_URL;
    delete process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('prefers SUPABASE_TEST_* env vars and disables session persistence + auto-refresh', async () => {
    process.env.SUPABASE_TEST_URL = 'https://ci-test.supabase.co';
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = 'sb_secret_test_key';
    const { getAdminSupabase } = await import('@/lib/supabase/admin');
    const client = getAdminSupabase();

    expect(client).toEqual({ __brand: 'admin-supabase-stub' });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://ci-test.supabase.co',
      'sb_secret_test_key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  });

  it('falls back to NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY for local dev', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-dev.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_dev_key';
    const { getAdminSupabase } = await import('@/lib/supabase/admin');
    getAdminSupabase();
    expect(createClientMock).toHaveBeenCalledWith(
      'https://local-dev.supabase.co',
      'sb_secret_dev_key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
    );
  });

  it('does NOT memoize: each call returns a fresh instance', async () => {
    process.env.SUPABASE_TEST_URL = 'https://ci-test.supabase.co';
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = 'sb_secret_test_key';
    const { getAdminSupabase } = await import('@/lib/supabase/admin');
    getAdminSupabase();
    getAdminSupabase();
    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it('throws a descriptive error naming BOTH env-var sets when nothing resolves', async () => {
    const { getAdminSupabase } = await import('@/lib/supabase/admin');
    expect(() => getAdminSupabase()).toThrow(/SUPABASE_TEST_URL/);
    expect(() => getAdminSupabase()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

/**
 * `lib/supabase/server.ts` — request-scoped server Supabase client.
 *
 * Unit coverage for Task 1.2 CI-fix:
 *   - Reads `next/headers` `cookies()` and forwards the jar to
 *     `@supabase/ssr` `createServerClient` via `{ cookies: { getAll, setAll } }`.
 *   - Uses the SAME `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 *     env vars as the browser client (publishable key is safe to expose).
 *   - `setAll` handler catches + swallows errors thrown when called from a
 *     Server Component that cannot mutate cookies (per Supabase SSR docs;
 *     middleware is the refresh authority in Task 2.1).
 *   - Throws when env vars are missing.
 *
 * We mock both `next/headers` (cookie jar) and `@supabase/ssr` so no Next
 * runtime is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ServerClientFactory = (url: string, key: string, options: unknown) => unknown;

const createServerClientMock = vi.fn<ServerClientFactory>(() => ({
  __brand: 'server-supabase-stub',
}));

const cookieStoreMock = {
  getAll: vi.fn(() => [{ name: 'sb-access-token', value: 'token-value' }]),
  set: vi.fn<(name: string, value: string, options?: unknown) => void>(() => undefined),
};

const cookiesMock = vi.fn(async () => cookieStoreMock);

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

type SetAllHandler = (
  cookiesToSet: Array<{ name: string; value: string; options?: unknown }>,
) => void;

describe('lib/supabase/server.ts', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    createServerClientMock.mockClear();
    cookieStoreMock.getAll.mockClear();
    cookieStoreMock.set.mockClear();
    cookiesMock.mockClear();
    cookieStoreMock.set.mockImplementation(() => undefined);
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key';
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
    if (originalKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    }
  });

  it('builds the server client with URL + publishable key from canonical env vars', async () => {
    const { getServerSupabase } = await import('@/lib/supabase/server');
    const client = await getServerSupabase();
    expect(client).toEqual({ __brand: 'server-supabase-stub' });
    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    const firstCall = createServerClientMock.mock.calls[0]!;
    const [url, key] = firstCall;
    expect(url).toBe('https://example.supabase.co');
    expect(key).toBe('sb_publishable_test_key');
  });

  it('wires the cookie bridge: getAll reads and setAll writes through next/headers', async () => {
    const { getServerSupabase } = await import('@/lib/supabase/server');
    await getServerSupabase();
    const firstCall = createServerClientMock.mock.calls[0]!;
    const options = firstCall[2] as {
      cookies: { getAll: () => unknown; setAll: SetAllHandler };
    };

    expect(options.cookies.getAll()).toEqual([{ name: 'sb-access-token', value: 'token-value' }]);
    expect(cookieStoreMock.getAll).toHaveBeenCalledTimes(1);

    options.cookies.setAll([
      { name: 'sb-one', value: 'v1', options: { path: '/' } },
      { name: 'sb-two', value: 'v2', options: { path: '/app' } },
    ]);
    expect(cookieStoreMock.set).toHaveBeenCalledTimes(2);
    expect(cookieStoreMock.set).toHaveBeenNthCalledWith(1, 'sb-one', 'v1', { path: '/' });
    expect(cookieStoreMock.set).toHaveBeenNthCalledWith(2, 'sb-two', 'v2', { path: '/app' });
  });

  it('swallows cookie-write errors (Server Component read-only context)', async () => {
    cookieStoreMock.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler.');
    });
    const { getServerSupabase } = await import('@/lib/supabase/server');
    await getServerSupabase();
    const firstCall = createServerClientMock.mock.calls[0]!;
    const options = firstCall[2] as {
      cookies: { setAll: SetAllHandler };
    };

    // Must NOT throw — Supabase SSR docs instruct callers to ignore this error
    // when middleware is the refresh authority (Task 2.1 takes over).
    expect(() => options.cookies.setAll([{ name: 'sb-x', value: 'vx' }])).not.toThrow();
  });

  it('throws when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { getServerSupabase } = await import('@/lib/supabase/server');
    await expect(getServerSupabase()).rejects.toThrow(/Supabase env vars missing/);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});

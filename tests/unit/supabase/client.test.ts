/**
 * `lib/supabase/client.ts` — browser Supabase client factory.
 *
 * Unit coverage for Task 1.2 CI-fix:
 *   - Requires `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 *     (the 2026 canonical env-var names). Throws a clear error if either is
 *     missing.
 *   - Calls `@supabase/ssr` `createBrowserClient(url, key)` with EXACTLY the
 *     publishable key (not the server secret).
 *   - Memoizes the client — repeated calls return the same instance.
 *
 * We `vi.mock('@supabase/ssr')` so no network / no cookie handshake happens.
 * `vi.resetModules()` clears the memoization between tests so each case sees
 * a fresh module-scope.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BrowserClientFactory = (url: string, key: string) => unknown;

const createBrowserClientMock = vi.fn<BrowserClientFactory>(() => ({
  __brand: 'browser-supabase-stub',
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: createBrowserClientMock,
}));

describe('lib/supabase/client.ts', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  beforeEach(() => {
    createBrowserClientMock.mockClear();
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

  it('creates a browser client from the canonical 2026 publishable-key env vars', async () => {
    const { getBrowserSupabase } = await import('@/lib/supabase/client');
    const client = getBrowserSupabase();
    expect(client).toEqual({ __brand: 'browser-supabase-stub' });
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_test_key',
    );
  });

  it('memoizes the client so repeated calls return the same instance', async () => {
    const { getBrowserSupabase } = await import('@/lib/supabase/client');
    const first = getBrowserSupabase();
    const second = getBrowserSupabase();
    expect(first).toBe(second);
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
  });

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { getBrowserSupabase } = await import('@/lib/supabase/client');
    expect(() => getBrowserSupabase()).toThrow(/Supabase env vars missing/);
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it('throws when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const { getBrowserSupabase } = await import('@/lib/supabase/client');
    expect(() => getBrowserSupabase()).toThrow(/Supabase env vars missing/);
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });
});

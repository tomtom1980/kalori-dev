/**
 * Browser Supabase client — for Client Components (`'use client'`) only.
 *
 * Uses `@supabase/ssr` `createBrowserClient` with canonical 2026 env vars
 * (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
 * The publishable key is designed to be shipped to the browser; it is the
 * modern replacement for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 *
 * IMPORTANT:
 *   - Never import this file from Server Components or Route Handlers.
 *     Use `lib/supabase/server.ts` instead so SSR cookie handoff works.
 *   - Never import `lib/supabase/admin.ts` from anywhere under `app/` or
 *     `components/` — the ESLint rule `kalori/no-admin-in-app` enforces this.
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | undefined;

/**
 * Returns a memoized browser Supabase client. Memoization avoids re-creating
 * the client on every React render; the cookie-backed session survives
 * across component re-mounts naturally.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.',
    );
  }

  browserClient = createBrowserClient(url, key);
  return browserClient;
}

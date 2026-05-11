/**
 * Server-side Supabase client for Next.js App Router.
 *
 * Wraps `@supabase/ssr` `createServerClient` so it can be used from:
 *   - Server Components (via `next/headers` `cookies()`)
 *   - Route Handlers (`app/api/**`)
 *   - Server Actions
 *
 * The cookie shim passes the entire cookie jar through to Supabase's SSR
 * helpers, which is required for session refresh to work during SSR.
 *
 * Middleware has its own cookie bridge (`createMiddlewareSupabase` in
 * `middleware.ts`) because Next.js gives middleware a different cookie API.
 *
 * Task 1.2 scope: this file exists so later tasks (Task 2.1 auth, Task 2.2
 * profile write, Task 3.x food CRUD) can import without re-architecting.
 * The middleware in Task 1.2 is a pass-through shell per residual R1 —
 * 401 refresh logic lands in Task 2.1.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns a per-request Supabase client that reads and writes auth cookies
 * through Next's `cookies()` store. Must be called inside a request context
 * (Server Component, Route Handler, or Server Action).
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // The `setAll` method was called from a Server Component. Supabase's
          // SSR guide explicitly documents ignoring this case when middleware
          // is the refresh owner — Task 2.1 will make middleware authoritative.
        }
      },
    },
  });
}

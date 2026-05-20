/**
 * Task D.2 — US-STAB-D2 — `withAuth` route-handler wrapper.
 *
 * Architecture.md §8.1 spec, adapted to the canonical JSON 401 envelope
 * introduced by US-STAB-D2. Wraps a route handler so the handler sees a
 * guaranteed-authenticated `{ user, supabase }` context and the unauth path
 * always emits `apiUnauthenticated401()`.
 *
 * Scope: this wrapper is used by routes that previously auth'd via inline
 * `auth.getUser()` (today: `/api/profile/save`, `/api/account/delete`).
 * Routes that already auth via `requireProfileOrJson401` (the orphan-profile
 * fence) keep that call — the fence imports `apiUnauthenticated401` directly,
 * so wrapping fenced routes with `withAuth` would be redundant.
 *
 * R1 firewall: this wrapper detects "no session" and emits the canonical
 * 401 envelope. It does NOT implement any refresh-retry behaviour — that
 * remains the exclusive responsibility of `lib/auth/refresh-interceptor.ts`
 * (the R1 single-canonical-module contract). On the server side, an
 * unauthenticated request simply gets the canonical 401; the client-side
 * interceptor then handles refresh-retry.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { apiUnauthenticated401 } from '@/lib/auth/api-401-response';
import { getServerSupabase } from '@/lib/supabase/server';

/** Handler signature: receives the inbound Request plus an authenticated context. */
export type AuthedHandler = (
  request: Request,
  ctx: { user: User; supabase: SupabaseClient },
) => Promise<Response> | Response;

/**
 * Wrap a route handler so the unauth branch returns the canonical 401 and the
 * authed branch receives `{ user, supabase }`. Mirrors architecture.md §8.1
 * but uses `apiUnauthenticated401()` (US-STAB-D2 contract) instead of the
 * legacy `{ error: 'Unauthorized' }` shape.
 *
 * Usage:
 * ```ts
 * export const POST = withAuth(async (req, { user, supabase }) => {
 *   // … handler body, user is guaranteed non-null
 * });
 * ```
 */
export function withAuth(handler: AuthedHandler): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return apiUnauthenticated401();
    }
    return handler(request, { user: data.user, supabase });
  };
}

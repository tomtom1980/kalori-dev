/**
 * `POST /api/auth/sign-out` — server-side sign-out endpoint (Task 2.1d).
 *
 * The F12 refresh interceptor uses `supabase.auth.signOut()` on the browser
 * client, which itself calls Supabase's hosted sign-out endpoint and clears
 * local cookies. This route exists so future surfaces (e.g. a sidebar sign-out
 * button that performs a server-rendered navigation, or the Task 5.2
 * BroadcastChannel cross-tab sign-out trigger) can hit a same-origin endpoint
 * instead of routing through the SDK. It is intentionally idempotent: if no
 * session cookie is present, we still return 200.
 *
 * Contract:
 *   - `POST`: invokes `supabase.auth.signOut()` via the SSR server client,
 *             which clears the session cookies on the outgoing response. Returns
 *             200 `{ ok: true }`. Idempotent — repeated calls are a no-op.
 *   - `GET`:  returns 405. Sign-out is a state-changing action; it must not be
 *             reachable via a GET (guards against CSRF via image-src / link preload).
 *
 * Public-route status: the `isPublicRoute` allowlist in
 * `lib/auth/public-routes.ts` includes `/api/auth`, so middleware lets this
 * through without requiring an active session (consistent with the idempotent
 * behavior — calling sign-out while already signed out is a no-op).
 */
import { NextResponse } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(): Promise<Response> {
  const supabase = await getServerSupabase();
  try {
    await supabase.auth.signOut();
  } catch {
    // Idempotent: if the session is already gone (network hiccup, stale
    // cookie, already-expired token), a sign-out throw is not an error from
    // the caller's perspective. Proceed to 200.
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

export function GET(): Response {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}

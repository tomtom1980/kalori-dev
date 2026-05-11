/**
 * `GET /auth/callback` — OAuth / magic-link redirect handler (Task 2.1c).
 *
 * Flow:
 *   1. Supabase (magic-link email OR Google OAuth) redirects here with `?code=…`.
 *   2. We exchange the code for a session via the SSR server client
 *      (`supabase.auth.exchangeCodeForSession(code)`), which writes the
 *      session cookies on the outgoing response.
 *   3. We then look up the user's `profiles.onboarding_completed_at` to
 *      decide where to land them:
 *        - row missing / `onboarding_completed_at IS NULL` → `/onboarding`
 *        - row present + completed              → `/dashboard`
 *   4. If an explicit `redirect_to` param was preserved across the OAuth
 *      round-trip, we respect it ONLY when the user has already completed
 *      onboarding. New users always start at `/onboarding` to avoid
 *      landing them on a surface that needs profile data.
 *
 * Error modes:
 *   - missing `code`                        → `/login?error=callback`
 *   - `exchangeCodeForSession` fails        → `/login?error=callback`
 *   - profile lookup returns an error       → `/login?error=profile_lookup_failed`
 *                                              (Phase 2 Codex R1 F2: DB/RLS errors
 *                                              must NOT silently bounce an
 *                                              already-onboarded user back into
 *                                              the wizard — which is what happened
 *                                              when we ignored `maybeSingle()` error)
 *   - profile lookup throws (network)       → same: `/login?error=profile_lookup_failed`
 *
 * Public route — middleware lets this through even when unauthenticated so
 * the code exchange can run. We do NOT log anything here (Sentry scrubber
 * from Task 1.1 catches unexpected throws).
 */
import { NextResponse, type NextRequest } from 'next/server';

import { getServerSupabase } from '@/lib/supabase/server';

/**
 * Guard against open-redirects + assorted smuggling on the `?redirect_to=`
 * parameter that survives the OAuth round-trip. Rejects anything that isn't a
 * plain same-origin pathname, including:
 *
 *   1. Empty / null input
 *   2. Control characters (`\n`, `\r`, `\t`, `\0`) — prevents CRLF / header
 *      injection once Location header is serialized
 *   3. Backslashes (`\`) — some browsers treat `\` as `/` and would interpret
 *      `/\evil.com` as an origin-crossing redirect
 *   4. Non-root-absolute paths (must start with a single `/`, not `//` or
 *      schemes like `https:` / `javascript:` / `data:`)
 *   5. Protocol-relative (`//`) — standard open-redirect vector
 *   6. Cross-origin after URL normalization against a dummy origin — belt-and-
 *      suspenders check in case URL parser re-interprets the path
 *   7. Path traversal (`..` or `.` segments) in either raw OR percent-decoded
 *      form — blocks `/%2e%2e/admin`, `/login/../admin`, etc.
 *   8. Any remaining `%00` (null byte) after a single decode pass
 *
 * On acceptance, returns the normalized pathname + search + hash. The
 * normalization round-trips through `URL` so callers get the parser's
 * canonical serialization (resolves stray `./` segments the parser already
 * collapses safely).
 */
function safeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  // Reject control chars + backslashes before any URL parsing — these are
  // structural hazards that URL parsers do NOT uniformly reject.
  if (/[\\\n\r\t\0]/.test(raw)) return null;
  // Must be root-absolute pathname.
  if (!raw.startsWith('/')) return null;
  // Protocol-relative `//evil.com/...` — reject.
  if (raw.startsWith('//')) return null;

  // Pre-parser traversal check: the URL parser silently collapses `../` into
  // a normalized path (e.g. `/login/../admin` becomes `/admin`). We MUST
  // detect traversal on the raw input BEFORE normalization, otherwise the
  // attack surface we reject below is empty.
  //
  // We also decode once up-front so percent-encoded dots (`%2e%2e`) count as
  // traversal — catches `/%2e%2e/admin` and `/%2e/admin` variants.
  let decodedRaw: string;
  try {
    decodedRaw = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — reject.
    return null;
  }
  if (decodedRaw.includes('\0')) return null;
  if (decodedRaw.includes('\\')) return null;
  // Reject traversal in either raw or decoded form. The regex catches `..` or
  // single-dot segments between slashes (or at path boundaries).
  if (/(^|\/)\.\.(\/|$)/.test(decodedRaw)) return null;
  if (/(^|\/)\.(\/|$)/.test(decodedRaw)) return null;
  // Also reject encoded traversal directly on the raw input — defense in
  // depth in case a future tweak to the decode logic loses fidelity.
  if (/%2e/i.test(raw)) return null;

  // Parse against a dummy origin so we can use the URL parser's normalization
  // + cross-origin detection. If parsing throws (malformed URL), reject.
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://dummy.local');
  } catch {
    return null;
  }
  if (parsed.origin !== 'http://dummy.local') return null;
  // Post-parse sanity — the parser must not have produced control-char or
  // null-byte content in the pathname portion (encoded forms like `%00`
  // survive as `%00` in `parsed.pathname` until decoded).
  if (/%00/i.test(parsed.pathname)) return null;

  return parsed.pathname + parsed.search + parsed.hash;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const redirectParam = safeRedirectTarget(url.searchParams.get('redirect_to'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const supabase = await getServerSupabase();

  const { data: exchangeData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !exchangeData.session) {
    return NextResponse.redirect(new URL('/login?error=callback', request.url));
  }

  const userId = exchangeData.session.user.id;

  // Look up onboarding completion to pick the right landing surface.
  //
  // Phase 2 Codex R1 F2: distinguish three states explicitly — previously
  // the ignored `maybeSingle()` error made a transient DB/RLS failure look
  // like "not onboarded" and bounced already-onboarded users back into the
  // wizard. The new contract:
  //   1. `error != null` (DB/RLS failure) → /login?error=profile_lookup_failed.
  //   2. `data == null` AND no error (row truly doesn't exist) → /onboarding.
  //   3. `data.onboarding_completed_at` truthy → /dashboard (or redirectParam).
  let profile: { onboarding_completed_at: string | null } | null = null;
  try {
    const { data, error: lookupError } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', userId)
      .maybeSingle();
    if (lookupError) {
      return NextResponse.redirect(new URL('/login?error=profile_lookup_failed', request.url));
    }
    profile = data;
  } catch {
    // Network / connection failure — same fallback as an explicit lookup
    // error. Do NOT silently treat as onboarded or not-onboarded.
    return NextResponse.redirect(new URL('/login?error=profile_lookup_failed', request.url));
  }

  if (!profile?.onboarding_completed_at) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  const destination = redirectParam ?? '/dashboard';
  return NextResponse.redirect(new URL(destination, request.url));
}

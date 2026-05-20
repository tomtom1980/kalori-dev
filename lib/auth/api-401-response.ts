/**
 * Task D.2 — US-STAB-D2 — Canonical JSON 401 envelope builder for `/api/*`.
 *
 * SINGLE SOURCE OF TRUTH for the unauthenticated-401 response shape on every
 * `/api/*` route. Routes MUST emit a 401 only via this builder so the wire
 * contract stays uniform: SPA `authFetch` consumers and the PWA service
 * worker see the same body and headers regardless of which handler refused
 * the request.
 *
 * Wire contract (design-doc §4 US-STAB-D2 + impact-analysis line 207):
 *   HTTP/1.1 401 Unauthorized
 *   Content-Type: application/json
 *   WWW-Authenticate: Bearer realm="kalori"
 *   (no Location header, no Set-Cookie change, no HTML)
 *   { "error": "unauthenticated" }
 *
 * Rules:
 *   - Body is EXACTLY `{ "error": "unauthenticated" }` — no extra fields, no
 *     `code`, no `message`, no envelope wrapping.
 *   - `WWW-Authenticate: Bearer realm="kalori"` is RFC 6750 compliant; the
 *     realm value defaults to `"kalori"` and is overrideable for tests.
 *   - NO `Location:` header. The unauthenticated branch on `/api/*` MUST
 *     NOT redirect — page-route handlers retain their 302 to /login via
 *     `requireProfileOrRedirect`, but API handlers always return JSON 401.
 *   - The builder is pure: no I/O, no side effects, no Sentry write — it is
 *     consumed by the orphan-profile fence (`lib/auth/orphan-profile-fence.ts`)
 *     and by the `withAuth` wrapper (`lib/auth/with-auth.ts`).
 *
 * R1 firewall: this is a response-builder, NOT a refresh-retry shim. The
 * status-code-only refresh-interceptor (`lib/auth/refresh-interceptor.ts`)
 * still owns the 401 detection / retry contract. See module docstring there.
 */
import { NextResponse } from 'next/server';

const DEFAULT_REALM = 'kalori';

/**
 * Build a canonical JSON 401 response for an unauthenticated `/api/*` call.
 *
 * @param opts.realm - WWW-Authenticate realm. Defaults to `"kalori"`. Tests
 *   may override to assert realm handling without touching the production
 *   contract.
 */
export function apiUnauthenticated401(opts?: { realm?: string }): NextResponse {
  const realm = opts?.realm ?? DEFAULT_REALM;
  return NextResponse.json(
    { error: 'unauthenticated' },
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="${realm}"`,
      },
    },
  );
}

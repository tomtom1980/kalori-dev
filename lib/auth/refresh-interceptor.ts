/**
 * F12 refresh interceptor — R1 mitigation contract (Task 2.1d).
 *
 * This is the single canonical module for 401-refresh-retry behavior in the
 * Kalori client. Every Phase 2+ mutation route handler client call MUST
 * route its `fetch` through `authFetch` / `authPost` exported here. Tasks
 * 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3b are contractually FORBIDDEN from
 * implementing local refresh-retry shims — see `Planning/tasks.md` §R1 and
 * `Planning/progress.md` R1 block.
 *
 * Contract (design-doc §18.1 F12 + architecture.md §8.2):
 *   1. Execute the fetch.
 *   2. If response.status !== 401, return response immediately.
 *   3. On 401:
 *      a. Call supabase.auth.refreshSession().
 *      b. If refreshSession returns { error } or throws:
 *           - call supabase.auth.signOut() (best-effort)
 *           - redirect window.location to /login?reason=session_expired
 *           - throw SessionExpiredError
 *      c. If refreshSession succeeds:
 *           - retry the ORIGINAL fetch EXACTLY ONCE
 *           - If retry returns 2xx/4xx-other/5xx: return as-is (NOT our job to
 *             retry non-auth errors)
 *           - If retry returns 401 AGAIN:
 *               - signOut + window.location to /login + throw SessionExpiredError
 *   4. Concurrent 401s share a SINGLE in-flight refresh promise (module-level
 *      singleton) — N parallel 401s trigger exactly ONE refreshSession call,
 *      then each request retries exactly once independently.
 *
 * Idempotency (I11): callers must pass a `client_id` inside the JSON body;
 * the server's idempotency index (owned by Phase 3+ tasks) uses it to
 * recognize a retried request whose original landed but whose response was
 * lost — this interceptor simply resends the same bytes, which is sufficient.
 *
 * Body preservation: callers pass string bodies (not single-use streams) so
 * both the original fetch and the retry see identical bytes. `authPost`
 * JSON.stringifies up front to guarantee this property.
 *
 * Test name prefix: F12-*. See:
 *   - `lib/auth/refresh-interceptor.test.ts` (unit, global-fetch-mocked)
 *   - `tests/integration/auth/auth-refresh-retry.test.ts` (integration, MSW + real route)
 */
import { getBrowserSupabase } from '@/lib/supabase/client';

/**
 * Thrown when the interceptor has exhausted its single-retry budget (refresh
 * failed OR retried fetch returned 401). Distinct name so downstream callers
 * can `instanceof`-check and react (e.g. surface a toast, abort optimistic UI).
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Session expired after refresh attempt') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Module-level in-flight refresh singleton. If N parallel 401 responses race
 * each other, only the first observer triggers `refreshSession()`; the rest
 * await the same promise. The promise is cleared once it settles so a later
 * session expiry triggers a fresh refresh.
 */
let inFlightRefresh: Promise<RefreshOutcome> | null = null;

type RefreshOutcome = { ok: true } | { ok: false };

async function sharedRefresh(): Promise<RefreshOutcome> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { error } = await supabase.auth.refreshSession();
        if (error) return { ok: false } as const;
        return { ok: true } as const;
      } catch {
        // refreshSession() itself throwing is treated the same as returning
        // { error } — the session is unrecoverable from here.
        return { ok: false } as const;
      }
    })();
    // Clear the singleton once it resolves so a subsequent 401 spawns a new
    // refresh (the previous one may have succeeded but a later token rotation
    // is still possible).
    inFlightRefresh.finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/**
 * Best-effort sign-out + redirect. Called when the refresh path cannot
 * recover the session. The Supabase SDK `signOut()` clears cookies on the
 * server via its own HTTP call; we don't separately hit `/api/auth/sign-out`
 * because the SDK already handles token invalidation end-to-end. The
 * sign-out POST route still exists for future server-side session cleanup
 * needs (e.g. BroadcastChannel-driven cross-tab sign-out in Task 5.2).
 */
async function forceSignOut(): Promise<void> {
  try {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
  } catch {
    // Swallow — we are already on the unrecoverable-session path; a failed
    // server sign-out is not fatal because the local state is about to be
    // redirected away.
  }
  if (typeof window !== 'undefined') {
    window.location.href = '/login?reason=session_expired';
  }
}

/**
 * Body types that can be replayed byte-for-byte on retry. Deliberately EXCLUDES
 * `ReadableStream` (single-use; the first fetch drains it), `FormData` (some
 * runtimes attach a single-use underlying stream), and `Blob` (ditto, plus
 * multipart boundaries are generated lazily and are not re-serializable on
 * retry). Restricting the type forces callers who need multipart uploads to
 * use a different path — at the MVP scale, all mutation endpoints accept JSON
 * and this narrower type is the "make the wrong thing hard to do" guarantee
 * that backs the R1 refresh contract. If a future endpoint legitimately needs
 * multipart, it must pre-buffer into `ArrayBuffer` or serialize upstream.
 */
type RetryableBody = string | URLSearchParams | ArrayBuffer | ArrayBufferView | null | undefined;

/**
 * `RequestInit` with the `body` slot narrowed to `RetryableBody`. Callers that
 * attempt to pass `FormData` / `Blob` / `ReadableStream` fail compilation with
 * a TypeScript error at the call site — the authoritative enforcement point.
 */
export type RetryableRequestInit = Omit<RequestInit, 'body'> & { body?: RetryableBody };

/**
 * Drop-in `fetch` replacement that automatically refreshes the Supabase
 * session once on 401 and retries the request. See module contract above.
 *
 * Body type is narrowed: only `RetryableBody` (string, URLSearchParams,
 * ArrayBuffer, ArrayBufferView, null, undefined) is accepted. Stream / Blob /
 * FormData bodies are single-use and would fail silently on retry; rejecting
 * them at compile time prevents that footgun per the R1 "make-the-wrong-
 * thing-hard-to-do" principle.
 */
export async function authFetch(
  input: string | URL,
  init?: RetryableRequestInit,
): Promise<Response> {
  const firstResponse = await fetch(input, init as RequestInit | undefined);
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const outcome = await sharedRefresh();
  if (!outcome.ok) {
    await forceSignOut();
    throw new SessionExpiredError();
  }

  // Retry exactly once with the same method/body bytes. RetryableBody
  // guarantees the body is replayable (string / URLSearchParams / ArrayBuffer
  // / ArrayBufferView / null / undefined) — no single-use streams reach here.
  const retryResponse = await fetch(input, init as RequestInit | undefined);
  if (retryResponse.status === 401) {
    await forceSignOut();
    throw new SessionExpiredError();
  }
  return retryResponse;
}

/**
 * Convenience JSON POST wrapper. Accepts a plain object body, serializes it
 * once, and routes the call through `authFetch`. The serialized string is
 * what both the original and retry fetch see — preserves body bytes across
 * retries (I11 idempotency handoff).
 *
 * Extra `init` overrides exclude `method` and `body`; callers never set those
 * fields because the wrapper owns them.
 */
export async function authPost<T>(
  url: string,
  body: unknown,
  init?: Omit<RetryableRequestInit, 'method' | 'body'>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await authFetch(url, {
    ...init,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`authPost ${url} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

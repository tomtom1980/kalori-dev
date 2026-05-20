/**
 * Task A.3 — Orphan-profile fence (US-STAB-A3).
 *
 * Two-step fence (auth.uid() server-scoping) for the 6 (app) page
 * handlers + every aggregate-bearing /api/** route. Replaces the inline
 * `profiles` SELECT + ad-hoc redirect/throw scattered across handlers
 * with one helper that:
 *
 *   1. Calls `getServerSupabase()` + `auth.getUser()` to derive the
 *      server-side `auth.uid()`. Client-supplied user ids are never
 *      trusted (AC4).
 *   2. Issues `.from('profiles').select(...).eq('id', user.id).maybeSingle()`
 *      — exactly one profile SELECT per request (AC5: no redundant
 *      profile reads in the caller's code path). The auth + profile
 *      lookup is two-step (NOT atomic with auth — see task-A.3-output.md
 *      "Codex Round 2" section for rationale and the planned RPC followup).
 *      RLS scoping is enforced server-side via auth.uid().
 *   3. Three branches on the result:
 *      - error: capture real Supabase error to Sentry.captureException
 *        (so transient DB blips don't get silently lost). Page flavor
 *        rethrows so Next's error boundary handles. API flavor returns
 *        `Response.json({error:'profile_lookup_unavailable'}, {status:503})`
 *        — DISTINCT from `profile_lookup_failed` so the refresh
 *        interceptor's 401 pattern-match does NOT sign the user out on
 *        a transient blip.
 *      - data === null && !error: orphan profile. Emits a Sentry
 *        breadcrumb `dashboard.orphan-profile-fenced` with SHA-256
 *        anonymized `user_id_hash` (AC3). Page flavor:
 *        `redirect('/onboarding')`. API flavor: returns
 *        `Response.json({error:'profile_lookup_failed'}, {status:401})`
 *        per US-STAB-D2 contract.
 *      - data present: ok. Returns `{ user, profile }` to caller.
 *
 * Recommended path: pure redirect (AC6 fallback-create branch is NOT
 * exercised by this implementation — see briefing §3 AC6 GREEN-means).
 *
 * The SHA-256 anonymizer is internal to this module per Task A.3 briefing
 * §7 "introduce one inline … do NOT reinvent in multiple places."
 *
 * R1 firewall: this is the ONLY new file under `lib/auth/`. No edits to
 * `refresh-interceptor.*`, `cross-tab-signout.*`, `get-display-identity.*`,
 * or `public-routes.ts`.
 *
 * TODO(future): replace the two-step auth + profile lookup with a
 * security-invoker RPC (or PostgREST RETURNING-style join) for atomic
 * auth+profile evaluation. See followups.md F-A3 entries.
 */
import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { apiUnauthenticated401 } from '@/lib/auth/api-401-response';
import { getServerSupabase } from '@/lib/supabase/server';

const BREADCRUMB_CATEGORY = 'dashboard.orphan-profile-fenced';
const OPTIONAL_AI_SUMMARY_OPT_IN_COLUMN = 'ai_summary_opt_in';

/**
 * SHA-256 hash of the supplied id, hex-encoded. Internal — Sentry
 * breadcrumb data only.
 */
function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex');
}

/**
 * Profile row shape returned to callers on the happy path. Callers may
 * pass `selectExtras` to widen the SELECT — those columns appear here as
 * `unknown` keys (callers cast at the use-site).
 */
export interface ProfileFenceRow {
  id: string;
  onboarding_completed_at: string | null;
  [extra: string]: unknown;
}

interface FenceContext {
  user: User;
  profile: ProfileFenceRow;
}

interface FenceOrphan {
  kind: 'orphan';
  user: User;
  anonymizedUserId: string;
}

interface FenceUnauthenticated {
  kind: 'unauthenticated';
}

interface FenceOk {
  kind: 'ok';
  ctx: FenceContext;
}

interface FenceLookupError {
  kind: 'lookup_error';
  user: User;
  anonymizedUserId: string;
  error: unknown;
}

/**
 * Typed error thrown by the page-route flavor when the profile lookup
 * fails for a transient/non-orphan reason (Supabase error, network
 * blip, RLS error, etc.). Page handlers should let this propagate to
 * Next's error boundary — DO NOT redirect to /onboarding for these.
 */
export class ProfileLookupError extends Error {
  override readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'ProfileLookupError';
    this.cause = cause;
  }
}

type FenceResult = FenceOk | FenceOrphan | FenceUnauthenticated | FenceLookupError;

function profileSelectColumns(opts: {
  selectExtras?: string | undefined;
  omitAiSummaryOptIn?: boolean | undefined;
}): string {
  const extras = (opts.selectExtras ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !opts.omitAiSummaryOptIn || part !== OPTIONAL_AI_SUMMARY_OPT_IN_COLUMN);
  return ['id', 'onboarding_completed_at', ...extras].join(', ');
}

function requestsAiSummaryOptIn(selectExtras: string | undefined): boolean {
  return (selectExtras ?? '')
    .split(',')
    .map((part) => part.trim())
    .includes(OPTIONAL_AI_SUMMARY_OPT_IN_COLUMN);
}

function isMissingAiSummaryOptInColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';
  return (
    code === '42703' &&
    message.includes('ai_summary_opt_in') &&
    message.toLowerCase().includes('does not exist')
  );
}

/**
 * Internal — runs the auth + profile lookup. Caller decides what to do
 * with the discriminated result. Issues exactly ONE profiles SELECT per
 * request (AC5: no redundant profile reads); auth+profile is two-step,
 * not atomic. RLS scoping enforced server-side via auth.uid().
 *
 * Three result shapes (after auth succeeds):
 *   - lookup_error: Supabase returned a real error — transient, should
 *     NOT be conflated with orphan (would force-logout via 401 path).
 *   - orphan: data === null and no error — user has no profile row.
 *   - ok: data present.
 */
async function runFence(opts: {
  supabase: SupabaseClient;
  selectExtras?: string | undefined;
}): Promise<FenceResult> {
  const { supabase, selectExtras } = opts;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { kind: 'unauthenticated' };
  }

  const cols = profileSelectColumns({ selectExtras });

  const initialResult = await supabase
    .from('profiles')
    .select(cols)
    .eq('id', user.id)
    .maybeSingle();
  let data = initialResult.data as unknown;
  let error = initialResult.error as unknown;

  if (error && requestsAiSummaryOptIn(selectExtras) && isMissingAiSummaryOptInColumn(error)) {
    const fallbackResult = await supabase
      .from('profiles')
      .select(profileSelectColumns({ selectExtras, omitAiSummaryOptIn: true }))
      .eq('id', user.id)
      .maybeSingle();
    const fallbackData = fallbackResult.data as unknown;
    data = fallbackData
      ? { ...(fallbackData as Record<string, unknown>), ai_summary_opt_in: false }
      : fallbackData;
    error = fallbackResult.error as unknown;
  }

  if (error) {
    // Transient Supabase error — NOT an orphan. Capture the real error
    // so Sentry sees the underlying cause. Caller decides 503 vs throw.
    return {
      kind: 'lookup_error',
      user,
      anonymizedUserId: hashUserId(user.id),
      error,
    };
  }

  if (!data) {
    return {
      kind: 'orphan',
      user,
      anonymizedUserId: hashUserId(user.id),
    };
  }

  return {
    kind: 'ok',
    ctx: { user, profile: data as unknown as ProfileFenceRow },
  };
}

/**
 * Sentry capture for a transient profile lookup error. Anonymized user
 * id only; never log the raw UUID. Tags route + op for triage.
 */
function captureLookupError(opts: {
  error: unknown;
  anonymizedUserId: string;
  route: string;
}): void {
  Sentry.captureException(opts.error, {
    tags: {
      source: 'orphan-profile-fence',
      op: 'profile-lookup',
    },
    contexts: {
      profile_lookup: {
        user_id_hash: opts.anonymizedUserId,
        route: opts.route,
      },
    },
  });
}

/**
 * Sentry breadcrumb on orphan detection. Anonymized user id only.
 */
function emitOrphanBreadcrumb(opts: { anonymizedUserId: string; route: string }): void {
  Sentry.addBreadcrumb({
    category: BREADCRUMB_CATEGORY,
    level: 'warning',
    message: 'Orphan profile detected; fencing request',
    data: {
      user_id_hash: opts.anonymizedUserId,
      route: opts.route,
    },
  });
}

/**
 * Page-route flavor. Calls `redirect('/onboarding')` from `next/navigation`
 * if the calling user has no profile row (orphan state). On the happy
 * path returns `{ user, profile }` — the caller may then check
 * `profile.onboarding_completed_at` for the wizard-complete gate.
 *
 * Unauthenticated requests redirect to `/login` (existing pattern).
 *
 * @param opts.route   passed into the Sentry breadcrumb only
 * @param opts.selectExtras  extra columns to widen the profile SELECT
 *                           (caller-typed via cast). E.g. `'unit_pref,
 *                           timezone, current_weight_kg'`.
 */
export async function requireProfileOrRedirect(opts: {
  route: string;
  selectExtras?: string | undefined;
  loginRedirectTo: string;
}): Promise<FenceContext> {
  const supabase = await getServerSupabase();
  const result = await runFence({ supabase, selectExtras: opts.selectExtras });

  if (result.kind === 'unauthenticated') {
    try {
      await supabase.auth.signOut();
    } catch {
      // Best-effort — the redirect below is the safety net.
    }
    redirect(
      `/login?reason=session_expired&redirect_to=${encodeURIComponent(opts.loginRedirectTo)}`,
    );
  }

  if (result.kind === 'lookup_error') {
    captureLookupError({
      error: result.error,
      anonymizedUserId: result.anonymizedUserId,
      route: opts.route,
    });
    // Phase B Codex Round 1 Critical F-PB-R1-2: ALL profiles-SELECT errors
    // — including PGRST116 — must fail closed and propagate to Next's
    // error boundary. The genuine missing-row orphan path is exclusively
    // the `data === null && error === null` branch (handled below); a
    // PGRST116 surfacing here means transient/RLS error, NOT no-row
    // (since `.maybeSingle()` returns `data:null, error:null` for empty
    // result sets). Redirecting any of these to /onboarding would let an
    // already-onboarded user re-enter the wizard, where the Step 8
    // finalize upsert can clobber their profile and recomputed targets.
    // Authed-but-broken sessions surface in Sentry; forged-cookie tokens
    // trip the unauthenticated branch upstream rather than masquerading
    // as orphans (C1-B forged-cookie contract preserved).
    throw new ProfileLookupError('profile lookup failed', result.error);
  }

  if (result.kind === 'orphan') {
    emitOrphanBreadcrumb({ anonymizedUserId: result.anonymizedUserId, route: opts.route });
    redirect('/onboarding');
  }

  return result.ctx;
}

/**
 * API-route flavor. Returns a JSON Response on orphan profile per US-STAB-D2
 * contract; on the happy path returns `{ user, profile }` so the caller can
 * keep its existing `userData.user.id` shape.
 *
 * Status-code map (Phase A Codex Round 1 Critical #1 + Task D.2 US-STAB-D2):
 *   - unauthenticated         → 401 canonical JSON envelope via
 *                               `apiUnauthenticated401()` —
 *                               `{ error: 'unauthenticated' }` +
 *                               `WWW-Authenticate: Bearer realm="kalori"`
 *                               (only 401 surface in this module). Body
 *                               string flipped from `'unauthorized'` to
 *                               `'unauthenticated'` for US-STAB-D2 AC1.
 *   - orphan profile           → 422 `{ error: 'profile_lookup_failed' }`
 *   - transient lookup error   → 503 `{ error: 'profile_lookup_unavailable' }`
 *
 * The orphan branch returns 422 (Unprocessable Entity) instead of 401 because
 * client `authFetch` (R1 firewall) pattern-matches every 401 as session-expiry,
 * refreshes once, and then force-signs-out on a second 401. An orphan user
 * redirected to onboarding could therefore be kicked to
 * `/login?reason=session_expired` by any fenced client API call. 422 is
 * outside that pattern, so the refresh-interceptor leaves the response alone
 * and the user stays on the self-heal path. Body shape is preserved so
 * existing callers that match on `body.error === 'profile_lookup_failed'`
 * keep working.
 *
 * Function name retained as `requireProfileOrJson401` (surgical-changes —
 * renaming would cascade through every API route caller). The "401" in the
 * name is now misleading for the orphan branch; rename is a follow-up.
 *
 * Caller pattern:
 *   const fenced = await requireProfileOrJson401({ route: '/api/x' });
 *   if (fenced instanceof Response) return fenced;
 *   const { user } = fenced;
 */
export async function requireProfileOrJson401(opts: {
  route: string;
  selectExtras?: string | undefined;
}): Promise<FenceContext | Response> {
  const supabase = await getServerSupabase();
  const result = await runFence({ supabase, selectExtras: opts.selectExtras });

  if (result.kind === 'unauthenticated') {
    // Task D.2 US-STAB-D2: canonical JSON 401 envelope. Body shape flipped
    // from `{error:'unauthorized'}` to `{error:'unauthenticated'}` AND
    // `WWW-Authenticate: Bearer realm="kalori"` added (RFC 6750). NO
    // Location header. R1 refresh-interceptor detection is status-code-only,
    // so this body-string flip preserves AC3.
    return apiUnauthenticated401();
  }

  if (result.kind === 'lookup_error') {
    // Transient Supabase error — return 503 so the refresh interceptor's
    // 401 pattern-match does NOT escalate this to a forced sign-out
    // (R1 firewall: distinct status + body from `profile_lookup_failed`).
    captureLookupError({
      error: result.error,
      anonymizedUserId: result.anonymizedUserId,
      route: opts.route,
    });
    return NextResponse.json(
      { error: 'profile_lookup_unavailable' },
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (result.kind === 'orphan') {
    emitOrphanBreadcrumb({ anonymizedUserId: result.anonymizedUserId, route: opts.route });
    // Phase A Codex Round 1 Critical #1: status 422 (Unprocessable Entity).
    // 422 is distinct from the 401 the refresh-interceptor pattern-matches
    // as session-expiry, so orphan API calls do NOT trigger forced sign-out
    // for users on the onboarding self-heal path. Body shape unchanged.
    return NextResponse.json(
      { error: 'profile_lookup_failed' },
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return result.ctx;
}

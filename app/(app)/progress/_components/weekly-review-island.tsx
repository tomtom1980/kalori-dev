/**
 * <WeeklyReviewIsland /> — Task 4.3a progress page weekly review (RSC).
 *
 * Streaming Suspense boundary #6. Reads the cached `weekly_reviews` row
 * for (user, weekStartOn); if missing or expired, delegates to
 * `/api/ai/weekly-review` which handles sparse-data short-circuit (no
 * Gemini call, writes `ai_call_log` row per briefing §0 Resolution #3)
 * vs. full Gemini generation. Either branch returns the same-shape
 * response — island renders via <WeeklyReviewCore variant="full">.
 *
 * Week boundary is ISO-Monday in the user's TZ. Computed server-side
 * to avoid client-side TZ drift.
 *
 * Codex Round 1 fix (I-1): `headers()` / `cookies()` MUST NOT be called
 * inside this Suspense island — doing so couples the island to the
 * request context and defeats the PPR-ready topology (Resolution #9).
 * The request origin + propagated cookie header are captured ONCE in
 * the parent page RSC (`app/(app)/progress/page.tsx`) and passed as
 * props. The island remains a pure "data-fetch by prop" server
 * component, so when `experimental.ppr` flips on the island can render
 * with the already-resolved request context without re-reading
 * request-scoped storage inside its own render scope.
 */
import { WeeklyReviewCore } from '@/components/charts/WeeklyReviewCore';
import { getServerSupabase } from '@/lib/supabase/server';
import { userTzDayFrom } from '@/lib/time/day';

export interface WeeklyReviewIslandProps {
  userId: string;
  tz: string;
  clientId: string;
  /**
   * Request-time ISO instant, captured by the parent page RSC once per
   * request. Passed as a prop to avoid calling `Date.now()` inside the
   * island's server-render scope (react-hooks/purity rule).
   */
  nowIso: string;
  /**
   * Request origin string (e.g., `https://kalori-one.vercel.app`),
   * resolved in the parent page RSC via `headers().get('host')`. Passed
   * as a prop so this island never reads `headers()` itself (Codex R1
   * I-1 fix — keeps PPR-ready topology intact).
   */
  requestOrigin: string;
  /**
   * Cookie header string from the inbound request, captured by the
   * parent page RSC via `headers().get('cookie')`. Forwarded into the
   * same-origin POST so the weekly-review route can resolve the user's
   * session. Empty string if the request has no cookies (unauthenticated
   * request would have been redirected by middleware upstream).
   */
  cookieHeader: string;
}

export async function WeeklyReviewIsland({
  userId,
  tz,
  clientId,
  nowIso,
  requestOrigin,
  cookieHeader,
}: WeeklyReviewIslandProps) {
  const nowMs = Date.parse(nowIso);
  const weekStartOn = isoMondayInUserTz(nowIso, tz);
  const weekEndsOn = addDaysIso(weekStartOn, 6);

  // Try cached row first.
  const supabase = await getServerSupabase();
  const { data: row } = await supabase
    .from('weekly_reviews')
    .select('insights, generated_at, expires_at, week_start_on')
    .eq('user_id', userId)
    .eq('week_start_on', weekStartOn)
    .maybeSingle();

  const isRowFresh = row?.expires_at && Date.parse(row.expires_at) > nowMs;

  if (isRowFresh && row?.insights) {
    const insights = row.insights as {
      body_markdown?: string | null;
      sparse_data?: boolean;
      logged_days?: Array<{ date: string; summary: string }>;
    };
    return (
      <WeeklyReviewCore
        variant="full"
        status={insights.sparse_data ? 'sparse-data' : 'fresh'}
        insights={insights}
        generatedAt={(row.generated_at as string | null | undefined) ?? undefined}
        expiresAt={(row.expires_at as string | null | undefined) ?? undefined}
        weekStartOn={weekStartOn}
        weekEndsOn={weekEndsOn}
      />
    );
  }

  // Cache miss: invoke the route handler via same-origin fetch with
  // propagated cookies. Origin + cookie header were captured in the
  // parent page RSC (I-1 fix).
  let status: 'fresh' | 'sparse-data' | 'error' = 'fresh';
  let insights: {
    body_markdown?: string | null;
    sparse_data?: boolean;
    logged_days?: Array<{ date: string; summary: string }>;
  } = {};
  try {
    const res = await fetch(`${requestOrigin}/api/ai/weekly-review`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify({ client_id: clientId, week_start_on: weekStartOn }),
      cache: 'no-store',
    });
    if (!res.ok) {
      status = 'error';
    } else {
      const payload = (await res.json()) as {
        body_markdown?: string | null;
        sparse_data?: boolean;
        logged_days?: Array<{ date: string; summary: string }>;
      };
      insights = payload;
      status = payload.sparse_data ? 'sparse-data' : 'fresh';
    }
  } catch {
    status = 'error';
  }

  return (
    <WeeklyReviewCore
      variant="full"
      status={status}
      insights={insights}
      weekStartOn={weekStartOn}
      weekEndsOn={weekEndsOn}
    />
  );
}

/** Return the ISO-Monday date (YYYY-MM-DD) of the week containing `nowIso` in the user's TZ. */
function isoMondayInUserTz(nowIso: string, tz: string): string {
  const today = userTzDayFrom(nowIso, tz);
  const [y, m, d] = today.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return today;
  const todayUtcAnchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  const dayNum = todayUtcAnchor.getUTCDay(); // 0=Sun, 1=Mon
  const daysSinceMonday = dayNum === 0 ? 6 : dayNum - 1;
  const mondayMs = todayUtcAnchor.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000;
  const mondayDate = new Date(mondayMs);
  const yy = mondayDate.getUTCFullYear();
  const mm = String(mondayDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(mondayDate.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function addDaysIso(day: string, n: number): string {
  const [y, m, d] = day.split('-').map((p) => parseInt(p, 10));
  if (!y || !m || !d) return day;
  const ms = Date.UTC(y, m - 1, d, 12, 0, 0, 0) + n * 24 * 60 * 60 * 1000;
  const dt = new Date(ms);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * `GET /api/dashboard/bac` — widget-only BAC refresh source.
 *
 * Bug D fix (bugfix-tomi 2026-05-19-bac-improvements). The previous
 * `<BacTracker />` refresh handler called `router.refresh()` on the
 * `next/navigation` router, which re-streams every RSC under `/dashboard`
 * — 7+ islands repaint while the user is staring at one small widget. This
 * route lets the widget refresh in isolation via `authFetch` (R1 refresh-
 * interceptor contract preserved).
 *
 * Pipeline mirrors `lib/dashboard/aggregate.ts` so the value returned here
 * is bit-identical to what an RSC re-stream would have produced. No new
 * BAC math — calls `calculateBac` and `fetchAlcoholLogs` directly.
 *
 * Auth fence: project-standard `requireProfileOrJson401` (Task A.3). The
 * fence widens the profiles SELECT with `bio_sex, current_weight_kg` so we
 * could in principle build the BAC profile straight from `fenced.profile`,
 * but the SSR aggregate path uses `fetchProfile()` (per-request React
 * cache), so we use the same reader here to keep cache-key parity and to
 * future-proof against extra Profile fields the calculator may need.
 *
 * `asOf` is the server-side `new Date().toISOString()` (never trusted from
 * the client) — same contract as the `aggregateDay` orchestrator.
 */
import { NextResponse } from 'next/server';

import { calculateBac } from '@/lib/alcohol/bac';
import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { fetchAlcoholLogs, fetchProfile } from '@/lib/dashboard/fetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const fenced = await requireProfileOrJson401({
    route: '/api/dashboard/bac',
    selectExtras: 'bio_sex, current_weight_kg',
  });
  if (fenced instanceof Response) return fenced;

  const profile = await fetchProfile(fenced.user.id);
  const asOf = new Date().toISOString();
  const logs = await fetchAlcoholLogs(fenced.user.id, asOf);
  const value = calculateBac({
    logs,
    profile: {
      bio_sex: profile.bio_sex,
      current_weight_kg: profile.current_weight_kg,
    },
    asOf,
  });

  return NextResponse.json({ value, calculatedAt: asOf }, { status: 200 });
}

/**
 * `GET /api/export/csv` — CSV-bundle export (Task 5.2).
 *
 * The CSV "format" is itself a ZIP of 4 CSVs (entries / weight / water /
 * library) per design-doc §10.9 + briefing §2.4 (CSV: ZIP bundle convention).
 * Single inner ZIP returned as `application/zip` with
 * `Content-Disposition: attachment` and filename
 *   `kalori-export-{userId}-{YYYYMMDD}.csv-bundle.zip`
 *
 * Auth-gated, RLS-scoped. Client invokes via authFetch (R1 firewall).
 */
import { NextResponse } from 'next/server';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { buildCsvBundle } from '@/lib/export/csv';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function dateStamp(): string {
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export async function GET(): Promise<Response> {
  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/export/csv' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  let result;
  try {
    result = await buildCsvBundle({ supabase, userId });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'export_failed',
        cause: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }

  const filename = `kalori-export-${userId}-${dateStamp()}.csv-bundle.zip`;
  // Convert Buffer to Uint8Array body for NextResponse.
  return new NextResponse(new Uint8Array(result.csvZipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Rows': String(result.totalRows),
    },
  });
}

/**
 * `GET /api/export/json` — JSON-only export (Task 5.2).
 *
 * Auth-gated, RLS-scoped via user-scoped SSR client. Streams a single JSON
 * file with `Content-Disposition: attachment` so the browser triggers a
 * native download. Filename per design-doc §6:
 *   `kalori-export-{userId}-{YYYYMMDD}.json`
 *
 * Client-side caller (Phase 2B `<ExportModal>`) invokes via authFetch — R1
 * firewall.
 */
import { NextResponse } from 'next/server';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { buildJsonExport } from '@/lib/export/json';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function dateStamp(): string {
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

export async function GET(): Promise<Response> {
  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/export/json' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();

  let body;
  try {
    body = await buildJsonExport({ supabase, userId });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'export_failed',
        cause: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }

  const json = JSON.stringify(body, null, 2);
  const filename = `kalori-export-${userId}-${dateStamp()}.json`;
  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

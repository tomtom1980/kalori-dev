/**
 * `GET /api/export/zip` — outer ZIP combining inner CSV bundle + JSON dump
 * (Task 5.2).
 *
 * Per Conflict #9a (synthesis §1) + briefing §2.4: ships and is callable but
 * no MVP UI button drives it (the two Settings buttons download CSV-bundle.zip
 * or JSON directly). Reserved for future "EXPORT EVERYTHING" flow.
 *
 * Outer ZIP shape:
 *   kalori-export-{userId}-{YYYYMMDD}.zip
 *   ├── kalori-export-{userId}-{YYYYMMDD}.csv-bundle.zip   (inner)
 *   └── kalori-export-{userId}-{YYYYMMDD}.json
 *
 * Auth-gated, RLS-scoped. Client invokes via authFetch (R1 firewall).
 */
import archiver from 'archiver';
import { NextResponse } from 'next/server';

import { requireProfileOrJson401 } from '@/lib/auth/orphan-profile-fence';
import { buildCsvBundle } from '@/lib/export/csv';
import { buildJsonExport } from '@/lib/export/json';
import { getServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function dateStamp(): string {
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

async function buildOuterZip(args: {
  csvZipBuffer: Buffer;
  jsonBuffer: Buffer;
  userId: string;
  stamp: string;
}): Promise<Buffer> {
  const { csvZipBuffer, jsonBuffer, userId, stamp } = args;
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  const finalize = new Promise<void>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  archive.append(csvZipBuffer, {
    name: `kalori-export-${userId}-${stamp}.csv-bundle.zip`,
  });
  archive.append(jsonBuffer, { name: `kalori-export-${userId}-${stamp}.json` });
  archive.finalize();
  await finalize;
  return Buffer.concat(chunks);
}

export async function GET(): Promise<Response> {
  // Task A.3 — orphan-profile fence (US-STAB-A3) before any aggregate read.
  const fenced = await requireProfileOrJson401({ route: '/api/export/zip' });
  if (fenced instanceof Response) return fenced;
  const userId = fenced.user.id;
  const supabase = await getServerSupabase();
  const stamp = dateStamp();

  let csvBundle;
  let jsonBody;
  try {
    [csvBundle, jsonBody] = await Promise.all([
      buildCsvBundle({ supabase, userId }),
      buildJsonExport({ supabase, userId }),
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'export_failed',
        cause: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }

  const jsonBuffer = Buffer.from(JSON.stringify(jsonBody, null, 2), 'utf8');
  let outerZip;
  try {
    outerZip = await buildOuterZip({
      csvZipBuffer: csvBundle.csvZipBuffer,
      jsonBuffer,
      userId,
      stamp,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'zip_failed',
        cause: err instanceof Error ? err.message : 'unknown',
      },
      { status: 500 },
    );
  }

  const filename = `kalori-export-${userId}-${stamp}.zip`;
  return new NextResponse(new Uint8Array(outerZip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

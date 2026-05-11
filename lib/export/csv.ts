/**
 * Server-only CSV export builder (Task 5.2).
 *
 * Produces an inner ZIP bundle containing 4 CSVs: entries.csv, weight.csv,
 * water.csv, library.csv. ZIP-of-CSVs is the design-doc §10.9 + briefing
 * F-EXPORT convention; the outer `/api/export/zip` route may then bundle
 * THIS inner zip together with the JSON dump.
 *
 * Timestamp columns (per design-doc §10.9):
 *   - `*_utc`: ISO 8601 UTC
 *   - `*_local_iso`: ISO 8601 in the user's tz from profiles.timezone
 *   - `*_tz`: the user's tz string (e.g. "Asia/Ho_Chi_Minh")
 *
 * RLS-scoped reads via the user-scoped SSR client. NEVER the admin client
 * (briefing line 542 + I1).
 */
import archiver from 'archiver';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Readable } from 'node:stream';

interface BuildCsvBundleArgs {
  supabase: SupabaseClient;
  userId: string;
}

export interface BuildCsvBundleResult {
  csvZipBuffer: Buffer;
  totalRows: number;
}

/**
 * RFC 4180-ish CSV escaping. Wraps any value that contains comma, quote,
 * CR, or LF in double quotes, and doubles inner double quotes.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'string') {
    s = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    s = String(value);
  } else if (value instanceof Date) {
    s = value.toISOString();
  } else {
    s = JSON.stringify(value);
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToLine(headers: readonly string[], row: Record<string, unknown>): string {
  return headers.map((h) => csvEscape(row[h])).join(',');
}

function rowsToCsv(headers: readonly string[], rows: Array<Record<string, unknown>>): string {
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(rowToLine(headers, row));
  }
  // Trailing newline so spreadsheet apps treat the file as complete.
  return `${lines.join('\n')}\n`;
}

/**
 * Convert a UTC ISO timestamp to a "local ISO" string for the user's tz.
 * The output uses the same `YYYY-MM-DDTHH:mm:ss±HH:mm` shape but in user
 * tz; we use Intl.DateTimeFormat parts to construct it deterministically.
 */
function toLocalIso(utcIso: string | null | undefined, tz: string): string {
  if (!utcIso) return '';
  try {
    const d = new Date(utcIso);
    if (Number.isNaN(d.getTime())) return '';
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour') === '24' ? '00' : get('hour');
    const minute = get('minute');
    const second = get('second');
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  } catch {
    return '';
  }
}

const ENTRY_HEADERS = [
  'id',
  'client_id',
  'logged_at_utc',
  'logged_at_local_iso',
  'logged_at_tz',
  'meal_category',
  'source',
  'library_item_id',
  'items_json',
  'ai_reasoning',
  'created_at_server',
] as const;

const WEIGHT_HEADERS = [
  'id',
  'client_id',
  'date',
  'logged_at_utc',
  'logged_at_local_iso',
  'logged_at_tz',
  'weight_kg',
  'note',
] as const;

const WATER_HEADERS = [
  'id',
  'client_id',
  'date',
  'count',
  'unit',
  'created_at_utc',
  'created_at_local_iso',
  'created_at_tz',
] as const;

const LIBRARY_HEADERS = [
  'id',
  'client_id',
  'normalized_name',
  'display_name',
  'default_portion',
  'default_unit',
  'nutrition_json',
  'log_count',
  'last_used_at_utc',
  'last_used_at_local_iso',
  'last_used_at_tz',
  'user_edited_flag',
  'created_from',
  'created_at_utc',
] as const;

async function fetchProfileTz(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();
  const row = data as { timezone?: string } | null;
  return row?.timezone ?? 'UTC';
}

/**
 * Codex C1 fix — page reads via `.range(start, end)` so users with more
 * than PostgREST's 1000-row default cap get a complete export. Each page
 * is a 1000-row inclusive window; we loop while the last batch returns a
 * full page (== PAGE_SIZE rows) and short-circuit on the first short page.
 *
 * Defensive `MAX_ITERATIONS` cap (100 × 1000 = 100,000 rows) mirrors
 * `deleteStorageObjectsForUser` in `lib/account/delete.ts:113` to prevent
 * runaway loops on a misbehaving server.
 */
const PAGE_SIZE = 1000;
const MAX_ITERATIONS = 100;

async function fetchAll<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  userIdColumn: string,
  userId: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const from = i * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    // Codex R1 I1 fix — Postgres does not guarantee row order across pages
    // without an explicit ORDER BY. `.range(...)` plus a non-deterministic
    // plan order produces duplicates and skips for users with >1000 rows.
    // Order by `id` (uuid PK on every table here) before paginating so the
    // window is stable.
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(userIdColumn, userId)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`${table}_read_failed: ${error.message ?? 'unknown'}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

export async function buildCsvBundle(args: BuildCsvBundleArgs): Promise<BuildCsvBundleResult> {
  const { supabase, userId } = args;

  const [tz, entries, weight, water, library] = await Promise.all([
    fetchProfileTz(supabase, userId),
    fetchAll<Record<string, unknown>>(supabase, 'food_entries', 'user_id', userId),
    fetchAll<Record<string, unknown>>(supabase, 'weight_log', 'user_id', userId),
    fetchAll<Record<string, unknown>>(supabase, 'water_log', 'user_id', userId),
    fetchAll<Record<string, unknown>>(supabase, 'food_library_items', 'user_id', userId),
  ]);

  // Map DB rows into CSV-friendly shapes with timestamp triplets.
  const entryRows = entries.map((r) => {
    const loggedAt = (r.logged_at as string) ?? '';
    return {
      id: r.id,
      client_id: r.client_id,
      logged_at_utc: loggedAt,
      logged_at_local_iso: toLocalIso(loggedAt, tz),
      logged_at_tz: tz,
      meal_category: r.meal_category,
      source: r.source,
      library_item_id: r.library_item_id ?? '',
      items_json: r.items ?? '',
      ai_reasoning: r.ai_reasoning ?? '',
      created_at_server: r.created_at_server ?? '',
    };
  });

  const weightRows = weight.map((r) => {
    const createdAt = (r.created_at as string) ?? '';
    return {
      id: r.id,
      client_id: r.client_id,
      date: r.date,
      logged_at_utc: createdAt,
      logged_at_local_iso: toLocalIso(createdAt, tz),
      logged_at_tz: tz,
      weight_kg: r.weight_kg,
      note: r.note ?? '',
    };
  });

  const waterRows = water.map((r) => {
    const createdAt = (r.created_at as string) ?? '';
    return {
      id: r.id,
      client_id: r.client_id,
      date: r.date,
      count: r.count,
      unit: r.unit,
      created_at_utc: createdAt,
      created_at_local_iso: toLocalIso(createdAt, tz),
      created_at_tz: tz,
    };
  });

  const libraryRows = library.map((r) => {
    const lastUsed = (r.last_used_at as string | null) ?? '';
    const createdAt = (r.created_at as string) ?? '';
    return {
      id: r.id,
      client_id: r.client_id,
      normalized_name: r.normalized_name,
      display_name: r.display_name,
      default_portion: r.default_portion ?? '',
      default_unit: r.default_unit ?? '',
      nutrition_json: r.nutrition ?? '',
      log_count: r.log_count,
      last_used_at_utc: lastUsed,
      last_used_at_local_iso: lastUsed ? toLocalIso(lastUsed, tz) : '',
      last_used_at_tz: tz,
      user_edited_flag: r.user_edited_flag,
      created_from: r.created_from,
      created_at_utc: createdAt,
    };
  });

  const entriesCsv = rowsToCsv(ENTRY_HEADERS, entryRows);
  const weightCsv = rowsToCsv(WEIGHT_HEADERS, weightRows);
  const waterCsv = rowsToCsv(WATER_HEADERS, waterRows);
  const libraryCsv = rowsToCsv(LIBRARY_HEADERS, libraryRows);

  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];

  // Buffer the archive output in memory. The final outer `/api/export/zip`
  // route can stream this buffer back as a single ZIP entry, or the inner
  // CSV-only download can return the buffer as `Content-Type: application/zip`.
  archive.append(entriesCsv, { name: 'entries.csv' });
  archive.append(weightCsv, { name: 'weight.csv' });
  archive.append(waterCsv, { name: 'water.csv' });
  archive.append(libraryCsv, { name: 'library.csv' });

  const finalize = new Promise<void>((resolve, reject) => {
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

  archive.finalize();
  // Pipe-into-collector via the data event above. Wait for end.
  await finalize;
  // Drain any trailing data via a no-op consumer.
  Readable.from(chunks);

  const csvZipBuffer = Buffer.concat(chunks);
  const totalRows = entryRows.length + weightRows.length + waterRows.length + libraryRows.length;

  return { csvZipBuffer, totalRows };
}

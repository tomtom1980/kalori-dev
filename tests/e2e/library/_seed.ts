/**
 * Library test seed helper — Task 4.1 sub-step 4.
 *
 * Extends the F-TEST-4 `authedPage` fixture with a way to bulk-insert
 * `food_library_items` rows (and optionally `food_entries` rows linking to
 * them) under the test user's id via service-role. Per reconciled spec §11.3
 * the fixture "optionally accepts { seedLibraryItems?: LibraryItem[] }" —
 * we implement that as a standalone helper the specs call once after the
 * `authedPage` fixture has provisioned the user, so the fixture stays
 * generic.
 *
 * Strategy:
 *   - Read `SUPABASE_TEST_URL` + `SUPABASE_TEST_SERVICE_ROLE_KEY` from env
 *     (same fallback chain as fixtures/auth.ts resolveEnv()).
 *   - Use a fresh admin client per call (lightweight; no persistSession).
 *   - Resolve the user id from the Playwright context's auth cookie (avoids
 *     threading another parameter through every spec). The cookie name is
 *     `sb-<project-ref>-auth-token`; value is `base64-<base64url(JSON)>`.
 *   - Insert rows; row ids are auto-generated. Return the inserted rows so
 *     specs can assert on ids.
 *
 * Cleanup:
 *   NO per-row cleanup needed — the auth fixture's teardown cascade-deletes
 *   via `auth.users -> profiles -> food_library_items` (FK on delete cascade
 *   per migration 0003).
 */
import type { BrowserContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SeedLibraryItemInput {
  display_name: string;
  normalized_name?: string;
  default_portion?: number | null;
  default_unit?: string | null;
  nutrition?: {
    kcal: number;
    macros?: { protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number };
  };
  thumbnail_url?: string | null;
  log_count?: number;
  last_used_at?: string | null;
  user_edited_flag?: boolean;
  created_from?: 'text' | 'photo';
  created_at?: string;
}

export interface SeededLibraryItem {
  id: string;
  client_id: string;
  display_name: string;
  normalized_name: string;
  log_count: number;
}

function resolveEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Seed helper env missing: SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY (CI) or NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (local).',
    );
  }
  return { url, serviceRoleKey };
}

function buildAdmin(url: string, key: string): SupabaseClient {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Decode the user id from the `sb-<ref>-auth-token` cookie that the auth
 * fixture wrote onto the browser context. Format is
 * `base64-<base64url(JSON.stringify(session))>`; the session payload's
 * `user.id` is what we need.
 */
export async function resolveTestUserId(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  const authCookie = cookies.find(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'),
  );
  if (!authCookie) {
    throw new Error('Seed helper: could not locate Supabase auth cookie on context');
  }
  const value = authCookie.value;
  if (!value.startsWith('base64-')) {
    throw new Error('Seed helper: auth cookie not in expected base64-prefixed shape');
  }
  const decoded = Buffer.from(value.slice('base64-'.length), 'base64url').toString('utf8');
  const parsed = JSON.parse(decoded) as { user?: { id?: string } };
  const id = parsed.user?.id;
  if (!id || typeof id !== 'string') {
    throw new Error('Seed helper: session cookie missing user.id');
  }
  return id;
}

/** Normalize a display name the same way the app layer does (lowercase + trim). */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Insert a batch of library items for the given user. Returns the inserted
 * rows with their generated ids. Each row gets a fresh uuid `client_id`.
 */
export async function seedLibraryItems(
  userId: string,
  items: readonly SeedLibraryItemInput[],
): Promise<SeededLibraryItem[]> {
  if (items.length === 0) return [];
  const { url, serviceRoleKey } = resolveEnv();
  const admin = buildAdmin(url, serviceRoleKey);

  const rows = items.map((it) => ({
    user_id: userId,
    client_id: crypto.randomUUID(),
    display_name: it.display_name,
    normalized_name: it.normalized_name ?? normalize(it.display_name),
    default_portion: it.default_portion ?? 1,
    default_unit: it.default_unit ?? 'serving',
    nutrition: it.nutrition ?? {
      kcal: 200,
      macros: { protein_g: 10, carbs_g: 20, fat_g: 8 },
    },
    thumbnail_url: it.thumbnail_url ?? null,
    log_count: it.log_count ?? 1,
    last_used_at: it.last_used_at ?? null,
    user_edited_flag: it.user_edited_flag ?? false,
    created_from: it.created_from ?? 'text',
    created_at: it.created_at ?? new Date().toISOString(),
  }));

  const { data, error } = await admin
    .from('food_library_items')
    .insert(rows)
    .select('id, client_id, display_name, normalized_name, log_count');
  if (error) throw new Error(`seedLibraryItems failed: ${error.message}`);
  const inserted = (data ?? []) as SeededLibraryItem[];
  return inserted;
}

/**
 * Insert food_entries rows referencing a given library item id. Used by the
 * merge spec to prove FK repoint happens server-side.
 *
 * Minimal columns: user_id, client_id, library_item_id, logged_at, nutrition,
 * source ('text' | 'photo'). `display_name` is copied from the library item
 * for readability; the real app denormalizes snapshot fields on insert.
 */
export async function seedFoodEntries(
  userId: string,
  rows: ReadonlyArray<{
    library_item_id: string;
    display_name: string;
    logged_at: string;
    meal_category?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
    nutrition?: { kcal: number; macros: { protein_g: number; carbs_g: number; fat_g: number } };
  }>,
): Promise<Array<{ id: string; library_item_id: string | null }>> {
  if (rows.length === 0) return [];
  const { url, serviceRoleKey } = resolveEnv();
  const admin = buildAdmin(url, serviceRoleKey);

  // food_entries schema (migration 0003): user_id, client_id, library_item_id,
  // meal_category, source, items (jsonb array), ai_reasoning, logged_at.
  // The display_name + nutrition are stored inside `items[]`, not top-level.
  const payload = rows.map((r) => ({
    user_id: userId,
    client_id: crypto.randomUUID(),
    library_item_id: r.library_item_id,
    meal_category: r.meal_category ?? 'lunch',
    source: 'library' as const,
    items: [
      {
        display_name: r.display_name,
        portion: 1,
        unit: 'serving',
        nutrition: r.nutrition ?? {
          kcal: 200,
          macros: { protein_g: 10, carbs_g: 20, fat_g: 8 },
        },
      },
    ],
    logged_at: r.logged_at,
  }));
  const { data, error } = await admin
    .from('food_entries')
    .insert(payload)
    .select('id, library_item_id');
  if (error) throw new Error(`seedFoodEntries failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; library_item_id: string | null }>;
}

/**
 * Read library rows for a user (service-role, bypasses RLS). Used to assert
 * tombstones / hard-deletes after a mutation round-trip.
 */
export async function fetchLibraryRows(
  userId: string,
): Promise<
  Array<{ id: string; client_id: string; display_name: string; deleted_at: string | null }>
> {
  const { url, serviceRoleKey } = resolveEnv();
  const admin = buildAdmin(url, serviceRoleKey);
  const { data, error } = await admin
    .from('food_library_items')
    .select('id, client_id, display_name, deleted_at')
    .eq('user_id', userId);
  if (error) throw new Error(`fetchLibraryRows failed: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    client_id: string;
    display_name: string;
    deleted_at: string | null;
  }>;
}

/**
 * Read food_entries rows for a user. Used by the merge spec to assert FK
 * repoint happened (entry.library_item_id now = winnerId).
 */
export async function fetchEntryRows(
  userId: string,
): Promise<Array<{ id: string; library_item_id: string | null }>> {
  const { url, serviceRoleKey } = resolveEnv();
  const admin = buildAdmin(url, serviceRoleKey);
  const { data, error } = await admin
    .from('food_entries')
    .select('id, library_item_id')
    .eq('user_id', userId);
  if (error) throw new Error(`fetchEntryRows failed: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    library_item_id: string | null;
  }>;
}

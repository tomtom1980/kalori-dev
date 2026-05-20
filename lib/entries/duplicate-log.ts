import { normalizeName } from '@/lib/text/normalize';
import { userTzDayFrom, userTzDayUtcRange } from '@/lib/time/day';

type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

interface DuplicateQueryResult {
  data: DuplicateEntryRow[] | null;
  error: unknown;
}

interface QueryBuilderLike extends PromiseLike<DuplicateQueryResult> {
  select: (columns: string) => QueryBuilderLike;
  eq: (column: string, value: unknown) => QueryBuilderLike;
  gte: (column: string, value: unknown) => QueryBuilderLike;
  lt: (column: string, value: unknown) => QueryBuilderLike;
  limit: (count: number) => QueryBuilderLike;
}

interface SupabaseLike {
  from: (table: string) => {
    select: (columns: string) => QueryBuilderLike;
  };
}

interface DuplicateEntryRow {
  id?: unknown;
  library_item_id?: unknown;
  items?: unknown;
}

interface DuplicateCheckInput {
  supabase: unknown;
  userId: string;
  loggedAtIso: string;
  timezone: string;
  mealCategory: MealCategory;
  libraryItemId?: string | null;
  itemNames: readonly string[];
}

function itemNameSet(items: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const name = (item as { name?: unknown }).name;
    if (typeof name !== 'string') continue;
    const normalized = normalizeName(name);
    if (normalized) out.add(normalized);
  }
  return out;
}

export async function findDuplicateFoodLog({
  supabase,
  userId,
  loggedAtIso,
  timezone,
  mealCategory,
  libraryItemId,
  itemNames,
}: DuplicateCheckInput): Promise<{ id: string } | null> {
  const day = new Date(loggedAtIso);
  if (Number.isNaN(day.getTime())) return null;

  const names = itemNames.map(normalizeName).filter(Boolean);
  if (!libraryItemId && names.length === 0) return null;

  const client = supabase as SupabaseLike;
  const { startUtc, endUtc } = userTzDayUtcRange(userTzDayFrom(loggedAtIso, timezone), timezone);
  const query = client
    .from('food_entries')
    .select('id, library_item_id, items')
    .eq('user_id', userId)
    .eq('meal_category', mealCategory);
  if (
    typeof query.gte !== 'function' ||
    typeof query.lt !== 'function' ||
    typeof query.limit !== 'function'
  ) {
    return null;
  }
  const { data, error } = await query.gte('logged_at', startUtc).lt('logged_at', endUtc).limit(50);

  if (error || !data) return null;

  for (const row of data) {
    if (libraryItemId && row.library_item_id === libraryItemId && typeof row.id === 'string') {
      return { id: row.id };
    }
    const existingNames = itemNameSet(row.items);
    if (names.some((name) => existingNames.has(name)) && typeof row.id === 'string') {
      return { id: row.id };
    }
  }
  return null;
}

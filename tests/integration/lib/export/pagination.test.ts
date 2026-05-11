/**
 * Task 5.2 Codex C1 — Export pagination integration test.
 *
 * Asserts that `buildJsonExport` and `buildCsvBundle` both page through
 * Supabase reads via `.range(start, end)` so users with >1000 rows in any
 * table get a complete export. PostgREST caps a bare `select('*')` at
 * 1000 rows; the bug fix is to issue successive `.range()` windows until
 * a short page returns.
 *
 * The test mocks the Supabase client to return:
 *   - 1500 rows for `food_entries` (one of the highest-cardinality tables)
 *   - smaller fixed sets for the other tables
 *   - a single profile row
 *
 * If `fetchAll` paginates correctly, the resulting JSON export has
 * `entries.length === 1500`. If the bug is still present, only 1000 rows
 * land in the export.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCsvBundle } from '@/lib/export/csv';
import { buildJsonExport } from '@/lib/export/json';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

interface RangeArgs {
  from: number;
  to: number;
}

interface RecordedQuery {
  table: string;
  ranges: RangeArgs[];
}

function makeRow(prefix: string, index: number): Record<string, unknown> {
  return {
    id: `${prefix}-${index}`,
    client_id: `c-${prefix}-${index}`,
    user_id: TEST_USER_ID,
    // Minimal columns the row mappers in csv.ts touch; null/empty for the rest.
    logged_at: '2026-04-15T08:30:00Z',
    created_at: '2026-04-15T08:30:00Z',
    last_used_at: '2026-04-15T08:30:00Z',
    date: '2026-04-15',
    meal_category: 'breakfast',
    source: 'ai_text',
    library_item_id: null,
    items: null,
    ai_reasoning: null,
    created_at_server: '2026-04-15T08:30:00Z',
    weight_kg: 60.0,
    note: null,
    count: 1,
    unit: 'glass',
    normalized_name: 'item',
    display_name: 'Item',
    default_portion: 1,
    default_unit: 'serving',
    nutrition: null,
    log_count: 1,
    user_edited_flag: false,
    created_from: 'ai',
  };
}

function makeRows(prefix: string, total: number): Array<Record<string, unknown>> {
  return Array.from({ length: total }, (_, i) => makeRow(prefix, i));
}

/**
 * A select chain that records every `.range()` call into a shared
 * `queryRecord` and returns the row window the call requested. Mimics
 * PostgREST's inclusive .range(from, to) semantics. The shared record
 * lets the test assert "this many .range() calls landed on this table"
 * across multiple .from(table) invocations (one per fetchAll iteration).
 */
function buildRangeAwareSelectChainShared(
  _table: string,
  rows: Array<Record<string, unknown>>,
  queryRecord: RecordedQuery,
): unknown {
  const chain: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => void;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    range: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
    then: (resolve) => {
      // Default thenable when the chain is awaited without .range() —
      // returns the first 1000 rows (the buggy behaviour we are fixing).
      resolve({ data: rows.slice(0, 1000), error: null });
    },
  };

  // Chain methods return `this` to keep fluent semantics.
  chain.select.mockImplementation(() => chain);
  chain.eq.mockImplementation(() => chain);
  chain.order.mockImplementation(() => chain);
  chain.range.mockImplementation((from: number, to: number) => {
    queryRecord.ranges.push({ from, to });
    // Return a thenable scoped to this window so the await result matches
    // the requested .range(from, to). PostgREST .range is inclusive on both
    // ends.
    const slicedRows = rows.slice(from, to + 1);
    const windowed = {
      ...chain,
      then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
        resolve({ data: slicedRows, error: null });
      },
    };
    return windowed;
  });

  return chain;
}

const profileRow = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  timezone: 'Asia/Ho_Chi_Minh',
};

function buildSupabaseMockWithLargeEntries(): {
  client: { from: (table: string) => unknown };
  recorded: RecordedQuery[];
} {
  const recorded: RecordedQuery[] = [];
  // 1500-row entries set is the load-bearing fixture for this test.
  const entries = makeRows('entry', 1500);
  const weight = makeRows('weight', 5);
  const water = makeRows('water', 5);
  const library = makeRows('lib', 5);
  const weekly = makeRows('weekly', 5);

  // Per-table query record (shared across multiple .from(table) calls so
  // we accumulate every .range() call on the same table into one array).
  const recordFor = (table: string): RecordedQuery => {
    let rec = recorded.find((r) => r.table === table);
    if (!rec) {
      rec = { table, ranges: [] };
      recorded.push(rec);
    }
    return rec;
  };

  const buildPaginatedFrom = (table: string, rows: Array<Record<string, unknown>>): unknown => {
    return buildRangeAwareSelectChainShared(table, rows, recordFor(table));
  };

  const from = (table: string): unknown => {
    switch (table) {
      case 'profiles':
        // profiles uses .maybeSingle(), no pagination.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: profileRow, error: null }),
            }),
          }),
        };
      case 'food_entries':
        return buildPaginatedFrom('food_entries', entries);
      case 'weight_log':
        return buildPaginatedFrom('weight_log', weight);
      case 'water_log':
        return buildPaginatedFrom('water_log', water);
      case 'food_library_items':
        return buildPaginatedFrom('food_library_items', library);
      case 'weekly_reviews':
        return buildPaginatedFrom('weekly_reviews', weekly);
      default:
        return buildPaginatedFrom(table, []);
    }
  };

  return { client: { from }, recorded };
}

describe('Codex C1 — export fetchAll pagination', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('lib/export/json.ts buildJsonExport', () => {
    it('returns ALL 1500 entries when food_entries has >1000 rows (paginates via .range)', async () => {
      const { client, recorded } = buildSupabaseMockWithLargeEntries();
      const result = await buildJsonExport({
        // The implementation only uses .from() — cast is the test boundary.
        supabase: client as unknown as Parameters<typeof buildJsonExport>[0]['supabase'],
        userId: TEST_USER_ID,
      });
      expect(result.entries.length).toBe(1500);

      const entriesQuery = recorded.find((q) => q.table === 'food_entries');
      expect(entriesQuery).toBeDefined();
      // At least 2 ranged calls (1000-row windows) for 1500 rows.
      expect(entriesQuery!.ranges.length).toBeGreaterThanOrEqual(2);
      // First window: rows 0–999 (PostgREST inclusive).
      expect(entriesQuery!.ranges[0]).toEqual({ from: 0, to: 999 });
    });
  });

  describe('lib/export/csv.ts buildCsvBundle', () => {
    it('processes ALL 1500 entries when food_entries has >1000 rows (paginates via .range)', async () => {
      const { client, recorded } = buildSupabaseMockWithLargeEntries();
      const result = await buildCsvBundle({
        supabase: client as unknown as Parameters<typeof buildCsvBundle>[0]['supabase'],
        userId: TEST_USER_ID,
      });
      // totalRows is sum across the 4 tables (entries=1500, weight=5, water=5, library=5).
      expect(result.totalRows).toBe(1500 + 5 + 5 + 5);

      const entriesQuery = recorded.find((q) => q.table === 'food_entries');
      expect(entriesQuery).toBeDefined();
      expect(entriesQuery!.ranges.length).toBeGreaterThanOrEqual(2);
      expect(entriesQuery!.ranges[0]).toEqual({ from: 0, to: 999 });
    });
  });

  describe('iteration safety cap', () => {
    /**
     * Defensive: a misbehaving server that always returns full 1000-row
     * pages (never short-page) would loop forever. fetchAll caps at 100
     * iterations (= 100,000 rows). This test verifies the loop terminates.
     */
    it('terminates at 100-iteration safety cap if the server never returns a short page', async () => {
      // Synthetic infinite source: every range() call returns a full
      // 1000-row page regardless of `from`. Per-table records aggregate
      // across the multiple .from(table) calls fetchAll makes.
      const fullPage = makeRows('inf', 1000);
      const records = new Map<string, RecordedQuery>();
      const recordFor = (table: string): RecordedQuery => {
        let r = records.get(table);
        if (!r) {
          r = { table, ranges: [] };
          records.set(table, r);
        }
        return r;
      };

      const buildInfiniteChain = (table: string): unknown => {
        const queryRecord = recordFor(table);
        const chain: {
          select: ReturnType<typeof vi.fn>;
          eq: ReturnType<typeof vi.fn>;
          range: ReturnType<typeof vi.fn>;
          order: ReturnType<typeof vi.fn>;
          maybeSingle: ReturnType<typeof vi.fn>;
          then: (r: (v: { data: unknown[]; error: null }) => void) => void;
        } = {
          select: vi.fn(),
          eq: vi.fn(),
          range: vi.fn(),
          order: vi.fn(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: (resolve) => resolve({ data: fullPage, error: null }),
        };
        chain.select.mockImplementation(() => chain);
        chain.eq.mockImplementation(() => chain);
        chain.order.mockImplementation(() => chain);
        chain.range.mockImplementation((from: number, to: number) => {
          queryRecord.ranges.push({ from, to });
          return {
            ...chain,
            then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
              resolve({ data: fullPage, error: null }),
          };
        });
        return chain;
      };

      const buildEmptyChain = (table: string): unknown => {
        const queryRecord = recordFor(table);
        const chain: {
          select: ReturnType<typeof vi.fn>;
          eq: ReturnType<typeof vi.fn>;
          range: ReturnType<typeof vi.fn>;
          order: ReturnType<typeof vi.fn>;
          maybeSingle: ReturnType<typeof vi.fn>;
          then: (r: (v: { data: unknown[]; error: null }) => void) => void;
        } = {
          select: vi.fn(),
          eq: vi.fn(),
          range: vi.fn(),
          order: vi.fn(),
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          then: (resolve) => resolve({ data: [], error: null }),
        };
        chain.select.mockImplementation(() => chain);
        chain.eq.mockImplementation(() => chain);
        chain.order.mockImplementation(() => chain);
        chain.range.mockImplementation((from: number, to: number) => {
          queryRecord.ranges.push({ from, to });
          return {
            ...chain,
            then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
              resolve({ data: [], error: null }),
          };
        });
        return chain;
      };

      const from = (table: string): unknown => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: profileRow, error: null }),
              }),
            }),
          };
        }
        if (table === 'food_entries') return buildInfiniteChain(table);
        return buildEmptyChain(table);
      };

      const result = await buildJsonExport({
        supabase: { from } as unknown as Parameters<typeof buildJsonExport>[0]['supabase'],
        userId: TEST_USER_ID,
      });

      // Cap at 100 iterations × 1000 rows/page = 100,000 rows.
      expect(result.entries.length).toBe(100 * 1000);
      const entriesRecord = records.get('food_entries');
      expect(entriesRecord).toBeDefined();
      expect(entriesRecord!.ranges.length).toBe(100);
    });
  });
});

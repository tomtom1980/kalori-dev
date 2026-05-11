/**
 * Task 5.3 Codex Round 1 I1 — Export pagination missing stable ORDER BY.
 *
 * `.range(from, to)` without `.order(...)` lets Postgres pick any plan order;
 * across pages this can produce duplicates and skips for users with >1000
 * rows. Both `buildJsonExport` and `buildCsvBundle` MUST issue
 * `.order('id', { ascending: true })` BEFORE `.range(...)` on every paginated
 * fetch.
 *
 * RED-first contract: this spec records every chain method call against the
 * mock client and asserts that `.order` is invoked on every paginated table
 * (food_entries, weight_log, water_log, food_library_items, weekly_reviews
 * for JSON; same minus weekly_reviews for CSV).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCsvBundle } from '@/lib/export/csv';
import { buildJsonExport } from '@/lib/export/json';

const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';

interface OrderArgs {
  column: string;
  options?: { ascending?: boolean } | undefined;
}

interface RecordedQuery {
  table: string;
  ranges: Array<{ from: number; to: number }>;
  orders: OrderArgs[];
}

function makeRow(prefix: string, index: number): Record<string, unknown> {
  return {
    id: `${prefix}-${String(index).padStart(6, '0')}`,
    client_id: `c-${prefix}-${index}`,
    user_id: TEST_USER_ID,
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

function buildOrderRecordingChain(
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
      resolve({ data: rows.slice(0, 1000), error: null });
    },
  };

  chain.select.mockImplementation(() => chain);
  chain.eq.mockImplementation(() => chain);
  chain.order.mockImplementation((column: string, options?: { ascending?: boolean }) => {
    queryRecord.orders.push({ column, options });
    return chain;
  });
  chain.range.mockImplementation((from: number, to: number) => {
    queryRecord.ranges.push({ from, to });
    const slicedRows = rows.slice(from, to + 1);
    return {
      ...chain,
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
        resolve({ data: slicedRows, error: null });
      },
    };
  });

  return chain;
}

const profileRow = {
  id: TEST_USER_ID,
  email: 'test@example.com',
  timezone: 'Asia/Ho_Chi_Minh',
};

function buildClient(): {
  client: { from: (table: string) => unknown };
  recorded: RecordedQuery[];
} {
  const recorded: RecordedQuery[] = [];
  // 600 rows on entries — drives 1 paginated call (single page < 1000).
  // Even one page must use .order so the per-page result is deterministic
  // and so the cross-page contract holds for users >1000 rows.
  const entries = makeRows('entry', 600);
  const weight = makeRows('weight', 5);
  const water = makeRows('water', 5);
  const library = makeRows('lib', 5);
  const weekly = makeRows('weekly', 5);

  const recordFor = (table: string): RecordedQuery => {
    let rec = recorded.find((r) => r.table === table);
    if (!rec) {
      rec = { table, ranges: [], orders: [] };
      recorded.push(rec);
    }
    return rec;
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
    return buildOrderRecordingChain(
      table === 'food_entries'
        ? entries
        : table === 'weight_log'
          ? weight
          : table === 'water_log'
            ? water
            : table === 'food_library_items'
              ? library
              : table === 'weekly_reviews'
                ? weekly
                : [],
      recordFor(table),
    );
  };

  return { client: { from }, recorded };
}

describe('Codex R1 I1 — export pagination uses stable .order before .range', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('lib/export/json.ts buildJsonExport', () => {
    it("calls .order('id', { ascending: true }) on every paginated table", async () => {
      const { client, recorded } = buildClient();
      await buildJsonExport({
        supabase: client as unknown as Parameters<typeof buildJsonExport>[0]['supabase'],
        userId: TEST_USER_ID,
      });

      const paginatedTables = [
        'food_library_items',
        'food_entries',
        'weight_log',
        'water_log',
        'weekly_reviews',
      ];
      for (const table of paginatedTables) {
        const query = recorded.find((q) => q.table === table);
        expect(query, `${table} not queried`).toBeDefined();
        expect(query!.orders.length, `${table} missing .order call`).toBeGreaterThanOrEqual(1);
        expect(query!.orders[0]).toEqual({ column: 'id', options: { ascending: true } });
        expect(query!.ranges.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('lib/export/csv.ts buildCsvBundle', () => {
    it("calls .order('id', { ascending: true }) on every paginated table", async () => {
      const { client, recorded } = buildClient();
      await buildCsvBundle({
        supabase: client as unknown as Parameters<typeof buildCsvBundle>[0]['supabase'],
        userId: TEST_USER_ID,
      });

      // CSV doesn't pull weekly_reviews — only entries/weight/water/library.
      const paginatedTables = ['food_entries', 'weight_log', 'water_log', 'food_library_items'];
      for (const table of paginatedTables) {
        const query = recorded.find((q) => q.table === table);
        expect(query, `${table} not queried`).toBeDefined();
        expect(query!.orders.length, `${table} missing .order call`).toBeGreaterThanOrEqual(1);
        expect(query!.orders[0]).toEqual({ column: 'id', options: { ascending: true } });
      }
    });
  });
});

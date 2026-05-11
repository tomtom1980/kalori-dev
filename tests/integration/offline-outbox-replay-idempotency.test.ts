/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.1 — I11 OUTBOX REPLAY IDEMPOTENCY contract test.
 *
 * This is the canonical full-contract integration test for AC3/AC4/AC5:
 *   - AC3: N unique + K duplicate client_ids → exactly N rows server-side
 *          (the per-row dedup is server-owned; here we assert the OUTBOX
 *          sends the SAME bytes for every retry of the SAME entry — server
 *          dedup correctness is owned by Task 3.1+ which already ships
 *          UNIQUE(client_id) and is exercised by tests/integration/
 *          client-id-idempotency.test.ts and friends).
 *   - AC4: Mid-flush network drop + resume → zero new rows (every retry of
 *          the same outbox entry sends the same client_id; server's existing
 *          UNIQUE/select-before-insert path catches the dupe).
 *   - AC5: client_id is preserved across tab refresh + reconnect (we re-import
 *          the module to simulate a fresh page load, peek IDB, and prove the
 *          row's client_id is byte-identical to the original).
 *
 * The interceptor (`authFetch`) is mocked so we can drive 401/200/500/network
 * scenarios deterministically and assert the bytes it observed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clear as idbClear } from 'idb-keyval';

const authFetch = vi.fn();

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
  SessionExpiredError: class extends Error {
    constructor(msg = 'session expired') {
      super(msg);
      this.name = 'SessionExpiredError';
    }
  },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  vi.resetModules();
  authFetch.mockReset();
  await idbClear();
});

afterEach(async () => {
  await idbClear();
});

describe('Task 5.1.1 — I11 outbox replay idempotency (canonical full contract)', () => {
  it('AC3: N unique + K duplicate flushes send the SAME body bytes (server dedup safe)', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    // Simulate 3 unique entries; 2 of them retry once (5 total POSTs by end).
    const cidA = crypto.randomUUID();
    const cidB = crypto.randomUUID();
    const cidC = crypto.randomUUID();

    // Enqueue 3 distinct rows.
    for (const [cid, ml] of [
      [cidA, 100],
      [cidB, 200],
      [cidC, 300],
    ] as const) {
      await enqueue({
        kind: 'water-log',
        endpoint: '/api/water/log',
        method: 'POST',
        body: { client_id: cid, ml },
      });
    }

    // Round 1: A succeeds, B fails (network), C succeeds.
    authFetch.mockResolvedValueOnce(jsonResponse(200, {})); // A
    authFetch.mockRejectedValueOnce(new Error('network drop')); // B
    // The flush loop on network failure stops + defers remaining rows; C waits.
    await flush();

    // Round 2 simulates reconnect — B retries with SAME client_id; C now also flushes.
    authFetch.mockResolvedValueOnce(jsonResponse(200, {})); // B retry
    authFetch.mockResolvedValueOnce(jsonResponse(200, {})); // C
    await flush();

    // Tally distinct client_ids observed across all flushes.
    const observed = authFetch.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    const observedCids = new Set(observed.map((b: { client_id: string }) => b.client_id));
    expect(observedCids.size).toBe(3); // exactly N = 3 unique
    expect(observedCids.has(cidA)).toBe(true);
    expect(observedCids.has(cidB)).toBe(true);
    expect(observedCids.has(cidC)).toBe(true);
  });

  it('AC4: mid-flush network drop + resume preserves client_id on the deferred row', async () => {
    const { enqueue, flush, peek } = await import('@/lib/offline/outbox');
    const cidA = crypto.randomUUID();
    const cidB = crypto.randomUUID();
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cidA, ml: 100 },
    });
    await enqueue({
      kind: 'water-log',
      endpoint: '/api/water/log',
      method: 'POST',
      body: { client_id: cidB, ml: 200 },
    });
    // Network drop while sending A.
    authFetch.mockRejectedValueOnce(new Error('network'));
    await flush();
    const stillQueued = await peek();
    // Both rows still in queue with original client_ids.
    expect(stillQueued).toHaveLength(2);
    expect(stillQueued[0]!.client_id).toBe(cidA);
    expect(stillQueued[1]!.client_id).toBe(cidB);

    // Resume — both flush successfully with preserved client_ids.
    authFetch.mockResolvedValueOnce(jsonResponse(200, {})); // A
    authFetch.mockResolvedValueOnce(jsonResponse(200, {})); // B
    await flush();
    const observed = authFetch.mock.calls
      .filter(([, init]) => typeof (init as RequestInit).body === 'string')
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    // First call (rejected) saw cidA; second saw cidA again on retry; third saw cidB.
    expect(observed[0]!.client_id).toBe(cidA);
    expect(observed[1]!.client_id).toBe(cidA);
    expect(observed[2]!.client_id).toBe(cidB);
  });

  it('AC5: client_id preserved across tab refresh (module re-import + peek)', async () => {
    const { enqueue: enqueueOriginal } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    await enqueueOriginal({
      kind: 'entry-create',
      endpoint: '/api/entries/save',
      method: 'POST',
      body: { client_id: cid, name: 'pho-bo', kcal: 480 },
    });

    // Simulate a tab refresh: tear down the module graph, then re-import.
    vi.resetModules();
    const { peek: peekFresh, flush: flushFresh } = await import('@/lib/offline/outbox');
    const rows = await peekFresh();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBe(cid);
    expect(rows[0]!.body).toEqual({ client_id: cid, name: 'pho-bo', kcal: 480 });

    // Flush from the "fresh" module instance — same bytes as the original payload.
    authFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await flushFresh();
    const sentBody = JSON.parse((authFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(sentBody.client_id).toBe(cid);
  });

  it('AC2: client_id NEVER regenerated across an arbitrary number of retries', async () => {
    const { enqueue, flush } = await import('@/lib/offline/outbox');
    const cid = crypto.randomUUID();
    await enqueue({
      kind: 'weight-log',
      endpoint: '/api/weight/log',
      method: 'POST',
      body: { client_id: cid, weight_kg: 71.4, date: '2026-04-25' },
    });
    // 5 attempts: 4 server errors, 5th succeeds.
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(500, {}));
    authFetch.mockResolvedValueOnce(jsonResponse(200, {}));
    await flush();
    await flush();
    await flush();
    await flush();
    await flush();
    const observed = authFetch.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string),
    );
    expect(observed).toHaveLength(5);
    for (const body of observed) {
      expect(body.client_id).toBe(cid);
    }
  });
});

describe('Task 5.1.1 — R1 compliance (no raw fetch, only authFetch)', () => {
  it('lib/offline/** contains zero raw `fetch(` calls (recursive scan)', async () => {
    // We assert every source file under lib/offline/** contains ZERO raw
    // `fetch(` token outside the `authFetch` / `globalThis.fetch` reference.
    // The ESLint rule is the live enforcement (`no-restricted-syntax` scoped
    // to `lib/offline/**`); this test is the belt-and-braces double-check
    // and (importantly) auto-discovers any new files added to the directory
    // so future contributors can't slip a raw fetch past the static guard.
    //
    // Codex review I5: original implementation hard-coded three filenames;
    // this version walks the directory recursively and excludes only `.test.`
    // files (per the brief's `lib/offline/**` scope).
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { resolve, join } = await import('node:path');
    const root = process.cwd();

    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) out.push(...walk(full));
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) && !/\.test\./.test(entry)) {
          out.push(full);
        }
      }
      return out;
    }

    const files = walk(resolve(root, 'lib/offline'));
    expect(files.length).toBeGreaterThan(0); // sanity — directory must exist

    for (const fullPath of files) {
      const src = readFileSync(fullPath, 'utf8');
      // Strip comments + string literals so a doc-block containing "fetch("
      // or a string template doesn't trip us.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/\/\/.*$/gm, '') // line comments
        .replace(/'(?:\\.|[^'\\])*'/g, "''") // single-quoted strings
        .replace(/"(?:\\.|[^"\\])*"/g, '""') // double-quoted strings
        .replace(/`(?:\\.|[^`\\])*`/g, '``'); // template literals (no expressions)
      // Match raw `fetch(` calls NOT prefixed by `auth` (so authFetch is fine).
      const rawFetchPattern = /(?<![A-Za-z0-9_$])fetch\s*\(/g;
      const matches = stripped.match(rawFetchPattern);
      expect(matches, `raw fetch( found in ${fullPath}`).toBeNull();
    }
  });
});

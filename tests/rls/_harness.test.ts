/**
 * @vitest-environment node
 *
 * RLS harness sanity test — Task 1.2.
 *
 * Task 1.2 scope is SUBSTRATE ONLY (testing-strategy.md §10.2):
 *   - `setupRlsHarness()` creates two fresh auth users (A + B) with distinct
 *     UUIDs via Supabase admin (service-role) APIs.
 *   - Each user gets a scoped `SupabaseClient` bound to their own JWT so
 *     downstream per-table tests (Task 2.1 profiles, 3.1 food schema, 4.3b
 *     weight regression) can exercise RLS `using`/`with check` policies per
 *     user.
 *   - `teardown()` removes both users via the admin client and is idempotent
 *     — running it twice in a row must not throw.
 *
 * The full 32-assertion 4-verb matrix (I1) lives in Task 2.1 onward; this
 * test proves the fixture is structurally correct so later specs can trust it.
 *
 * Runs under Vitest (happy-dom environment) but only touches server/Node code
 * (admin client + token refresh). It is included via the `tests/rls/` glob in
 * `vitest.config.ts`.
 *
 * SKIPPED WHEN ENV NOT PRESENT. CI (ubuntu-latest) wires
 * `SUPABASE_TEST_URL` / `SUPABASE_TEST_ANON_KEY` /
 * `SUPABASE_TEST_SERVICE_ROLE_KEY` via GitHub Actions secrets (setup-state.md
 * §7); local Windows without `.env.local` defining those falls back to skip so
 * `pnpm test` stays green without a live DB connection.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

maybe('tests/rls/_harness — 2-user fixture substrate', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    await harness.teardown();
  }, 30_000);

  it('creates two distinct auth users with UUIDs and JWTs', () => {
    expect(harness.userA).toBeDefined();
    expect(harness.userB).toBeDefined();
    expect(harness.userA.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(harness.userB.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(harness.userA.id).not.toBe(harness.userB.id);
    expect(harness.userA.jwt).toBeTruthy();
    expect(harness.userB.jwt).toBeTruthy();
    expect(harness.userA.jwt).not.toBe(harness.userB.jwt);
  });

  it('exposes per-user scoped Supabase clients', () => {
    expect(harness.userA.client).toBeDefined();
    expect(harness.userB.client).toBeDefined();
    expect(harness.userA.client).not.toBe(harness.userB.client);
    expect(harness.admin).toBeDefined();
  });

  it('teardown is idempotent — second call does not throw', async () => {
    await expect(harness.teardown()).resolves.toBeUndefined();
    await expect(harness.teardown()).resolves.toBeUndefined();
  });
});

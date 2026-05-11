/**
 * Unit tests for the RLS harness partial-failure teardown contract.
 *
 * Contract (testing-strategy.md §10.2):
 *   - `setupRlsHarness()` must leave the auth store in a clean state on ANY
 *     failure path — i.e. any user created during setup must be deleted before
 *     the original error is rethrown.
 *   - Regression guard for Codex Round 1 finding: `userB` was left orphaned
 *     when `signInWithPassword()` failed after `admin.auth.admin.createUser()`
 *     succeeded.
 *
 * These tests mock `@supabase/supabase-js` so we can orchestrate exact failure
 * timing without a live DB. Runs in node environment (no browser deps).
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks must be registered before module import.
const adminCreateUser = vi.fn();
const adminDeleteUser = vi.fn();
const anonSignIn = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: anonSignIn,
      admin: {
        createUser: adminCreateUser,
        deleteUser: adminDeleteUser,
      },
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: vi.fn(() => ({
    auth: {
      admin: {
        createUser: adminCreateUser,
        deleteUser: adminDeleteUser,
      },
    },
  })),
}));

const ORIGINAL_ENV = { ...process.env };

describe('setupRlsHarness — partial-failure teardown contract', () => {
  beforeEach(() => {
    vi.resetModules();
    adminCreateUser.mockReset();
    adminDeleteUser.mockReset();
    anonSignIn.mockReset();
    process.env.SUPABASE_TEST_URL = 'https://example.supabase.co';
    process.env.SUPABASE_TEST_ANON_KEY = 'sb_publishable_example';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('deletes userA when userA sign-in fails after userA creation succeeded (F-TEST-3 case (b))', async () => {
    // Case (b) from the Task 1.4 briefing — retires residual F-TEST-3.
    // Arrange: userA creation succeeds but userA sign-in fails. userB never
    // begins, so the catch path must delete exactly one user: userA.
    adminCreateUser.mockResolvedValueOnce({
      data: { user: { id: 'user-a-uuid' } },
      error: null,
    });
    anonSignIn.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'invalid credentials' } as unknown as Error,
    });
    adminDeleteUser.mockResolvedValue({ error: null });

    const { setupRlsHarness } = await import('../rls/_harness');

    // Act + Assert: setup throws on userA sign-in, exactly one delete fires.
    await expect(setupRlsHarness()).rejects.toThrow(/failed to sign in user a/i);

    const deletedIds = adminDeleteUser.mock.calls.map((c) => c[0]);
    expect(deletedIds).toEqual(['user-a-uuid']);
    expect(adminDeleteUser).toHaveBeenCalledTimes(1);
    // userB setup never began — its createUser mock must not have fired.
    expect(adminCreateUser).toHaveBeenCalledTimes(1);
  });

  it('deletes userB when userB sign-in fails after userB creation succeeded', async () => {
    // Arrange: userA succeeds end-to-end; userB creation succeeds but sign-in fails.
    adminCreateUser
      .mockResolvedValueOnce({
        data: { user: { id: 'user-a-uuid' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: 'user-b-uuid' } },
        error: null,
      });
    anonSignIn
      .mockResolvedValueOnce({
        data: { session: { access_token: 'jwt-a' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'invalid credentials' } as unknown as Error,
      });
    adminDeleteUser.mockResolvedValue({ error: null });

    const { setupRlsHarness } = await import('../rls/_harness');

    // Act + Assert: setup throws, both users are deleted.
    await expect(setupRlsHarness()).rejects.toThrow(/failed to sign in user b/i);

    const deletedIds = adminDeleteUser.mock.calls.map((c) => c[0]);
    expect(deletedIds).toContain('user-a-uuid');
    expect(deletedIds).toContain('user-b-uuid');
    expect(adminDeleteUser).toHaveBeenCalledTimes(2);
  });

  it('does not attempt to delete userB when userB creation itself fails', async () => {
    // Arrange: userA succeeds; userB creation fails.
    adminCreateUser
      .mockResolvedValueOnce({
        data: { user: { id: 'user-a-uuid' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'create failed' } as unknown as Error,
      });
    anonSignIn.mockResolvedValueOnce({
      data: { session: { access_token: 'jwt-a' } },
      error: null,
    });
    adminDeleteUser.mockResolvedValue({ error: null });

    const { setupRlsHarness } = await import('../rls/_harness');

    await expect(setupRlsHarness()).rejects.toThrow(/failed to create user b/i);

    const deletedIds = adminDeleteUser.mock.calls.map((c) => c[0]);
    expect(deletedIds).toContain('user-a-uuid');
    expect(deletedIds).not.toContain('user-b-uuid');
    expect(adminDeleteUser).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to delete userA when userA creation itself fails', async () => {
    // Arrange: userA creation fails outright — nothing to clean up.
    adminCreateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'create failed' } as unknown as Error,
    });
    adminDeleteUser.mockResolvedValue({ error: null });

    const { setupRlsHarness } = await import('../rls/_harness');

    await expect(setupRlsHarness()).rejects.toThrow(/failed to create user a/i);

    expect(adminDeleteUser).not.toHaveBeenCalled();
  });

  it('swallows teardown errors so the original setup error surfaces', async () => {
    // Arrange: userA succeeds; userB sign-in fails; teardown itself also throws
    // on the first delete call. The original sign-in error must still surface.
    adminCreateUser
      .mockResolvedValueOnce({
        data: { user: { id: 'user-a-uuid' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: 'user-b-uuid' } },
        error: null,
      });
    anonSignIn
      .mockResolvedValueOnce({
        data: { session: { access_token: 'jwt-a' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'invalid credentials' } as unknown as Error,
      });
    adminDeleteUser.mockRejectedValueOnce(new Error('teardown also broke'));
    adminDeleteUser.mockResolvedValueOnce({ error: null });

    const { setupRlsHarness } = await import('../rls/_harness');

    // Original error must surface — teardown errors are swallowed.
    await expect(setupRlsHarness()).rejects.toThrow(/failed to sign in user b/i);
    // Both deletes attempted regardless of first failing.
    expect(adminDeleteUser).toHaveBeenCalledTimes(2);
  });
});

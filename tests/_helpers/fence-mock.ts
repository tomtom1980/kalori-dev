/**
 * Test helper for the orphan-profile fence at
 * `lib/auth/orphan-profile-fence.ts` (`runFence` →
 * `requireProfileOrJson401` / `requireProfileOrRedirect`).
 *
 * The fence issues exactly one read per request:
 *   `.from('profiles').select('id, onboarding_completed_at[, ...extras]')
 *     .eq('id', user.id).maybeSingle()`
 *
 * Tests that exercise the fence's HAPPY path (profile exists, NOT orphan)
 * need a `from()` shim on their `getServerSupabase` mock that resolves the
 * read to a non-null row. This helper returns a `from('profiles')`-shaped
 * delegate factory to drop into the SSR mock.
 */

type ProfileSelectChain = {
  eq: (
    col: string,
    val: string,
  ) => {
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    single: () => Promise<{ data: unknown; error: unknown }>;
  };
};

type ProfilesTableMock = {
  select: (cols: string) => ProfileSelectChain;
};

/**
 * Returns a `profiles` table mock that resolves the orphan-profile fence
 * read with a non-null row. `extras` widens the row payload — pass
 * additional fields when the route also widens the SELECT via
 * `selectExtras` (e.g. `{ timezone: 'Asia/Ho_Chi_Minh' }` for routes that
 * read `profile.timezone`).
 *
 * Default row: `{ id: <userId>, onboarding_completed_at: '2024-01-01' }`
 * — onboarding marked complete so callers that gate on it pass through.
 */
export function makeProfilesMock(
  userId = 'u-test',
  extras: Record<string, unknown> = {},
): ProfilesTableMock {
  const row = {
    id: userId,
    onboarding_completed_at: '2024-01-01T00:00:00Z',
    ...extras,
  };
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      }),
    }),
  };
}

/**
 * Returns a `from()` factory matching the SSR client surface used by
 * `lib/auth/orphan-profile-fence.ts`. Drop into a `getServerSupabase`
 * mock alongside `auth.getUser`:
 *
 *   vi.doMock('@/lib/supabase/server', () => ({
 *     getServerSupabase: async () => ({
 *       auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
 *       from: makeServerFrom('u-1'),
 *     }),
 *   }));
 *
 * Only the `profiles` table is shimmed (the only table the fence reads).
 * Other tables fall through to a builder that throws — surfacing any
 * unexpected SSR-side reads loudly instead of silently returning empty
 * data.
 */
export function makeServerFrom(
  userId = 'u-test',
  extras: Record<string, unknown> = {},
): (table: string) => unknown {
  const profiles = makeProfilesMock(userId, extras);
  return (table: string) => {
    if (table === 'profiles') return profiles;
    throw new Error(
      `[fence-mock] unexpected SSR table read: ${table}. ` +
        `Only 'profiles' is shimmed by makeServerFrom; extend the helper ` +
        `if a new SSR-side table read is intentional.`,
    );
  };
}

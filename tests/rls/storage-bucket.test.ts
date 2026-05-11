/**
 * @vitest-environment node
 *
 * I1 / I4 substrate — `food-thumbnails` Storage bucket RLS test (Task 3.1
 * AC; briefing §8).
 *
 * Coverage (8 assertions):
 *   - User A (owner) succeeds at: upload, download, upsert (update), delete
 *   - User B (non-owner) fails at: upload-into-A's-prefix, download-A's-object,
 *     upsert-A's-object, delete-A's-object
 *
 * Path-based ownership rule (architecture.md §4.1 + briefing §6.B):
 *     bucket_id = 'food-thumbnails' AND split_part(name, '/', 1)::uuid = auth.uid()
 *
 * So objects MUST be uploaded under `food-thumbnails/{user_id}/...`. The
 * `{user_id}` prefix is what RLS reads as the "owner" — User A signs in,
 * uploads to `{userA.id}/file.webp`, and any other user cannot read or
 * mutate that path.
 *
 * Storage RLS error caveat (briefing §8): errors come back via the Storage
 * REST gateway, not raw Postgres. Test against `{ data, error }` returned by
 * `supabase-js` Storage calls — DO NOT match Postgres SQLSTATE codes for
 * Storage assertions.
 *
 * Naming note: file uses `.test.ts` (not `.spec.ts` per briefing) to match
 * the vitest.config.ts include glob. See `food-schema.test.ts` header for
 * the same rationale + decision log.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setupRlsHarness, type RlsHarness } from './_harness';

const hasSupabaseTestEnv =
  !!process.env.SUPABASE_TEST_URL &&
  !!process.env.SUPABASE_TEST_ANON_KEY &&
  !!process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const maybe = hasSupabaseTestEnv ? describe : describe.skip;

const BUCKET = 'food-thumbnails';

// One shared object name across "owner-can" assertions; a separate name for
// "owner-can-update" so the upsert test isn't a no-op on a freshly-uploaded
// object.
const OWN_OBJECT = 'own-object.webp';
const OWN_UPDATE_OBJECT = 'own-update-object.webp';

maybe('I1: storage RLS — food-thumbnails 4 verbs × 2 directions (8 assertions)', () => {
  let harness: RlsHarness;

  beforeAll(async () => {
    harness = await setupRlsHarness();
  }, 30_000);

  afterAll(async () => {
    if (!harness) return;
    // Clean up any remaining objects under userA's prefix via admin (bypasses
    // RLS). Best-effort — list + remove. teardown() will then remove the
    // user; auth.users CASCADE does NOT touch storage.objects, so explicit
    // cleanup keeps the bucket pristine for next run.
    try {
      const { data: listed } = await harness.admin.storage.from(BUCKET).list(harness.userA.id);
      if (listed && listed.length > 0) {
        const paths = listed.map((o) => `${harness.userA.id}/${o.name}`);
        await harness.admin.storage.from(BUCKET).remove(paths);
      }
    } catch {
      // swallow — original error path is more informative
    }
    await harness.teardown();
  }, 30_000);

  // --- 4 owner verbs (User A on User A's prefix) -------------------------

  it('owner UPLOAD: User A uploads to own prefix succeeds', async () => {
    const { error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload(`${harness.userA.id}/${OWN_OBJECT}`, new Blob(['ok'], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(error).toBeNull();
  });

  it('owner DOWNLOAD: User A reads own object succeeds', async () => {
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .download(`${harness.userA.id}/${OWN_OBJECT}`);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it('owner UPDATE: User A upserts (overwrites) own object succeeds', async () => {
    // Upload to a different path with upsert: true so this exercises the
    // UPDATE policy specifically (not a fresh INSERT). Pre-seed via
    // straight upload so upsert has something to overwrite.
    await harness.userA.client.storage
      .from(BUCKET)
      .upload(
        `${harness.userA.id}/${OWN_UPDATE_OBJECT}`,
        new Blob(['v1'], { type: 'image/webp' }),
        {
          contentType: 'image/webp',
        },
      );

    const { error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload(
        `${harness.userA.id}/${OWN_UPDATE_OBJECT}`,
        new Blob(['v2'], { type: 'image/webp' }),
        {
          contentType: 'image/webp',
          upsert: true,
        },
      );
    expect(error).toBeNull();
  });

  it('owner DELETE: User A removes own update-target object succeeds', async () => {
    // Use the upsert-target so the delete-self spec doesn't conflict with
    // the cross-user spec which expects OWN_OBJECT to STILL EXIST under A's
    // prefix.
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .remove([`${harness.userA.id}/${OWN_UPDATE_OBJECT}`]);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  // --- 4 cross-user verbs (User B on User A's prefix; all denied) --------

  it('non-owner DOWNLOAD: User B reading User A object is denied', async () => {
    const { data, error } = await harness.userB.client.storage
      .from(BUCKET)
      .download(`${harness.userA.id}/${OWN_OBJECT}`);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('non-owner UPLOAD: User B writing into User A prefix is denied', async () => {
    const { error } = await harness.userB.client.storage
      .from(BUCKET)
      .upload(`${harness.userA.id}/attack.webp`, new Blob(['attack'], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(error).not.toBeNull();
  });

  it('non-owner UPDATE: User B upserting User A object is denied', async () => {
    const { error } = await harness.userB.client.storage
      .from(BUCKET)
      .upload(`${harness.userA.id}/${OWN_OBJECT}`, new Blob(['hacked'], { type: 'image/webp' }), {
        contentType: 'image/webp',
        upsert: true,
      });
    expect(error).not.toBeNull();
  });

  it('non-owner DELETE: User B removing User A object affects zero rows', async () => {
    // Storage `.remove()` on objects you cannot SELECT silently returns an
    // empty data array (no rows removed) rather than a hard error — RLS
    // hides them from the actor's session. Either an error OR an empty
    // data array is an acceptable "denied" mode.
    const { data, error } = await harness.userB.client.storage
      .from(BUCKET)
      .remove([`${harness.userA.id}/${OWN_OBJECT}`]);
    const denied = !!error || (Array.isArray(data) && data.length === 0);
    expect(denied).toBe(true);

    // Confirm via owner that the object STILL EXISTS.
    const { data: ownerCheck, error: ownerErr } = await harness.userA.client.storage
      .from(BUCKET)
      .download(`${harness.userA.id}/${OWN_OBJECT}`);
    expect(ownerErr).toBeNull();
    expect(ownerCheck).not.toBeNull();
  });

  // --- Codex R1 D1: malformed-path edge cases ----------------------------
  //
  // The path-based ownership rule lives in 4 RLS policies on storage.objects.
  // After the R1 A3 fix (regex-guarded ::uuid cast), malformed paths must be
  // rejected by the policy predicate's strict UUID regex BEFORE the cast.
  // These assertions document and lock that posture: even User A (a valid,
  // signed-in user) cannot upload to a path whose first segment is not a
  // strict 8-4-4-4-12 hex UUID equal to their own auth.uid().
  //
  // Without these assertions, the A3 regex guard could regress (someone
  // weakens it to e.g. `[0-9a-f-]{36}` or removes the ANDed cast guard) and
  // we would never know — the existing 8 owner/non-owner tests use clean
  // UUID-shaped paths that don't exercise the malformed-path branch.
  //
  // Assertion contract: each upload must FAIL with a Storage-side error
  // surfaced by supabase-js. We distinguish "RLS / policy denial" (the
  // intended outcome) from a connection or transport error by asserting
  // both error-presence AND data === null. (Both shapes are equivalent
  // here — Storage REST never returns a partial object on policy denial.)
  //
  // All four cases are owner-context (User A authenticated). Using A
  // proves the path itself is rejected, NOT just that the actor is wrong.

  it('owner UPLOAD malformed path `..//foo`: denied by policy', async () => {
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload('..//attack-traversal.webp', new Blob(['x'], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('owner UPLOAD malformed path `//foo` (empty first segment): denied by policy', async () => {
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload('//attack-empty-prefix.webp', new Blob(['x'], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('owner UPLOAD malformed path `not-a-uuid/foo`: denied by policy', async () => {
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload('not-a-uuid/attack-non-uuid-prefix.webp', new Blob(['x'], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('owner UPLOAD valid-UUID-format-but-not-own-UUID prefix: denied by policy', async () => {
    // A syntactically valid UUID that is guaranteed not to equal userA.id
    // (32 a's). The regex passes; the equality check against auth.uid()
    // does not — exactly the with-check rejection we want.
    const FOREIGN_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const { data, error } = await harness.userA.client.storage
      .from(BUCKET)
      .upload(
        `${FOREIGN_UUID}/attack-foreign-prefix.webp`,
        new Blob(['x'], { type: 'image/webp' }),
        {
          contentType: 'image/webp',
        },
      );
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

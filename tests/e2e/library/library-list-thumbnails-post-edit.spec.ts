/**
 * E2E: library list thumbnails persist post-edit + render across the
 * raised SIGN_LIMIT (bugfix-tomi batch 2026-05-16-library-sketch-display,
 * Bug 3).
 *
 * Verifies the two observable contracts of the Bug 3 fix:
 *
 *   1. SIGN_LIMIT raise from 10 → 500. Cards at positions 11+ now carry a
 *      signed `thumbnail_url`, so `<LibraryCard>` renders the
 *      `library-card-thumb-{id}` <Image>, NOT the lettermark fallback.
 *
 *   2. Update route signs `thumbnail_url` before returning. After editing a
 *      library item's name (a non-thumbnail field), the navigation back to
 *      /library re-runs the server fetch + sign-on-read, so the thumbnail
 *      still renders. Pre-fix the update route returned a raw storage path
 *      and the toast/optimistic-merge surface would have flagged a broken
 *      image. The clean post-fix observable is "library list still shows
 *      the thumbnail after a non-thumbnail edit", which is what the user
 *      complained about and what this test asserts.
 *
 * Seeding strategy:
 *   - Upload a 1x1 transparent PNG to the `food-thumbnails` bucket under
 *     a deterministic test-scoped path (the fixture's per-test user id +
 *     a probe filename). Storage policy on the bucket (architecture.md
 *     §4.2) allows service-role to write under any user_id prefix.
 *   - Seed library rows with `thumbnail_url = <that storage path>`.
 *   - `fetchLibraryPage` then signs each path; the signed URL matches the
 *     `*.supabase.co/storage/v1/object/sign/food-thumbnails/**` pattern
 *     in `next.config.ts` `remotePatterns`, so `<Image>` mounts without
 *     a remote-pattern rejection.
 *   - Cleanup: the auth fixture cascade-deletes the user → profile →
 *     library rows on teardown, but the uploaded storage object is NOT
 *     cascaded by the FK. We delete it explicitly in an `afterEach`.
 *
 * NOT covered (covered by unit + integration tests):
 *   - The signing fan-out concurrency cap (tests/unit/lib/storage/sign-thumbnail.test.ts)
 *   - The merge route's thumbnail_source_id guard (tests/integration/library-merge-signed-url-guard.test.ts)
 *   - The update route's HTTPS-URL rejection (tests/integration/library-item-update.test.ts Test L)
 *   - SIGN_LIMIT cap value of 500 (tests/unit/lib/library/fetch.test.ts Tests F + G)
 */
import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

const THUMBNAILS_BUCKET = 'food-thumbnails';

/**
 * 1x1 fully-transparent PNG. Smallest valid PNG payload — the byte stream
 * is the canonical "transparent pixel" example reproduced verbatim.
 */
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'library-list-thumbnails-post-edit: SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY (or NEXT_PUBLIC_* fallbacks) must be set.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function uploadProbePng(userId: string, fileName: string): Promise<string> {
  const admin = adminClient();
  const storagePath = `${userId}/${fileName}`;
  const png = Buffer.from(ONE_PX_PNG_BASE64, 'base64');
  const { error } = await admin.storage
    .from(THUMBNAILS_BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`probe PNG upload failed: ${error.message}`);
  return storagePath;
}

async function deleteProbePng(storagePath: string): Promise<void> {
  try {
    const admin = adminClient();
    await admin.storage.from(THUMBNAILS_BUCKET).remove([storagePath]);
  } catch {
    // teardown — never mask the test's own failure
  }
}

test.describe('/library · thumbnails post-edit (Bug 3 — library-sketch-display batch)', () => {
  test('thumbnail persists in library list after editing the item name', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const probePath = await uploadProbePng(userId, `post-edit-probe-${Date.now()}.png`);

    try {
      const [seedRow] = await seedLibraryItems(userId, [
        {
          display_name: 'Pho Bo Original Name',
          nutrition: { kcal: 320, macros: { protein_g: 22, carbs_g: 38, fat_g: 9 } },
          thumbnail_url: probePath,
        },
      ]);

      // --- Assertion 1: card renders <Image> (not lettermark) on initial load ---
      await authedPage.goto('/library');
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();

      const thumbInitial = authedPage.getByTestId(`library-card-thumb-${seedRow!.id}`);
      await expect(thumbInitial).toBeVisible();
      await expect(authedPage.getByTestId(`library-card-lettermark-${seedRow!.id}`)).toHaveCount(0);

      // --- Edit flow: navigate to detail with mode=edit, change name, save ---
      await authedPage.goto(`/library/${seedRow!.id}?mode=edit`);
      const nameInput = authedPage.getByTestId('food-detail-edit-name-input');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Pho Bo Edited Name');
      await authedPage.getByTestId('food-detail-save-button').click();

      // Save settles: edit mode collapses; the header reflects the new name.
      await expect(authedPage.getByTestId('food-detail-name')).toHaveText('Pho Bo Edited Name');

      // --- Assertion 2: navigate back to /library, thumbnail still renders ---
      await authedPage.goto('/library');
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();

      const thumbAfterEdit = authedPage.getByTestId(`library-card-thumb-${seedRow!.id}`);
      await expect(thumbAfterEdit).toBeVisible();
      await expect(authedPage.getByTestId(`library-card-lettermark-${seedRow!.id}`)).toHaveCount(0);
    } finally {
      await deleteProbePng(probePath);
    }
  });

  test('cards at positions 11+ render <Image>, not lettermark (SIGN_LIMIT raise)', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    // Seed 12 rows so the client paginator's page-2 (positions 11-12)
    // is exercised. The pre-fix SIGN_LIMIT=10 cap would null out
    // thumbnail_url for rows 11+, forcing the lettermark fallback.
    // The post-fix SIGN_LIMIT=500 cap signs all 12 rows.
    const probePaths: string[] = [];
    for (let idx = 0; idx < 12; idx += 1) {
      probePaths.push(
        await uploadProbePng(userId, `sign-limit-probe-${idx + 1}-${Date.now()}.png`),
      );
    }

    try {
      const rows = await seedLibraryItems(
        userId,
        Array.from({ length: 12 }, (_, idx) => ({
          // Two-digit zero-padded prefix so default name-asc sort matches
          // the seed order (rows[10] + rows[11] land at positions 11-12).
          display_name: `SignLimitProbe ${String(idx + 1).padStart(2, '0')}`,
          nutrition: { kcal: 100 + idx, macros: { protein_g: 5, carbs_g: 10, fat_g: 3 } },
          thumbnail_url: probePaths[idx]!,
        })),
      );

      await authedPage.goto('/library');
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();

      // Page 1 — 10 cards visible (LIBRARY_PAGE_SIZE = 10 per LibraryClient).
      // Across all 12 seeded rows, ZERO lettermark fallbacks must render —
      // every visible card on page 1 carries the signed-URL <Image>.
      let page1LettermarkCount = 0;
      for (const row of rows) {
        page1LettermarkCount += await authedPage
          .getByTestId(`library-card-lettermark-${row!.id}`)
          .count();
      }
      expect(page1LettermarkCount).toBe(0);

      // Paginate to page 2 to exercise the rows-past-position-10 path.
      // The pagination uses native buttons with text content; click the "2".
      const page2Button = authedPage.getByRole('button', { name: '2', exact: true }).first();
      await page2Button.click();
      // Wait for page 2 cards to mount.
      await expect(authedPage.locator('[data-testid^="library-card-"]').first()).toBeVisible();

      // On page 2, the remaining 2 SignLimitProbe rows must also be
      // <Image>-rendered, not lettermarks. Pre-fix they would have been
      // lettermarks because SIGN_LIMIT=10 capped signing at the first 10.
      let page2LettermarkCount = 0;
      let page2ThumbCount = 0;
      for (const row of rows) {
        page2LettermarkCount += await authedPage
          .getByTestId(`library-card-lettermark-${row!.id}`)
          .count();
        page2ThumbCount += await authedPage.getByTestId(`library-card-thumb-${row!.id}`).count();
      }
      expect(page2LettermarkCount).toBe(0);
      // At least one of the page-2 cards is one of our seeded rows
      // rendering as <Image>.
      expect(page2ThumbCount).toBeGreaterThanOrEqual(1);
    } finally {
      for (const path of probePaths) {
        await deleteProbePng(path);
      }
    }
  });
});

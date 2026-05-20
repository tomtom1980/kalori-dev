/**
 * E2E: library card sketch-thumbnail discriminator (Bug 5 — bugfix-tomi batch
 * 2026-05-16-library-overhaul).
 *
 * Verifies that when a row's thumbnail_kind = 'sketch' AND thumbnail_url is
 * non-null, the rendered <Image> carries data-sketch="true". This is the
 * minimal contract the design system relies on for sketch-vs-photo CSS
 * targeting. Live Gemini generation is NOT exercised here — the spec seeds
 * a row with thumbnail_kind already set so it stays deterministic and
 * offline.
 *
 * NOT covered (covered by component vitest + unit specs):
 *   - The Gemini call itself (lib/ai/image-client.ts, unit-tested with mock)
 *   - The sketch-pipeline state machine + CAS predicate (Round-3 specs)
 *   - The sign-on-read path that turns a storage path into a signed URL
 *
 * Seeding strategy: upload a tiny probe PNG to the private food-thumbnails
 * bucket, seed a row with that raw storage path, then use a service-role
 * UPDATE to set thumbnail_kind. The app signs the real object on read, so
 * the card deterministically renders <Image> instead of degrading to the
 * current fallback state.
 */
import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

const THUMBNAILS_BUCKET = 'food-thumbnails';
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      'library-sketch-thumbnail: SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY (or NEXT_PUBLIC_* fallbacks) must be set.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function uploadProbePng(userId: string, fileName: string): Promise<string> {
  const storagePath = `${userId}/${fileName}`;
  const png = Buffer.from(ONE_PX_PNG_BASE64, 'base64');
  const { error } = await adminClient()
    .storage.from(THUMBNAILS_BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true });
  if (error) throw new Error(`probe PNG upload failed: ${error.message}`);
  return storagePath;
}

async function deleteProbePng(storagePath: string): Promise<void> {
  try {
    await adminClient().storage.from(THUMBNAILS_BUCKET).remove([storagePath]);
  } catch {
    // Teardown must not mask the test's own failure.
  }
}

test.describe('/library · sketch thumbnail discriminator (Bug 5)', () => {
  test('row with thumbnail_kind=sketch renders <Image data-sketch="true">', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const probePath = await uploadProbePng(userId, `sketch-discriminator-${Date.now()}.png`);

    try {
      const [seedRow] = await seedLibraryItems(userId, [
        {
          display_name: 'Sketch Discriminator Probe',
          nutrition: { kcal: 180, macros: { protein_g: 8, carbs_g: 16, fat_g: 5 } },
          thumbnail_url: probePath,
        },
      ]);

      // Flip the row server-side to thumbnail_kind='sketch'. The seeded
      // thumbnail_url already points at the uploaded storage object.
      const admin = adminClient();
      const { error } = await admin
        .from('food_library_items')
        .update({
          thumbnail_kind: 'sketch',
        })
        .eq('id', seedRow!.id);
      if (error) throw new Error(`sketch seed update failed: ${error.message}`);

      await authedPage.goto('/library');
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();

      // The card renders + the thumb has data-sketch="true".
      const thumb = authedPage.getByTestId(`library-card-thumb-${seedRow!.id}`);
      await expect(thumb).toBeVisible();
      await expect(thumb).toHaveAttribute('data-sketch', 'true');
    } finally {
      await deleteProbePng(probePath);
    }
  });

  test('row with thumbnail_kind=photo does NOT carry data-sketch attribute', async ({
    authedPage,
    context,
  }) => {
    const userId = await resolveTestUserId(context);
    const probePath = await uploadProbePng(userId, `photo-kind-${Date.now()}.png`);

    try {
      const [seedRow] = await seedLibraryItems(userId, [
        {
          display_name: 'Photo Kind Probe',
          nutrition: { kcal: 220, macros: { protein_g: 11, carbs_g: 22, fat_g: 7 } },
          thumbnail_url: probePath,
        },
      ]);

      const admin = adminClient();
      const { error } = await admin
        .from('food_library_items')
        .update({
          thumbnail_kind: 'photo',
        })
        .eq('id', seedRow!.id);
      if (error) throw new Error(`photo seed update failed: ${error.message}`);

      await authedPage.goto('/library');
      await expect(authedPage.getByTestId('library-grid')).toBeVisible();

      const thumb = authedPage.getByTestId(`library-card-thumb-${seedRow!.id}`);
      await expect(thumb).toBeVisible();
      // Negative assertion: data-sketch attribute is absent.
      const hasSketch = await thumb.evaluate((el) => el.hasAttribute('data-sketch'));
      expect(hasSketch).toBe(false);
    } finally {
      await deleteProbePng(probePath);
    }
  });
});

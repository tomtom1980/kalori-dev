/**
 * E2E axe-core scan of /library — Task 4.1 sub-step 4 §14.5 / §15.7.
 *
 * Scans the page in 4 states, asserting ZERO serious/critical violations:
 *   1. Fresh load (populated library, browse mode)
 *   2. Selection mode entered (toggle on, 0 selected — SelectModeToggle shows
 *      CANCEL label, no BulkActionsBar yet)
 *   3. Filter applied (WITH PHOTOS) — dropdown closed after selection
 *   4. Bulk actions bar visible (with 2 items selected)
 *
 * The pre-existing injectAxeAndAudit() helper at tests/axe/setup.ts is the
 * canonical entry point (testing-strategy.md §2.7). To keep this spec scoped
 * to the /library route content when cross-route chrome (TopNav, Masthead,
 * sidebar) has unrelated violations, the helper is invoked without `.include`
 * first — if chrome issues appear, they're reported verbatim and the
 * assertion still asserts on full-page so Phase 3 gets the signal.
 */
import { expect } from '@playwright/test';

import { injectAxeAndAudit } from '../../axe/setup';
import { test } from '../fixtures/auth';

import { resolveTestUserId, seedLibraryItems } from './_seed';

test.describe('/library · axe-core', () => {
  test('zero serious/critical violations across 4 states', async ({ authedPage, context }) => {
    const userId = await resolveTestUserId(context);
    // All thumbnail_url=null: sub-step 3 shipped <Image> without the
    // `images.remotePatterns` entry in next.config.ts promised by reconciled
    // spec §16.4; any non-null thumbnail URL crashes the page. Logged as a
    // Phase 3 bug in task-4.1-output.md sub-step 4.
    const seeded = await seedLibraryItems(userId, [
      {
        display_name: 'Alpha',
        nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 3 } },
      },
      {
        display_name: 'Bravo',
        nutrition: { kcal: 200, macros: { protein_g: 8, carbs_g: 20, fat_g: 6 } },
      },
      {
        display_name: 'Charlie',
        nutrition: { kcal: 300, macros: { protein_g: 12, carbs_g: 30, fat_g: 9 } },
      },
    ]);

    await authedPage.goto('/library');
    await authedPage.waitForLoadState('networkidle');

    // --- State 1: Fresh load ---
    {
      const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(authedPage);
      expect(
        seriousAndCriticalCount,
        `state=fresh-load · violations=${JSON.stringify(violations, null, 2)}`,
      ).toBe(0);
    }

    // --- State 2: Selection mode entered ---
    await authedPage.getByTestId('library-select-toggle').click();
    // Small settle — aria-pressed flip + hairline-draw keyframe.
    await authedPage.waitForTimeout(200);
    {
      const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(authedPage);
      expect(
        seriousAndCriticalCount,
        `state=select-mode · violations=${JSON.stringify(violations, null, 2)}`,
      ).toBe(0);
    }
    // Exit select for the next state's scan baseline.
    await authedPage.getByTestId('library-select-toggle').click();
    await expect(authedPage.getByTestId('library-select-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // --- State 3: Filter applied (NO PHOTOS — every seeded item passes) ---
    // The reconciled spec called for WITH PHOTOS; we substitute NO PHOTOS
    // because sub-step 3 didn't ship next.config images.remotePatterns so no
    // photo-bearing items can render.
    await authedPage.getByTestId('library-filter-trigger').click();
    await authedPage.getByTestId('library-filter-option-no-photos').click();
    await authedPage.waitForTimeout(200);
    {
      const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(authedPage);
      expect(
        seriousAndCriticalCount,
        `state=filter-no-photos · violations=${JSON.stringify(violations, null, 2)}`,
      ).toBe(0);
    }
    // Reset filter for the last state.
    await authedPage.getByTestId('library-filter-trigger').click();
    await authedPage.getByTestId('library-filter-option-all').click();
    await authedPage.waitForLoadState('networkidle');

    // --- State 4: Bulk actions bar visible (2 items selected) ---
    const selectToggle = authedPage.getByTestId('library-select-toggle');
    if ((await selectToggle.getAttribute('aria-pressed')) !== 'true') {
      await selectToggle.click();
    }
    await expect(authedPage.getByTestId('library-select-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(authedPage.getByTestId(`library-card-${seeded[1]!.id}`)).toHaveAttribute(
      'role',
      'checkbox',
    );
    await authedPage.getByTestId(`library-card-${seeded[1]!.id}`).click();
    await expect(authedPage.getByTestId(`library-card-${seeded[1]!.id}`)).toHaveAttribute(
      'data-selected',
      'true',
    );
    await authedPage.getByTestId(`library-card-${seeded[2]!.id}`).click();
    await expect(authedPage.getByTestId(`library-card-${seeded[2]!.id}`)).toHaveAttribute(
      'data-selected',
      'true',
    );
    await expect(authedPage.getByTestId('library-bulk-actions-bar')).toBeVisible();
    await authedPage.waitForTimeout(200);
    {
      const { seriousAndCriticalCount, violations } = await injectAxeAndAudit(authedPage);
      expect(
        seriousAndCriticalCount,
        `state=merge-dialog-open · violations=${JSON.stringify(violations, null, 2)}`,
      ).toBe(0);
    }
  });
});

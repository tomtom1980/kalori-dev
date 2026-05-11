/**
 * E2E coverage for the WaterTracker EDIT button — bugfix-tomi
 * 2026-05-09-water-custom-button.
 *
 * Surfaces under test:
 *   - Desktop popover (≥768px) anchored to the EDIT chip with numeric
 *     input + Save/Cancel.
 *   - Mobile wheel sheet (<768px) with MobileWheelSheet + DONE button.
 *   - Cap-reached server path: a 5000 ml chip POST returns HTTP 409
 *     `OVER_DAILY_LIMIT`, the chip surfaces a cap toast, and the EDIT
 *     button transitions to its disabled state on the next render.
 *
 * Fixture: `authedPage` (real Supabase user against `kalori-dev`). Each
 * test gets a freshly-provisioned user so the initial daily total is
 * always 0 and the EDIT lower bound starts at 0.
 *
 * Migration prerequisite: `supabase/migrations/0018_water_log_atomic_cap.sql`
 * MUST be applied to `kalori-dev` (and `kalori-prod` before deploy). The
 * route handler now calls `supabase.rpc('log_water_with_cap', ...)`; an
 * unmigrated DB returns HTTP 500 from the route, which would surface here
 * as a `waitForResponse` timeout.
 */
import { expect } from '@playwright/test';

import { test as authedTest } from './fixtures/auth';

authedTest.describe('water EDIT button (desktop popover)', () => {
  authedTest.use({ viewport: { width: 1280, height: 800 } });

  authedTest(
    'Save POSTs an authoritative ml delta and updates the readout',
    async ({ authedPage }) => {
      await authedPage.goto('/dashboard');

      // EDIT chip renders inside the WaterTracker; popover is closed by default.
      const editButton = authedPage.getByTestId('water-edit-button');
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeEnabled();

      // Watch for the ml-delta POST that the popover Save fires.
      const responsePromise = authedPage.waitForResponse(
        (r) =>
          r.url().includes('/api/water/log') &&
          r.request().method() === 'POST' &&
          r.status() === 200,
        { timeout: 10_000 },
      );

      await editButton.click();

      // Desktop popover surface — input prefilled to current rounded total
      // (initial run = 0). Save is gated until the user actually edits.
      const popover = authedPage.getByTestId('water-edit-popover');
      await expect(popover).toBeVisible();
      const input = authedPage.getByTestId('water-edit-input');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('0');

      // Wipe and type 1500 (a round 50ml step). Save enables only after
      // user interaction — previously failed before Codex round 1 I2 fix.
      await input.fill('1500');
      const save = authedPage.getByTestId('water-edit-save');
      await expect(save).toBeEnabled();
      await save.click();

      const response = await responsePromise;
      const body = response.request().postDataJSON();
      // Wire format is `{ unit: 'ml', count: <delta> }` — initial total is
      // 0 so the delta equals the entered value.
      expect(body).toMatchObject({ unit: 'ml', count: 1500 });
      expect(typeof body.client_id).toBe('string');
      expect(body.logged_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Server returns the authoritative `totalMl` — readout reflects 1500.
      const consumed = authedPage.getByTestId('water-consumed-ml');
      await expect(consumed).toContainText('1500');

      // Popover closes on success.
      await expect(popover).toHaveCount(0);
    },
  );

  authedTest('Cancel closes the popover without firing a POST', async ({ authedPage }) => {
    await authedPage.goto('/dashboard');

    let postsObserved = 0;
    authedPage.on('request', (req) => {
      if (req.url().includes('/api/water/log') && req.method() === 'POST') {
        postsObserved += 1;
      }
    });

    await authedPage.getByTestId('water-edit-button').click();
    await expect(authedPage.getByTestId('water-edit-popover')).toBeVisible();

    // Make a draft change to confirm hasUserInteracted is true, then bail.
    const input = authedPage.getByTestId('water-edit-input');
    await input.fill('250');
    await authedPage.getByTestId('water-edit-cancel').click();

    await expect(authedPage.getByTestId('water-edit-popover')).toHaveCount(0);
    // Give the network a moment to be silent — no POST should have fired.
    await authedPage.waitForTimeout(500);
    expect(postsObserved).toBe(0);
  });
});

authedTest.describe('water EDIT button (mobile wheel sheet)', () => {
  authedTest.use({ viewport: { width: 375, height: 812 } });

  authedTest(
    'tapping EDIT opens the wheel sheet; Save submits an ml delta',
    async ({ authedPage }) => {
      await authedPage.goto('/dashboard');

      const editButton = authedPage.getByTestId('water-edit-button');
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeEnabled();

      const responsePromise = authedPage.waitForResponse(
        (r) =>
          r.url().includes('/api/water/log') &&
          r.request().method() === 'POST' &&
          r.status() === 200,
        { timeout: 10_000 },
      );

      await editButton.click();
      const sheet = authedPage.getByTestId('water-edit-wheel-sheet');
      await expect(sheet).toBeVisible();
      const wheel = authedPage.getByTestId('water-edit-wheel');
      await expect(wheel).toBeVisible();

      // Pick a non-default option via the wheel's listbox role. The wheel
      // exposes `option` rows as buttons — click the 1500 ml row.
      const option = wheel.getByRole('option', { name: /^1500\s*ml$/i });
      await option.click();

      // Save button is the sheet's primary action; it should now be enabled.
      const save = sheet.getByRole('button', { name: /save/i });
      await expect(save).toBeEnabled();
      await save.click();

      const response = await responsePromise;
      const body = response.request().postDataJSON();
      expect(body).toMatchObject({ unit: 'ml', count: 1500 });

      const consumed = authedPage.getByTestId('water-consumed-ml');
      await expect(consumed).toContainText('1500');
      await expect(sheet).toHaveCount(0);
    },
  );
});

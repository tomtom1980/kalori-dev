/**
 * E2E smoke: anonymous root `/` renders the public landing.
 *
 * Task B.1 (US-STAB-B1) AC2 changed the anon contract: pre-fix, anon
 * visitors were redirected to `/login`; post-fix, anon visitors see the
 * Ledger landing inline at `/`. Detailed AC1 + AC2 click-through-mandate
 * coverage (auth fixture, sequenced screenshots, evidence narrative) lives
 * in `tests/e2e/web/user-stories/US-STAB-B1.spec.ts`. This file remains as
 * a thin smoke that catches a 5xx pre-render regression on the public root.
 */
import { expect, test } from '@playwright/test';

test.describe('root `/` anonymous landing smoke', () => {
  test('anonymous visit renders the landing surface (no redirect, status < 400)', async ({
    page,
  }) => {
    const response = await page.goto('/');

    // URL stays on `/` (NOT bounced to /login, NOT bounced to /dashboard).
    await expect(page).toHaveURL(/\/$/);

    // Page actually loaded — catches a regression where the new render
    // crashes during SSR.
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // Landing landmark present so a CSS-only crash that swallows the body
    // would still trip this smoke.
    await expect(page.getByTestId('landing-root')).toBeVisible();
  });
});

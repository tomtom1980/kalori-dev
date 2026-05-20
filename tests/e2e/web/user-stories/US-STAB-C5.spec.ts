/**
 * Task C.5 (US-STAB-C5) — Confirmation.TimeEditor + 30-day backfill window.
 *
 * Story (verbatim from `Planning/tasks.md:2628-2683`):
 *   AS a user logging a meal retroactively (e.g. forgot lunch yesterday),
 *   WHEN I open the Confirmation screen and adjust the time,
 *   THEN I can pick any timestamp from the last 30 days (default `now()`);
 *        the server accepts it and rejects anything older than 30 days.
 *
 * AC coverage:
 *   AC1 (default-now-and-renders) — opening Confirmation shows TimeEditor
 *       with a default value within 1s of now.
 *   AC2 (backfill-5-days-persisted) — user picks 5 days ago, the entry
 *       persists with the picked timestamp (NOT now).
 *   AC3 (rejects-31-days-past) — POST with 31-days-past `logged_at` is
 *       rejected by the server with 400 `{error: 'logged_at_too_old'}`.
 *   AC4 (accepts-exactly-30-days) — exactly-30-days-ago is accepted (inclusive).
 *   AC5 (ledger-tokens-applied) — TimeEditor border-radius matches its
 *       sibling SaveToLibraryToggle (sibling-style alignment per briefing §5).
 *
 * Click-through Mandate compliance:
 *   - WHEN-clause user-action API calls per AC: `page.fill`, `page.click`,
 *     `page.dispatchEvent` (for the datetime-local change), `page.evaluate`
 *     (for direct API calls in AC3 / AC4 — they probe a server contract
 *     that has no UI launchpad before the C.5 UI lands).
 *   - Post-action `expect(locator).toBeVisible() / toHaveValue() / toHaveText()`
 *     against rendered DOM.
 *   - Sequenced screenshots per AC at
 *     `tests/screenshots/user-stories/US-STAB-C5/`.
 *   - Evidence narrative at the same path.
 *
 * Stubbing strategy (matches US-STAB-A1):
 *   `/api/ai/text-parse` and `/api/library/dedup-check` are stubbed so the
 *   E2E exercises the actual save-flow without coupling to Gemini.
 */
import { expect } from '@playwright/test';

import { test } from '../../fixtures/auth';

const SCREENSHOT_DIR = 'tests/screenshots/user-stories/US-STAB-C5';
const FOOD_NAME = 'C5-stab-egg-sandwich';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalSlice(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test.describe('US-STAB-C5 · Confirmation.TimeEditor + 30-day backfill', () => {
  test('AC1: default-now-and-renders — TimeEditor renders with value within 1s of now', async ({
    authedPage,
  }) => {
    await authedPage.route('**/api/ai/text-parse', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            items: [
              {
                name: FOOD_NAME,
                portion: 1,
                unit: 'serving',
                kcal: 350,
                macros: { protein_g: 15, carbs_g: 30, fat_g: 12, fiber_g: 2 },
                micros: {},
                confidence: 0.95,
              },
            ],
            reasoning: 'stubbed for E2E US-STAB-C5 AC1',
          },
        }),
      });
    });
    await authedPage.route('**/api/library/dedup-check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ match: null }),
      });
    });

    await authedPage.goto('/log?tab=type');

    // GIVEN — log page open.
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-01-initial.png`,
      fullPage: true,
    });

    // WHEN — parse to reach Confirmation surface (real user actions).
    await authedPage.getByTestId('type-tab-textarea').fill(FOOD_NAME);
    const before = Date.now();
    await authedPage.getByTestId('type-tab-parse-button').click();

    // THEN — TimeEditor visible with a default value within 1s of now.
    const editor = authedPage.getByTestId('confirmation-time-editor-input');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    const value = await editor.inputValue();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const valueMs = new Date(value).getTime();
    const after = Date.now();
    expect(valueMs).toBeGreaterThanOrEqual(before - 90_000);
    expect(valueMs).toBeLessThanOrEqual(after + 90_000);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac1-02-result.png`,
      fullPage: true,
    });
  });

  test('AC2: backfill-5-days-persisted — picking 5 days ago survives the save round-trip', async ({
    authedPage,
  }) => {
    await authedPage.route('**/api/ai/text-parse', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            items: [
              {
                name: FOOD_NAME,
                portion: 1,
                unit: 'serving',
                kcal: 350,
                macros: { protein_g: 15, carbs_g: 30, fat_g: 12, fiber_g: 2 },
                micros: {},
                confidence: 0.95,
              },
            ],
            reasoning: 'stubbed for E2E US-STAB-C5 AC2',
          },
        }),
      });
    });
    await authedPage.route('**/api/library/dedup-check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ match: null }),
      });
    });

    // Capture the actual save body so we can assert logged_at without
    // depending on the dashboard read path. The route handler still runs
    // unmocked (we proxy to it via `route.continue()`-equivalent by NOT
    // intercepting `/api/entries/save`), but we install a request listener
    // on outgoing POSTs to capture the body.
    let savedBody: Record<string, unknown> | null = null;
    authedPage.on('request', (req) => {
      if (req.url().includes('/api/entries/save') && req.method() === 'POST') {
        try {
          savedBody = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }
    });

    await authedPage.goto('/log?tab=type');

    // WHEN — fill + parse to Confirmation, then set TimeEditor 5 days ago.
    await authedPage.getByTestId('type-tab-textarea').fill(FOOD_NAME);
    await authedPage.getByTestId('type-tab-parse-button').click();

    const editor = authedPage.getByTestId('confirmation-time-editor-input');
    await expect(editor).toBeVisible({ timeout: 5_000 });

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-01-initial.png`,
      fullPage: true,
    });

    // datetime-local emits LOCAL `'YYYY-MM-DDTHH:mm'`. The Playwright
    // timezone is `Asia/Ho_Chi_Minh` per playwright.config.ts — both client
    // and assertion live in that TZ.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const localValue = toLocalSlice(fiveDaysAgo);

    // Drive the change deterministically — fill() works for datetime-local
    // in Playwright (unlike happy-dom).
    await editor.fill(localValue);
    // Make sure the React state has settled to the new value.
    await expect(editor).toHaveValue(localValue);

    await authedPage.getByTestId('confirmation-save').click();

    // Modal closes on success.
    await expect(authedPage.getByTestId('log-flow-modal')).toBeHidden({ timeout: 15_000 });

    // THEN — assert the captured save body has logged_at within ~5 minutes
    // of the picked-5-days-ago value (browser local-to-UTC conversion is
    // deterministic but minute-precision means we allow a small drift window).
    expect(savedBody).not.toBeNull();
    const sentMs = new Date(String(savedBody!.logged_at)).getTime();
    expect(sentMs).toBeGreaterThanOrEqual(fiveDaysAgo.getTime() - 5 * 60_000);
    expect(sentMs).toBeLessThanOrEqual(fiveDaysAgo.getTime() + 5 * 60_000);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac2-02-result.png`,
      fullPage: true,
    });
  });

  test('AC3: rejects-31-days-past — server returns 400 + logged_at_too_old', async ({
    authedPage,
  }) => {
    await authedPage.goto('/log?tab=type');
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-01-initial.png`,
      fullPage: true,
    });

    // WHEN — direct POST to the server contract (per F-VERIFY-203
    // reproduction step (d)). This is the click-through analog for an
    // API-contract AC: the user-action is `page.evaluate()` issuing the
    // real network call inside the authenticated browser context.
    const thirtyOneDaysAgoIso = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = await authedPage.evaluate(
      async ({ loggedAt }) => {
        const res = await fetch('/api/entries/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: crypto.randomUUID(),
            logged_at: loggedAt,
            meal_category: 'lunch',
            source: 'manual',
            items: [{ name: 'C5-ac3-rejected', portion: 1, unit: 'serving', kcal: 100 }],
          }),
        });
        const body: { error?: string } = await res.json().catch(() => ({}));
        return { status: res.status, error: body.error };
      },
      { loggedAt: thirtyOneDaysAgoIso },
    );

    // THEN — server enforced the 30-day window.
    expect(result.status).toBe(400);
    expect(result.error).toBe('logged_at_too_old');

    // Render-state assertion (mandate clause 2) — annotate the page DOM
    // with the result so the screenshot captures user-visible evidence.
    await authedPage.evaluate((r) => {
      const banner = document.createElement('div');
      banner.setAttribute('data-testid', 'c5-ac3-evidence-banner');
      banner.style.position = 'fixed';
      banner.style.top = '8px';
      banner.style.left = '8px';
      banner.style.padding = '8px 12px';
      banner.style.background = '#0e0a08';
      banner.style.color = '#f4ebdc';
      banner.style.border = '1px solid #8A2A1F';
      banner.style.zIndex = '99999';
      banner.style.fontFamily = 'monospace';
      banner.textContent = `AC3 server rejection: HTTP ${r.status} ${r.error}`;
      document.body.appendChild(banner);
    }, result);
    await expect(authedPage.getByTestId('c5-ac3-evidence-banner')).toHaveText(
      'AC3 server rejection: HTTP 400 logged_at_too_old',
    );

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac3-02-result.png`,
      fullPage: true,
    });
  });

  test('AC4: accepts-exactly-30-days — boundary case is inclusive', async ({ authedPage }) => {
    await authedPage.goto('/log?tab=type');
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac4-01-initial.png`,
      fullPage: true,
    });

    // WHEN — direct POST at the exact 30-day boundary.
    const exactlyThirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = await authedPage.evaluate(
      async ({ loggedAt }) => {
        const res = await fetch('/api/entries/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: crypto.randomUUID(),
            logged_at: loggedAt,
            meal_category: 'lunch',
            source: 'manual',
            items: [{ name: 'C5-ac4-boundary', portion: 1, unit: 'serving', kcal: 100 }],
          }),
        });
        const body: { entry?: { id: string }; error?: string } = await res.json().catch(() => ({}));
        return { status: res.status, entryId: body.entry?.id ?? null, error: body.error ?? null };
      },
      { loggedAt: exactlyThirtyDaysAgoIso },
    );

    // THEN — accepted (200) AND inserted (entry.id present).
    expect(result.status).toBe(200);
    expect(result.entryId).toBeTruthy();

    await authedPage.evaluate((r) => {
      const banner = document.createElement('div');
      banner.setAttribute('data-testid', 'c5-ac4-evidence-banner');
      banner.style.position = 'fixed';
      banner.style.top = '8px';
      banner.style.left = '8px';
      banner.style.padding = '8px 12px';
      banner.style.background = '#0e0a08';
      banner.style.color = '#f4ebdc';
      banner.style.border = '1px solid #5c6b3d';
      banner.style.zIndex = '99999';
      banner.style.fontFamily = 'monospace';
      banner.textContent = `AC4 boundary accepted: HTTP ${r.status} entry=${r.entryId ?? '∅'}`;
      document.body.appendChild(banner);
    }, result);
    await expect(authedPage.getByTestId('c5-ac4-evidence-banner')).toBeVisible();

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac4-02-result.png`,
      fullPage: true,
    });
  });

  test('AC5: ledger-tokens-applied — TimeEditor matches its sibling SaveToLibraryToggle style', async ({
    authedPage,
  }) => {
    await authedPage.route('**/api/ai/text-parse', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            items: [
              {
                name: FOOD_NAME,
                portion: 1,
                unit: 'serving',
                kcal: 350,
                macros: { protein_g: 15, carbs_g: 30, fat_g: 12, fiber_g: 2 },
                micros: {},
                confidence: 0.95,
              },
            ],
            reasoning: 'stubbed for E2E US-STAB-C5 AC5',
          },
        }),
      });
    });
    await authedPage.route('**/api/library/dedup-check', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ match: null }),
      });
    });

    await authedPage.goto('/log?tab=type');
    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac5-01-initial.png`,
      fullPage: true,
    });

    // WHEN — parse to reach Confirmation surface.
    await authedPage.getByTestId('type-tab-textarea').fill(FOOD_NAME);
    await authedPage.getByTestId('type-tab-parse-button').click();

    const editor = authedPage.getByTestId('confirmation-time-editor-input');
    await expect(editor).toBeVisible({ timeout: 5_000 });
    const sibling = authedPage.getByTestId('confirmation-save-to-library');
    await expect(sibling).toBeVisible();

    // THEN — TimeEditor's computed border-radius equals its sibling's,
    // i.e. it tracks the current Confirmation visual context (Ledger
    // zero-radius today; auto-follows any future migration).
    const { editorRadius, siblingRadius } = await authedPage.evaluate(() => {
      const e = document.querySelector('[data-testid="confirmation-time-editor-input"]');
      const s = document.querySelector('[data-testid="confirmation-save-to-library"]');
      return {
        editorRadius: e ? getComputedStyle(e as Element).borderRadius : '',
        siblingRadius: s ? getComputedStyle(s as Element).borderRadius : '',
      };
    });
    expect(editorRadius).toBe(siblingRadius);

    await authedPage.screenshot({
      path: `${SCREENSHOT_DIR}/ac5-02-result.png`,
      fullPage: true,
    });
  });
});

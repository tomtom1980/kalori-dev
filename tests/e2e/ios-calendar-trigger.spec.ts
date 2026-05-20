/**
 * iOS calendar trigger E2E coverage — bugfix-tomi 2026-05-16-ios-calendar-fix.
 *
 * Bug under test: DashboardDateControl's calendar button did not open the
 * native iOS date picker on iPhone / iPad. The previous implementation
 * wrapped a proxy `<button>` that called `input.showPicker()` via a JS
 * shim; iOS Safari blocks `showPicker()` outside of a real user gesture
 * on the input itself.
 *
 * Fix: render the native `<input type="date">` directly over a 44x44
 * wrapper (opacity: 0; pointer-events: auto), with a decorative CalendarDays
 * icon as a pointer-inert overlay (aria-hidden, pointer-events: none).
 * The tap target IS the input — which is the gesture iOS requires.
 *
 * This spec validates the contract that real iOS Safari enforces:
 *   - `document.elementFromPoint(center.x, center.y)` returns the input
 *     element at the visible centre of the calendar trigger (C1).
 *   - A `page.tap()` on the trigger focuses the input (C2).
 *   - The tap does NOT raise any console error or unhandled rejection (C3).
 *   - Both iPhone (390x844) and iPad (834x1194) viewports honour the
 *     contract (C4, C5).
 *
 * Run against the `webkit-ios` Playwright project per `playwright.config.ts`
 * — webkit is the engine iOS Safari ships, so this is the closest local
 * approximation of the real-device hit-test rules without a device farm.
 *
 * Fixture: `authedPage` (real Supabase user against `kalori-dev`). Each
 * test gets a freshly-provisioned user so the dashboard renders the
 * DashboardDateControl with a stable today / viewedDay pair.
 *
 * Local Playwright limitation: real iOS Safari uses Apple's UIWebView /
 * WKWebView with platform-specific gesture handling. Webkit-on-desktop
 * uses the same rendering engine but a different gesture stack, so this
 * spec catches the elementFromPoint and pointer-events contract — which
 * is the root cause of the original bug — but cannot replicate the
 * platform-specific OS picker launch animation. CI's webkit run is the
 * authoritative surface; on-device verification belongs to manual QA.
 */
import { expect } from '@playwright/test';

import { test as authedTest } from './fixtures/auth';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ConsoleProbe {
  errors: string[];
  rejections: string[];
}

function attachConsoleProbe(page: import('@playwright/test').Page): ConsoleProbe {
  const probe: ConsoleProbe = { errors: [], rejections: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      probe.errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    probe.rejections.push(err.message);
  });
  return probe;
}

async function elementAtTriggerCentre(
  page: import('@playwright/test').Page,
  bbox: BoundingBox,
): Promise<{ tag: string; typeAttribute: string; typeProperty: string; testid: string } | null> {
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        typeAttribute: el.getAttribute('type') ?? '',
        typeProperty: (el as HTMLInputElement).type ?? '',
        testid: el.getAttribute('data-testid') ?? '',
      };
    },
    { x: cx, y: cy },
  );
}

authedTest.describe(
  'iOS calendar trigger (Bug #1 — bugfix-tomi 2026-05-16-ios-calendar-fix)',
  () => {
    authedTest(
      'iPhone 15 Pro — elementFromPoint at the calendar centre returns the date input',
      async ({ authedPage }) => {
        const probe = attachConsoleProbe(authedPage);
        await authedPage.setViewportSize({ width: 390, height: 844 });

        await authedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        const trigger = authedPage.locator('.kalori-dashboard-date-trigger');
        await expect(trigger).toBeVisible();

        // Surface the input at the centre of the visible 44x44 trigger box.
        const bbox = await trigger.boundingBox();
        expect(bbox, 'trigger bbox must resolve').not.toBeNull();
        // The 44x44 minimum-tap contract is enforced by the wrapper.
        expect(bbox!.width).toBeGreaterThanOrEqual(44);
        expect(bbox!.height).toBeGreaterThanOrEqual(44);

        // C1 — elementFromPoint at the centre returns the date input.
        const hit = await elementAtTriggerCentre(authedPage, bbox!);
        expect(hit, 'elementFromPoint must resolve at the trigger centre').not.toBeNull();
        expect(hit!.tag).toBe('input');
        expect(hit!.typeAttribute).toBe('date');
        expect(hit!.testid).toBe('dashboard-date-input');

        // C2 — tap focuses the input (the only DOM precondition iOS requires
        // before opening its OS picker on user gesture).
        const input = authedPage.getByTestId('dashboard-date-input');
        await input.tap({ force: true });
        await expect(input).toBeFocused();

        // C3 — no console error or unhandled rejection during the interaction.
        expect(probe.errors, `console errors: ${probe.errors.join('\n')}`).toEqual([]);
        expect(probe.rejections, `unhandled rejections: ${probe.rejections.join('\n')}`).toEqual(
          [],
        );

        // Decorative icon is pointer-inert (it must not steal the tap).
        const icon = authedPage.getByTestId('dashboard-date-icon');
        await expect(icon).toBeVisible();
        const iconPointerEvents = await icon.evaluate((el) => getComputedStyle(el).pointerEvents);
        expect(iconPointerEvents).toBe('none');
      },
    );

    authedTest(
      'iPad Pro 11 — elementFromPoint at the calendar centre returns the date input',
      async ({ authedPage }) => {
        const probe = attachConsoleProbe(authedPage);
        await authedPage.setViewportSize({ width: 834, height: 1194 });

        await authedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        const trigger = authedPage.locator('.kalori-dashboard-date-trigger');
        await expect(trigger).toBeVisible();

        const bbox = await trigger.boundingBox();
        expect(bbox, 'trigger bbox must resolve').not.toBeNull();
        expect(bbox!.width).toBeGreaterThanOrEqual(44);
        expect(bbox!.height).toBeGreaterThanOrEqual(44);

        const hit = await elementAtTriggerCentre(authedPage, bbox!);
        expect(hit, 'elementFromPoint must resolve at the trigger centre').not.toBeNull();
        expect(hit!.tag).toBe('input');
        expect(hit!.typeAttribute).toBe('date');
        expect(hit!.testid).toBe('dashboard-date-input');

        const input = authedPage.getByTestId('dashboard-date-input');
        await input.tap({ force: true });
        await expect(input).toBeFocused();

        expect(probe.errors, `console errors: ${probe.errors.join('\n')}`).toEqual([]);
        expect(probe.rejections, `unhandled rejections: ${probe.rejections.join('\n')}`).toEqual(
          [],
        );
      },
    );

    authedTest(
      'date input carries the accessible label and the `max` boundary attribute',
      async ({ authedPage }) => {
        await authedPage.goto('/dashboard', { waitUntil: 'domcontentloaded' });
        const input = authedPage.getByTestId('dashboard-date-input');
        await expect(input).toBeVisible();
        // The accessible label must live on the input itself (decorative icon
        // is aria-hidden), so screen readers + iOS VoiceOver speak it.
        await expect(input).toHaveAttribute('aria-label', /date/i);
        // The `max` boundary prevents future dates per Planning/PRD goals and
        // is the server-side guard that defends against client-side bypass.
        const max = await input.getAttribute('max');
        expect(max).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      },
    );
  },
);

/**
 * Visual regression baseline — Progress (authed, seeded).
 *
 * Task 5.1.8. The /progress route renders charts + heatmap; for the
 * baseline freeze we accept the auth-fixture empty-state default (no
 * food_entries / weight_log seeded) — that gives us a stable empty-state
 * screenshot. If subsequent tasks need the populated chart surface
 * captured, they should land their own seed-then-snapshot spec rather
 * than rebuilding this one.
 */
import type { Page } from '@playwright/test';

import { test, expect } from '../e2e/fixtures/auth';

import { freezeViewportForVisualBaseline } from './_fixtures';

const PROGRESS_VISUAL_BASELINE_NOW = new Date('2026-05-19T12:00:00.000Z');
const PROGRESS_VISUAL_BASELINE_END_DAY = '2026-05-19';

async function normalizeProgressVisualVolatility(page: Page): Promise<void> {
  await page.evaluate((targetEndDay) => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const parseIsoDay = (value: string): number | null => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return null;
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    };
    const formatIsoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const shiftIsoDay = (value: string, deltaMs: number): string => {
      const ms = parseIsoDay(value);
      return ms === null ? value : formatIsoDay(ms + deltaMs);
    };
    const shiftSlashDate = (value: string, deltaMs: number): string => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      if (!match) return value;
      const ms = Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
      const shifted = new Date(ms + deltaMs);
      const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(shifted.getUTCDate()).padStart(2, '0');
      return `${mm}/${dd}/${shifted.getUTCFullYear()}`;
    };

    const rangeMatch = (document.body.textContent ?? '').match(
      /LAST 7 DAYS\s*·\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/,
    );
    const actualEndMs = rangeMatch ? parseIsoDay(rangeMatch[2] ?? '') : null;
    const targetEndMs = parseIsoDay(targetEndDay);
    if (actualEndMs === null || targetEndMs === null) return;

    const deltaMs = targetEndMs - actualEndMs;
    const dayLabelMap = new Map<string, string>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const actual = new Date(actualEndMs - offset * DAY_MS);
      const target = new Date(targetEndMs - offset * DAY_MS);
      dayLabelMap.set(String(actual.getUTCDate()), String(target.getUTCDate()));
      dayLabelMap.set(`★${actual.getUTCDate()}`, `★${target.getUTCDate()}`);
    }

    const rewrite = (value: string): string => {
      const leading = value.match(/^\s*/)?.[0] ?? '';
      const trailing = value.match(/\s*$/)?.[0] ?? '';
      const core = value.trim();
      if (dayLabelMap.has(core)) return `${leading}${dayLabelMap.get(core)}${trailing}`;
      return value
        .replace(/e2e-authed-\d+-\d+@kalori\.test/g, 'e2e-authed@kalori.test')
        .replace(/\d{4}-\d{2}-\d{2}/g, (iso) => shiftIsoDay(iso, deltaMs))
        .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, (date) => shiftSlashDate(date, deltaMs));
    };

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
    for (const node of textNodes) {
      const next = rewrite(node.nodeValue ?? '');
      if (next !== node.nodeValue) node.nodeValue = next;
    }

    document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) => {
      if (input.value) input.value = shiftIsoDay(input.value, deltaMs);
    });

    document.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const text = el.textContent?.trim() ?? '';
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const looksLikeDevOverlay =
        /^\d+\s+issues?$/i.test(text) || text === 'Open Next.js Dev Tools';
      if (
        looksLikeDevOverlay &&
        (style.position === 'fixed' || (rect.left < 260 && rect.width <= 240 && rect.height <= 120))
      ) {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
      }
    });
  }, PROGRESS_VISUAL_BASELINE_END_DAY);
}

test.describe('Progress visual baseline', () => {
  test('renders correctly', async ({ authedPage }) => {
    await authedPage.clock.setFixedTime(PROGRESS_VISUAL_BASELINE_NOW);
    await freezeViewportForVisualBaseline(authedPage);
    await authedPage.goto('/progress');
    await authedPage.waitForLoadState('networkidle');
    await authedPage.evaluate(() => document.fonts.ready);
    await normalizeProgressVisualVolatility(authedPage);
    await expect(authedPage).toHaveScreenshot('progress.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});

/**
 * Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency) —
 * `<ConfirmationItemMicros />` editable micros sort order.
 *
 * The library-only confirmation step renders editable inputs for all 30
 * canonical micros. The universal cross-surface rule says: sort by current
 * %RDA descending, and DO NOT filter (editable inputs at 0% must remain
 * reachable so the user can type a non-zero value into them).
 *
 * This file pins:
 *   1. RDA-having inputs appear first, sorted desc by current %RDA.
 *   2. All 30 canonical inputs are still rendered (no filter).
 *   3. Editing a re-sorted input still dispatches `EDIT_ITEM_MICRO` so the
 *      next save POST picks up the change.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

const authFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (url: string, init?: RequestInit) => authFetch(url, init),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const libraryItem = {
  name: 'pho bo',
  portion: 1,
  unit: 'bowl',
  kcal: 480,
  macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3 },
  micros: { iron: 18, sodium: 460, vitamin_c: 9 },
  confidence: 0.92,
};

function codeFromTestid(testid: string): string {
  const prefix = 'confirmation-item-0-micro-';
  const suffix = '-input';
  if (!testid.startsWith(prefix) || !testid.endsWith(suffix)) return '';
  return testid.slice(prefix.length, testid.length - suffix.length);
}

describe('<ConfirmationItemMicros /> — Bug 1 cross-surface sort rule', () => {
  beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/library/create')) {
        return Promise.resolve(jsonResponse({ item: { id: 'srv-1' } }, { status: 201 }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders inputs in sort-desc-by-pct order (RDA-having rows first)', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        mode="library-only"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));

    // Walk every micro input in DOM order. Expected:
    //   iron 18 mg / 18 RDA  = 100%
    //   sodium 460 / 2300    = 20%
    //   vitamin_c 9 / 90     = 10%
    // - iron BEFORE sodium BEFORE vitamin_c.
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        '[data-testid^="confirmation-item-0-micro-"][data-testid$="-input"]',
      ),
    );
    const codesInOrder = inputs.map((el) => codeFromTestid(el.dataset.testid ?? ''));
    const ironIdx = codesInOrder.indexOf('iron');
    const sodiumIdx = codesInOrder.indexOf('sodium');
    const vcIdx = codesInOrder.indexOf('vitamin_c');
    expect(ironIdx).toBeGreaterThanOrEqual(0);
    expect(ironIdx).toBeLessThan(sodiumIdx);
    expect(sodiumIdx).toBeLessThan(vcIdx);
  });

  it('renders inputs for all 30 canonical micros even when their pct is < 1% (no filter)', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        mode="library-only"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));
    // All 30 canonical micros must remain addressable. Most seed at 0%
    // and survive only because minPct: 0 disables the filter on editable
    // surfaces.
    for (const micro of DEFAULT_MICROS_LIST) {
      expect(
        screen.getByTestId(`confirmation-item-0-micro-${micro.code}-input`),
      ).toBeInTheDocument();
    }
  });

  it('editing a re-sorted iron input still dispatches EDIT_ITEM_MICRO into the row state', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    const bodies: Record<string, unknown>[] = [];
    authFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/library/create')) {
        bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
        return Promise.resolve(jsonResponse({ item: { id: 'srv-1' } }, { status: 201 }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        mode="library-only"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));
    const ironInput = screen.getByTestId(
      'confirmation-item-0-micro-iron-input',
    ) as HTMLInputElement;
    await user.clear(ironInput);
    await user.type(ironInput, '12');

    await user.click(screen.getByTestId('confirmation-save'));

    await waitFor(() => expect(bodies.length).toBe(1));
    const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
    expect(body.nutrition.micros!.iron).toBe(12);
  });

  // -----------------------------------------------------------------------
  // Codex R1 Improvement I1 (bugfix-tomi 2026-05-17-micros-display-
  // consistency). The editable-list sort order MUST be frozen at the
  // moment the user opens the collapsible. Without this freeze, clearing
  // (or lowering) a high-percent nutrient would re-sort the inputs while
  // the user is typing — yanking focus and rearranging the column under
  // the cursor. The original implementation rebuilt rows from live
  // `micros` and re-sorted on every render, so editing iron from 100% to
  // 0% would push iron BELOW sodium / vitamin_c mid-keystroke.
  //
  // Approach pinned by these tests: capture the initial micros snapshot
  // once (useRef / useMemo with empty deps), derive the sorted key order
  // from that snapshot only, and render inputs in that frozen order even
  // as the live `micros` map updates. Amounts still bind to live state —
  // only the ORDER is locked.
  // -----------------------------------------------------------------------

  it('freezes the input order at mount — clearing the top-ranked iron input does NOT push it below sodium / vitamin_c', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        mode="library-only"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));

    const orderSnapshot = (): string[] => {
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          '[data-testid^="confirmation-item-0-micro-"][data-testid$="-input"]',
        ),
      );
      return inputs.map((el) => codeFromTestid(el.dataset.testid ?? ''));
    };

    const before = orderSnapshot();
    const ironBeforeIdx = before.indexOf('iron');
    const sodiumBeforeIdx = before.indexOf('sodium');
    const vcBeforeIdx = before.indexOf('vitamin_c');
    // Sanity: initial sort puts iron (100%) ahead of sodium (20%) ahead
    // of vitamin_c (10%) per the live-sort baseline.
    expect(ironBeforeIdx).toBeGreaterThanOrEqual(0);
    expect(ironBeforeIdx).toBeLessThan(sodiumBeforeIdx);
    expect(sodiumBeforeIdx).toBeLessThan(vcBeforeIdx);

    const ironInput = screen.getByTestId(
      'confirmation-item-0-micro-iron-input',
    ) as HTMLInputElement;
    // Clear iron — its pct drops from 100% to 0%. If the sort were live,
    // iron would now rank LAST among RDA-having rows, swapping past
    // sodium and vitamin_c. The onChange handler coerces '' → 0, so the
    // input rebinds to '0' (still 0 mg, still 0% RDA) — the live-sort
    // regression would still reorder around that 0 value.
    await user.clear(ironInput);
    expect(ironInput.value).toBe('0');

    const after = orderSnapshot();
    // The frozen order MUST preserve iron's index. The 3-row relative
    // order (iron < sodium < vitamin_c) must stay locked.
    expect(after.indexOf('iron')).toBe(ironBeforeIdx);
    expect(after.indexOf('sodium')).toBe(sodiumBeforeIdx);
    expect(after.indexOf('vitamin_c')).toBe(vcBeforeIdx);
    // Same DOM keys, same order — no row shuffling at all.
    expect(after).toEqual(before);
  });

  it('keeps the input order stable across multiple keystrokes on the same field', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        mode="library-only"
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('confirmation-item-0-micros-trigger'));

    const orderSnapshot = (): string[] => {
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          '[data-testid^="confirmation-item-0-micro-"][data-testid$="-input"]',
        ),
      );
      return inputs.map((el) => codeFromTestid(el.dataset.testid ?? ''));
    };

    const baseline = orderSnapshot();
    const ironInput = screen.getByTestId(
      'confirmation-item-0-micro-iron-input',
    ) as HTMLInputElement;
    await user.clear(ironInput);

    // Type one character at a time and assert order is stable at every
    // intermediate keystroke. Each digit changes iron's live pct — 1mg
    // (5.5%), 12mg (66%), 120mg (666% capped at 999999 input bounds) —
    // none of which may shift any input's position.
    for (const ch of ['1', '2', '0']) {
      await user.type(ironInput, ch);
      expect(orderSnapshot()).toEqual(baseline);
    }
  });
});

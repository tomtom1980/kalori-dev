/**
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — ConfirmationScreen
 * renders a READ-ONLY alcohol "Detected" label for AI-flagged alcoholic
 * drinks. Replaces the deleted AlcoholControls toggle/preset/inputs.
 *
 * Contract:
 *   - When meal_category=drink AND an item has `is_alcoholic: true`,
 *     show a one-line ledger-style label: "Detected: 355 ml · 5% ABV · ~14 g"
 *   - When meal_category=drink but NO item is_alcoholic, label hidden.
 *   - When meal_category!=drink, label hidden (even if AI flagged alcoholic).
 *   - The save payload carries the AI-derived per-item fields straight
 *     through `items[]` to the server (no client-side lift; the server
 *     reads `items[].is_alcoholic` directly).
 *   - NO toggle, NO preset buttons, NO editable volume/ABV inputs.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';
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

vi.mock('@/lib/hooks/use-is-mobile', () => ({
  MOBILE_QUERY: '(max-width: 1279px)',
  useIsMobile: () => false,
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const alcoholicItem = {
  name: 'lager',
  portion: 1,
  unit: 'can',
  kcal: 153,
  macros: { protein_g: 1.6, carbs_g: 12.6, fat_g: 0, fiber_g: 0 },
  micros: {},
  confidence: 0.85,
  is_alcoholic: true,
  volume_ml: 355,
  abv_percent: 5,
};

const nonAlcoholicDrink = {
  name: 'sparkling water',
  portion: 1,
  unit: 'bottle',
  kcal: 0,
  macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
  micros: {},
  confidence: 0.95,
  is_alcoholic: false,
};

const noAlcoholFieldsItem = {
  name: 'apple',
  portion: 1,
  unit: 'piece',
  kcal: 95,
  macros: { protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4 },
  micros: {},
  confidence: 0.9,
};

function renderWithItems(items: Array<Record<string, unknown>>) {
  return render(
    <ConfirmationScreen
      source="text"
      tab="type"
      items={items as never}
      reasoning={null}
      dedupMatch={null}
      onClose={vi.fn()}
    />,
  );
}

describe('<ConfirmationScreen /> AI alcohol detected label', () => {
  beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'entry-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      if (url.includes('/api/library/quota')) {
        return Promise.resolve(jsonResponse({ quota: { exceeded: false } }));
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

  it('renders the read-only Detected label when meal=drink and an item is_alcoholic=true', async () => {
    renderWithItems([alcoholicItem]);
    await userEvent.click(screen.getByTestId('confirmation-meal-drink'));

    const label = await screen.findByTestId('confirmation-alcohol-detected');
    // Format: "Detected: 355 ml · 5% ABV · ~14 g" (grams rounded to nearest int;
    // 355 * 0.05 * 0.789 = 14.005 → 14)
    expect(label.textContent).toMatch(/355\s*ml/);
    expect(label.textContent).toMatch(/5\s*%\s*ABV/i);
    expect(label.textContent).toMatch(/14\s*g/);
  });

  it('omits the Detected label when meal=drink but no item is alcoholic', async () => {
    renderWithItems([nonAlcoholicDrink]);
    await userEvent.click(screen.getByTestId('confirmation-meal-drink'));

    expect(screen.queryByTestId('confirmation-alcohol-detected')).not.toBeInTheDocument();
  });

  it('omits the Detected label when meal!=drink, even if AI flagged the item alcoholic', async () => {
    renderWithItems([alcoholicItem]);
    // Default meal slot is time-of-day derived (breakfast/lunch/dinner/snack).
    // Without clicking drink, the alcohol label MUST NOT render.
    expect(screen.queryByTestId('confirmation-alcohol-detected')).not.toBeInTheDocument();
  });

  it('omits the Detected label for legacy items with no alcohol fields at all', async () => {
    renderWithItems([noAlcoholFieldsItem]);
    await userEvent.click(screen.getByTestId('confirmation-meal-drink'));

    expect(screen.queryByTestId('confirmation-alcohol-detected')).not.toBeInTheDocument();
  });

  it('does NOT render the deleted AlcoholControls toggle / preset / inputs', async () => {
    renderWithItems([alcoholicItem]);
    await userEvent.click(screen.getByTestId('confirmation-meal-drink'));

    // The deleted toggle had role=group + an "Alcohol details" legend.
    expect(screen.queryByRole('group', { name: /alcohol details/i })).not.toBeInTheDocument();
    // The deleted checkbox label.
    expect(screen.queryByLabelText(/alcoholic drink/i)).not.toBeInTheDocument();
    // The deleted preset buttons.
    expect(screen.queryByRole('button', { name: /^beer$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^wine$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^spirit$/i })).not.toBeInTheDocument();
    // The deleted editable inputs.
    expect(screen.queryByLabelText(/volume \(ml\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/abv/i)).not.toBeInTheDocument();
  });

  it('saves the AI alcohol fields straight through items[] (no client-side lift)', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    renderWithItems([alcoholicItem]);
    await userEvent.click(screen.getByTestId('confirmation-meal-drink'));
    await userEvent.click(screen.getByTestId('confirmation-save'));

    const saveCall = authFetch.mock.calls.find((call) => call[0] === '/api/entries/save');
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as {
      meal_category?: string;
      alcohol?: unknown;
      items?: Array<Record<string, unknown>>;
    };
    expect(body.meal_category).toBe('drink');
    // No legacy top-level `body.alcohol` payload — the server now reads
    // alcohol from items[] directly.
    expect(body.alcohol).toBeUndefined();
    expect(body.items?.[0]).toMatchObject({
      is_alcoholic: true,
      volume_ml: 355,
      abv_percent: 5,
    });
  });
});

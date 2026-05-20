/**
 * Bug 1 (bugfix-tomi 2026-05-17-library-micros) — ConfirmationItemMicros
 *
 * Library-only sub-mode of <ConfirmationScreen /> must expose an editable
 * micronutrient collapsible so the user can review/adjust the 30 canonical
 * micros the AI parse returned before the row is POSTed to
 * /api/library/create.
 *
 * Test surface — TDD failing-first:
 *   1. Trigger renders in library-only mode
 *   2. Trigger does NOT render in the standard log flow (mode === 'log')
 *   3. Expanding the trigger reveals all 30 canonical micro inputs
 *   4. Typing into a micro input dispatches an EDIT_ITEM_MICRO action so the
 *      next save payload picks up the change
 *   5. Edited micros round-trip into the /api/library/create POST body under
 *      `nutrition.micros[<code>]`
 *
 * UI prescription (web-ui-guide §1 Quick-Pick Decision Table — Disclosure
 * row): Radix `@radix-ui/react-collapsible`. Mirrors the precedent in
 * `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx::EditMicrosCollapsible`.
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
  // AI parse returns all 30 canonical codes — most at 0. Seed a couple of
  // non-zero values so the existing nonZeroMicros filter in the save handler
  // does not strip the row before the user has a chance to edit.
  micros: {
    iron: 2,
    vitamin_c: 5,
  },
  confidence: 0.92,
};

describe('<ConfirmationItemMicros /> — library-only micros collapsible', () => {
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

  it('renders the micros expander trigger in library-only mode', () => {
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
    expect(screen.getByTestId('confirmation-item-0-micros-trigger')).toBeInTheDocument();
  });

  it('does NOT render the micros expander trigger in the standard log flow', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[libraryItem]}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('confirmation-item-0-micros-trigger')).toBeNull();
  });

  it('exposes inputs for all 30 canonical micros once the expander is open', async () => {
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
    // Each canonical micro must be addressable by stable per-row testid so
    // automation can target any of the 30 inputs.
    for (const micro of DEFAULT_MICROS_LIST) {
      const input = screen.getByTestId(`confirmation-item-0-micro-${micro.code}-input`);
      expect(input).toBeInTheDocument();
    }
  });

  it('typing a new iron value updates the row state so save POSTs the edited micro', async () => {
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
    await user.type(ironInput, '8');

    await user.click(screen.getByTestId('confirmation-save'));

    await waitFor(() => expect(bodies.length).toBe(1));
    const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
    expect(body.nutrition.micros).toBeDefined();
    expect(body.nutrition.micros!.iron).toBe(8);
  });

  // -------------------------------------------------------------------
  // LM-SEC-1 (bugfix-tomi 2026-05-17-followups) — micros input upper-bound
  // defense-in-depth. The Zod schema cap at 1_000_000 already exists; this
  // adds the input-level cap at 999_999 with 1-unit headroom so that a
  // typed/pasted absurd value never reaches the persisted body. RLS gates
  // the row to the current user (self-sabotage only), but the cap also
  // protects future programmatic callers that bypass the React onChange.
  // -------------------------------------------------------------------

  it('LM-SEC-1: renders each micro input with max="999999" attribute', async () => {
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
    const ironInput = screen.getByTestId('confirmation-item-0-micro-iron-input');
    expect(ironInput).toHaveAttribute('max', '999999');
  });

  it('LM-SEC-1: caps an above-ceiling typed value (1e10) at 999999 in the persisted body', async () => {
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
    // 11-digit absurd input — well above the 999_999 ceiling.
    await user.type(ironInput, '99999999999');

    await user.click(screen.getByTestId('confirmation-save'));

    await waitFor(() => expect(bodies.length).toBe(1));
    const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
    expect(body.nutrition.micros).toBeDefined();
    expect(body.nutrition.micros!.iron).toBe(999999);
  });

  it('LM-SEC-1: caps a pasted scientific-notation value (1e10) at 999999', async () => {
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
    // Focus the input then paste — the paste vector bypasses key-level
    // input filters that some browsers apply to type="number".
    await user.click(ironInput);
    await user.paste('1e10');

    await user.click(screen.getByTestId('confirmation-save'));

    await waitFor(() => expect(bodies.length).toBe(1));
    const body = bodies[0] as { nutrition: { micros?: Record<string, number> } };
    expect(body.nutrition.micros).toBeDefined();
    expect(body.nutrition.micros!.iron).toBe(999999);
  });
});

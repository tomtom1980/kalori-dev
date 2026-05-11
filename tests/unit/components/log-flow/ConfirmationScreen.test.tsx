/**
 * Task 3.4 — <ConfirmationScreen /> compound tests + axe-core coverage.
 *
 * Contract scope (synthesis §6.1 + a11y C1/C2/C3 fixes):
 *   - Compound (Confirmation.Root + children) provides shared context so
 *     deep descendants read state without prop drilling.
 *   - Renders editable item rows with name, portion, kcal + stepper controls.
 *   - Save CTA fires `authFetch('/api/entries/save', …)` via refresh-interceptor.
 *   - On 200 success: clearClientId + push undo toast + close modal.
 *   - On error: lifecycle = error, banner + retry shown.
 *   - Dedup banner appears when `dedupMatch` is seeded.
 *   - Form a11y: aria-invalid, aria-describedby, role=alert per-field.
 *   - axe-core: 0 violations on initial render + dedup prompt + error state.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Confirmation, ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';
import { t } from '@/lib/i18n/en';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Mock the refresh-interceptor so we don't hit the network.
const authFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (url: string, init?: RequestInit) => authFetch(url, init),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

// Fix 1 — ConfirmationScreen must call router.refresh() after save so the
// dashboard RSC re-renders and shows the new entry.
const routerRefreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const baseItems = [
  {
    name: 'eggs',
    portion: 2,
    unit: 'unit',
    kcal: 140,
    macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
    micros: {},
    confidence: 0.9,
  },
];

describe('<ConfirmationScreen />', () => {
  beforeEach(() => {
    authFetch.mockReset();
    // Default: return a fresh-insert response for /api/entries/save; allow
    // other URLs (dedup preflight) to resolve empty.
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    routerRefreshMock.mockReset();
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders the kicker + item rows + save CTA', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/kalori.*ledger/i)).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-save')).toBeInTheDocument();
  });

  it('renders the full calorie value with a visible kcal unit', () => {
    const sandwichItems = [{ ...baseItems[0]!, name: 'sandwich', kcal: 550 }];
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={sandwichItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const row = screen.getByTestId('confirmation-item-0');
    const kcalInput = screen.getByTestId('confirmation-item-0-kcal') as HTMLInputElement;
    expect(kcalInput).toHaveValue(550);
    expect(screen.getByLabelText(t.log.confirmationItemKcalLabel)).toBe(kcalInput);
    expect(within(row).getByText(t.log.confirmationItemKcalUnit)).toBeInTheDocument();
  });

  it('has no axe-core violations on initial render', async () => {
    const { container } = render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning="2 eggs at 70 kcal each"
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe-core violations with dedup prompt visible', async () => {
    const { container } = render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={{
          id: 'lib-1',
          normalized_name: 'eggs',
          display_name: 'Eggs',
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dedup-prompt')).toBeInTheDocument();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('save CTA POSTs to /api/entries/save with client_id, items, meal_category', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    const onClose = vi.fn();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning="2 eggs at 70 kcal each"
        dedupMatch={null}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeDefined();
    const [url, init] = saveCall!;
    expect(url).toBe('/api/entries/save');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(body.client_id).toBeTruthy();
    expect(body.items).toEqual(baseItems);
    expect(body.meal_category).toBeTruthy();
    expect(body.source).toBe('text');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useLogFlowStore.getState().clientIds.type).toBeUndefined();
    expect(useUndoQueueStore.getState().stack.length).toBeGreaterThan(0);
  });

  // Portion recalculation regressions: edits must update the snapshot that save sends.
  it('rescales kcal and macros when the portion changes before saving', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('confirmation-item-0-portion'), {
      target: { value: '4' },
    });

    expect(screen.getByTestId('confirmation-item-0-kcal')).toHaveValue(280);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as {
      items: typeof baseItems;
    };
    expect(body.items[0]).toMatchObject({
      portion: 4,
      kcal: 280,
      macros: { protein_g: 24, carbs_g: 2, fat_g: 20, fiber_g: 0 },
    });
  });

  it('PATCHes edits with the updated item snapshot and no unused create-only fields', async () => {
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/edit-row-1')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'edit-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const onClose = vi.fn();
    render(
      <ConfirmationScreen
        source={'ai_text' as never}
        tab="type"
        items={baseItems}
        reasoning="legacy source row"
        dedupMatch={null}
        editEntryId="edit-row-1"
        originalLoggedAt="2026-05-10T05:00:00.000Z"
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByTestId('confirmation-item-0-portion'), {
      target: { value: '4' },
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));

    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/edit-row-1');
    expect(saveCall).toBeDefined();
    expect(saveCall![1]?.method).toBe('PATCH');
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as Record<string, unknown>;
    expect(body.source).toBeUndefined();
    expect(body.client_id).toBeUndefined();
    expect(body.logged_at).toBeUndefined();
    expect(body).toMatchObject({
      meal_category: expect.any(String),
      ai_reasoning: 'legacy source row',
      items: [
        {
          portion: 4,
          kcal: 280,
          macros: { protein_g: 24, carbs_g: 2, fat_g: 20, fiber_g: 0 },
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('does not show the library duplicate prompt while editing an existing entry', async () => {
    vi.useFakeTimers();
    try {
      authFetch.mockImplementation((url: string) => {
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(
            jsonResponse({
              match: {
                id: 'lib-1',
                normalized_name: 'eggs',
                display_name: 'Eggs',
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse({ entry: { id: 'edit-row-1' } }));
      });

      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={baseItems}
          reasoning={null}
          dedupMatch={null}
          editEntryId="edit-row-1"
          originalLoggedAt="2026-05-10T05:00:00.000Z"
          onClose={vi.fn()}
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });

      expect(
        authFetch.mock.calls.some((call) => call[0].includes('/api/library/dedup-check')),
      ).toBe(false);
      expect(screen.queryByTestId('dedup-prompt')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Codex Round 1 CRITICAL — library re-log path. When the
  // ConfirmationScreen receives `libraryItemIds=[<uuid>]` (set by LibraryTab
  // Continue CTA or LogPageClient deep-link branch), the save body MUST
  // include `library_item_id` so the server links the food_entries row to
  // the source library row (I12 contract). Without this, every library re-
  // log silently drops the foreign-key.
  it('CRITICAL R1: forwards libraryItemIds[0] as body.library_item_id on save', async () => {
    useLogFlowStore.getState().ensureClientId('library');
    const onClose = vi.fn();
    const libraryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    render(
      <ConfirmationScreen
        source="library"
        tab="library"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        libraryItemIds={[libraryId]}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as Record<string, unknown>;
    expect(body.library_item_id).toBe(libraryId);
    expect(body.source).toBe('library');
  });

  it('CRITICAL R1: omits library_item_id when libraryItemIds[0] is null (multi-item non-first row)', async () => {
    useLogFlowStore.getState().ensureClientId('library');
    render(
      <ConfirmationScreen
        source="library"
        tab="library"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        libraryItemIds={[null]}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as Record<string, unknown>;
    expect(body.library_item_id).toBeUndefined();
  });

  // Fix 1 — RSC dashboard doesn't re-render after mutations without a
  // client-side invalidation. After a successful save we must call
  // router.refresh() so the (app) server components re-run.
  it('calls router.refresh() after a successful save', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and blocks repeat clicks while saving to the ledger', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    let resolveSave: (value: Response) => void = () => {};
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return new Promise((resolve) => {
          resolveSave = resolve;
        });
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const onClose = vi.fn();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={onClose}
      />,
    );

    const user = userEvent.setup();
    const button = screen.getByTestId('confirmation-save');
    await user.click(button);

    await screen.findByTestId('confirmation-save-spinner');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(within(button).getByText(t.onboarding.buttonNextLoading)).toBeInTheDocument();

    await user.click(button);
    const saveCalls = authFetch.mock.calls.filter((c) => c[0] === '/api/entries/save');
    expect(saveCalls).toHaveLength(1);

    resolveSave(jsonResponse({ entry: { id: 'srv-row-1' } }));
    await screen.findByTestId('confirmation-screen');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Un-save path: when the user clicks UNDO on the "Logged …" toast, the
  // revert closure fires a DELETE. On a successful 2xx the dashboard must
  // re-render to drop the row.
  it('calls router.refresh() after a successful revert DELETE (un-save 200)', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    authFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    // refresh #1 from save. Now trigger revert.
    const savedEntry = useUndoQueueStore.getState().stack.find((e) => e.kind === 'saved');
    expect(savedEntry).toBeDefined();
    await savedEntry!.revert();
    // Two calls: the save and the successful un-save.
    expect(routerRefreshMock).toHaveBeenCalledTimes(2);
  });

  it('shows error banner with Retry on save failure', async () => {
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(new Response('db_error', { status: 500, statusText: 'db_error' }));
      }
      return Promise.resolve(jsonResponse({ match: null }));
    });
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    expect(await screen.findByTestId('confirmation-error-banner')).toBeInTheDocument();
    // Retry button present and focused.
    const retry = screen.getByTestId('confirmation-retry');
    expect(retry).toBeInTheDocument();
  });

  it('has no axe-core violations when save errors', async () => {
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(new Response('db_error', { status: 500, statusText: 'db_error' }));
      }
      return Promise.resolve(jsonResponse({ match: null }));
    });
    const { container } = render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    await screen.findByTestId('confirmation-error-banner');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders dedup banner with REUSE EXISTING + CREATE NEW when dedupMatch is seeded', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={{
          id: 'lib-1',
          normalized_name: 'eggs',
          display_name: 'Eggs',
        }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('dedup-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('dedup-reuse')).toBeInTheDocument();
    expect(screen.getByTestId('dedup-create')).toBeInTheDocument();
  });

  it('item-name input is editable', async () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    const input = screen.getByDisplayValue('eggs') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'fried eggs');
    expect(input.value).toBe('fried eggs');
  });

  it('renders WhyTheseNumbers when source=text and reasoning is present', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning="2 eggs at 70 kcal"
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /why these numbers/i })).toBeInTheDocument();
  });

  it('item list uses role=list with per-row role=listitem + group', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    // role=list on <ul>
    const lists = screen.getAllByRole('list');
    expect(lists.length).toBeGreaterThan(0);
    // stepper role=group present
    expect(screen.getByRole('group', { name: /portion stepper/i })).toBeInTheDocument();
    // meal slot role=radiogroup with legend/aria-labelledby
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('save-to-library toggle renders as role=switch when source=text', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const sw = screen.getByTestId('confirmation-save-to-library');
    expect(sw).toHaveAttribute('role', 'switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('save-to-library toggle is hidden when source=library', () => {
    render(
      <ConfirmationScreen
        source="library"
        tab="library"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('confirmation-save-to-library')).not.toBeInTheDocument();
  });

  it('remove button removes a row from the list', async () => {
    const first = baseItems[0]!;
    const items = [first, { ...first, name: 'toast' }];
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={items}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirmation-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-item-1')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-item-1-remove'));
    expect(screen.queryByTestId('confirmation-item-1')).not.toBeInTheDocument();
  });

  // I2 — Zero-item save guard. When the user removes every row, Save must
  // NOT round-trip the server (would 400 + show opaque "500" to the user).
  // The button must be `aria-disabled="true"` + a placeholder caption tells
  // them to add an item.
  it('disables Save when the row list is empty and does not fire authFetch', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    // Remove the only row → state.rows.length === 0.
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-item-0-remove'));

    const saveButton = screen.getByTestId('confirmation-save');
    expect(saveButton).toHaveAttribute('aria-disabled', 'true');

    // Empty-rows caption surfaces.
    expect(screen.getByTestId('confirmation-empty-caption')).toBeInTheDocument();

    // Clicking the aria-disabled Save does NOT issue /api/entries/save.
    await user.click(saveButton);
    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeUndefined();
  });

  // I1 — MealCategory accepts `'drink'` per server Zod + DB check-constraint
  // (migrations/0003_food_schema.sql:91 + app/api/entries/save/route.ts:54).
  // The MealSlot segmented control must offer a 5th option so users editing a
  // copy-yesterday'd drink entry can re-select the `drink` slot without being
  // forced into a fallback.
  it('renders a `drink` meal option in the MealSlot segmented control', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirmation-meal-drink')).toBeInTheDocument();
  });

  it('compound children consume ConfirmationContext via use() — deeply-nested consumer can read state', () => {
    // Explicit-variant test: the compound's children should read state from
    // context, NOT props. This guards the G1/G9 contract.
    render(
      <Confirmation.Root
        source="text"
        tab="type"
        items={baseItems}
        reasoning="eggs"
        dedupMatch={null}
        onClose={vi.fn()}
      >
        <Confirmation.Masthead />
        <Confirmation.ItemList />
      </Confirmation.Root>,
    );
    expect(screen.getByTestId('confirmation-item-0')).toBeInTheDocument();
    expect(screen.getByText(/kalori.*ledger/i)).toBeInTheDocument();
  });

  // --- AC7 (F3) delete-recovery UX ------------------------------------------
  // Contract: when the save-toast revert (i.e. the user clicked UNDO on the
  // "LOGGED ..." toast) fires a DELETE that the server rejects, the failure
  // path must surface a new undo-queue entry with kind='delete-failed' and the
  // `undoToastDeleteRestored` copy. The server rejection means the row is
  // still persisted; the toast informs the user that their un-save failed.
  it('pushes a delete-failed toast when revert DELETE returns 500', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    authFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-1' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'db_error' }), {
            status: 500,
            statusText: 'db_error',
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));

    // After save succeeds, the first undo-toast (kind='saved') is in the stack.
    const savedEntry = useUndoQueueStore.getState().stack.find((e) => e.kind === 'saved');
    expect(savedEntry).toBeDefined();

    // Simulate the user clicking UNDO — invokes the saved-toast's revert
    // closure, which fires the rejected DELETE.
    await savedEntry!.revert();

    // GREEN contract: a new undo-queue entry with kind='delete-failed' was
    // pushed, carrying the restored copy.
    const restored = useUndoQueueStore.getState().stack.find((e) => e.kind === 'delete-failed');
    expect(restored).toBeDefined();
    expect(restored!.description).toBe(t.log.undoToastDeleteRestored);
  });

  // I7 — When `#kalori-live-polite` is absent (chrome unmounted during
  // Next 16 route transition), the save-toast revert closure must still
  // announce "Couldn't delete — restored" via an ad-hoc live region
  // attached to the DOM, so the user does not silently lose the a11y
  // announcement.
  it('announces delete-restored via fallback aria-live region when #kalori-live-polite is absent', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    authFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-2' } }));
      }
      if (url.includes('/api/library/dedup-check')) {
        return Promise.resolve(jsonResponse({ match: null }));
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'db_error' }), {
            status: 500,
            statusText: 'db_error',
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    // Simulate the chrome-level polite region being absent (e.g., SrLiveRegions
    // unmounted during nav).
    const existingPolite = document.getElementById('kalori-live-polite');
    existingPolite?.remove();
    expect(document.getElementById('kalori-live-polite')).toBeNull();

    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    const savedEntry = useUndoQueueStore.getState().stack.find((e) => e.kind === 'saved');
    await savedEntry!.revert();

    // Fallback: a transient aria-live region was attached with the restored
    // copy so screen readers still receive the announcement. There may be
    // multiple fallback regions (the save-success announcement + the
    // delete-restored announcement); the latest (last in DOM order) carries
    // the restored copy.
    const fallbackRegions = Array.from(
      document.querySelectorAll<HTMLElement>('[data-kalori-live-polite-fallback="true"]'),
    );
    expect(fallbackRegions.length).toBeGreaterThan(0);
    const latest = fallbackRegions[fallbackRegions.length - 1]!;
    expect(latest.getAttribute('aria-live')).toBe('polite');
    expect(latest.textContent).toBe(t.log.undoToastDeleteRestored);
  });
});

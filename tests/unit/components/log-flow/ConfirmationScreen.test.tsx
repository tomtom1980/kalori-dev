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

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

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

  it('opens an in-app duplicate confirmation and retries with allow_duplicate', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/entries/save')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { allow_duplicate?: boolean };
        if (!body.allow_duplicate) {
          return Promise.resolve(
            jsonResponse(
              { error: 'duplicate_food_entry' },
              { status: 409, statusText: 'Conflict' },
            ),
          );
        }
        return Promise.resolve(jsonResponse({ entry: { id: 'srv-row-dup' } }));
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
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('confirmation-save'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(t.log.duplicateFoodConfirmMessage)).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('duplicate-log-confirm'));

    await waitFor(() => {
      const saveCalls = authFetch.mock.calls.filter((c) => c[0] === '/api/entries/save');
      expect(saveCalls).toHaveLength(2);
      const retryBody = JSON.parse(String(saveCalls[1]![1]?.body ?? '{}')) as {
        allow_duplicate?: boolean;
      };
      expect(retryBody.allow_duplicate).toBe(true);
    });
  });

  it('canceling the duplicate confirmation does not retry the save', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(
          jsonResponse({ error: 'duplicate_food_entry' }, { status: 409, statusText: 'Conflict' }),
        );
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
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('confirmation-save'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('duplicate-log-cancel'));

    await waitFor(() => {
      const saveCalls = authFetch.mock.calls.filter((c) => c[0] === '/api/entries/save');
      expect(saveCalls).toHaveLength(1);
      expect(screen.getByTestId('confirmation-error-banner')).toBeInTheDocument();
    });
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

  it('rejects decimal edits for whole-style confirmation units', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[{ ...baseItems[0]!, unit: 'cup', portion: 1 }]}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId('confirmation-item-0-portion'), {
      target: { value: '1.5' },
    });

    expect(screen.getByTestId('confirmation-item-0-portion')).toHaveValue(1);
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

  it('reusing an existing library match links the entry without save_to_library enrichment', async () => {
    useLogFlowStore.getState().ensureClientId('type');
    const libraryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[
          {
            ...baseItems[0]!,
            name: 'watermelon',
            portion: 1400,
            unit: 'g',
            kcal: 480,
          },
        ]}
        reasoning={null}
        dedupMatch={{
          id: libraryId,
          normalized_name: 'watermelon',
          display_name: 'Watermelon',
        }}
        onClose={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('dedup-reuse'));
    await user.click(screen.getByTestId('confirmation-save'));

    const saveCall = authFetch.mock.calls.find((c) => c[0] === '/api/entries/save');
    expect(saveCall).toBeDefined();
    const body = JSON.parse(String(saveCall![1]?.body ?? '{}')) as Record<string, unknown>;
    expect(body.library_item_id).toBe(libraryId);
    expect(body.save_to_library).toBeUndefined();
    expect(body.description).toBeUndefined();
    expect(body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ portion: 1400, kcal: 480 })]),
    );
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

  it('shows a specific error when the server rejects a future logged_at', async () => {
    authFetch.mockImplementation((url: string) => {
      if (url.includes('/api/entries/save')) {
        return Promise.resolve(
          jsonResponse({ error: 'logged_at_future' }, { status: 400, statusText: 'Bad Request' }),
        );
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

    const banner = await screen.findByTestId('confirmation-error-banner');
    expect(banner).toHaveTextContent(t.log.confirmationFutureTimeError);
  });

  it('blocks a future logged_at client-side with red validation text and no save request', async () => {
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
    const futureValue = toDatetimeLocalValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    fireEvent.change(screen.getByTestId('confirmation-time-editor-input'), {
      target: { value: futureValue },
    });

    const hint = screen.getByTestId('confirmation-time-editor-hint');
    const input = screen.getByTestId('confirmation-time-editor-input');
    expect(hint).toHaveTextContent(t.log.confirmationFutureTimeError);
    expect(hint).toHaveClass('is-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toContain(hint.id);
    expect(hint.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('confirmation-save'));
    expect(authFetch.mock.calls.some((c) => c[0] === '/api/entries/save')).toBe(false);
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
    // CREATE NEW was removed 2026-05-16 — duplicates are now hard-rejected
    // at the FILE UNDER input; the only resolutions are to rename or reuse.
    expect(screen.queryByTestId('dedup-create')).toBeNull();
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
    // The row's per-item name input — scoped by testId so it doesn't
    // collide with the new FILE UNDER input that mirrors the same name.
    const input = screen.getByTestId('confirmation-item-0-name') as HTMLInputElement;
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

  it('keeps the parsed-food remove button as the final row control', () => {
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

    const row = screen.getByTestId('confirmation-item-0');
    const inner = row.querySelector('.kalori-confirmation-item-inner');
    const remove = screen.getByTestId('confirmation-item-0-remove');

    expect(inner?.lastElementChild).toBe(remove);
  });

  it('standard parsed-food rows show only the top micronutrient by target percentage by default', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[
          {
            ...baseItems[0]!,
            name: 'pho bo',
            unit: 'bowl',
            micros: { iron: 9, vitamin_c: 20, calcium: 100 },
          },
        ]}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('confirmation-item-0-parsed-micros')).toHaveTextContent('Iron');
    expect(screen.queryByText(/Vitamin C/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all micronutrients' })).toBeInTheDocument();
  });

  it('standard parsed-food micronutrient toggle expands all nonzero micros and hides all-zero rows', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="photo"
        tab="snap"
        items={[
          {
            ...baseItems[0]!,
            name: 'pho bo',
            unit: 'bowl',
            micros: { iron: 9, vitamin_c: 20, calcium: 100 },
          },
          {
            ...baseItems[0]!,
            name: 'water',
            unit: 'cup',
            micros: { iron: 0, vitamin_c: 0, calcium: 0 },
          },
        ]}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Show all micronutrients' }));

    expect(screen.getByRole('button', { name: 'Hide all micronutrients' })).toBeInTheDocument();
    expect(screen.getByText(/Vitamin C/i)).toBeInTheDocument();
    expect(screen.queryByTestId('confirmation-item-1-parsed-micros')).not.toBeInTheDocument();
  });

  it('shows approximate grams below the food name for sane non-gram rows', () => {
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={[
          {
            ...baseItems[0]!,
            name: 'sandwich',
            unit: 'piece',
            approxGrams: 180,
            confidence: 0.8,
          },
          {
            ...baseItems[0]!,
            name: 'uncertain taco',
            unit: 'piece',
            approxGrams: 150,
            confidence: 0.5,
          },
          {
            ...baseItems[0]!,
            name: 'absurd bowl',
            unit: 'bowl',
            approxGrams: 3000,
            confidence: 0.95,
          },
          {
            ...baseItems[0]!,
            name: 'weighed rice',
            unit: 'g',
            approxGrams: 180,
            confidence: 0.95,
          },
        ]}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );

    const approx = screen.getByTestId('confirmation-item-0-approx-grams');
    expect(approx).toHaveTextContent('approx. 180 g');
    expect(approx.closest('.kalori-confirmation-item-name-slot')).not.toBeNull();
    expect(screen.getByTestId('confirmation-item-1-approx-grams')).toHaveTextContent(
      'approx. 150 g',
    );
    expect(screen.queryByTestId('confirmation-item-2-approx-grams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirmation-item-3-approx-grams')).not.toBeInTheDocument();
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

  // --- E.CODEX Round-2 library-only mode fixes -------------------------------
  //
  // C1: library-only mode renders ALL parsed rows but the save handler
  //     only POSTed `state.rows[0]` to `/api/library/create`, silently
  //     dropping every other visible row. Fix: persist EACH visible row
  //     so the persistence contract matches the on-screen list. Empty
  //     rows are not POSTed; failures aggregate.
  //
  // C2: library-only mode hides SaveToLibraryToggle and DedupBanner. The
  //     `saveBlockedByDuplicate` flag still disabled Save whenever the
  //     dedup preflight found a match, leaving the user with an
  //     aria-disabled button and no visible duplicate banner / rename
  //     hint. Fix: render a library-only DedupBanner that surfaces the
  //     collision + instructs the user to rename, so the path forward
  //     is visible.
  describe('E.CODEX Round-2 — library-only mode persistence + dedup surface', () => {
    const multiItem = [
      {
        name: 'pho bo',
        portion: 1,
        unit: 'bowl',
        kcal: 480,
        macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3 },
        micros: {},
        confidence: 0.92,
      },
      {
        name: 'spring rolls',
        portion: 2,
        unit: 'piece',
        kcal: 160,
        macros: { protein_g: 6, carbs_g: 18, fat_g: 7, fiber_g: 1 },
        micros: {},
        confidence: 0.88,
      },
      {
        name: 'vietnamese coffee',
        portion: 1,
        unit: 'cup',
        kcal: 110,
        macros: { protein_g: 2, carbs_g: 14, fat_g: 5, fiber_g: 0 },
        micros: {},
        confidence: 0.85,
      },
    ];

    it('C1: POSTs /api/library/create for EVERY parsed row, not just rows[0]', async () => {
      const createCalls: { display_name: string; nutrition: Record<string, unknown> }[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            display_name: string;
            nutrition: Record<string, unknown>;
          };
          createCalls.push({ display_name: body.display_name, nutrition: body.nutrition });
          return Promise.resolve(
            jsonResponse({ item: { id: `srv-${body.display_name}` } }, { status: 201 }),
          );
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
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={onClose}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      // All three rows must hit /api/library/create (one POST per row).
      expect(createCalls.length).toBe(3);
      const names = createCalls.map((c) => c.display_name).sort();
      expect(names).toEqual(['pho bo', 'spring rolls', 'vietnamese coffee']);
    });

    it('C1: persists per-row macros (and cholesterol) faithfully on each POST', async () => {
      const bodies: Record<string, unknown>[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          bodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));

      await waitFor(() => expect(bodies.length).toBe(3));
      const phoBody = bodies.find(
        (b) => (b as { display_name: string }).display_name === 'pho bo',
      ) as { nutrition: { kcal: number; macros: Record<string, number> } } | undefined;
      expect(phoBody).toBeDefined();
      expect(phoBody!.nutrition.kcal).toBe(480);
      expect(phoBody!.nutrition.macros.protein_g).toBe(32);
      expect(phoBody!.nutrition.macros.carbs_g).toBe(55);
      expect(phoBody!.nutrition.macros.fat_g).toBe(12);
      expect(phoBody!.nutrition.macros.fiber_g).toBe(3);
    });

    it('C1: if a row name is empty, surfaces a single-row error and aborts the batch', async () => {
      // Sanity check on the "empty name" guard — empty rows must not silently
      // produce a partial save. Surface an error and stop the batch.
      const itemsWithBlank = [{ ...multiItem[0]!, name: '' }, multiItem[1]!];
      authFetch.mockImplementation((url: string) => {
        if (url.includes('/api/library/create')) {
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
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
          items={itemsWithBlank}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={onClose}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await screen.findByTestId('confirmation-error-banner');
      expect(onClose).not.toHaveBeenCalled();
      // No POSTs should have been made because the batch aborted before
      // touching the network.
      const createCalls = authFetch.mock.calls.filter((c) =>
        String(c[0]).includes('/api/library/create'),
      );
      expect(createCalls.length).toBe(0);
    });

    it('C2: renders a library-only duplicate banner when dedupMatch is seeded', () => {
      // The dedup banner must be visible in library-only mode so the user
      // sees WHY Save is blocked + how to resolve (rename).
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={[multiItem[0]!]}
          reasoning={null}
          dedupMatch={{
            id: 'lib-existing-1',
            normalized_name: 'pho bo',
            display_name: 'Pho Bo',
          }}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      // The new library-only dedup banner. Distinct testid from the
      // standard `dedup-prompt` so the visual + ARIA contract is its own.
      expect(screen.getByTestId('library-only-dedup-banner')).toBeInTheDocument();
    });

    it('C2: library-only duplicate banner does NOT render REUSE EXISTING (no log entry to link)', () => {
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={[multiItem[0]!]}
          reasoning={null}
          dedupMatch={{
            id: 'lib-existing-1',
            normalized_name: 'pho bo',
            display_name: 'Pho Bo',
          }}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      // The standard banner's `dedup-reuse` button is not appropriate here
      // (library-only mode CREATES a row; reusing is meaningless). The new
      // banner must NOT expose that affordance.
      expect(screen.queryByTestId('dedup-reuse')).toBeNull();
    });

    it('C2: dedup banner persists alongside aria-disabled Save (no dead-end)', () => {
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={[multiItem[0]!]}
          reasoning={null}
          dedupMatch={{
            id: 'lib-existing-1',
            normalized_name: 'pho bo',
            display_name: 'Pho Bo',
          }}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      // Save remains preflight-disabled (no guaranteed-failure round-trip).
      const saveBtn = screen.getByTestId('confirmation-save');
      expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
      // BUT a visible banner explains why + how to resolve.
      expect(screen.getByTestId('library-only-dedup-banner')).toBeInTheDocument();
    });
  });

  // --- E.CODEX Round-2 R2 (Codex Round-3 follow-up) ---------------------------
  //
  // POST-MVP-CODEX-R2-C1: previous Round-2 fix derived row-N+ idempotency
  //   keys as `${baseClientId}:${idx}`. The shared `CreateLibraryBodySchema`
  //   in `lib/library/create-schema.ts` validates `client_id` as
  //   `z.string().uuid()`, so row 1+ POSTs hit a 400 in production. Unit
  //   tests mocked `authFetch` and never ran emitted bodies through the
  //   schema, so the bug shipped green. Fix: every emitted body's
  //   `client_id` MUST be a fresh UUID. We use the row's stable id
  //   (already minted via `crypto.randomUUID()` in the reducer) so the
  //   I11 retry contract still holds per-row.
  //
  // POST-MVP-CODEX-R2-C2: previous Round-2 fix only dispatched
  //   `SAVE_ERROR` on 409 and ignored the `{ existing }` payload. The
  //   `LibraryOnlyDedupBanner` never appeared for races or non-primary-row
  //   duplicates. Fix: parse the 409 body, dispatch `SET_DEDUP_MATCH`
  //   with the existing row's metadata, halt the batch.
  describe('E.CODEX Round-2 R2 — schema-valid client_ids + server-409 banner', () => {
    const multiItem = [
      {
        name: 'pho bo',
        portion: 1,
        unit: 'bowl',
        kcal: 480,
        macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3 },
        micros: {},
        confidence: 0.92,
      },
      {
        name: 'spring rolls',
        portion: 2,
        unit: 'piece',
        kcal: 160,
        macros: { protein_g: 6, carbs_g: 18, fat_g: 7, fiber_g: 1 },
        micros: {},
        confidence: 0.88,
      },
      {
        name: 'vietnamese coffee',
        portion: 1,
        unit: 'cup',
        kcal: 110,
        macros: { protein_g: 2, carbs_g: 14, fat_g: 5, fiber_g: 0 },
        micros: {},
        confidence: 0.85,
      },
    ];

    it('C1: every emitted /api/library/create body passes CreateLibraryBodySchema (UUID client_id)', async () => {
      // The shared schema lives at `lib/library/create-schema.ts` and is
      // used by the real route handler. Round each emitted body through it
      // to catch the `${clientId}:${idx}` violation that Codex Round-2
      // caught in real production but unit tests missed.
      const { CreateLibraryBodySchema } = await import('@/lib/library/create-schema');
      const bodies: unknown[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          bodies.push(JSON.parse(String(init?.body ?? '{}')));
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await waitFor(() => expect(bodies.length).toBe(3));

      // EVERY body must pass the same schema the real route validates
      // against. If row 1+ uses `${clientId}:1` style, this fails on
      // `client_id` UUID validation.
      for (const body of bodies) {
        const parsed = CreateLibraryBodySchema.safeParse(body);
        expect(parsed.success, `body failed schema: ${JSON.stringify(body)}`).toBe(true);
      }

      // Also verify the UUIDs are distinct per row — otherwise the
      // server's I11 dedup-by-client_id would short-circuit row 1 + 2.
      const clientIds = bodies.map((b) => (b as { client_id: string }).client_id);
      expect(new Set(clientIds).size).toBe(3);
    });

    it('passes AI recipe eligibility through to /api/library/create in library-only mode', async () => {
      const bodies: unknown[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          bodies.push(JSON.parse(String(init?.body ?? '{}')));
          return Promise.resolve(jsonResponse({ item: { id: 'srv-recipe' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });

      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={[
            {
              name: 'pho bo',
              portion: 1,
              unit: 'bowl',
              kcal: 480,
              macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3 },
              micros: {},
              recipeEligible: true,
              recipeEligibilityReason: 'mixed_dish',
              confidence: 0.9,
            },
          ]}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );

      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({
        recipe_eligibility: 'eligible',
        recipe_eligibility_reason: 'mixed_dish',
      });
    });

    it('C1 schema contract: a suffixed `${uuid}:1` style is rejected by CreateLibraryBodySchema (regression demonstration)', async () => {
      // Demonstrates WHY the previous fix was broken: the shared schema
      // hard-rejects the `${clientId}:${idx}` form. This test exists to
      // ensure if anyone re-introduces the suffix pattern, schema
      // validation rejects it — making the bug class hard to regress.
      const { CreateLibraryBodySchema } = await import('@/lib/library/create-schema');
      const baseUuid = '11111111-2222-4333-8444-555555555555';
      const suffixed = `${baseUuid}:1`;
      const parsed = CreateLibraryBodySchema.safeParse({
        client_id: suffixed,
        display_name: 'pho bo',
        nutrition: {
          kcal: 480,
          macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3, cholesterol_mg: 0 },
        },
      });
      expect(parsed.success).toBe(false);
      // And: the same body with a fresh UUID passes — proves the only
      // failure axis is the suffix.
      const freshUuid = '99999999-8888-4777-8666-555555555555';
      const parsedFresh = CreateLibraryBodySchema.safeParse({
        client_id: freshUuid,
        display_name: 'pho bo',
        nutrition: {
          kcal: 480,
          macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3, cholesterol_mg: 0 },
        },
      });
      expect(parsedFresh.success).toBe(true);
    });

    it('C2: server 409 on row 1+ seeds dedupMatch and renders LibraryOnlyDedupBanner', async () => {
      // Setup: row 0 succeeds (201). Row 1 returns 409 with `{ existing }`.
      // The save loop MUST parse the 409 body, dispatch SET_DEDUP_MATCH so
      // LibraryOnlyDedupBanner appears, and halt the batch.
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { display_name: string };
          if (body.display_name === 'spring rolls') {
            return Promise.resolve(
              jsonResponse(
                {
                  error: 'duplicate_name',
                  existing: {
                    id: 'lib-existing-spring',
                    user_id: 'u1',
                    client_id: 'srv-spring-cid',
                    display_name: 'Spring Rolls',
                    normalized_name: 'spring rolls',
                    default_portion: null,
                    default_unit: null,
                    nutrition: {},
                    thumbnail_url: null,
                    log_count: 0,
                    last_used_at: null,
                    user_edited_flag: false,
                    created_from: 'manual',
                    created_at: '2026-05-17T00:00:00.000Z',
                    deleted_at: null,
                  },
                },
                { status: 409 },
              ),
            );
          }
          return Promise.resolve(jsonResponse({ item: { id: 'srv-pho' } }, { status: 201 }));
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
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={onClose}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));

      // After the 409, the library-only dedup banner MUST surface so the
      // user can rename — the prior bug was a generic retry banner
      // with no actionable target.
      await screen.findByTestId('library-only-dedup-banner');

      // The batch must NOT complete — onClose stays uncalled.
      expect(onClose).not.toHaveBeenCalled();
    });

    it('C2: server-409 path halts the batch — does not POST subsequent rows after a collision', async () => {
      // Row 0 → 201, Row 1 → 409, Row 2 should NEVER be POSTed because the
      // collision halts the batch. Without this, the user sees a banner
      // BUT row 2 might already be inserted, creating a half-saved batch.
      const postedNames: string[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { display_name: string };
          postedNames.push(body.display_name);
          if (body.display_name === 'spring rolls') {
            return Promise.resolve(
              jsonResponse(
                {
                  error: 'duplicate_name',
                  existing: {
                    id: 'lib-existing-spring',
                    user_id: 'u1',
                    client_id: 'srv-spring-cid',
                    display_name: 'Spring Rolls',
                    normalized_name: 'spring rolls',
                    default_portion: null,
                    default_unit: null,
                    nutrition: {},
                    thumbnail_url: null,
                    log_count: 0,
                    last_used_at: null,
                    user_edited_flag: false,
                    created_from: 'manual',
                    created_at: '2026-05-17T00:00:00.000Z',
                    deleted_at: null,
                  },
                },
                { status: 409 },
              ),
            );
          }
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await screen.findByTestId('library-only-dedup-banner');

      // Row 0 + Row 1 POSTed. Row 2 (vietnamese coffee) must NEVER be
      // attempted — the collision halts the batch.
      expect(postedNames).toContain('pho bo');
      expect(postedNames).toContain('spring rolls');
      expect(postedNames).not.toContain('vietnamese coffee');
    });

    it('C2 regression guard: row-0 preflight-409 path (existing dedupMatch seed) still blocks save', () => {
      // The preflight `useEffect` calls /api/library/dedup-check on the
      // primary row name. When it returns a match, `dedupMatch` is set,
      // SaveBlockedByDuplicate is true, the LibraryOnlyDedupBanner shows.
      // We must not regress this path while wiring the post-fail (server
      // 409) path. Drive it via the existing `dedupMatch` prop seed since
      // ConfirmationScreen accepts it on the initial-render path.
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={[multiItem[0]!]}
          reasoning={null}
          dedupMatch={{
            id: 'lib-preflight',
            normalized_name: 'pho bo',
            display_name: 'Pho Bo',
          }}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByTestId('library-only-dedup-banner')).toBeInTheDocument();
      expect(screen.getByTestId('confirmation-save')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  // --- POST-MVP-CODEX-R3 (paired structural fixes) ---------------------------
  //
  // R3-C1: Per-row UUID idempotency. The Round-2 fix minted a fresh UUID
  //   inside every save() invocation, so a retry for the same visible row
  //   sent a different UUID — defeating the server's replay-by-same-client_id
  //   contract. On retry, row 0's first POST already succeeded server-side,
  //   but the retry sees a NEW UUID and the server treats it as a brand-new
  //   request → 409 by normalized-name dedup → user dead-ended. Fix: mint
  //   `clientId` at row creation time (reducer init), persist on the row
  //   state, read `row.clientId` at save time. Retries reuse the same UUID,
  //   server detects replay (200 + replayed:true), batch continues without
  //   spurious 409s.
  //
  // R3-C2: Per-row dedup state. The Round-2 fix surfaced the 409 banner
  //   for row 1+ collisions but kept `dedupMatch` as global state. Only
  //   row 0's debounce preflight could clear it, so renaming row 1 left
  //   Save aria-disabled forever. Fix: store `dedupMatch` per-row on the
  //   row state. The library-only banner renders inline next to the
  //   offending row; renaming that row's name (via EDIT_ITEM_NAME) clears
  //   that row's entry; Save becomes enabled when no row has a conflict.
  describe('POST-MVP-CODEX-R3 — per-row clientId + per-row dedup state', () => {
    const multiItem = [
      {
        name: 'pho bo',
        portion: 1,
        unit: 'bowl',
        kcal: 480,
        macros: { protein_g: 32, carbs_g: 55, fat_g: 12, fiber_g: 3 },
        micros: {},
        confidence: 0.92,
      },
      {
        name: 'spring rolls',
        portion: 2,
        unit: 'piece',
        kcal: 160,
        macros: { protein_g: 6, carbs_g: 18, fat_g: 7, fiber_g: 1 },
        micros: {},
        confidence: 0.88,
      },
      {
        name: 'vietnamese coffee',
        portion: 1,
        unit: 'cup',
        kcal: 110,
        macros: { protein_g: 2, carbs_g: 14, fat_g: 5, fiber_g: 0 },
        micros: {},
        confidence: 0.85,
      },
    ];

    it('R3-C1: Retry replays the SAME client_id per row (server replay-detect path preserved)', async () => {
      // Setup: capture every POST's client_id by display_name. First attempt:
      // row 0 succeeds (201), row 1 fails with 500. User clicks Retry → row 0
      // (which already succeeded on the server) MUST replay with the SAME
      // client_id as the original attempt so the server's idempotency index
      // returns 200 + replayed:true instead of treating it as a fresh request
      // (which would 409 on normalized-name dedup).
      const callsByName = new Map<string, string[]>(); // display_name → client_id[]
      let firstAttemptDone = false;
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            client_id: string;
            display_name: string;
          };
          const list = callsByName.get(body.display_name) ?? [];
          list.push(body.client_id);
          callsByName.set(body.display_name, list);
          // First attempt: row 1 (spring rolls) errors with 500. After that
          // the retry sees a clean mock so every row succeeds.
          if (!firstAttemptDone && body.display_name === 'spring rolls') {
            firstAttemptDone = true;
            return Promise.resolve(
              new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
            );
          }
          return Promise.resolve(
            jsonResponse({ item: { id: `srv-${body.display_name}` } }, { status: 201 }),
          );
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await screen.findByTestId('confirmation-error-banner');
      // Retry — assert pho bo (row 0) is replayed with the SAME client_id.
      await user.click(screen.getByTestId('confirmation-retry'));
      await waitFor(() => {
        const pho = callsByName.get('pho bo') ?? [];
        expect(pho.length).toBeGreaterThanOrEqual(2);
      });
      const phoCids = callsByName.get('pho bo')!;
      expect(phoCids[0]).toBe(phoCids[1]);
    });

    it('R3-C1: per-row clientIds satisfy CreateLibraryBodySchema and are distinct (regression guard)', async () => {
      const { CreateLibraryBodySchema } = await import('@/lib/library/create-schema');
      const bodies: unknown[] = [];
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          bodies.push(JSON.parse(String(init?.body ?? '{}')));
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      await waitFor(() => expect(bodies.length).toBe(3));
      for (const body of bodies) {
        const parsed = CreateLibraryBodySchema.safeParse(body);
        expect(parsed.success, `body failed schema: ${JSON.stringify(body)}`).toBe(true);
      }
      const clientIds = bodies.map((b) => (b as { client_id: string }).client_id);
      expect(new Set(clientIds).size).toBe(3);
    });

    it('R3-C2: 409 on a non-primary row attaches an inline banner to THAT row', async () => {
      // Server returns 409 for spring rolls (row 1). The per-row banner
      // must be rendered inside row 1's section (its `data-testid` carries
      // the row index). The general `library-only-dedup-banner` testid
      // is preserved on the row 1 banner for backwards-compat with the
      // R2 tests.
      authFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/library/create')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { display_name: string };
          if (body.display_name === 'spring rolls') {
            return Promise.resolve(
              jsonResponse(
                {
                  error: 'duplicate_name',
                  existing: {
                    id: 'lib-existing-spring',
                    user_id: 'u1',
                    client_id: 'srv-spring-cid',
                    display_name: 'Spring Rolls',
                    normalized_name: 'spring rolls',
                    default_portion: null,
                    default_unit: null,
                    nutrition: {},
                    thumbnail_url: null,
                    log_count: 0,
                    last_used_at: null,
                    user_edited_flag: false,
                    created_from: 'manual',
                    created_at: '2026-05-17T00:00:00.000Z',
                    deleted_at: null,
                  },
                },
                { status: 409 },
              ),
            );
          }
          return Promise.resolve(jsonResponse({ item: { id: 'srv-x' } }, { status: 201 }));
        }
        if (url.includes('/api/library/dedup-check')) {
          return Promise.resolve(jsonResponse({ match: null }));
        }
        return Promise.resolve(jsonResponse({}));
      });
      render(
        <ConfirmationScreen
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          mode="library-only"
          onClose={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByTestId('confirmation-save'));
      // After the 409 the inline per-row banner appears scoped to row 1.
      const row1Banner = await screen.findByTestId('confirmation-item-1-dedup-banner');
      expect(row1Banner).toBeInTheDocument();
      // Row 0 and row 2 must NOT carry a banner — the conflict is row-scoped.
      expect(screen.queryByTestId('confirmation-item-0-dedup-banner')).toBeNull();
      expect(screen.queryByTestId('confirmation-item-2-dedup-banner')).toBeNull();
    });

    it('R3-C2: renaming the colliding row (row 1) clears its dedup match → Save re-enables', () => {
      // Drive the test deterministically via the reducer's prop-seeded
      // dedupMatch path on row 1, instead of relying on async 409. The store
      // exposes a setter on the reducer-shape via the new per-row API.
      // Seed: row 1 carries an inline dedupMatch from a prior 409, row 0/2
      // are clean. Save must be aria-disabled. Renaming row 1 must clear
      // the row's dedupMatch and re-enable Save.
      render(
        <Confirmation.Root
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          // New prop: per-row initial dedup matches positionally aligned
          // with `items[]`. `null` entries mean no conflict for that row.
          dedupMatchByRow={[
            null,
            {
              id: 'lib-existing-spring',
              normalized_name: 'spring rolls',
              display_name: 'Spring Rolls',
            },
            null,
          ]}
          mode="library-only"
          onClose={vi.fn()}
        >
          <Confirmation.ItemList />
          <Confirmation.LibraryOnlyDedupBanner />
          <Confirmation.SaveAction />
        </Confirmation.Root>,
      );
      // Save is aria-disabled because row 1 has an active dedup conflict.
      const saveBtn = screen.getByTestId('confirmation-save');
      expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
      // The per-row banner sits inline at row 1.
      expect(screen.getByTestId('confirmation-item-1-dedup-banner')).toBeInTheDocument();
      // Synchronous rename via `fireEvent.change` — avoids the async race
      // with the row-0 preflight setTimeout that haunts userEvent.type.
      const row1Name = screen.getByTestId('confirmation-item-1-name') as HTMLInputElement;
      fireEvent.change(row1Name, { target: { value: 'spring rolls fresh' } });
      // Row 1's dedup clears → Save re-enables.
      expect(saveBtn).toHaveAttribute('aria-disabled', 'false');
      expect(screen.queryByTestId('confirmation-item-1-dedup-banner')).toBeNull();
    });

    it('R3-C2: renaming a NON-colliding row does NOT clear another row’s dedup (per-row scoping)', () => {
      // Regression guard: row 1 has the conflict; user types in row 0
      // (which has no conflict). Row 1's banner must persist; Save stays
      // aria-disabled.
      render(
        <Confirmation.Root
          source="text"
          tab="type"
          items={multiItem}
          reasoning={null}
          dedupMatch={null}
          dedupMatchByRow={[
            null,
            {
              id: 'lib-existing-spring',
              normalized_name: 'spring rolls',
              display_name: 'Spring Rolls',
            },
            null,
          ]}
          mode="library-only"
          onClose={vi.fn()}
        >
          <Confirmation.ItemList />
          <Confirmation.LibraryOnlyDedupBanner />
          <Confirmation.SaveAction />
        </Confirmation.Root>,
      );
      const saveBtn = screen.getByTestId('confirmation-save');
      expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
      const row0Name = screen.getByTestId('confirmation-item-0-name') as HTMLInputElement;
      fireEvent.change(row0Name, { target: { value: 'pho bo extra' } });
      // Row 1's banner survives, Save still blocked.
      expect(screen.getByTestId('confirmation-item-1-dedup-banner')).toBeInTheDocument();
      expect(saveBtn).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

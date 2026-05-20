/**
 * `<FoodDetail />` mutation feedback + cross-mutation block — Bug 4
 * (library overhaul batch 2026-05-16).
 *
 * RED-first contract tests for the four gaps captured in the proposal:
 *   1. Sheet-wide `aria-busy="true"` while any mutation is in flight
 *      (Save / Delete / Log Now).
 *   2. Cross-mutation block: while one mutation pends, the other
 *      mutation buttons are disabled (programmatic clicks short-circuit).
 *   3. Delete navigation is DEFERRED until AFTER `authPost` resolves —
 *      no router.push pre-empts the in-flight cue.
 *   4. Real "Deleting…" label inside the BulkDeleteConfirmDialog while
 *      pending (replaces bare "…" ellipsis).
 *
 * Mock + harness follow the FoodDetail.a11y / FoodDetail-LogNow patterns
 * so the test surface is consistent with existing sibling tests.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

vi.mock('next/dynamic', async () => {
  const { Suspense, lazy, createElement } = await import('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<unknown>) => {
      const Lazy = lazy(async () => {
        const mod = (await loader()) as unknown;
        let Comp: unknown = mod;
        if (typeof mod === 'object' && mod !== null) {
          const asMod = mod as { default?: unknown };
          Comp =
            asMod.default ??
            Object.values(mod as Record<string, unknown>).find(
              (v) => typeof v === 'function' || typeof v === 'object',
            );
        }
        return { default: Comp as React.ComponentType<Record<string, unknown>> };
      });
      const Wrapper = (props: Record<string, unknown>) =>
        createElement(Suspense, { fallback: null }, createElement(Lazy, props));
      return Wrapper;
    },
  };
});

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      refresh: refreshMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

// authPost mock — overridable per-test.
const authPostMock = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => {
  class FakeSessionExpiredError extends Error {
    constructor(message = 'Session expired after refresh attempt') {
      super(message);
      this.name = 'SessionExpiredError';
    }
  }
  return {
    authPost: (...args: unknown[]) => authPostMock(...args),
    SessionExpiredError: FakeSessionExpiredError,
  };
});

// Sentry silence.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// Undo store stub.
const pushToastMock = vi.fn();
vi.mock('@/lib/stores/useUndoQueueStore', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stores/useUndoQueueStore')>(
    '@/lib/stores/useUndoQueueStore',
  );
  return {
    ...actual,
    useUndoQueueStore: (selector?: (s: unknown) => unknown) => {
      const state = { pushToast: pushToastMock };
      return selector ? selector(state) : state;
    },
  };
});

import { FoodDetail } from '@/app/(app)/library/_components/FoodDetail/FoodDetail';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18, fiber_g: 3 },
    micros: { sodium_mg: 800 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

const baseHistory = {
  firstLoggedAt: '2026-04-01T10:00:00Z',
  totalLogCount: 3,
  recent: [] as Array<{ id: string; loggedAt: string; mealCategory: string }>,
};

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  authPostMock.mockReset();
  pushToastMock.mockReset();
});

describe('<FoodDetail /> — Bug 4 sheet-wide aria-busy', () => {
  it('sheet has aria-busy="true" while Log Now POST is in flight, restored to false on resolve', async () => {
    let resolveFn: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const sheet = screen.getByTestId('food-detail-sheet');
    expect(sheet.getAttribute('aria-busy')).not.toBe('true');

    await user.click(screen.getByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    await waitFor(() => {
      expect(sheet).toHaveAttribute('aria-busy', 'true');
      expect(sheet).toHaveAttribute('data-busy', 'true');
    });

    resolveFn({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });

    await waitFor(() => {
      expect(sheet.getAttribute('aria-busy')).not.toBe('true');
    });
  });
});

describe('<FoodDetail /> — Bug 4 cross-mutation block (view mode)', () => {
  it('while Log Now pends, the Edit button is disabled and clicking does NOT enter edit mode', async () => {
    let resolveLogNow: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogNow = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    const logNow = screen.getByTestId('food-detail-log-now');
    await user.click(logNow);
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));

    const edit = screen.getByTestId('food-detail-edit-button');
    await waitFor(() => {
      expect(edit).toBeDisabled();
    });
    // Programmatic click while disabled must not enter edit mode.
    await user.click(edit);
    expect(screen.queryByTestId('food-detail-actions-edit')).toBeNull();
    expect(screen.getByTestId('food-detail-actions-view')).toBeInTheDocument();

    resolveLogNow({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });
    // Wait for state to settle so we end the test cleanly.
    await waitFor(() => {
      expect(edit).not.toBeDisabled();
    });
  });

  it('while Log Now pends, the Delete button is disabled and the delete dialog does NOT open', async () => {
    let resolveLogNow: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogNow = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(screen.getByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));
    const del = screen.getByTestId('food-detail-delete-button');
    await waitFor(() => {
      expect(del).toBeDisabled();
    });
    await user.click(del);
    expect(screen.queryByTestId('library-bulk-delete-dialog')).toBeNull();

    resolveLogNow({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });
    await waitFor(() => {
      expect(del).not.toBeDisabled();
    });
  });
});

describe('<FoodDetail /> — Bug 4 delete-await navigation ordering', () => {
  it('post-delete router.push(/library) fires AFTER authPost resolves (not before)', async () => {
    const callOrder: string[] = [];
    let resolveDelete: (val: unknown) => void = () => {};

    // First click: open dialog (no authPost). Subsequent: the delete POST.
    authPostMock.mockImplementation(() => {
      callOrder.push('authPost');
      return new Promise((resolve) => {
        resolveDelete = resolve;
      });
    });
    pushMock.mockImplementation((href: string) => {
      callOrder.push(`push:${href}`);
    });

    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(screen.getByTestId('food-detail-delete-button'));
    await waitFor(() => {
      expect(screen.getByTestId('library-bulk-delete-dialog')).toBeInTheDocument();
    });

    // Confirm — fire delete POST. Order: authPost first, push after resolve.
    await user.click(screen.getByTestId('library-bulk-delete-confirm'));

    // authPost is in flight. push must NOT have fired with /library yet.
    await waitFor(() => {
      expect(callOrder).toContain('authPost');
    });
    expect(callOrder.filter((c) => c === 'push:/library')).toHaveLength(0);

    // Resolve — now the push should fire.
    resolveDelete({ item: { id: baseItem.id, deleted_at: '2026-05-15T08:30:00Z' } });

    await waitFor(() => {
      expect(callOrder).toContain('push:/library');
    });

    // Final order: authPost was called BEFORE push:/library.
    const authIdx = callOrder.indexOf('authPost');
    const pushIdx = callOrder.indexOf('push:/library');
    expect(authIdx).toBeLessThan(pushIdx);
  });
});

describe('<FoodDetail /> — Bug 4 dialog Cancel disabled while pending', () => {
  it('CANCEL button inside the dialog is disabled while delete POST is in flight', async () => {
    let resolveDelete: (val: unknown) => void = () => {};
    authPostMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(screen.getByTestId('food-detail-delete-button'));
    await waitFor(() => {
      expect(screen.getByTestId('library-bulk-delete-dialog')).toBeInTheDocument();
    });

    const confirm = screen.getByTestId('library-bulk-delete-confirm');
    await user.click(confirm);

    const cancel = screen.getByTestId('library-bulk-delete-cancel');
    await waitFor(() => {
      expect(cancel).toBeDisabled();
    });
    // Confirm itself is also disabled.
    expect(confirm).toBeDisabled();
    // And shows the real "Deleting…" word (NOT bare ellipsis).
    expect(confirm).toHaveTextContent(/deleting/i);

    resolveDelete({ item: { id: baseItem.id, deleted_at: '2026-05-15T08:30:00Z' } });
    await waitFor(() => {
      // After resolve the dialog closes (onOpenChange(false)); cancel
      // unmounts. The contract under test is the pending-state coupling.
      expect(pushMock).toHaveBeenCalledWith('/library');
    });
  });
});

describe('<FoodDetail /> — Bug 4 ESC gated by sheetBusy', () => {
  it('ESC does NOT navigate to /library while Log Now is in flight', async () => {
    let resolveFn: (val: unknown) => void = () => {};
    authPostMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} />);

    await user.click(screen.getByTestId('food-detail-log-now'));
    await user.click(await screen.findByTestId('food-detail-log-now-meal-snack'));
    // Wait for pending state to be reflected.
    await waitFor(() => {
      expect(screen.getByTestId('food-detail-sheet')).toHaveAttribute('aria-busy', 'true');
    });

    pushMock.mockClear();
    await user.keyboard('{Escape}');
    expect(pushMock).not.toHaveBeenCalled();

    resolveFn({ entry: { id: 'e', logged_at: '2026-05-15T08:30:00Z' } });
  });
});

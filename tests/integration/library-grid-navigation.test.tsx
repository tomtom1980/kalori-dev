/**
 * Integration test — Task C.6 / US-STAB-C6.
 *
 * Library grid card activation routes to `/library/[id]`. Covers:
 *   - AC1 unit-level: click navigates (sanity seam for the E2E path)
 *   - AC2 keyboard-enter-and-space-activate: Enter + Space on focused card
 *     trigger the same `router.push('/library/[id]')`.
 *   - Select-mode preservation: in select mode, clicking toggles selection
 *     and does NOT call router.push (avoids regressing F19 select mode).
 *
 * Pattern mirrors tests/integration/library-page.test.tsx — same vi.mock
 * harness (next/navigation, next/image, next/dynamic), narrowed to the
 * navigation use-case. `routerPushMock` replaces the `routerRefreshMock`
 * assertion target.
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryClient } from '@/app/(app)/library/_components/LibraryClient';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Stub next/image to keep happy-dom lean.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} {...rest} />
  ),
}));

// next/dynamic — happy-dom renders a suspense-like boundary. Same async
// wrapper as library-page.test.tsx — needed so the BulkActionsBar /
// MergeDialog / BulkDeleteConfirmDialog dynamic imports don't blow up.
vi.mock('next/dynamic', async () => {
  const { Suspense, lazy, createElement } = await import('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<Record<string, unknown>>) => {
      const Lazy = lazy(async () => {
        const mod = await loader();
        const Comp =
          (mod as { default?: unknown }).default ??
          (Object.values(mod as Record<string, unknown>).find(
            (v) => typeof v === 'function' || typeof v === 'object',
          ) as unknown);
        return { default: Comp as React.ComponentType<Record<string, unknown>> };
      });
      const Wrapper = (props: Record<string, unknown>) =>
        createElement(Suspense, { fallback: null }, createElement(Lazy, props));
      return Wrapper;
    },
  };
});

// Silence refresh-interceptor's signOut + redirect path in happy-dom.
vi.mock('@/lib/auth/refresh-interceptor', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/refresh-interceptor')>(
    '@/lib/auth/refresh-interceptor',
  );
  return {
    ...actual,
  };
});

// Capture push() so we can assert the navigation target. Refresh + replace
// are stubbed to satisfy other LibraryClient call-sites (delete + merge).
const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      refresh: routerRefreshMock,
      push: routerPushMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

function mk(id: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    client_id: `client-${id}`,
    display_name: overrides.display_name ?? `Item ${id.toUpperCase()}`,
    normalized_name: overrides.normalized_name ?? `item ${id}`,
    default_portion: 1,
    default_unit: 'piece',
    nutrition: {
      kcal: overrides.nutrition?.kcal ?? 100,
      macros: {
        protein_g: 10,
        carbs_g: 10,
        fat_g: 5,
      },
    },
    thumbnail_url: overrides.thumbnail_url ?? null,
    log_count: overrides.log_count ?? 1,
    last_used_at: overrides.last_used_at ?? null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SEED: LibraryItem[] = [
  mk('a', { display_name: 'Apple' }),
  mk('b', { display_name: 'Banh Mi' }),
];

describe('<LibraryClient /> grid navigation (US-STAB-C6)', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
    useUndoQueueStore.setState({ stack: [] });
    if (typeof window !== 'undefined') window.sessionStorage.clear();
    routerPushMock.mockClear();
    routerRefreshMock.mockClear();
  });
  afterEach(() => {
    useLibrarySelectionStore.getState().clear();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('AC1 (unit-level): clicking a card calls router.push("/library/${id}")', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);

    const card = screen.getByTestId('library-card-a');
    await user.click(card);

    expect(routerPushMock).toHaveBeenCalledWith('/library/a');
    expect(routerPushMock).toHaveBeenCalledTimes(1);
  });

  it('AC2 (keyboard-enter-and-space-activate): Enter on focused card routes to /library/${id}', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);

    const card = screen.getByTestId('library-card-a');
    await act(async () => {
      card.focus();
    });
    expect(card).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(routerPushMock).toHaveBeenCalledWith('/library/a');
  });

  it('AC2 (keyboard-enter-and-space-activate): Space on focused card routes to /library/${id}', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);

    const card = screen.getByTestId('library-card-b');
    await act(async () => {
      card.focus();
    });
    expect(card).toHaveFocus();

    await user.keyboard(' ');

    expect(routerPushMock).toHaveBeenCalledWith('/library/b');
  });

  it('select-mode preserves toggle semantics: click does NOT call router.push', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);

    // Enter select mode via the rail toggle (mirrors real UX). The
    // toolbar exposes its toggle via data-testid `library-select-toggle`.
    const selectToggle = screen.getByTestId('library-select-toggle');
    await user.click(selectToggle);

    // Click a card — should toggle selection, NOT navigate.
    const card = screen.getByTestId('library-card-a');
    await user.click(card);

    expect(routerPushMock).not.toHaveBeenCalled();
    // Confirm the selection toggled.
    expect(useLibrarySelectionStore.getState().ids.has('a')).toBe(true);
  });
});

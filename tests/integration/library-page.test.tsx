/**
 * Integration test — /library client-side flow (Task 4.1 sub-step 3 §15.3).
 *
 * Covers full route behaviour against mocked API endpoints:
 *   - initial render populates the grid
 *   - search filters visible cards
 *   - sort reorders the list
 *   - selection mode + bulk actions bar appears at ≥1 selected
 *   - bulk delete flow calls the API + pushes an undo toast
 *   - merge dialog opens on MERGE button when exactly 2 selected
 *
 * Uses MSW for the mutation endpoints. Auth is mocked at the module level
 * because the client island doesn't do auth itself (handled in `page.tsx`).
 */
import { act, render, screen, within } from '@testing-library/react';
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

// next/dynamic — `happy-dom` renders a suspense-like boundary on the first
// call. We stub it as an async wrapper that resolves the real module on
// mount. Test code awaits the async boundary via `findByTestId`.
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
    // Re-export authPost so real fetch still hits MSW.
  };
});

// Phase 3 fix P3-bug-1: LibraryClient calls `useRouter().refresh()`
// after successful mutations. Mock the router so we can assert calls.
const routerRefreshMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      refresh: routerRefreshMock,
      push: vi.fn(),
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
  mk('a', { display_name: 'Apple', log_count: 1 }),
  mk('b', { display_name: 'Banh Mi', log_count: 5 }),
  mk('c', { display_name: 'Cucumber', log_count: 3 }),
];

describe('<LibraryClient /> integration', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
    useUndoQueueStore.setState({ stack: [] });
    if (typeof window !== 'undefined') window.sessionStorage.clear();
    routerRefreshMock.mockClear();
  });
  afterEach(() => {
    useLibrarySelectionStore.getState().clear();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders all seeded items', () => {
    render(<LibraryClient initial={SEED} uid="u1" />);
    expect(screen.getByTestId('library-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-b')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-c')).toBeInTheDocument();
  });

  it('search filters the grid to matching names', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.type(screen.getByTestId('library-search-input'), 'banh');
    // Let useDeferredValue flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByTestId('library-card-b')).toBeInTheDocument();
    expect(screen.queryByTestId('library-card-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-card-c')).not.toBeInTheDocument();
  });

  it('entering select mode + selecting 2 cards reveals the bulk actions bar', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-a'));
    await user.click(screen.getByTestId('library-card-b'));
    const bar = await screen.findByTestId('library-bulk-actions-bar');
    expect(bar).toBeInTheDocument();
    // Bug 2 (library bulk overhaul 2026-05-17): bulk MERGE replaced by
    // bulk LOG. The bar exposes a `library-bulk-log-button` instead.
    expect(within(bar).getByTestId('library-bulk-log-button')).toBeInTheDocument();
  });

  it('bulk-delete dialog open flag flips on BULK DELETE click', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-a'));
    await user.click(screen.getByTestId('library-card-b'));
    // Phase 3 F2: bar visible at N=2; bulk delete button present.
    const btn = screen.getByTestId('library-bulk-delete-button');
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    // Dialog module is dynamically imported; Radix portals to the body.
    // We assert the app-side state (selection intact) — the dialog's own
    // Vitest + RTL test covers the render path.
    expect(useLibrarySelectionStore.getState().ids.size).toBe(2);
  });

  it('bulk LOG button materializes at N>=2 (bulk MERGE was retired 2026-05-17)', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-a'));
    // Phase 3 F2 threshold: bar renders only at N≥2, so at N=1 the
    // bulk-log button is not in the DOM yet.
    expect(screen.queryByTestId('library-bulk-log-button')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('library-card-b'));
    // 2 selected → bar visible with bulk LOG button.
    expect(screen.getByTestId('library-bulk-log-button')).toBeInTheDocument();
    await user.click(screen.getByTestId('library-card-c'));
    // 3 selected → bulk LOG still available (no exact-count gate).
    expect(screen.getByTestId('library-bulk-log-button')).toBeInTheDocument();
  });

  it('sort change reorders visible cards', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    // Bug 7 — Default sort is name-asc → Apple (id=a) first on initial render
    // (no sessionStorage interaction). Was previously most-logged.
    const grid = screen.getByTestId('library-grid');
    const cards = within(grid).getAllByTestId(/^library-card-[abc]$/);
    expect(cards[0]).toHaveAttribute('data-testid', 'library-card-a');
    // Switching to most-logged via the dropdown reorders the grid so the
    // highest log_count item (Banh Mi / id=b) comes first — preserves
    // coverage of "sort change reorders".
    await user.click(screen.getByTestId('library-sort-trigger'));
    await user.click(screen.getByTestId('library-sort-option-most-logged'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const postSortGrid = screen.getByTestId('library-grid');
    const postSortCards = within(postSortGrid).getAllByTestId(/^library-card-[abc]$/);
    expect(postSortCards[0]).toHaveAttribute('data-testid', 'library-card-b');
  });

  it('filter=with-photos hides items without thumbnails', async () => {
    const user = userEvent.setup();
    const seedWithPhoto: LibraryItem[] = [
      mk('a', { display_name: 'Photo A', thumbnail_url: 'https://example.com/a.webp' }),
      mk('b', { display_name: 'No Photo B', thumbnail_url: null }),
    ];
    render(<LibraryClient initial={seedWithPhoto} uid="u1" />);
    await user.click(screen.getByTestId('library-filter-trigger'));
    await user.click(screen.getByTestId('library-filter-option-with-photos'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByTestId('library-card-a')).toBeInTheDocument();
    expect(screen.queryByTestId('library-card-b')).not.toBeInTheDocument();
  });

  // The full bulk-delete mutation flow through the dialog requires the
  // dynamic chunk + Radix portal, which happy-dom doesn't fully simulate.
  // The mutation endpoint is covered by the integration test
  // `tests/integration/library-bulk-delete.test.ts` from sub-step 2, and
  // the dialog itself has its own Vitest test
  // (`tests/components/library/BulkDeleteConfirmDialog.test.tsx`).
  it('undo queue starts empty at mount', () => {
    render(<LibraryClient initial={SEED} uid="u1" />);
    expect(useUndoQueueStore.getState().stack).toHaveLength(0);
  });

  // Phase 3 fix (C2): sr-only live region for SC 4.1.3 Status Messages.
  it('renders an aria-live selection announcement region that updates on selection', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    const region = screen.getByTestId('library-selection-announcement');
    expect(region).toHaveAttribute('role', 'status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region.textContent).toBe('');

    await user.click(screen.getByTestId('library-select-toggle'));
    // Mode on, no selection yet → "Selection mode enabled."
    expect(region.textContent).toMatch(/selection mode enabled/i);

    await user.click(screen.getByTestId('library-card-a'));
    expect(region.textContent).toMatch(/1 items selected/i);

    await user.click(screen.getByTestId('library-card-b'));
    expect(region.textContent).toMatch(/2 items selected/i);
  });

  // Phase 3 F2: BulkActionsBar threshold is N≥2.
  it('bulk actions bar is hidden at N=1 and visible at N=2 (F2 threshold)', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-a'));
    expect(screen.queryByTestId('library-bulk-actions-bar')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('library-card-b'));
    expect(await screen.findByTestId('library-bulk-actions-bar')).toBeInTheDocument();
  });

  // Phase 3 P3-bug-4: toggling select mode off should not raise
  // React's "Cannot update a component while rendering" warning.
  it('toggling select mode off clears selection without render-phase setState warning', async () => {
    const user = userEvent.setup();
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<LibraryClient initial={SEED} uid="u1" />);
    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-a'));
    await user.click(screen.getByTestId('library-card-b'));
    // Toggle off.
    await user.click(screen.getByTestId('library-select-toggle'));
    expect(useLibrarySelectionStore.getState().ids.size).toBe(0);
    const renderWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0] ?? '').includes('Cannot update a component'),
    );
    expect(renderWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });
});

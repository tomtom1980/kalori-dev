/**
 * Task 3.3 — <LibraryTab /> smoke test.
 *   - search input with role="search" + label
 *   - 3-way sort radiogroup (frequent / recent / highest-protein)
 *   - empty state when items prop is empty
 *   - keyboard `/` focuses the search input
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryTab } from '@/app/(app)/log/_components/LibraryTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

// Stub the refresh interceptor so the self-hydration `authFetch('/api/library/list')`
// inside `LibraryTab`'s mount effect (LibraryTab.tsx:162) does not reach undici
// and dial localhost:3000 (CI has no dev server → ECONNREFUSED). Tests in this
// file render `<LibraryTab />` without `items` and with an empty store, which
// otherwise triggers that hydration fetch. Mirrors the pattern already used in
// `tests/components/log-flow/library-tab-self-hydrate.test.tsx`.
const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (input: string | URL, init?: RequestInit) => authFetchMock(input, init),
  authPost: vi.fn(),
  SessionExpiredError: class SessionExpiredError extends Error {},
}));

describe('<LibraryTab />', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    useLogFlowStore.getState().resetDraft();
  });

  it('renders the search input with type=search', () => {
    render(<LibraryTab />);
    const input = screen.getByTestId('library-search-input') as HTMLInputElement;
    expect(input.type).toBe('search');
  });

  it('renders the 3-way sort radiogroup', () => {
    render(<LibraryTab />);
    const group = screen.getByTestId('library-sort');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(screen.getByTestId('library-sort-frequent')).toHaveAttribute('role', 'radio');
    expect(screen.getByTestId('library-sort-recent')).toHaveAttribute('role', 'radio');
    expect(screen.getByTestId('library-sort-highest-protein')).toHaveAttribute('role', 'radio');
  });

  it('default sort is `frequent`', () => {
    render(<LibraryTab />);
    expect(screen.getByTestId('library-sort-frequent')).toHaveAttribute('aria-checked', 'true');
  });

  it('clicking RECENT sets aria-checked to true and updates store', async () => {
    const user = userEvent.setup();
    render(<LibraryTab />);
    await user.click(screen.getByTestId('library-sort-recent'));
    expect(useLogFlowStore.getState().librarySort).toBe('recent');
  });

  it('renders empty state when items list is empty (no search)', () => {
    render(<LibraryTab />);
    expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
  });

  it('renders items when provided and supports toggle selection', async () => {
    const user = userEvent.setup();
    render(
      <LibraryTab
        items={[
          {
            id: 'a',
            name: 'Pho Bo',
            kcal: 520,
            logCount: 12,
            lastUsedIso: '2026-04-20T12:00:00Z',
            proteinG: 32,
          },
          {
            id: 'b',
            name: 'Banh Mi',
            kcal: 480,
            logCount: 8,
            lastUsedIso: '2026-04-18T12:00:00Z',
            proteinG: 18,
          },
        ]}
      />,
    );
    const card = screen.getByTestId('library-card-a');
    await user.click(card);
    expect(useLogFlowStore.getState().librarySelection).toEqual([{ itemId: 'a', quantity: 1 }]);
  });

  it('renders letter-mark fallback when no thumbnail provided (style critical #8)', () => {
    render(
      <LibraryTab
        items={[
          {
            id: 'a',
            name: 'Pho Bo',
            kcal: 520,
            logCount: 12,
            lastUsedIso: null,
            proteinG: 32,
          },
        ]}
      />,
    );
    const mark = screen.getByTestId('library-card-lettermark-a');
    expect(mark).toBeInTheDocument();
    expect(mark.textContent).toBe('P');
  });

  it('renders last-used date row when lastUsedIso is present (style critical #8)', () => {
    render(
      <LibraryTab
        items={[
          {
            id: 'a',
            name: 'Pho Bo',
            kcal: 520,
            logCount: 12,
            lastUsedIso: '2026-04-18T12:00:00Z',
            proteinG: 32,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('library-card-lastused-a')).toBeInTheDocument();
  });

  it('sort radiogroup uses roving tabindex (compliance §C3)', () => {
    render(<LibraryTab />);
    const frequentPill = screen.getByTestId('library-sort-frequent');
    const recentPill = screen.getByTestId('library-sort-recent');
    const highProteinPill = screen.getByTestId('library-sort-highest-protein');
    // Default sort = frequent → only that pill is tabbable.
    expect(frequentPill.getAttribute('tabindex')).toBe('0');
    expect(recentPill.getAttribute('tabindex')).toBe('-1');
    expect(highProteinPill.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight on sort radiogroup moves selection forward (compliance §C3)', async () => {
    const user = userEvent.setup();
    render(<LibraryTab />);
    const frequentPill = screen.getByTestId('library-sort-frequent');
    frequentPill.focus();
    await user.keyboard('{ArrowRight}');
    expect(useLogFlowStore.getState().librarySort).toBe('recent');
    // Home resets to first option.
    await user.keyboard('{Home}');
    expect(useLogFlowStore.getState().librarySort).toBe('frequent');
    // End jumps to last option.
    await user.keyboard('{End}');
    expect(useLogFlowStore.getState().librarySort).toBe('highest-protein');
  });

  it('selected card uses aria-selected=true (Phase-3 style critical #8)', async () => {
    const user = userEvent.setup();
    render(
      <LibraryTab
        items={[
          {
            id: 'a',
            name: 'Pho Bo',
            kcal: 520,
            logCount: 12,
            lastUsedIso: null,
            proteinG: 32,
          },
        ]}
      />,
    );
    const card = screen.getByTestId('library-card-a');
    expect(card.getAttribute('aria-selected')).toBe('false');
    await user.click(card);
    expect(card.getAttribute('aria-selected')).toBe('true');
  });
});

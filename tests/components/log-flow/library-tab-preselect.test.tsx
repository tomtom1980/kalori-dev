/**
 * F-TASK-4.2-I2-UI-ROUNDTRIP — DOM-level integration test.
 *
 * Round 1's I2 fix seeds the LogPageClient zustand store with
 * `{ activeTab: 'library', librarySelection: [{ itemId, quantity }] }`
 * when the user deep-links `/log?tab=library&item=<uuid>&quantity=150`.
 * Store hydration was complete, but `LogFlowTabs.tsx` rendered
 * `<LibraryTab />` against an empty default and there was no DOM widget
 * reading the seeded quantity — so the claimed "row pre-selected +
 * quantity prefilled" UX was unobservable.
 *
 * This test asserts the full DOM round-trip:
 *   1. With store seeded `{ activeTab: 'library', libraryItems: [...],
 *      librarySelection: [{ itemId: 'pho-id', quantity: 150 }] }`,
 *      mount `<LogFlowTabs />`.
 *   2. The Library panel is the active panel.
 *   3. The card for `pho-id` has `aria-selected="true"`.
 *   4. A quantity input rendered for that row shows the value `150`.
 *
 * Pairs with `tests/components/library-tab-hydration.test.tsx` (store-only
 * hydration) and `tests/integration/log-page-library-hydration.test.tsx`
 * (URL → store seeding) — closes the loop end-to-end.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/use-is-mobile', () => ({
  MOBILE_QUERY: '(max-width: 1279px)',
  useIsMobile: () => false,
}));

import {
  LibraryList,
  type LibraryListProps,
} from '@/app/(app)/log/_components/AddFoodTab/LibraryList';

// Task 10 — migrated import. `<LibraryTab>` is gone; tests use the same
// component (now `<LibraryList>`) via a thin wrapper that supplies the new
// required `onAddNew` prop with a no-op default so existing render sites
// keep working without touching every call.
function LibraryTab(props: Partial<LibraryListProps> = {}) {
  const { onAddNew = () => {}, ...rest } = props;
  return <LibraryList onAddNew={onAddNew} {...rest} />;
}
import { LogFlowTabs } from '@/app/(app)/log/_components/LogFlowTabs';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

// Same mock stack as LogFlowTabs.test.tsx — refresh-interceptor + next/navigation.
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ match: null }), { status: 200 })),
  ),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const PHO = {
  id: 'pho-id',
  name: 'Pho Bo',
  kcal: 520,
  lastUsedIso: '2026-04-20T12:00:00Z',
  logCount: 12,
  proteinG: 32,
  carbsG: 48,
  fatG: 14,
  fiberG: 3,
  unit: 'g',
};

const BANH_MI = {
  id: 'banh-mi-id',
  name: 'Banh Mi',
  kcal: 480,
  lastUsedIso: null,
  logCount: 5,
  proteinG: 18,
  carbsG: 60,
  fatG: 12,
  fiberG: 2,
  unit: 'g',
};

describe('F-TASK-4.2-I2-UI-ROUNDTRIP — LibraryTab DOM round-trip from seeded store', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useUndoQueueStore.setState({ stack: [] });
  });

  it('mounts LogFlowTabs with seeded store: Add Food tab active (library subview), target row preselected, quantity 150 visible', () => {
    // Seed exactly what LogPageClient writes for `/log?tab=library&item=pho-id&quantity=150`.
    const store = useLogFlowStore.getState();
    store.setLibraryItems([PHO, BANH_MI]);
    store.setActiveTab('library');
    store.setLibrarySelection([{ itemId: 'pho-id', quantity: 150 }]);

    render(<LogFlowTabs />);

    // Add Food merge: the unified "Add Food" panel is the active panel
    // when activeTab === 'library' (library is one of the two subviews
    // hosted under it). Per-subview panel testids no longer exist.
    const addFoodPanel = screen.getByTestId('log-flow-panel-add-food');
    expect(addFoodPanel.getAttribute('data-state')).toBe('active');

    // Pho row is preselected (aria-selected via store `selection`).
    const phoCard = screen.getByTestId('library-card-pho-id');
    expect(phoCard.getAttribute('aria-selected')).toBe('true');

    // Banh Mi row is NOT selected.
    const banhCard = screen.getByTestId('library-card-banh-mi-id');
    expect(banhCard.getAttribute('aria-selected')).toBe('false');

    // Quantity input for the preselected row shows 150.
    const qtyInput = screen.getByTestId('library-quantity-pho-id') as HTMLInputElement;
    expect(qtyInput).toBeInTheDocument();
    expect(qtyInput.value).toBe('150');
  });

  it('quantity input is hidden for unselected rows', () => {
    useLogFlowStore.getState().setLibraryItems([PHO, BANH_MI]);
    useLogFlowStore.getState().setActiveTab('library');
    useLogFlowStore.getState().setLibrarySelection([{ itemId: 'pho-id', quantity: 200 }]);

    render(<LibraryTab />);

    expect(screen.getByTestId('library-quantity-pho-id')).toBeInTheDocument();
    expect(screen.queryByTestId('library-quantity-banh-mi-id')).not.toBeInTheDocument();
  });

  it('editing the quantity input updates the store', () => {
    useLogFlowStore.getState().setLibraryItems([PHO]);
    useLogFlowStore.getState().setLibrarySelection([{ itemId: 'pho-id', quantity: 100 }]);

    render(<LibraryTab />);

    const qtyInput = screen.getByTestId('library-quantity-pho-id') as HTMLInputElement;
    // Single change event — controlled-input round-trip: change reflects
    // in store. (userEvent.type would replay each keystroke and assert
    // an intermediate state; we want the steady-state contract.)
    fireEvent.change(qtyInput, { target: { value: '250' } });

    const sel = useLogFlowStore.getState().librarySelection;
    expect(sel).toEqual([{ itemId: 'pho-id', quantity: 250 }]);
  });

  it('clicking a row toggles selection AND mounts the quantity input at default 1', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([PHO]);
    // No initial selection.
    render(<LibraryTab />);

    expect(screen.queryByTestId('library-quantity-pho-id')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('library-card-pho-id'));

    const qtyInput = screen.getByTestId('library-quantity-pho-id') as HTMLInputElement;
    expect(qtyInput).toBeInTheDocument();
    expect(qtyInput.value).toBe('1');
  });

  it('clicking a defaultPortion row selects the saved serving amount', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([{ ...PHO, defaultPortion: 350 }]);

    render(<LibraryTab />);

    await user.click(screen.getByTestId('library-card-pho-id'));

    const qtyInput = screen.getByTestId('library-quantity-pho-id') as HTMLInputElement;
    expect(qtyInput.value).toBe('350');
    expect(useLogFlowStore.getState().librarySelection).toEqual([
      { itemId: 'pho-id', quantity: 350 },
    ]);
  });

  it('clicking quantity input does not toggle selection (event stays inside input)', async () => {
    const user = userEvent.setup();
    useLogFlowStore.getState().setLibraryItems([PHO]);
    useLogFlowStore.getState().setLibrarySelection([{ itemId: 'pho-id', quantity: 150 }]);

    render(<LibraryTab />);

    const qtyInput = screen.getByTestId('library-quantity-pho-id') as HTMLInputElement;
    await user.click(qtyInput);

    // Selection still present — clicking the input must not bubble up to
    // the card's toggle handler.
    const sel = useLogFlowStore.getState().librarySelection;
    expect(sel).toEqual([{ itemId: 'pho-id', quantity: 150 }]);
  });
});

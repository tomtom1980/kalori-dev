/**
 * Integration test — Task 4.2 round 1 I2 fix.
 *
 * `/log?tab=library&item=<uuid>&quantity=150` must hydrate the LogFlow
 * store with BOTH an initial tab hint AND a seeded library selection.
 *
 * Before this fix, LogPageClient already seeded `librarySelection` with
 * quantity=1 (hard-coded), ignoring the `quantity` searchParam. After the
 * fix, the client respects the URL-provided quantity so "Log this now"
 * from the detail page can carry an explicit portion.
 */
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LogPageClient } from '@/app/(app)/log/_components/LogPageClient';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<LogPageClient /> — I2 library hydration', () => {
  afterEach(() => {
    // Reset store to defaults between tests.
    useLogFlowStore.setState((s) => ({
      ...s,
      activeTab: 'type',
      librarySelection: [],
      isOpen: false,
    }));
  });

  it('seeds librarySelection with the URL-provided quantity (not 1)', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        initialQuantity={150}
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.activeTab).toBe('library');
    expect(state.librarySelection).toEqual([
      { itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', quantity: 150 },
    ]);
    expect(state.isOpen).toBe(true);
  });

  it('defaults to quantity=1 when no explicit quantity is provided', () => {
    render(
      <LogPageClient initialTab="library" initialItemId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" />,
    );
    const state = useLogFlowStore.getState();
    expect(state.librarySelection).toEqual([
      { itemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', quantity: 1 },
    ]);
  });

  it('ignores a non-positive quantity param and falls back to 1', () => {
    render(
      <LogPageClient
        initialTab="library"
        initialItemId="cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        initialQuantity={0}
      />,
    );
    const state = useLogFlowStore.getState();
    expect(state.librarySelection).toEqual([
      { itemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', quantity: 1 },
    ]);
  });
});

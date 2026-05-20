import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LibraryList } from '@/app/(app)/log/_components/AddFoodTab/LibraryList';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const RESET = () => {
  useLogFlowStore.setState({
    libraryItems: [],
    librarySelection: [],
    librarySearch: '',
    librarySort: 'name-asc',
    failureMode: null,
  });
};

describe('<LibraryList />', () => {
  beforeEach(RESET);

  it('renders LibraryLoadingSkeleton when items are empty and hydrating', () => {
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('library-list')).toBeNull();
  });

  it('renders AddNewItemIconButton beside the search input', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-icon-button')).toBeTruthy();
  });

  it('icon button calls onAddNew with empty string (no seed)', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    const onAddNew = vi.fn();
    render(<LibraryList onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-icon-button'));
    expect(onAddNew).toHaveBeenCalledWith('');
  });

  it('renders empty-state CTA when search returns no matches', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'banh xeo',
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.getByTestId('library-add-new-cta')).toHaveTextContent(
      'Add "banh xeo" as new item',
    );
  });

  it('empty-state CTA seeds onAddNew with the search term', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'banh xeo',
    });
    const onAddNew = vi.fn();
    render(<LibraryList onAddNew={onAddNew} />);
    fireEvent.click(screen.getByTestId('library-add-new-cta'));
    expect(onAddNew).toHaveBeenCalledWith('banh xeo');
  });

  it('does NOT render empty-state CTA when there are matching items', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho bo',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
      librarySearch: 'pho',
    });
    render(<LibraryList onAddNew={() => {}} />);
    expect(screen.queryByTestId('library-add-new-cta')).toBeNull();
  });

  it('renders all 5 macros (P/C/F/Fi/Ch) on the card when item has cholesterolMg', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho bo',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          cholesterolMg: 35,
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    render(<LibraryList onAddNew={() => {}} />);
    const macros = screen.getByTestId('library-card-macros-a');
    expect(macros).toHaveTextContent('P 20g');
    expect(macros).toHaveTextContent('C 60g');
    expect(macros).toHaveTextContent('F 10g');
    expect(macros).toHaveTextContent('Fi 2g');
    expect(macros).toHaveTextContent('Ch 35mg');
  });

  it('omits cholesterol from the macros row when item.cholesterolMg is undefined', () => {
    useLogFlowStore.setState({
      libraryItems: [
        {
          id: 'a',
          name: 'Pho bo',
          kcal: 450,
          lastUsedIso: null,
          logCount: 1,
          proteinG: 20,
          carbsG: 60,
          fatG: 10,
          fiberG: 2,
          // no cholesterolMg
          unit: 'g',
          thumbnailUrl: null,
        },
      ],
    });
    render(<LibraryList onAddNew={() => {}} />);
    const macros = screen.getByTestId('library-card-macros-a');
    expect(macros).toHaveTextContent('P 20g');
    expect(macros).toHaveTextContent('Fi 2g');
    expect(macros.textContent ?? '').not.toContain('Ch');
  });

  describe('pagination (6 items per page)', () => {
    const makeItem = (n: number) => ({
      id: `id-${n}`,
      // Two-digit zero-padded so alphabetical sort places id-01 first and
      // id-10 last — gives the test a deterministic page split.
      name: `Item ${String(n).padStart(2, '0')}`,
      kcal: 100,
      lastUsedIso: null,
      logCount: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      unit: 'g',
      thumbnailUrl: null,
    });

    it('does NOT render pagination when there are 6 or fewer items', () => {
      useLogFlowStore.setState({
        libraryItems: Array.from({ length: 6 }, (_, i) => makeItem(i + 1)),
      });
      render(<LibraryList onAddNew={() => {}} />);
      expect(screen.queryByTestId('library-list-pagination')).toBeNull();
      expect(screen.getAllByTestId(/^library-card-id-/)).toHaveLength(6);
    });

    it('paginates to 6 items per page when there are more than 6', () => {
      useLogFlowStore.setState({
        libraryItems: Array.from({ length: 10 }, (_, i) => makeItem(i + 1)),
      });
      render(<LibraryList onAddNew={() => {}} />);
      expect(screen.getByTestId('library-list-pagination')).toBeTruthy();
      // Page 1 shows items 01..06 (alphabetical default sort).
      expect(screen.getAllByTestId(/^library-card-id-/)).toHaveLength(6);
      expect(screen.getByTestId('library-card-id-1')).toBeTruthy();
      expect(screen.getByTestId('library-card-id-6')).toBeTruthy();
      expect(screen.queryByTestId('library-card-id-7')).toBeNull();
    });

    it('Next button advances to page 2 showing the remaining items', () => {
      useLogFlowStore.setState({
        libraryItems: Array.from({ length: 10 }, (_, i) => makeItem(i + 1)),
      });
      render(<LibraryList onAddNew={() => {}} />);
      fireEvent.click(screen.getByTestId('library-list-pagination-next'));
      // Page 2 has items 07..10 — 4 cards.
      expect(screen.getAllByTestId(/^library-card-id-/)).toHaveLength(4);
      expect(screen.getByTestId('library-card-id-7')).toBeTruthy();
      expect(screen.queryByTestId('library-card-id-1')).toBeNull();
    });

    it('renders top pagination and scrolls back to the library top on page change', async () => {
      const originalRaf = window.requestAnimationFrame;
      const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
      const scrollIntoView = vi.fn();
      window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      }) as typeof window.requestAnimationFrame;
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });
      try {
        useLogFlowStore.setState({
          libraryItems: Array.from({ length: 10 }, (_, i) => makeItem(i + 1)),
        });
        render(<LibraryList onAddNew={() => {}} />);

        expect(screen.getByTestId('library-list-pagination-top')).toBeTruthy();
        fireEvent.click(screen.getByTestId('library-list-pagination-top-page-2'));

        expect(screen.getByTestId('library-card-id-7')).toBeTruthy();
        await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      } finally {
        window.requestAnimationFrame = originalRaf;
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      }
    });
  });
});

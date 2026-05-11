/**
 * <LibraryGrid /> component test — Task 4.1 sub-step 3 §15.2.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryGrid } from '@/app/(app)/library/_components/LibraryGrid';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} {...rest} />
  ),
}));

function mk(id: string, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    client_id: `c-${id}`,
    display_name: overrides.display_name ?? `Item ${id}`,
    normalized_name: overrides.normalized_name ?? `item ${id}`,
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 2 } },
    thumbnail_url: overrides.thumbnail_url ?? null,
    log_count: overrides.log_count ?? 1,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('<LibraryGrid />', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
  });

  it('renders as role=list (not role=grid) per §18.1 deviation', () => {
    render(
      <LibraryGrid
        items={[mk('a'), mk('b')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    const list = screen.getByTestId('library-grid');
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAttribute('role', 'list');
  });

  it('renders each item as <li> with a <button> child', () => {
    render(
      <LibraryGrid
        items={[mk('a'), mk('b')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('library-card-a').tagName).toBe('BUTTON');
    expect(screen.getByTestId('library-card-b').tagName).toBe('BUTTON');
  });

  it('renders letter-mark fallback when thumbnail is missing', () => {
    render(
      <LibraryGrid
        items={[mk('a')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('library-card-lettermark-a')).toBeInTheDocument();
  });

  it('roving tabindex: only the first card is tabbable', () => {
    render(
      <LibraryGrid
        items={[mk('a'), mk('b'), mk('c')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('library-card-a')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('library-card-b')).toHaveAttribute('tabindex', '-1');
  });

  it('does not render inert pad cells for partial final rows', () => {
    render(
      <LibraryGrid
        items={[mk('a'), mk('b')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    expect(screen.queryByTestId('library-grid-pad-cell')).not.toBeInTheDocument();
  });

  it('removed ids get data-removed + aria-hidden', () => {
    render(
      <LibraryGrid
        items={[mk('a'), mk('b')]}
        removedIds={new Set(['a'])}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    const cell = screen.getByTestId('library-card-a').closest('li');
    expect(cell).toHaveAttribute('data-removed', 'true');
    expect(cell).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders empty fallback when items=[] + renderEmpty supplied', () => {
    render(
      <LibraryGrid
        items={[]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
        renderEmpty={() => <div data-testid="empty-test">EMPTY</div>}
      />,
    );
    expect(screen.getByTestId('empty-test')).toBeInTheDocument();
  });

  it('Arrow-right navigates to the next card', async () => {
    const user = userEvent.setup();
    render(
      <LibraryGrid
        items={[mk('a'), mk('b'), mk('c')]}
        removedIds={new Set()}
        selectMode={false}
        onActivate={() => {}}
        onToggleSelect={() => {}}
      />,
    );
    const first = screen.getByTestId('library-card-a');
    first.focus();
    await user.keyboard('{ArrowRight}');
    // The next card receives focus through the roving tabindex mechanism.
    expect(screen.getByTestId('library-card-b')).toHaveAttribute('tabindex', '0');
  });
});

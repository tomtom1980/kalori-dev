import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryClient } from '@/app/(app)/library/_components/LibraryClient';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} {...rest} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: vi.fn(),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

function item(index: number, name = `Food ${String(index).padStart(2, '0')}`): LibraryItem {
  return {
    id: `item-${index}`,
    client_id: `client-${index}`,
    display_name: name,
    normalized_name: name.toLowerCase(),
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 100 + index, macros: { protein_g: 5, carbs_g: 10, fat_g: 2 } },
    thumbnail_url: null,
    log_count: 1,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
  };
}

function cardButtons(container: HTMLElement): HTMLElement[] {
  // Bug 3 (library overhaul 2026-05-16) — card root refactored from
  // `<button>` to `<div role="button">` to host the kebab menu trigger.
  // Selector now keys on the testid prefix alone.
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="library-card-item-"]'));
}

describe('<LibraryClient /> pagination', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    useLibrarySelectionStore.getState().clear();
  });

  it('shows only 10 real cards on the first page and the remaining real cards on page 2', async () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i + 1));
    const { container } = render(<LibraryClient initial={items} uid="user-1" />);

    expect(cardButtons(container)).toHaveLength(10);
    expect(screen.getByTestId('library-card-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-item-10')).toBeInTheDocument();
    expect(screen.queryByTestId('library-card-item-11')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-grid-pad-cell')).not.toBeInTheDocument();
    expect(screen.getByTestId('library-pagination')).toBeInTheDocument();
    expect(screen.getByTestId('library-pagination-top')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('library-pagination-top-next'));

    await waitFor(() => {
      expect(screen.getByTestId('library-card-item-11')).toBeInTheDocument();
    });
    expect(cardButtons(container)).toHaveLength(2);
    expect(screen.getByTestId('library-card-item-12')).toBeInTheDocument();
    expect(screen.queryByTestId('library-card-item-1')).not.toBeInTheDocument();
  });

  it('filters first, hides pagination when filtered results fit on one page, and renders no empty cards', async () => {
    const items = [
      ...Array.from({ length: 9 }, (_, i) => item(i + 1)),
      item(10, 'Apple Bowl'),
      item(11, 'Apple Toast'),
      item(12, 'Apple Yogurt'),
    ];
    const { container } = render(<LibraryClient initial={items} uid="user-1" />);

    await userEvent.click(screen.getByTestId('library-pagination-next'));
    expect(await screen.findByTestId('library-card-item-8')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('library-search-input'), 'apple');

    await waitFor(() => {
      expect(screen.queryByTestId('library-pagination')).not.toBeInTheDocument();
    });
    expect(cardButtons(container)).toHaveLength(3);
    expect(screen.getByTestId('library-card-item-10')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-item-11')).toBeInTheDocument();
    expect(screen.getByTestId('library-card-item-12')).toBeInTheDocument();
    expect(screen.queryByTestId('library-card-item-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-grid-pad-cell')).not.toBeInTheDocument();
  });
});

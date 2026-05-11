/**
 * <LibraryCard /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryCard } from '@/app/(app)/library/_components/LibraryCard';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';

// Mock next/image so happy-dom doesn't care about intrinsic width/height.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} {...rest} />
  ),
}));

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'a',
    client_id: 'c-a',
    display_name: 'Banh Mi',
    normalized_name: 'banh mi',
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 450, macros: { protein_g: 20, carbs_g: 60, fat_g: 12 } },
    thumbnail_url: null,
    log_count: 5,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(opts: {
  selectMode?: boolean;
  thumbnail_url?: string | null;
  onActivate?: () => void;
  onToggleSelect?: () => void;
}) {
  const onActivate = opts.onActivate ?? vi.fn();
  const onToggleSelect = opts.onToggleSelect ?? vi.fn();
  const utils = render(
    <LibraryCard
      item={item({ thumbnail_url: opts.thumbnail_url ?? null })}
      index={0}
      selectMode={Boolean(opts.selectMode)}
      isActive
      onActivate={onActivate}
      onToggleSelect={onToggleSelect}
      onFocus={() => {}}
    />,
  );
  return { ...utils, onActivate, onToggleSelect };
}

describe('<LibraryCard />', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
  });

  it('browse mode: role=button + activates on click', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    renderCard({ onActivate });
    const card = screen.getByTestId('library-card-a');
    expect(card).toHaveAttribute('role', 'button');
    await user.click(card);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('select mode: role=checkbox + toggles on click', async () => {
    const onToggleSelect = vi.fn();
    const user = userEvent.setup();
    renderCard({ selectMode: true, onToggleSelect });
    const card = screen.getByTestId('library-card-a');
    expect(card).toHaveAttribute('role', 'checkbox');
    expect(card).toHaveAttribute('aria-checked', 'false');
    await user.click(card);
    expect(onToggleSelect).toHaveBeenCalledWith('a');
  });

  it('reflects aria-checked=true when Zustand selection contains the id', () => {
    useLibrarySelectionStore.getState().add('a');
    renderCard({ selectMode: true });
    expect(screen.getByTestId('library-card-a')).toHaveAttribute('aria-checked', 'true');
  });

  it('Enter key activates the card', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    renderCard({ onActivate });
    const card = screen.getByTestId('library-card-a');
    card.focus();
    await user.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalled();
  });

  it('renders letter-mark when thumbnail_url is null', () => {
    renderCard({ thumbnail_url: null });
    expect(screen.getByTestId('library-card-lettermark-a')).toBeInTheDocument();
  });

  it('renders <img> when thumbnail_url is present', () => {
    renderCard({ thumbnail_url: 'https://example.com/x.webp' });
    expect(screen.getByTestId('library-card-thumb-a')).toBeInTheDocument();
  });
});

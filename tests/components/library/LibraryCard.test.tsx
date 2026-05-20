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
    thumbnail_kind: null,
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

  it('renders approximate grams metadata under whole-style portions', () => {
    render(
      <LibraryCard
        item={item({
          default_portion: 1,
          default_unit: 'bowl',
          nutrition: {
            kcal: 450,
            macros: { protein_g: 20, carbs_g: 60, fat_g: 12 },
            approxGrams: 420,
          },
        })}
        index={0}
        selectMode={false}
        isActive
        onActivate={vi.fn()}
        onToggleSelect={vi.fn()}
        onFocus={() => {}}
      />,
    );

    expect(screen.getByText(/approx\. 420 g/i)).toBeInTheDocument();
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

  // Bug 2 (library overhaul 2026-05-16) — pending cue while the route
  // transition runs. The card itself does not own `useTransition` (the
  // parent passes `isPending` down) so the test verifies the wiring
  // contract by injecting a `pending` prop.
  it('renders aria-busy + data-pending when `pending` prop is true (Bug 2)', () => {
    render(
      <LibraryCard
        item={item({ thumbnail_url: null })}
        index={0}
        selectMode={false}
        isActive
        onActivate={vi.fn()}
        onToggleSelect={vi.fn()}
        onFocus={() => {}}
        pending
      />,
    );
    const card = screen.getByTestId('library-card-a');
    expect(card).toHaveAttribute('aria-busy', 'true');
    expect(card).toHaveAttribute('data-pending', 'true');
  });

  // Bug 3 (library overhaul 2026-05-16) — per-card quick-action menu.
  describe('quick-action menu (Bug 3)', () => {
    it('renders the menu trigger in browse mode', () => {
      render(
        <LibraryCard
          item={item({ thumbnail_url: null })}
          index={0}
          selectMode={false}
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
        />,
      );
      expect(screen.getByTestId('library-card-menu-trigger-a')).toBeInTheDocument();
    });

    it('hides the menu trigger in selectMode (display:none — leaves tab order)', () => {
      render(
        <LibraryCard
          item={item({ thumbnail_url: null })}
          index={0}
          selectMode
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('library-card-menu-trigger-a')).not.toBeInTheDocument();
    });

    it('clicking the menu trigger does NOT activate the card (stopPropagation)', async () => {
      const onActivate = vi.fn();
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null })}
          index={0}
          selectMode={false}
          isActive
          onActivate={onActivate}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('library-card-menu-trigger-a'));
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('clicking Edit in the menu calls onCardEdit, not onActivate', async () => {
      const onActivate = vi.fn();
      const onCardEdit = vi.fn();
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null })}
          index={0}
          selectMode={false}
          isActive
          onActivate={onActivate}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={onCardEdit}
          onCardDelete={vi.fn()}
        />,
      );
      await user.click(screen.getByTestId('library-card-menu-trigger-a'));
      await user.click(await screen.findByTestId('library-card-menu-edit-a'));
      expect(onCardEdit).toHaveBeenCalledTimes(1);
      expect(onCardEdit).toHaveBeenCalledWith('a');
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('clicking Delete in the menu calls onCardDelete, not onActivate', async () => {
      const onActivate = vi.fn();
      const onCardDelete = vi.fn();
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null })}
          index={0}
          selectMode={false}
          isActive
          onActivate={onActivate}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={onCardDelete}
        />,
      );
      await user.click(screen.getByTestId('library-card-menu-trigger-a'));
      await user.click(await screen.findByTestId('library-card-menu-delete-a'));
      expect(onCardDelete).toHaveBeenCalledTimes(1);
      expect(onCardDelete).toHaveBeenCalledWith('a');
      expect(onActivate).not.toHaveBeenCalled();
    });

    it('shows Create recipe only for recipe-eligible items', async () => {
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null, recipe_eligibility: 'eligible' })}
          index={0}
          selectMode={false}
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
          onCardQuickLog={vi.fn()}
          onCardCreateRecipe={vi.fn()}
        />,
      );

      await user.click(screen.getByTestId('library-card-menu-trigger-a'));

      expect(await screen.findByTestId('library-card-menu-create-recipe-a')).toBeInTheDocument();
    });

    it('hides Create recipe for ineligible items', async () => {
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null, recipe_eligibility: 'ineligible' })}
          index={0}
          selectMode={false}
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
          onCardQuickLog={vi.fn()}
          onCardCreateRecipe={vi.fn()}
        />,
      );

      await user.click(screen.getByTestId('library-card-menu-trigger-a'));

      expect(screen.queryByTestId('library-card-menu-create-recipe-a')).not.toBeInTheDocument();
    });

    it('clicking Create recipe calls onCardCreateRecipe, not onActivate', async () => {
      const onActivate = vi.fn();
      const onCardCreateRecipe = vi.fn();
      const user = userEvent.setup();
      render(
        <LibraryCard
          item={item({ thumbnail_url: null, recipe_eligibility: 'eligible' })}
          index={0}
          selectMode={false}
          isActive
          onActivate={onActivate}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
          onCardEdit={vi.fn()}
          onCardDelete={vi.fn()}
          onCardQuickLog={vi.fn()}
          onCardCreateRecipe={onCardCreateRecipe}
        />,
      );

      await user.click(screen.getByTestId('library-card-menu-trigger-a'));
      await user.click(await screen.findByTestId('library-card-menu-create-recipe-a'));

      expect(onCardCreateRecipe).toHaveBeenCalledWith('a');
      expect(onActivate).not.toHaveBeenCalled();
    });
  });

  // Bug 10 (library overhaul 2026-05-16) — hover/focus animation CSS rules.
  // JSDOM cannot compute :hover/:focus-visible pseudo styles reliably, so
  // assert CSS-rule-existence (per Bug 10 proposal §"Pattern" line).
  describe('hover/focus animation CSS rules (Bug 10)', () => {
    async function loadGlobalsCss(): Promise<string> {
      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      return readFile(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    }

    it('declares hover+focus-visible wake-up rule on background (combined selector)', async () => {
      const css = await loadGlobalsCss();
      // Combined selector — hover AND focus-visible must both trigger
      // the bg-1 wake-up so keyboard-focus parity is honored.
      expect(css).toMatch(
        /\.kalori-library-card:hover[^{]*,\s*\.kalori-library-card:focus-visible[^{]*\{[^}]*background-color:\s*var\(--color-bg-1\)/,
      );
    });

    it('declares idle opacity 0.85 + opacity transition on thumb image', async () => {
      const css = await loadGlobalsCss();
      expect(css).toMatch(/\.kalori-library-card-thumb img\s*\{[^}]*opacity:\s*0\.85/);
      expect(css).toMatch(/\.kalori-library-card-thumb img\s*\{[^}]*transition:[^;]*opacity/);
    });

    it('declares hover+focus opacity:1 on thumb image (combined selector)', async () => {
      const css = await loadGlobalsCss();
      // Either combined selector or separate :hover-only AND :focus-visible
      // rules both set opacity to 1.
      expect(css).toMatch(
        /\.kalori-library-card:hover\s+\.kalori-library-card-thumb img[^,]*,\s*\.kalori-library-card:focus-visible\s+\.kalori-library-card-thumb img\s*\{[^}]*opacity:\s*1/,
      );
    });

    it('declares idle filter brightness(0.9) on letter-mark and brighten on hover/focus', async () => {
      const css = await loadGlobalsCss();
      expect(css).toMatch(/\.kalori-library-card-lettermark\s*\{[^}]*filter:\s*brightness\(0\.9\)/);
      expect(css).toMatch(
        /\.kalori-library-card:hover\s+\.kalori-library-card-lettermark[^,]*,\s*\.kalori-library-card:focus-visible\s+\.kalori-library-card-lettermark\s*\{[^}]*filter:\s*brightness/,
      );
    });

    it('reduced-motion gate: prefers-reduced-motion + html[data-reduce-motion="1"] both collapse transitions', async () => {
      const css = await loadGlobalsCss();
      // OS pref media query
      expect(css).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.kalori-library-card[\s\S]*?transition-duration:\s*1ms/,
      );
      // In-app toggle mirror
      expect(css).toMatch(
        /html\[data-reduce-motion=['"]1['"]\][\s\S]*?\.kalori-library-card[\s\S]*?transition-duration:\s*1ms/,
      );
    });

    it('pending state (data-pending=true) appears after hover rule so pending wins specificity', async () => {
      const css = await loadGlobalsCss();
      // Locate the indexes — pending block must come AFTER the hover block
      // so its `opacity: 0.7` overrides the hover wake-up.
      const hoverMatch = css.search(
        /\.kalori-library-card:hover[^{]*,\s*\.kalori-library-card:focus-visible/,
      );
      const pendingMatch = css.search(/\.kalori-library-card\[data-pending=['"]true['"]\]/);
      expect(hoverMatch).toBeGreaterThan(-1);
      expect(pendingMatch).toBeGreaterThan(-1);
      // Pending block lives AFTER hover block.
      expect(pendingMatch).toBeGreaterThan(hoverMatch);
    });
  });

  // Bug 5 (library overhaul 2026-05-16) — sketch attribute on the thumbnail
  // image so CSS / tests can discriminate sketch vs photo without an extra
  // class. Driven from `thumbnail_kind === 'sketch'`.
  describe('sketch attribute (Bug 5)', () => {
    it('image carries data-sketch="true" when thumbnail_kind="sketch"', () => {
      render(
        <LibraryCard
          item={item({
            thumbnail_url: 'https://signed.test/sketch.webp',
            thumbnail_kind: 'sketch',
          })}
          index={0}
          selectMode={false}
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
        />,
      );
      const img = screen.getByTestId('library-card-thumb-a');
      expect(img).toHaveAttribute('data-sketch', 'true');
    });

    it('image does NOT carry data-sketch when thumbnail_kind="photo"', () => {
      render(
        <LibraryCard
          item={item({
            thumbnail_url: 'https://signed.test/photo.webp',
            thumbnail_kind: 'photo',
          })}
          index={0}
          selectMode={false}
          isActive
          onActivate={vi.fn()}
          onToggleSelect={vi.fn()}
          onFocus={() => {}}
        />,
      );
      const img = screen.getByTestId('library-card-thumb-a');
      expect(img).not.toHaveAttribute('data-sketch');
    });
  });
});

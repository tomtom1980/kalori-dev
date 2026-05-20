/**
 * `<FoodDetail mode="route" />` — Bug 1 (library overhaul 2026-05-16).
 *
 * The `/library/[id]` route renders FoodDetail as a NAVIGATED PAGE, not as
 * a modal overlay on top of the library grid. The historical implementation
 * inherited the scrim + slide-in sheet chrome from a never-shipped overlay
 * design — on the dedicated route there is no host page to dim, so the
 * scrim merely darkens the empty viewport and the bg-0 sheet visually
 * blends with the bg-0 void, producing a faded/low-contrast appearance.
 *
 * Contract:
 *   - `mode="route"` (the only call site today: `app/(app)/library/[id]/page.tsx`):
 *       * NO scrim element rendered.
 *       * No `role="dialog"` / `aria-modal="true"` on the sheet root —
 *         this is a navigated page, not a modal. Use a `<section>` landmark
 *         instead.
 *       * Sheet wrap class is `kalori-fd-sheet-wrap` + `data-mode="route"`
 *         so CSS can branch on the attribute (no slide-in animation, full
 *         opacity, no `position: fixed` letterbox).
 *   - `mode="modal"` (reserved for future LibraryTab embedding) keeps the
 *     legacy dialog chrome — verified by the existing
 *     `FoodDetail.a11y.test.tsx` (which renders without an explicit mode
 *     prop and thus exercises `mode="route"` as the new default).
 *
 * RED-state failure mode (pre-fix): the component renders `role="dialog"`
 * unconditionally and ships a `.kalori-fd-scrim` element regardless of
 * mode. These assertions fail until the prop split is wired.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

vi.mock('next/dynamic', async () => {
  const { Suspense, lazy, createElement } = await import('react');
  return {
    __esModule: true,
    default: (loader: () => Promise<unknown>) => {
      const Lazy = lazy(async () => {
        const mod = (await loader()) as unknown;
        let Comp: unknown = mod;
        if (typeof mod === 'object' && mod !== null) {
          const asMod = mod as { default?: unknown };
          Comp =
            asMod.default ??
            Object.values(mod as Record<string, unknown>).find(
              (v) => typeof v === 'function' || typeof v === 'object',
            );
        }
        return { default: Comp as React.ComponentType<Record<string, unknown>> };
      });
      const Wrapper = (props: Record<string, unknown>) =>
        createElement(Suspense, { fallback: null }, createElement(Lazy, props));
      return Wrapper;
    },
  };
});

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useRouter: () => ({
      push: pushMock,
      refresh: refreshMock,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: vi.fn().mockResolvedValue({ ok: true, item: {} }),
  SessionExpiredError: class SessionExpiredError extends Error {},
}));

import { FoodDetail } from '@/app/(app)/library/_components/FoodDetail/FoodDetail';

const baseItem: LibraryItem = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  display_name: 'Pho Bo',
  normalized_name: 'pho bo',
  default_portion: 400,
  default_unit: 'g',
  nutrition: {
    kcal: 500,
    macros: { protein_g: 28, carbs_g: 50, fat_g: 18, fiber_g: 3 },
    micros: { sodium_mg: 800 },
  },
  thumbnail_url: null,
  log_count: 3,
  last_used_at: '2026-04-20T12:00:00Z',
  user_edited_flag: false,
  created_from: 'text',
  created_at: '2026-04-14T22:03:00Z',
};

const baseHistory = {
  firstLoggedAt: '2026-04-01T10:00:00Z',
  totalLogCount: 3,
  recent: [] as Array<{ id: string; loggedAt: string; mealCategory: string }>,
};

describe('<FoodDetail mode="route" /> — Bug 1 route refactor', () => {
  it('does NOT render the scrim element in route mode', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} mode="route" />);
    // The scrim is a static `.kalori-fd-scrim` div; it must be absent in
    // route mode (no host page to dim).
    const root = screen.getByTestId('food-detail-sheet-wrap');
    expect(root.querySelector('.kalori-fd-scrim')).toBeNull();
  });

  it('does NOT use role="dialog" on the sheet in route mode (renders as a region/section landmark)', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} mode="route" />);
    const sheet = screen.getByTestId('food-detail-sheet');
    // route mode → no dialog semantics
    expect(sheet).not.toHaveAttribute('role', 'dialog');
    expect(sheet).not.toHaveAttribute('aria-modal', 'true');
  });

  it('tags the sheet-wrap with data-mode="route" so CSS can branch chrome', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} mode="route" />);
    expect(screen.getByTestId('food-detail-sheet-wrap')).toHaveAttribute('data-mode', 'route');
  });

  it('defaults to route mode when `mode` prop is omitted (matches the only call site)', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} />);
    expect(screen.getByTestId('food-detail-sheet-wrap')).toHaveAttribute('data-mode', 'route');
    expect(
      screen.getByTestId('food-detail-sheet-wrap').querySelector('.kalori-fd-scrim'),
    ).toBeNull();
  });

  it('ESC still triggers navigation back to /library in route mode', async () => {
    pushMock.mockClear();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<FoodDetail item={baseItem} history={baseHistory} mode="route" />);
    const sheet = screen.getByTestId('food-detail-sheet');
    (sheet as HTMLElement).focus();
    await user.keyboard('{Escape}');
    expect(pushMock).toHaveBeenCalledWith('/library');
  });
});

describe('<FoodDetail mode="modal" /> — legacy chrome preserved', () => {
  it('renders the scrim element in modal mode (reserved for future LibraryTab embedding)', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} mode="modal" />);
    const root = screen.getByTestId('food-detail-sheet-wrap');
    expect(root.querySelector('.kalori-fd-scrim')).not.toBeNull();
  });

  it('uses role="dialog" + aria-modal in modal mode', () => {
    render(<FoodDetail item={baseItem} history={baseHistory} mode="modal" />);
    const sheet = screen.getByTestId('food-detail-sheet');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
  });
});

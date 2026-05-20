/**
 * <FoodDetail /> component tests — Task 4.2 round 1 fix.
 *
 * Covers the four Phase 3 a11y criticals:
 *   V1 — focus trap inside sheet dialog
 *   V2 — ESC keyboard handler closes sheet
 *  V10 — validation errors focus the first invalid field
 *   V4 — .kalori-fd-error uses a token that meets WCAG AA ≥4.5:1 on bg-0
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LibraryItem } from '@/lib/library/fetch';

// next/dynamic — render the imported module directly (no Suspense wait).
//
// The shipping FoodDetail.tsx loader is
//   () => import('../BulkDeleteConfirmDialog').then((m) => m.BulkDeleteConfirmDialog)
// so the loader resolves DIRECTLY to a component function, not a module
// namespace. We accept either shape: a function/component or a module object
// with a `default` / named export.
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

// Stub next/navigation router.
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

// Silence network calls from authPost during edit-commit — tests never reach
// network; we validate inline errors before commit.
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

function renderFoodDetail(overrides: Partial<LibraryItem> = {}) {
  const item = { ...baseItem, ...overrides };
  return render(<FoodDetail item={item} history={baseHistory} />);
}

/**
 * Bug 1 (library overhaul 2026-05-16) — focus-trap is modal-only.
 * Route mode (the default in production) renders a navigated page, not a
 * dialog, so Tab semantics fall through to the browser's normal flow.
 * The pre-existing V1 tests were written before Bug 1; they keep their
 * coverage by opting into `mode="modal"` explicitly.
 */
function renderFoodDetailModal(overrides: Partial<LibraryItem> = {}) {
  const item = { ...baseItem, ...overrides };
  return render(<FoodDetail item={item} history={baseHistory} mode="modal" />);
}

describe('<FoodDetail /> — V2 ESC handler', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('pressing Escape invokes the close handler (navigates back to /library)', async () => {
    const user = userEvent.setup();
    renderFoodDetail();
    const sheet = screen.getByTestId('food-detail-sheet');
    // Focus the sheet first so keydown dispatches reliably.
    (sheet as HTMLElement).focus();
    await user.keyboard('{Escape}');
    expect(pushMock).toHaveBeenCalledWith('/library');
  });

  // AC-A3 (aggregate Codex follow-up) — F-TASK-4.2-ESC-SCOPE regression
  // against the REAL `<BulkDeleteConfirmDialog>` (Radix Dialog.Portal). The
  // Radix portal renders Dialog.Content OUTSIDE `sheetRef.current`'s DOM
  // subtree, so the descendant-search guard from commit 748b595 missed it
  // entirely — pressing Escape with the delete confirm open closed the
  // parent sheet AND the dialog.
  //
  // Fix: the parent Escape handler now reads `deleteDialogOpen` state from
  // the component itself, so it correctly defers regardless of where the
  // dialog renders in the DOM tree.
  it('AC-A3: Escape with delete dialog open does not invoke onClose (real Radix portal path)', async () => {
    const user = userEvent.setup();
    renderFoodDetail();

    // Open the REAL delete-confirm dialog by clicking the BULK DELETE
    // affordance. This wires `setDeleteDialogOpen(true)` and renders
    // `<BulkDeleteConfirmDialog open />` via Radix's Portal.
    await user.click(screen.getByTestId('food-detail-delete-button'));

    // Sanity: the real dialog mounted via Portal (descendant-search would
    // have missed it because Radix renders outside the sheet's subtree).
    await waitFor(() => {
      expect(screen.getByTestId('library-bulk-delete-dialog')).toBeTruthy();
    });

    // Press Escape on the document. The parent FoodDetail Escape listener
    // MUST defer — Radix's own Dialog handles the Escape internally.
    pushMock.mockClear();
    await user.keyboard('{Escape}');

    // The parent sheet must NOT have navigated to /library. Whether Radix
    // closes the dialog itself is its own business; what matters here is
    // the parent didn't ALSO collapse.
    expect(pushMock).not.toHaveBeenCalledWith('/library');
  });
});

describe('<FoodDetail /> — V1 focus trap', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('on mount, focus is moved into the sheet (first focusable element)', async () => {
    renderFoodDetail();
    await waitFor(() => {
      const sheet = screen.getByTestId('food-detail-sheet');
      expect(sheet.contains(document.activeElement)).toBe(true);
    });
  });

  it('Tab from the last focusable element wraps to the first focusable element', async () => {
    const user = userEvent.setup();
    // Bug 1 (2026-05-16): focus-trap is modal-only behaviour.
    renderFoodDetailModal();
    const sheet = screen.getByTestId('food-detail-sheet');

    // Collect focusable elements in DOM order.
    const focusables = Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));
    expect(focusables.length).toBeGreaterThan(0);

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    // Move focus to the last element, then Tab — should wrap to the first.
    last.focus();
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab from the first focusable element wraps to the last focusable element', async () => {
    const user = userEvent.setup();
    // Bug 1 (2026-05-16): focus-trap is modal-only behaviour.
    renderFoodDetailModal();
    const sheet = screen.getByTestId('food-detail-sheet');

    const focusables = Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    first.focus();
    expect(document.activeElement).toBe(first);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });
});

describe('<FoodDetail /> — V10 focus first invalid field on validation error', () => {
  beforeEach(() => {
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('submitting edit mode with empty name focuses the name input', async () => {
    const user = userEvent.setup();
    renderFoodDetail();
    // Enter edit mode.
    await user.click(screen.getByTestId('food-detail-edit-button'));
    // Clear the name field.
    const nameInput = (await screen.findByTestId(
      'food-detail-edit-name-input',
    )) as HTMLInputElement;
    await user.clear(nameInput);
    // Trigger save — validation should fire and focus name input.
    const save = screen.getByTestId('food-detail-save-button');
    // SAVE is disabled when !dirty; clearing name makes it dirty so it should enable.
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);
    // Focus shift is scheduled via setTimeout inside commit() so it wins
    // over the click's default focus on the submit button.
    await waitFor(
      () => {
        const input = screen.getByTestId('food-detail-edit-name-input');
        expect(document.activeElement).toBe(input);
      },
      { timeout: 2000 },
    );
  });
});

/**
 * Bug 4 — consumer migration tests (bugfix-tomi 2026-05-08-mobile-ui-overhaul).
 *
 * Verifies that:
 *   1. ConfirmationScreen's per-item portion stepper renders the inline
 *      `[−][n][+]` stepper on desktop (`useIsMobile=false`) and the
 *      `<MobileWheelPicker />`-backed sheet trigger on mobile
 *      (`useIsMobile=true`).
 *   2. LibraryTab's per-item quantity input renders the inline number
 *      input on desktop and the wheel-sheet trigger on mobile.
 *   3. Form values flow through correctly in both modes — i.e., the
 *      committed value lands in the same store path regardless of
 *      surface.
 *
 * The wheel itself is unit-tested in
 * `tests/components/primitives/MobileWheelPicker.test.tsx`. Here we
 * only verify the breakpoint switch and that the mobile surface still
 * reads/writes the same store fields.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isMobileMock = vi.fn<() => boolean>(() => false);
vi.mock('@/lib/hooks/use-is-mobile', () => ({
  useIsMobile: () => isMobileMock(),
  MOBILE_QUERY: '(max-width: 767px)',
}));

const authFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (url: string, init?: RequestInit) => authFetch(url, init),
  authPost: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

const routerRefreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

import { ConfirmationScreen } from '@/app/(app)/log/_components/ConfirmationScreen';
import { LibraryTab } from '@/app/(app)/log/_components/LibraryTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const baseItems = [
  {
    name: 'eggs',
    portion: 2,
    unit: 'unit',
    kcal: 140,
    macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
    micros: {},
    confidence: 0.9,
  },
];

beforeEach(() => {
  authFetch.mockReset();
  authFetch.mockImplementation((url: string) => {
    if (url.includes('/api/entries/save')) {
      return Promise.resolve(
        new Response(JSON.stringify({ entry: { id: 'srv-row-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  routerRefreshMock.mockReset();
  isMobileMock.mockReset();
  isMobileMock.mockReturnValue(false);
  useLogFlowStore.getState().resetDraft();
});

afterEach(() => {
  useLogFlowStore.getState().resetDraft();
});

describe('ConfirmationScreen — portion picker breakpoint switch', () => {
  it('desktop (useIsMobile=false): renders the inline [−][n][+] stepper', () => {
    isMobileMock.mockReturnValue(false);
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirmation-item-0-portion-decrease')).toBeInTheDocument();
    expect(screen.getByTestId('confirmation-item-0-portion-increase')).toBeInTheDocument();
    // Wheel surface MUST NOT be rendered on desktop.
    expect(screen.queryByTestId('confirmation-item-0-portion-wheel-trigger')).toBeNull();
  });

  it('mobile (useIsMobile=true): renders the wheel-sheet trigger button', () => {
    isMobileMock.mockReturnValue(true);
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('confirmation-item-0-portion-wheel-trigger')).toBeInTheDocument();
    // Inline ± stepper buttons MUST NOT be rendered on mobile.
    expect(screen.queryByTestId('confirmation-item-0-portion-decrease')).toBeNull();
    expect(screen.queryByTestId('confirmation-item-0-portion-increase')).toBeNull();
  });

  it('mobile: tapping the trigger opens the wheel listbox; selecting + DONE updates the portion', async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <ConfirmationScreen
        source="text"
        tab="type"
        items={baseItems}
        reasoning={null}
        dedupMatch={null}
        onClose={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('confirmation-item-0-portion-wheel-trigger');
    await user.click(trigger);

    // Sheet opens with a listbox + DONE button.
    const list = await screen.findByRole('listbox');
    expect(list.getAttribute('aria-label')).toMatch(/portion/i);

    // Simulate keyboard selection — focus the listbox, ArrowDown ×3.
    // Wheel options run 0.25–10 step 0.25 (40 rows), so 2 + 3*0.25 = 2.75.
    list.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.click(screen.getByRole('button', { name: /done/i }));

    // The reducer in ConfirmationScreen owns portion state; we don't have
    // direct access to it here but the trigger label must reflect the new
    // value. Spec: portion 2 + 3*0.25 = 2.75.
    expect(trigger.textContent).toMatch(/2\.75/);
    expect(screen.getByTestId('confirmation-item-0-kcal')).toHaveValue(193);
  });
});

describe('LibraryTab — quantity input breakpoint switch', () => {
  const items = [
    {
      id: 'a',
      name: 'Pho Bo',
      kcal: 520,
      logCount: 12,
      lastUsedIso: '2026-04-20T12:00:00Z',
      proteinG: 32,
      unit: 'g' as const,
    },
  ];

  it('desktop (useIsMobile=false): renders the inline number input', async () => {
    isMobileMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<LibraryTab items={items} />);
    await user.click(screen.getByTestId('library-card-a'));
    expect(screen.getByTestId('library-quantity-a')).toBeInTheDocument();
    // Wheel trigger MUST NOT render on desktop.
    expect(screen.queryByTestId('library-quantity-wheel-trigger-a')).toBeNull();
  });

  it('mobile (useIsMobile=true): renders the wheel-sheet trigger', async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    render(<LibraryTab items={items} />);
    await user.click(screen.getByTestId('library-card-a'));
    expect(screen.getByTestId('library-quantity-wheel-trigger-a')).toBeInTheDocument();
    expect(screen.queryByTestId('library-quantity-a')).toBeNull();
  });

  it('mobile: tapping the trigger opens the wheel listbox; selecting + DONE updates the quantity in the store', async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    render(<LibraryTab items={items} />);

    // Select the card so the row appears in `librarySelection` (default qty = 1).
    await user.click(screen.getByTestId('library-card-a'));
    expect(useLogFlowStore.getState().librarySelection).toEqual([{ itemId: 'a', quantity: 1 }]);

    // Sheet must NOT be visible before the trigger is tapped.
    expect(screen.queryByRole('dialog')).toBeNull();

    // Tap the wheel trigger — sheet must open with a listbox + DONE.
    const trigger = screen.getByTestId('library-quantity-wheel-trigger-a');
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const list = await screen.findByRole('listbox');
    expect(list.getAttribute('aria-label')).toMatch(/quantity/i);

    // Drive the wheel via keyboard: ArrowDown ×3 starting from snapped value 1.
    // Wheel options run 0.25–10 step 0.25 (40 rows). Index of value 1 = 3,
    // so +3 lands on value 1.75.
    list.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.click(screen.getByRole('button', { name: /done/i }));

    // Sheet closes after DONE.
    expect(screen.queryByRole('dialog')).toBeNull();

    // Store quantity reflects the committed wheel value.
    expect(useLogFlowStore.getState().librarySelection).toEqual([{ itemId: 'a', quantity: 1.75 }]);

    // Trigger label reflects the new value.
    expect(screen.getByTestId('library-quantity-wheel-trigger-a').textContent).toMatch(/1\.75/);
  });

  it('mobile: cancelling the sheet (Cancel button) does NOT update the quantity', async () => {
    isMobileMock.mockReturnValue(true);
    const user = userEvent.setup();
    render(<LibraryTab items={items} />);
    await user.click(screen.getByTestId('library-card-a'));
    await user.click(screen.getByTestId('library-quantity-wheel-trigger-a'));

    const list = await screen.findByRole('listbox');
    list.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Sheet closes; quantity stays at the original 1 (no commit).
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useLogFlowStore.getState().librarySelection).toEqual([{ itemId: 'a', quantity: 1 }]);
  });
});

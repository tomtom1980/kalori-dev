/**
 * F-UI-3.6-C-1 (I4 Undo TTL delay-on-TTL) — MealEntryContextTrigger tests.
 *
 * The OLD handler at `components/dashboard/MealEntryContextTrigger.tsx:96`
 * fired the server DELETE immediately and pushed an undo toast whose
 * `revert` callback only restored local `hidden` state. On navigation the
 * component unmounted; the server row was already deleted with no recovery
 * path — violates I4 (5s TTL authoritative, survives nav).
 *
 * Fix: delay the server DELETE until the undo-toast 5s TTL elapses (the
 * `commit` callback fires the DELETE). `revert` runs when the user clicks
 * UNDO; DELETE is never issued. The undo-toast infrastructure
 * (`useUndoQueueStore`) is already mounted at the chrome layout layer via
 * `<UndoToastMount />`, so the 5s countdown survives route changes.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryRowActions } from '@/components/dashboard/MealEntryContextTrigger';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import type { FoodEntry } from '@/lib/dashboard/types';

const authFetchSpy = vi.fn<(...args: unknown[]) => Promise<Response>>();

vi.mock('@/lib/auth/refresh-interceptor', async () => {
  const actual = (await vi.importActual(
    '@/lib/auth/refresh-interceptor',
  )) as typeof import('@/lib/auth/refresh-interceptor');
  return {
    ...actual,
    authFetch: (...args: unknown[]) => authFetchSpy(...args),
  };
});

vi.mock('@/lib/a11y/announce', () => ({
  announcePolite: vi.fn(),
}));

const routerRefreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

function makeEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: 'entry-1',
    client_id: '11111111-1111-4111-8111-111111111111',
    logged_at: '2026-04-22T08:00:00.000Z',
    meal_category: 'breakfast',
    source: 'text',
    library_item_id: null,
    items: [
      {
        name: 'Eggs',
        portion: 100,
        unit: 'g',
        kcal: 150,
        macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
        micros: {},
        confidence: 0.9,
      },
    ],
    ai_reasoning: null,
    ...overrides,
  };
}

describe('<EntryRowActions /> — F-UI-3.6-C-1 delay-on-TTL delete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authFetchSpy.mockReset();
    authFetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    routerRefreshMock.mockReset();
    // Reset the undo queue between tests.
    useUndoQueueStore.setState({ stack: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function openMenuAndDelete(entry = makeEntry()): { unmount: () => void } {
    const { container, unmount } = render(<EntryRowActions entry={entry} />);
    const trigger = container.querySelector(
      `[data-testid="entry-menu-${entry.id}"]`,
    ) as HTMLButtonElement | null;
    if (!trigger) throw new Error('entry menu trigger not found');
    fireEvent.click(trigger);
    const menuItems = container.querySelectorAll('[role="menuitem"]');
    const deleteItem = menuItems[0] as HTMLButtonElement | undefined;
    if (!deleteItem) throw new Error('delete menu item not found');
    act(() => {
      deleteItem.click();
    });
    return { unmount };
  }

  it('hides the row optimistically and does NOT fire server DELETE before the 5s TTL elapses', () => {
    const entry = makeEntry();
    openMenuAndDelete(entry);

    // A toast was pushed onto the queue.
    const stack = useUndoQueueStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0]?.kind).toBe('deleted');

    // BEFORE TTL elapses: server DELETE must not have been called.
    expect(authFetchSpy).not.toHaveBeenCalled();
  });

  it('fires the server DELETE when the 5s TTL elapses with no undo', async () => {
    const entry = makeEntry();
    openMenuAndDelete(entry);

    expect(authFetchSpy).not.toHaveBeenCalled();

    // Advance past the 5000 ms TTL; the store runs `commit()` which fires
    // the server DELETE.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(authFetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = authFetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe(`/api/entries/${entry.id}?client_id=${entry.client_id}`);
    expect((init as RequestInit)?.method).toBe('DELETE');
  });

  it('clicking UNDO within the 5s window cancels the pending delete — server DELETE is never issued', async () => {
    const entry = makeEntry();
    openMenuAndDelete(entry);

    // Pre-TTL: invoke the same public API the UndoToast button uses.
    await act(async () => {
      await useUndoQueueStore.getState().undoTop();
    });

    // Fast-forward well past the TTL — the cleared timer must not fire.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(authFetchSpy).not.toHaveBeenCalled();
    // Stack is cleared — the entry was undone.
    expect(useUndoQueueStore.getState().stack).toHaveLength(0);
  });

  it('after component unmount (nav away), TTL-elapse still fires server DELETE — store is chrome-level', async () => {
    const entry = makeEntry();
    const { unmount } = openMenuAndDelete(entry);

    // Simulate route change: component unmounts, but the chrome-level
    // `<UndoToastMount />` + store survive.
    unmount();
    expect(authFetchSpy).not.toHaveBeenCalled();

    // TTL elapses: commit (DELETE) fires despite component being gone.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(authFetchSpy).toHaveBeenCalledTimes(1);
    expect((authFetchSpy.mock.calls[0]?.[1] as RequestInit)?.method).toBe('DELETE');
  });

  it('after unmount + remount (nav back) + UNDO within 5s window — DELETE is cancelled', async () => {
    const entry = makeEntry();
    const first = openMenuAndDelete(entry);

    first.unmount();
    // Remount the row (user navigated back). The stack-level timer is
    // still ticking; the toast re-surfaces at the chrome level.
    render(<EntryRowActions entry={entry} />);

    // User clicks UNDO on the re-surfaced toast. The toast calls
    // `undoTop()` — the same path `<UndoToastMount />` uses.
    await act(async () => {
      await useUndoQueueStore.getState().undoTop();
    });

    // TTL elapses — timer already cleared by undoTop(), so no DELETE.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(authFetchSpy).not.toHaveBeenCalled();
  });

  // Fix 1 — RSC dashboard does not re-render after a client-side mutation
  // unless the client invalidates router cache. After the delay-on-TTL
  // commit DELETE returns 200/204, we must call `router.refresh()` so the
  // dashboard server components re-run and drop the deleted row.
  it('calls router.refresh() after successful commit DELETE (TTL elapsed, 204)', async () => {
    const entry = makeEntry();
    openMenuAndDelete(entry);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(authFetchSpy).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  // router.refresh() must NOT fire on the delete-failed branch — the server
  // rejected the DELETE so the row is still persisted; forcing a refresh
  // would show no visible change and mask the failure toast.
  it('does NOT call router.refresh() when commit DELETE fails (500)', async () => {
    authFetchSpy.mockResolvedValueOnce(new Response('err', { status: 500 }));
    const entry = makeEntry();
    openMenuAndDelete(entry);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100);
    });

    expect(authFetchSpy).toHaveBeenCalledTimes(1);
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it('closes an open row action menu when the user clicks outside it', () => {
    const entry = makeEntry();
    render(
      <div>
        <EntryRowActions entry={entry} />
        <button type="button">Outside target</button>
      </div>,
    );

    fireEvent.click(screen.getByTestId(`entry-menu-${entry.id}`));
    expect(screen.getByTestId(`entry-menu-popover-${entry.id}`)).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: /outside target/i }));

    expect(screen.queryByTestId(`entry-menu-popover-${entry.id}`)).toBeNull();
  });

  it('opening another row action menu closes the previously open menu', () => {
    const first = makeEntry({ id: 'entry-1' });
    const second = makeEntry({ id: 'entry-2' });
    render(
      <div>
        <EntryRowActions entry={first} />
        <EntryRowActions entry={second} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('entry-menu-entry-1'));
    expect(screen.getByTestId('entry-menu-popover-entry-1')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('entry-menu-entry-2'));
    fireEvent.click(screen.getByTestId('entry-menu-entry-2'));

    expect(screen.queryByTestId('entry-menu-popover-entry-1')).toBeNull();
    expect(screen.getByTestId('entry-menu-popover-entry-2')).toBeInTheDocument();
  });
});

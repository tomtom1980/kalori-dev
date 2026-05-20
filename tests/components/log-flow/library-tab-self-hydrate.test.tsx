/**
 * `<LibraryTab />` — self-hydration when the LogFlow modal opens from a
 * chrome trigger (FAB / `n` keybinding / meal-column +ADD) instead of `/log`
 * direct-nav. Without this, the store stays `[]` and the user sees an empty
 * library state even though they have items.
 *
 * Skip-when-already-seeded contract:
 *   - When `propItems !== undefined` (legacy test path) → no fetch.
 *   - When `useLogFlowStore.libraryItems.length > 0` (already seeded by
 *     `/log` page's RSC hydration) → no fetch.
 *   - Both safeguards preserve the no-double-fetch contract for the
 *     `/log` direct-nav path.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LibraryList,
  type LibraryListProps,
} from '@/app/(app)/log/_components/AddFoodTab/LibraryList';

// Task 10 — migrated import. `<LibraryTab>` is gone; tests use the same
// component (now `<LibraryList>`) via a thin wrapper that supplies the new
// required `onAddNew` prop with a no-op default so existing render sites
// keep working without touching every call.
function LibraryTab(props: Partial<LibraryListProps> = {}) {
  const { onAddNew = () => {}, ...rest } = props;
  return <LibraryList onAddNew={onAddNew} {...rest} />;
}
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const { authFetchMock, SessionExpiredErrorMock } = vi.hoisted(() => {
  class SessionExpiredErrorImpl extends Error {
    constructor(message = 'Session expired after refresh attempt') {
      super(message);
      this.name = 'SessionExpiredError';
    }
  }
  return {
    authFetchMock: vi.fn(),
    SessionExpiredErrorMock: SessionExpiredErrorImpl,
  };
});

vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (input: string | URL, init?: RequestInit) => authFetchMock(input, init),
  authPost: vi.fn(),
  SessionExpiredError: SessionExpiredErrorMock,
}));

const SessionExpiredError = SessionExpiredErrorMock;

const ROW_PHO = {
  id: 'pho-id',
  name: 'Pho Bo',
  kcal: 520,
  lastUsedIso: '2026-04-20T12:00:00Z',
  logCount: 12,
  proteinG: 32,
  carbsG: 48,
  fatG: 14,
  fiberG: 3,
  unit: 'g',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('<LibraryTab /> — self-hydration via /api/library/list', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    useLogFlowStore.getState().resetDraft();
  });
  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('fetches /api/library/list on mount when store is empty and no propItems', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    render(<LibraryTab />);
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(authFetchMock).toHaveBeenCalledWith('/api/library/list', undefined);
  });

  it('does NOT fetch when propItems is provided (legacy test path)', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    render(<LibraryTab items={[]} />);
    // Allow any pending microtasks to flush; should remain 0 calls.
    await act(async () => {
      await Promise.resolve();
    });
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it('refetches on mount even when store already has items (stale-while-revalidate)', async () => {
    // Stale-while-revalidate: the modal mounts on every chrome open, so a
    // returning user with cached items still gets a fresh fetch so
    // additions made on `/library` show up without a full reload. The
    // cached items render immediately (no skeleton flash); the response
    // replaces them when it lands.
    useLogFlowStore.getState().setLibraryItems([ROW_PHO]);
    authFetchMock.mockResolvedValue(jsonResponse({ items: [ROW_PHO] }));
    render(<LibraryTab />);
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(authFetchMock).toHaveBeenCalledWith('/api/library/list', undefined);
  });

  it('populates store from response and renders items', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ items: [ROW_PHO] }));
    render(<LibraryTab />);
    await waitFor(() => {
      expect(useLogFlowStore.getState().libraryItems).toEqual([ROW_PHO]);
    });
    expect(screen.getByTestId('library-card-pho-id')).toBeInTheDocument();
  });

  it('swallows SessionExpiredError without console noise', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authFetchMock.mockRejectedValue(new SessionExpiredError());
    render(<LibraryTab />);
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(1);
    });
    // Library tab still mounted; store still empty; empty-state shown.
    expect(useLogFlowStore.getState().libraryItems).toEqual([]);
    expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('does not setLibraryItems when response is non-ok (4xx/5xx)', async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ error: 'oops' }, 503));
    render(<LibraryTab />);
    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalledTimes(1);
    });
    expect(useLogFlowStore.getState().libraryItems).toEqual([]);
  });

  it('cleans up on unmount (no setLibraryItems after unmount)', async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    authFetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { unmount } = render(<LibraryTab />);
    unmount();
    // Resolve the in-flight fetch AFTER unmount; the cleanup guard must
    // prevent setLibraryItems from running. Two microtask ticks: one for
    // the `.then(...)` callback, one for the inner `await res.json()`.
    await act(async () => {
      resolveFetch?.(jsonResponse({ items: [ROW_PHO] }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useLogFlowStore.getState().libraryItems).toEqual([]);
  });

  // Task 10 — the prior `aria-busy="true"`-on-empty-state contract is
  // obsolete. The Add Food merge (Task 5) replaced the bare empty-state
  // during hydration with `<LibraryLoadingSkeleton />`; the post-hydration
  // empty-state element no longer carries `aria-busy` at all. The hydrating-
  // skeleton + post-hydration empty-state-with-CTA contract is now covered
  // by `tests/unit/components/log-flow/LibraryList.test.tsx`.
});

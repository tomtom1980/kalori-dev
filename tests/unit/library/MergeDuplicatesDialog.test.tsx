/**
 * `<MergeDuplicatesDialog />` unit tests — Codex Fix Round 1.
 *
 * Coverage:
 *   - IF-1: `onSuccess` receives the RPC-returned `response.winner`,
 *     NOT the pre-merge local `winner`. Asserts the forwarded object's
 *     log_count + last_used_at reflect merged values.
 *   - CF-1 UI defensive: if `winner.id === loser.id` reaches
 *     `handleProceed()` (store manipulation / bug), the submit handler
 *     surfaces the error banner and does NOT call the network layer.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MergeDuplicatesDialog } from '@/app/(app)/library/_components/MergeDuplicatesDialog';
import type { LibraryItem } from '@/lib/library/fetch';

// Mock the authPost interceptor so we can control the RPC response.
const authPostMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: authPostMock,
  SessionExpiredError: class SessionExpiredError extends Error {},
}));

function libraryItem(overrides: Partial<LibraryItem>): LibraryItem {
  return {
    id: overrides.id ?? 'id-a',
    client_id: overrides.client_id ?? 'client-a',
    display_name: overrides.display_name ?? 'Item A',
    normalized_name: overrides.normalized_name ?? 'item a',
    default_portion: overrides.default_portion ?? 1,
    default_unit: overrides.default_unit ?? 'piece',
    nutrition: overrides.nutrition ?? {
      kcal: 100,
      macros: { protein_g: 10, carbs_g: 10, fat_g: 5 },
    },
    thumbnail_url: overrides.thumbnail_url ?? null,
    log_count: overrides.log_count ?? 1,
    last_used_at: overrides.last_used_at ?? null,
    user_edited_flag: overrides.user_edited_flag ?? false,
    created_from: overrides.created_from ?? 'text',
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('<MergeDuplicatesDialog />', () => {
  beforeEach(() => {
    authPostMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('IF-1: forwards the RPC-returned winner (merged data) to onSuccess', async () => {
    const a = libraryItem({
      id: 'id-a',
      display_name: 'Item A',
      log_count: 5,
      last_used_at: '2026-01-01T00:00:00Z',
    });
    const b = libraryItem({
      id: 'id-b',
      display_name: 'Item B',
      log_count: 3,
      last_used_at: '2026-02-01T00:00:00Z',
    });

    // RPC returns the merged row — summed log_count + max last_used_at.
    const mergedWinner = libraryItem({
      id: 'id-a',
      display_name: 'Item A',
      log_count: 8, // 5 + 3
      last_used_at: '2026-02-01T00:00:00Z', // max
    });
    authPostMock.mockResolvedValueOnce({ winner: mergedWinner });

    const onSuccess = vi.fn();
    render(
      <MergeDuplicatesDialog
        open={true}
        a={a}
        b={b}
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    );

    const user = userEvent.setup();

    // Open the confirm sub-dialog, then proceed.
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    await waitFor(() => expect(authPostMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const [forwardedWinner, forwardedLoser] = onSuccess.mock.calls[0]!;
    // CRITICAL: the forwarded winner is the RPC-returned merged row,
    // NOT the pre-merge local `a` copy.
    expect(forwardedWinner).toBe(mergedWinner);
    expect(forwardedWinner.log_count).toBe(8);
    expect(forwardedWinner.last_used_at).toBe('2026-02-01T00:00:00Z');
    // Loser is still the local pre-merge `b` (caller uses its id to
    // remove from optimistic state — the server-side row is gone, so
    // there's no post-merge data to forward for it).
    expect(forwardedLoser.id).toBe('id-b');
  });

  it('CF-1 UI defensive: winner.id === loser.id blocks submit + surfaces error', async () => {
    const sameId = 'same-id';
    const a = libraryItem({ id: sameId, client_id: 'cli-a', display_name: 'A' });
    const b = libraryItem({ id: sameId, client_id: 'cli-b', display_name: 'B' });

    const onSuccess = vi.fn();
    render(
      <MergeDuplicatesDialog
        open={true}
        a={a}
        b={b}
        onOpenChange={() => {}}
        onSuccess={onSuccess}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId('library-merge-submit'));
    await waitFor(() => expect(screen.getByTestId('library-merge-proceed')).toBeInTheDocument());
    await user.click(screen.getByTestId('library-merge-proceed'));

    // Error banner is visible.
    await waitFor(() => expect(screen.getByTestId('library-merge-error')).toBeInTheDocument());
    // No network call was made.
    expect(authPostMock).not.toHaveBeenCalled();
    // onSuccess was NOT called.
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

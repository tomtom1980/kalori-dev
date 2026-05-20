/**
 * <LibraryClient /> quick-actions wiring test — bugfix-tomi
 * 2026-05-16-library-overhaul Bug 3.
 *
 * Verifies:
 *   - Edit from the card kebab menu navigates to /library/[id]?mode=edit.
 *   - Delete from the card kebab menu opens the existing BulkDeleteConfirmDialog
 *     in single-item mode (totalCount=1, previewNames=[displayName]).
 *   - The card itself is NOT activated (router.push to /library/[id] without
 *     mode=edit) when the menu Edit/Delete items fire.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryClient } from '@/app/(app)/library/_components/LibraryClient';
import type { LibraryItem } from '@/lib/library/fetch';
import { useLibrarySelectionStore } from '@/lib/stores/useLibrarySelectionStore';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} src={typeof src === 'string' ? src : ''} {...rest} />
  ),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

const { FakeAuthApiError, authFetchMock } = vi.hoisted(() => {
  class FakeAuthApiError extends Error {
    readonly status: number;
    readonly body: unknown;

    constructor(message: string, status: number, body: unknown) {
      super(message);
      this.name = 'AuthApiError';
      this.status = status;
      this.body = body;
    }
  }
  return { FakeAuthApiError, authFetchMock: vi.fn() };
});

const authPostMock = vi.fn();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
  authPost: (...args: unknown[]) => authPostMock(...args),
  AuthApiError: FakeAuthApiError,
  SessionExpiredError: class SE extends Error {},
}));

function mk(id: string, name = `Item ${id}`, overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id,
    client_id: `client-${id}`,
    display_name: name,
    normalized_name: name.toLowerCase(),
    default_portion: 1,
    default_unit: 'piece',
    nutrition: { kcal: 100, macros: { protein_g: 5, carbs_g: 10, fat_g: 2 } },
    thumbnail_url: null,
    log_count: 1,
    last_used_at: null,
    user_edited_flag: false,
    created_from: 'text',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('<LibraryClient /> quick-action menu wiring (Bug 3)', () => {
  beforeEach(() => {
    useLibrarySelectionStore.getState().clear();
    pushMock.mockReset();
    refreshMock.mockReset();
    authFetchMock.mockReset();
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ quota: { exceeded: false } }), { status: 200 }),
    );
    authPostMock.mockReset();
  });

  it('Edit action navigates to /library/[id]?mode=edit', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);
    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-edit-alpha'));
    expect(pushMock).toHaveBeenCalledWith('/library/alpha?mode=edit');
  });

  it('Delete action opens the BulkDeleteConfirmDialog in single-item mode', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);
    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-delete-alpha'));
    // BulkDeleteConfirmDialog renders with totalCount=1 and uses
    // bulkDeleteTitleSingular copy ("Strike this title from the record?")
    // — verifying via its testid + single-name preview row.
    const dialog = await screen.findByTestId('library-bulk-delete-dialog');
    expect(dialog).toBeInTheDocument();
    // Single-item layout renders the italic name preview.
    expect(await screen.findByTestId('library-bulk-delete-name')).toHaveTextContent('Pho Bo');
  });

  it('opening the menu does NOT push to /library/[id] (i.e. does not activate the card)', async () => {
    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);
    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    // No /library/alpha push should have fired.
    expect(pushMock).not.toHaveBeenCalledWith('/library/alpha');
  });

  it('Create recipe action is only shown for eligible items', async () => {
    const user = userEvent.setup();
    render(
      <LibraryClient
        initial={[
          mk('alpha', 'Pho Bo', { recipe_eligibility: 'eligible' }),
          mk('beta', 'Banana', { recipe_eligibility: 'ineligible' }),
        ]}
        uid="user-1"
      />,
    );

    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    expect(await screen.findByTestId('library-card-menu-create-recipe-alpha')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('library-card-menu-trigger-beta'));

    expect(screen.queryByTestId('library-card-menu-create-recipe-beta')).not.toBeInTheDocument();
  });

  it('Create recipe opens the recipe dialog immediately and calls the recipe endpoint', async () => {
    authPostMock.mockImplementationOnce(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(
      <LibraryClient
        initial={[mk('alpha', 'Pho Bo', { recipe_eligibility: 'eligible' })]}
        uid="user-1"
      />,
    );

    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-create-recipe-alpha'));

    const dialog = await screen.findByTestId('library-create-recipe-dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Reading the saved item and drafting a practical method.',
    );
    expect(authPostMock).toHaveBeenCalledWith('/api/library/alpha/recipe', {
      client_id: expect.any(String),
    });
  });

  it('Add Item button opens the LogFlowModal at the Type tab in library-only mode', async () => {
    // The manual-entry LibraryAddDialog has been retired. The page-level
    // Add Item button now routes through the existing log flow modal so
    // adding a library item uses the same AI-parse → editable confirmation
    // flow as logging a meal. The `mode: 'library-only'` flag strips the
    // log-specific surfaces (tabs nav, meal slot, time editor, save-to-
    // library toggle) and routes the save handler to /api/library/create,
    // so no food_entries row is created — pure library insert.
    const openModalSpy = vi.spyOn(useLogFlowStore.getState(), 'openModal');
    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);
    await user.click(screen.getByTestId('library-add-button'));
    expect(openModalSpy).toHaveBeenCalledWith('type', { mode: 'library-only' });
    openModalSpy.mockRestore();
  });

  it('Add Item button exposes quota-check busy state while the quota request is pending', async () => {
    let resolveQuota!: (value: Response) => void;
    authFetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQuota = resolve;
        }),
    );
    const openModalSpy = vi.spyOn(useLogFlowStore.getState(), 'openModal');
    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);

    const addButton = screen.getByTestId('library-add-button');
    await user.click(addButton);

    expect(addButton).toHaveAttribute('aria-busy', 'true');
    expect(addButton).toHaveTextContent('CHECKING');
    expect(addButton).toBeDisabled();
    expect(openModalSpy).not.toHaveBeenCalled();

    resolveQuota(new Response(JSON.stringify({ quota: { exceeded: false } }), { status: 200 }));
    openModalSpy.mockRestore();
  });

  it('quick-log meal dialog exposes busy state while the log request is pending', async () => {
    authPostMock.mockImplementationOnce(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-quicklog-alpha'));
    await user.click(await screen.findByTestId('library-card-quicklog-meal-snack'));

    const dialog = await screen.findByTestId('library-card-quicklog-dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('library-card-quicklog-meal-snack')).toHaveTextContent('LOGGING');
    expect(screen.getByTestId('library-card-quicklog-meal-breakfast')).toBeDisabled();
  });

  it('bulk-log actions expose busy state while selected items are being logged', async () => {
    authPostMock.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo'), mk('beta', 'Banh Mi')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-alpha'));
    await user.click(screen.getByTestId('library-card-beta'));
    await user.click(screen.getByTestId('library-bulk-log-button'));
    await user.click(await screen.findByTestId('library-bulk-log-meal-lunch'));

    expect(screen.getByTestId('library-bulk-actions-bar')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('library-bulk-log-button')).toHaveTextContent('LOGGING');
    expect(screen.getByTestId('library-bulk-delete-button')).toBeDisabled();
  });

  it('quick-log duplicate cancel uses in-app dialog and does not retry', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock.mockRejectedValueOnce(
      new FakeAuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }),
    );

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-quicklog-alpha'));
    await user.click(await screen.findByTestId('library-card-quicklog-meal-snack'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('duplicate-log-cancel'));

    expect(authPostMock).toHaveBeenCalledTimes(1);
  });

  it('quick-log duplicate confirm retries with allow_duplicate', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock
      .mockRejectedValueOnce(
        new FakeAuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }),
      )
      .mockResolvedValueOnce({ entry: { id: 'entry-1' } });

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-card-menu-trigger-alpha'));
    await user.click(await screen.findByTestId('library-card-menu-quicklog-alpha'));
    await user.click(await screen.findByTestId('library-card-quicklog-meal-snack'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('duplicate-log-confirm'));

    expect(authPostMock).toHaveBeenCalledTimes(2);
    expect(authPostMock.mock.calls[1]?.[1]).toMatchObject({ allow_duplicate: true });
  });

  it('bulk-log duplicate confirm retries duplicate rows with allow_duplicate', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock
      .mockRejectedValueOnce(
        new FakeAuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }),
      )
      .mockResolvedValueOnce({ entry: { id: 'entry-beta' } })
      .mockResolvedValueOnce({ entry: { id: 'entry-alpha' } });

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo'), mk('beta', 'Banh Mi')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-alpha'));
    await user.click(screen.getByTestId('library-card-beta'));
    await user.click(screen.getByTestId('library-bulk-log-button'));
    await user.click(await screen.findByTestId('library-bulk-log-meal-lunch'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('duplicate-log-confirm'));

    expect(authPostMock).toHaveBeenCalledTimes(3);
    expect(authPostMock.mock.calls[0]?.[0]).toBe('/api/library/alpha/log-now');
    expect(authPostMock.mock.calls[1]?.[0]).toBe('/api/library/beta/log-now');
    expect(authPostMock.mock.calls[2]?.[0]).toBe('/api/library/alpha/log-now');
    expect(authPostMock.mock.calls[2]?.[1]).toMatchObject({ allow_duplicate: true });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('bulk-log duplicate cancel does not retry duplicate rows', async () => {
    const confirmSpy = vi.fn(() => true);
    Object.defineProperty(window, 'confirm', { value: confirmSpy, configurable: true });
    authPostMock
      .mockRejectedValueOnce(
        new FakeAuthApiError('duplicate', 409, { error: 'duplicate_food_entry' }),
      )
      .mockResolvedValueOnce({ entry: { id: 'entry-beta' } });

    const user = userEvent.setup();
    render(<LibraryClient initial={[mk('alpha', 'Pho Bo'), mk('beta', 'Banh Mi')]} uid="user-1" />);

    await user.click(screen.getByTestId('library-select-toggle'));
    await user.click(screen.getByTestId('library-card-alpha'));
    await user.click(screen.getByTestId('library-card-beta'));
    await user.click(screen.getByTestId('library-bulk-log-button'));
    await user.click(await screen.findByTestId('library-bulk-log-meal-lunch'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('duplicate-log-cancel'));

    expect(authPostMock).toHaveBeenCalledTimes(2);
    expect(authPostMock.mock.calls.map((call) => call[1])).not.toContainEqual(
      expect.objectContaining({ allow_duplicate: true }),
    );
  });
});

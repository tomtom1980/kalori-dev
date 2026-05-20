/**
 * Task 3.4 — <CopyYesterdayModal /> tests + axe-core coverage.
 *
 * Covers the P3 class-based rewrite + 44×44 labelled checkboxes +
 * dirty-close AlertDialog.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { CopyYesterdayModal } from '@/app/(app)/log/copy-yesterday/_components/CopyYesterdayModal';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

const backMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: backMock, refresh: refreshMock }),
}));

const authPost = vi.fn<(url: string, body: unknown) => Promise<unknown>>();
vi.mock('@/lib/auth/refresh-interceptor', () => ({
  authPost: (url: string, body: unknown) => authPost(url, body),
  authFetch: vi.fn(),
  SessionExpiredError: class SE extends Error {},
}));

const baseEntries = [
  { id: 'e1', mealCategory: 'breakfast', label: 'Eggs', kcal: 140 },
  { id: 'e2', mealCategory: 'lunch', label: 'Salad', kcal: 320 },
];

describe('<CopyYesterdayModal />', () => {
  beforeEach(() => {
    backMock.mockReset();
    refreshMock.mockReset();
    authPost.mockReset();
    authPost.mockResolvedValue({ created: [] });
    useUndoQueueStore.setState({ stack: [] });
  });
  afterEach(() => {
    useUndoQueueStore.setState({ stack: [] });
  });

  it('renders empty state when no entries', () => {
    render(<CopyYesterdayModal entries={[]} />);
    expect(screen.getByTestId('copy-yesterday-empty')).toBeInTheDocument();
  });

  it('renders grouped entries with labeled checkboxes', () => {
    render(<CopyYesterdayModal entries={baseEntries} />);
    expect(screen.getByTestId('copy-yesterday-entry-e1')).toBeInTheDocument();
    expect(screen.getByTestId('copy-yesterday-entry-e2')).toBeInTheDocument();
    // Checkboxes have accessible name via aria-label.
    const checks = screen.getAllByRole('checkbox');
    expect(checks).toHaveLength(2);
    expect(checks[0]?.getAttribute('aria-label')).toBe('Eggs');
  });

  it('selecting + Confirm calls authPost with ids + new_client_ids', async () => {
    render(<CopyYesterdayModal entries={baseEntries} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getByTestId('copy-yesterday-confirm'));
    expect(authPost).toHaveBeenCalledTimes(1);
    const body = authPost.mock.calls[0]![1] as Record<string, unknown>;
    expect(body.ids).toEqual(['e1']);
    expect(Array.isArray(body.new_client_ids)).toBe(true);
    expect((body.new_client_ids as string[]).length).toBe(1);
  });

  // Fix 1 — after a successful copy-yesterday POST, refresh the RSC so the
  // dashboard picks up the newly-copied entries before routing back.
  it('calls router.refresh() after a successful copy', async () => {
    render(<CopyYesterdayModal entries={baseEntries} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getByTestId('copy-yesterday-confirm'));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('shows semantic busy feedback and prevents duplicate copy submits while pending', async () => {
    let resolveCopy!: (value: unknown) => void;
    authPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCopy = resolve;
        }),
    );

    render(<CopyYesterdayModal entries={baseEntries} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);

    const confirm = screen.getByTestId('copy-yesterday-confirm');
    await user.click(confirm);
    await user.click(confirm);

    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toHaveTextContent('COPYING 1 ENTRIES');
    expect(confirm).toBeDisabled();
    expect(screen.getAllByRole('checkbox')[0]).toBeDisabled();
    expect(authPost).toHaveBeenCalledTimes(1);

    resolveCopy({ created: [] });
  });

  it('Cancel with no selections navigates back immediately', async () => {
    render(<CopyYesterdayModal entries={baseEntries} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('Cancel with dirty selections opens DiscardDraftAlertDialog', async () => {
    render(<CopyYesterdayModal entries={baseEntries} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    // AlertDialog Cancel visible when opened.
    expect(screen.getByTestId('discard-cancel')).toBeInTheDocument();
    expect(backMock).not.toHaveBeenCalled();
  });

  it('has no axe-core violations in empty state', async () => {
    const { container } = render(<CopyYesterdayModal entries={[]} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has no axe-core violations with entries + unchecked checkboxes', async () => {
    const { container } = render(<CopyYesterdayModal entries={baseEntries} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

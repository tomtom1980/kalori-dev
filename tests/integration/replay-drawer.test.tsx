/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.5 — `<ReplayDrawer />` integration tests.
 *
 * AC2: lists per-row queued mutations with retry/discard actions wired to
 *      outbox manager (`actions.retry()` for bulk retry, `outbox.remove()`
 *      for per-row discard).
 * AC6: zero serious/critical axe violations.
 *
 * Briefing §5b + §7c.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { OutboxRow } from '@/lib/offline/types';

const requestFlush = vi.fn().mockResolvedValue(undefined);

let mockRows: OutboxRow[] = [];
const subscribers = new Set<() => void>();

function notifyAll(): void {
  for (const fn of Array.from(subscribers)) fn();
}

const peekMock = vi.fn(async (limit?: number) => {
  // Honour the FIFO limit signature so the mock matches `outbox.peek`.
  void limit;
  return mockRows.slice();
});
const removeMock = vi.fn(async (client_id: string) => {
  const before = mockRows.length;
  mockRows = mockRows.filter((r) => r.client_id !== client_id);
  if (mockRows.length === before) return false;
  notifyAll();
  return true;
});
const subscribeMock = vi.fn((fn: () => void) => {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
});
const sizeMock = vi.fn(async () => mockRows.length);

vi.mock('@/lib/offline/outbox', () => ({
  peek: (limit?: number) => peekMock(limit),
  remove: (cid: string) => removeMock(cid),
  subscribe: (fn: () => void) => subscribeMock(fn),
  size: () => sizeMock(),
}));

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => ({
    online: true,
    queueDepth: mockRows.length,
    lastFlushAt: null,
    replayStatus: 'idle' as const,
    conflicts: [],
    actions: {
      requestFlush,
      resolveConflict: vi.fn().mockResolvedValue(undefined),
      retry: requestFlush,
    },
    meta: {
      isReducedMotion: false,
      isPending: false,
      isFlushing: false,
    },
  }),
}));

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: crypto.randomUUID(),
    client_id: crypto.randomUUID(),
    kind: 'entry-create',
    endpoint: '/api/entries/save',
    method: 'POST',
    body: { client_id: 'c1' },
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    conflict: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRows = [];
  subscribers.clear();
  requestFlush.mockClear();
  peekMock.mockClear();
  removeMock.mockClear();
  subscribeMock.mockClear();
  sizeMock.mockClear();
});

afterEach(() => {
  // RTL `cleanup()` (registered globally in tests/setup.ts) unmounts the
  // tree and removes inserted nodes; explicit body resets are unnecessary.
});

async function importDrawer(): Promise<{
  ReplayDrawer: React.ComponentType<{
    open: boolean;
    onOpenChange: (next: boolean) => void;
  }>;
}> {
  return await import('@/components/pwa/ReplayDrawer');
}

describe('ReplayDrawer — visibility', () => {
  it('AC2: mounts closed by default; renders nothing in body when open=false', async () => {
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={false} onOpenChange={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('AC2: opens when open=true and shows the dialog with title', async () => {
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toMatch(/Pending changes/i);
  });
});

describe('ReplayDrawer — empty state', () => {
  it('AC2: shows empty copy when no rows queued', async () => {
    mockRows = [];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(screen.getByText(/Nothing pending\. You're up to date\./i)).toBeInTheDocument();
    });
  });
});

describe('ReplayDrawer — row listing', () => {
  it('AC2: lists each row with kind label', async () => {
    mockRows = [
      makeRow({ kind: 'entry-create', client_id: 'c-a' }),
      makeRow({ kind: 'library-update', client_id: 'c-b' }),
      makeRow({ kind: 'goal-weight-update', client_id: 'c-c' }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    await waitFor(() => {
      const items = screen.getAllByTestId(/^replay-drawer-row-/);
      expect(items.length).toBe(3);
    });
    // Kind labels per ux-specialist §D.2.
    expect(screen.getByText(/Meal entry/i)).toBeInTheDocument();
    expect(screen.getByText(/Library item/i)).toBeInTheDocument();
    expect(screen.getByText(/Goal weight/i)).toBeInTheDocument();
  });

  it('AC2: renders all 7 OutboxKind labels correctly', async () => {
    mockRows = [
      makeRow({ kind: 'entry-create', client_id: 'k1' }),
      makeRow({ kind: 'entry-delete', client_id: 'k2' }),
      makeRow({ kind: 'water-log', client_id: 'k3' }),
      makeRow({ kind: 'weight-log', client_id: 'k4' }),
      makeRow({ kind: 'library-update', client_id: 'k5' }),
      makeRow({ kind: 'library-bulk-delete', client_id: 'k6' }),
      makeRow({ kind: 'goal-weight-update', client_id: 'k7' }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    await waitFor(() => {
      const items = screen.getAllByTestId(/^replay-drawer-row-/);
      expect(items.length).toBe(7);
    });
  });

  it('AC2: shows "Queued" status by default', async () => {
    mockRows = [makeRow({ kind: 'entry-create', client_id: 'c-x' })];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(screen.getByText(/Queued/i)).toBeInTheDocument();
    });
  });

  it('AC2: shows failed status copy when row has lastError', async () => {
    mockRows = [
      makeRow({
        kind: 'entry-create',
        client_id: 'c-fail',
        lastError: '500 Internal Server Error',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    await waitFor(() => {
      expect(screen.getByText(/Couldn't sync\./i)).toBeInTheDocument();
    });
  });
});

describe('ReplayDrawer — actions', () => {
  it('AC2 (Codex F4): per-row Retry button is NOT rendered (was lying about scope)', async () => {
    // Codex F4 — the per-row Retry button used to call the bulk
    // `actions.retry()` because no per-row retry primitive exists in
    // `useOutbox` yet. Clicking Retry beside one failed row flushed the
    // whole queue, contradicting the AC2 per-row review contract. The
    // button is gone until `F-OFFLINE-5.1.5-PER-ROW-RETRY-PROPER` lands.
    mockRows = [
      makeRow({
        kind: 'entry-create',
        client_id: 'c-fail',
        lastError: '500',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('replay-drawer-retry-c-fail')).toBeNull();
  });

  it('AC2 (Codex F4): footer Retry-all appears when any failed row exists (threshold lowered)', async () => {
    // With per-row Retry removed, the footer is the only retry surface;
    // a single failed row needs an actionable footer.
    mockRows = [
      makeRow({
        kind: 'entry-create',
        client_id: 'only-fail',
        lastError: '500',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    const retryAll = await screen.findByTestId('replay-drawer-retry-all');
    expect(retryAll).toBeInTheDocument();
    fireEvent.click(retryAll);
    expect(requestFlush).toHaveBeenCalled();
  });

  it('AC2: Discard button calls outbox.remove(client_id)', async () => {
    mockRows = [makeRow({ kind: 'entry-create', client_id: 'c-discard' })];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    const discardBtn = await screen.findByTestId('replay-drawer-discard-c-discard');
    fireEvent.click(discardBtn);
    await waitFor(() => {
      expect(removeMock).toHaveBeenCalledWith('c-discard');
    });
  });

  it('AC2: Retry-all footer fires bulk retry when ≥2 failed rows', async () => {
    mockRows = [
      makeRow({
        kind: 'entry-create',
        client_id: 'fail-1',
        lastError: '500',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
      makeRow({
        kind: 'entry-create',
        client_id: 'fail-2',
        lastError: '500',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    const retryAll = await screen.findByTestId('replay-drawer-retry-all');
    expect(retryAll).toBeInTheDocument();
    fireEvent.click(retryAll);
    expect(requestFlush).toHaveBeenCalled();
  });

  it('AC2 (Codex F4): Retry-all footer hidden when there are zero failed rows', async () => {
    // Threshold lowered from 2 → 1 in Codex F4 fix. Zero failed rows = no
    // retry footer (queued-only rows have no retry semantics).
    mockRows = [
      makeRow({
        kind: 'entry-create',
        client_id: 'just-queued',
        lastError: null,
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('replay-drawer-retry-all')).toBeNull();
  });
});

describe('ReplayDrawer — closing', () => {
  it('AC2: close button triggers onOpenChange(false)', async () => {
    mockRows = [makeRow({ kind: 'entry-create' })];
    const onOpenChange = vi.fn();
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={onOpenChange} />);
    const closeBtn = await screen.findByTestId('replay-drawer-close');
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('AC2: close button has aria-label="Close pending changes drawer"', async () => {
    mockRows = [makeRow({ kind: 'entry-create' })];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    const closeBtn = await screen.findByTestId('replay-drawer-close');
    expect(closeBtn.getAttribute('aria-label')).toBe('Close pending changes drawer');
  });
});

describe('ReplayDrawer — outbox subscription', () => {
  it('AC2: subscribes to outbox.subscribe on open', async () => {
    mockRows = [makeRow({ kind: 'entry-create' })];
    const { ReplayDrawer } = await importDrawer();
    render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    expect(subscribeMock).toHaveBeenCalled();
  });
});

describe('ReplayDrawer — a11y (vitest-axe)', () => {
  it('AC6: zero violations when empty', async () => {
    mockRows = [];
    const { ReplayDrawer } = await importDrawer();
    const { container } = render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('AC6: zero violations when populated', async () => {
    mockRows = [
      makeRow({ kind: 'entry-create', client_id: 'a' }),
      makeRow({
        kind: 'library-update',
        client_id: 'b',
        lastError: '500',
        attempts: 1,
        lastAttemptAt: Date.now(),
      }),
    ];
    const { ReplayDrawer } = await importDrawer();
    const { container } = render(<ReplayDrawer open={true} onOpenChange={() => undefined} />);
    await screen.findByRole('dialog');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

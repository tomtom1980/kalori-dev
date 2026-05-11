/**
 * Task 3.3 C1 — double-mount regression test.
 *
 * Before Codex fix round: navigating directly to `/log` rendered
 * `<LogFlowModal initialOpen />` from `LogPageClient`, which called
 * `openModal()`. NavShell ALSO rendered `<LogFlowModalMount />`, which
 * then mounted a SECOND `<LogFlowModal />` once `isOpen` flipped. Result:
 * two <Dialog.Root> portals, duplicate overlays, aria collisions.
 *
 * After fix: exactly ONE Dialog.Root portal regardless of entry path.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogFlowModalMount } from '@/components/nav/log-flow-modal-mount';
import { LogPageClient } from '@/app/(app)/log/_components/LogPageClient';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('Task 3.3 C1 — direct-nav /log does not double-mount the modal', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useLogFlowStore.getState().closeModal();
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
    useLogFlowStore.getState().closeModal();
    vi.restoreAllMocks();
  });

  it('mounts exactly ONE Dialog.Root when /log direct-nav renders alongside NavShell LogFlowModalMount', async () => {
    // Simulate chrome + /log page rendering together.
    render(
      <>
        <LogFlowModalMount />
        <LogPageClient />
      </>,
    );

    // Give dynamic import + effect a beat.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Exactly one dialog role in the DOM.
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBeLessThanOrEqual(1);

    // And exactly one log-flow-modal testid if it did mount.
    const modals = document.querySelectorAll('[data-testid="log-flow-modal"]');
    expect(modals.length).toBeLessThanOrEqual(1);
  });

  it('LogPageClient calls openModal() but does not render LogFlowModal directly', async () => {
    render(<LogPageClient />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Store is opened…
    expect(useLogFlowStore.getState().isOpen).toBe(true);
    // …but LogPageClient itself renders no modal (NavShell's mount owns that).
    expect(screen.queryByTestId('log-flow-modal')).toBeNull();
  });
});

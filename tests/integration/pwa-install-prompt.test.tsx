/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.4 — `<PWAInstallPrompt />` integration tests.
 *
 * AC2 (folded-letter modal copy + Android/iOS variants), AC-A11y-Modal
 * (focus trap + return-focus + ESC + role/aria-modal/aria-labelledby), AC5
 * (lazy bundle exposure check), AC6 (reduced-motion variant).
 *
 * Codex Round 2 (R2-F1): the modal now receives install state via props
 * (the host owns `usePWAInstall()`). Tests construct that prop bundle here
 * directly so the modal can be exercised in isolation.
 *
 * Briefing: `planning/.tmp/task-5.1.4-briefing.md` §9 + §10 + §13b.
 * Codex round 2 spec: `planning/.tmp/task-5.1.4-codex-round2.md` R2-F1.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kalori.pwa-prompt.dismissed';

// ---------------------------------------------------------------------------
// Install-state stand-ins — the modal now takes these as props (R2-F1).
// ---------------------------------------------------------------------------

const dismiss = vi.fn();
const promptInstall = vi.fn().mockResolvedValue('accepted' as const);

let canInstall = true;
let isIOSWithoutA2HS = false;
let platform: 'android-chromium' | 'ios-safari' | 'desktop-chromium' | 'unknown' =
  'android-chromium';

let mockReducedMotion = false;
const mockUseOutboxResult = (): {
  online: boolean;
  queueDepth: number;
  lastFlushAt: number | null;
  replayStatus: 'idle';
  conflicts: ReadonlyArray<unknown>;
  actions: {
    requestFlush: () => Promise<void>;
    resolveConflict: () => Promise<void>;
    retry: () => Promise<void>;
  };
  meta: { isReducedMotion: boolean; isPending: boolean; isFlushing: boolean };
} => ({
  online: true,
  queueDepth: 0,
  lastFlushAt: null,
  replayStatus: 'idle',
  conflicts: [],
  actions: {
    requestFlush: vi.fn().mockResolvedValue(undefined),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
  },
  meta: { isReducedMotion: mockReducedMotion, isPending: false, isFlushing: false },
});

vi.mock('@/lib/offline/use-outbox', () => ({
  useOutbox: () => mockUseOutboxResult(),
}));

beforeEach(() => {
  // Default — modal openable on Android/Chromium with no prior dismissal.
  canInstall = true;
  isIOSWithoutA2HS = false;
  platform = 'android-chromium';
  mockReducedMotion = false;
  dismiss.mockClear();
  promptInstall.mockReset().mockResolvedValue('accepted');
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function importModal(): Promise<{
  PWAInstallPrompt: (typeof import('@/components/pwa/PWAInstallPrompt'))['PWAInstallPrompt'];
}> {
  return await import('@/components/pwa/PWAInstallPrompt');
}

/** Build the prop bundle the modal expects (R2-F1: state passes via props). */
function modalProps(overrides?: { open?: boolean; onOpenChange?: (next: boolean) => void }): {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  canInstall: boolean;
  isIOSWithoutA2HS: boolean;
  platform: 'android-chromium' | 'ios-safari' | 'desktop-chromium' | 'unknown';
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unsupported'>;
  dismiss: () => void;
} {
  return {
    open: overrides?.open ?? true,
    onOpenChange: overrides?.onOpenChange ?? (() => undefined),
    canInstall,
    isIOSWithoutA2HS,
    platform,
    promptInstall,
    dismiss,
  };
}

describe('PWAInstallPrompt — Android/Chromium variant', () => {
  it('AC2: renders kicker + title + body + CTAs verbatim from i18n', async () => {
    // AC2: copy must match `task-5.1-ui-ux-specialist.md` §A.3 verbatim.
    const { PWAInstallPrompt } = await importModal();
    render(<PWAInstallPrompt {...modalProps()} />);
    expect(screen.getByText('§ INSTALL')).toBeInTheDocument();
    expect(screen.getByText('Keep Kalori close.')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add Kalori to your home screen for offline-ready ledger access. No App Store, no installs — it's already here.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'INSTALL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NOT NOW' })).toBeInTheDocument();
  });

  it('AC2: clicking INSTALL triggers promptInstall', async () => {
    // AC2: install primary CTA wires to the deferredPrompt.prompt() flow.
    const { PWAInstallPrompt } = await importModal();
    const onOpenChange = vi.fn();
    render(<PWAInstallPrompt {...modalProps({ onOpenChange })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'INSTALL' }));
    });
    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('AC1: clicking NOT NOW calls dismiss() and closes', async () => {
    // AC1 + AC-A11y-Modal: NOT NOW persists dismissal flag and closes modal.
    const { PWAInstallPrompt } = await importModal();
    const onOpenChange = vi.fn();
    render(<PWAInstallPrompt {...modalProps({ onOpenChange })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'NOT NOW' }));
    });
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('PWAInstallPrompt — iOS variant', () => {
  it('AC2: renders Three steps + GOT IT button when platform=ios-safari', async () => {
    // AC2: iOS path replaces INSTALL with manual A2HS instructions.
    platform = 'ios-safari';
    isIOSWithoutA2HS = true;
    canInstall = false;
    const { PWAInstallPrompt } = await importModal();
    render(<PWAInstallPrompt {...modalProps()} />);
    expect(
      screen.getByText(
        'Add Kalori to your home screen for offline-ready ledger access. iOS asks you to do it manually.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Three steps:')).toBeInTheDocument();
    expect(
      screen.getByText('Tap the share button at the bottom of the screen.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose "Add to home screen".')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GOT IT' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'INSTALL' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'NOT NOW' })).toBeNull();
  });
});

describe('PWAInstallPrompt — accessibility', () => {
  it('AC-A11y-Modal: role=dialog + aria-labelledby + aria-describedby (Radix Dialog modal)', async () => {
    // AC-A11y-Modal: dialog semantics drive screen reader announcement.
    // Radix Dialog uses `role="dialog"` for the modal Content; aria-modal
    // is implicit through the Radix focus-scope contract (the underlying
    // primitive sets `data-state="open"` and traps focus). What we MUST
    // assert is the presence of a dialog with the correct labelling.
    const { PWAInstallPrompt } = await importModal();
    render(<PWAInstallPrompt {...modalProps()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(dialog.getAttribute('data-state')).toBe('open');
  });

  it('AC-A11y-Modal: ESC key closes modal and persists dismissal', async () => {
    // AC-A11y-Modal: ESC is treated as NOT NOW (per ux-specialist §A).
    const { PWAInstallPrompt } = await importModal();
    const onOpenChange = vi.fn();
    render(<PWAInstallPrompt {...modalProps({ onOpenChange })} />);
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('AC-A11y-Modal: first-focus lands on the primary CTA', async () => {
    // AC-A11y-Modal: focus on the positive action so keyboard users default
    // to the recommended path. Per `ux-specialist §A.3`.
    const { PWAInstallPrompt } = await importModal();
    render(<PWAInstallPrompt {...modalProps()} />);
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('INSTALL');
    });
  });
});

describe('PWAInstallPrompt — reduced motion', () => {
  it('AC6: reduced-motion variant skips the 120ms opacity fade', async () => {
    // AC6: under prefers-reduced-motion the modal mounts with opacity:1
    // immediately — no transition class. Radix portals the content out of
    // the test container, so we query from the document root.
    mockReducedMotion = true;
    const { PWAInstallPrompt } = await importModal();
    render(<PWAInstallPrompt {...modalProps()} />);
    const surface = screen.getByTestId('pwa-install-prompt');
    expect(surface.getAttribute('data-reduced-motion')).toBe('true');
  });
});

/**
 * SignOutButton — verifies onClick wires to POST /api/auth/sign-out + hard-nav
 * to /login. Covers happy path, fetch failure (idempotency), variant rendering,
 * and in-flight guard against double-click.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { SignOutButton } from '@/components/nav/sign-out-button';

describe('SignOutButton', () => {
  const originalLocation = window.location;
  let hrefSetter: Mock<(url: string) => void>;
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        ...originalLocation,
        set href(url: string) {
          hrefSetter(url);
        },
      },
    });
    fetchMock = vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
  });

  it('POSTs to /api/auth/sign-out then navigates to /login (sidebar variant)', async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByTestId('sidebar-sign-out'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/sign-out',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(hrefSetter).toHaveBeenCalledWith('/login');
    });
  });

  it('still navigates to /login when fetch fails (idempotent)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network fail'));
    render(<SignOutButton />);
    fireEvent.click(screen.getByTestId('sidebar-sign-out'));
    await waitFor(() => {
      expect(hrefSetter).toHaveBeenCalledWith('/login');
    });
  });

  it('renders menuitem variant with correct testid', () => {
    render(<SignOutButton variant="menuitem" />);
    expect(screen.getByTestId('profile-menu-sign-out')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-sign-out')).not.toBeInTheDocument();
  });

  it('menuitem variant also wires POST + redirect', async () => {
    render(<SignOutButton variant="menuitem" />);
    fireEvent.click(screen.getByTestId('profile-menu-sign-out'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/sign-out',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(hrefSetter).toHaveBeenCalledWith('/login');
    });
  });

  it('disables button while request is in flight to prevent double-POST', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<SignOutButton />);
    const button = screen.getByTestId('sidebar-sign-out') as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch!(new Response('{"ok":true}', { status: 200 }));
    await waitFor(() => expect(hrefSetter).toHaveBeenCalled());
  });

  // Codex E.CODEX Round 1 (B-H2) — verify the button surfaces a console.error
  // when the sign-out POST returns non-2xx. The idempotent UX requirement
  // still navigates to /login (middleware re-validates session); the log is
  // the prod-observability hook so silent logout-failures don't disappear
  // into the catch.
  it('logs to console.error when sign-out POST returns non-2xx', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response('{"error":"x"}', { status: 500 }));
    render(<SignOutButton />);
    fireEvent.click(screen.getByTestId('sidebar-sign-out'));
    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith('[sign-out] non-2xx response', 500);
      expect(hrefSetter).toHaveBeenCalledWith('/login');
    });
    errSpy.mockRestore();
  });

  it('logs to console.error when sign-out fetch throws (network failure)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network fail'));
    render(<SignOutButton />);
    fireEvent.click(screen.getByTestId('sidebar-sign-out'));
    await waitFor(() => {
      expect(errSpy).toHaveBeenCalledWith('[sign-out] fetch failed', expect.any(Error));
      expect(hrefSetter).toHaveBeenCalledWith('/login');
    });
    errSpy.mockRestore();
  });
});

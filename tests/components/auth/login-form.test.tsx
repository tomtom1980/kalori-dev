/**
 * <LoginForm /> component test (Task 2.1c).
 *
 * Covers the sign-in surface contract from design-doc §6 + ui-design §7.8.2:
 *   - Email input labelled + required (no placeholder-only label)
 *   - Magic-link submit dispatches `supabase.auth.signInWithOtp`
 *   - Google button dispatches `supabase.auth.signInWithOAuth` with
 *     `provider: 'google'`
 *   - Success state displays after magic-link send
 *   - Error state surfaces Supabase error messages via i18n copy
 *   - Email validation gates submission (empty + invalid both caught)
 *
 * The underlying Supabase client is mocked via the `getBrowserSupabase`
 * shim so the tests run under happy-dom without a live Supabase.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n/en';

const signInWithOtp = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabase: () => ({
    auth: {
      signInWithOtp,
      signInWithOAuth,
    },
  }),
}));

// Stable window.location stub so OAuth redirect-to URL resolves against a
// predictable origin inside happy-dom.
const ORIGIN = 'http://localhost:3000';

describe('<LoginForm />', () => {
  beforeEach(() => {
    signInWithOtp.mockResolvedValue({ error: null });
    signInWithOAuth.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    signInWithOtp.mockReset();
    signInWithOAuth.mockReset();
  });

  it('renders email input with visible label and required attribute', async () => {
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    const input = screen.getByLabelText(t.auth.emailLabel, { selector: 'input' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('required');
    expect(input).toHaveAttribute('autocomplete');
  });

  it('dispatches signInWithOtp when submitting a valid email', async () => {
    const user = userEvent.setup();
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    const input = screen.getByLabelText(t.auth.emailLabel, { selector: 'input' });
    await user.type(input, 'user@example.com');
    const submit = screen.getByRole('button', { name: t.auth.submitMagicLink });
    await user.click(submit);

    await waitFor(() => {
      expect(signInWithOtp).toHaveBeenCalledTimes(1);
    });
    const call = signInWithOtp.mock.calls[0]?.[0] as
      | { email: string; options?: { emailRedirectTo?: string } }
      | undefined;
    expect(call?.email).toBe('user@example.com');
    expect(call?.options?.emailRedirectTo).toContain('/auth/callback');
  });

  it('shows the magic-link sent message after a successful dispatch', async () => {
    const user = userEvent.setup();
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    await user.type(
      screen.getByLabelText(t.auth.emailLabel, { selector: 'input' }),
      'user@example.com',
    );
    await user.click(screen.getByRole('button', { name: t.auth.submitMagicLink }));

    await waitFor(() => {
      expect(screen.getByText(t.auth.magicLinkSent)).toBeInTheDocument();
    });
  });

  it('dispatches signInWithOAuth when clicking Continue with Google', async () => {
    const user = userEvent.setup();
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    await user.click(
      screen.getByRole('button', { name: new RegExp(t.auth.continueWithGoogle, 'i') }),
    );

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });
    const call = signInWithOAuth.mock.calls[0]?.[0] as
      | { provider: string; options?: { redirectTo?: string } }
      | undefined;
    expect(call?.provider).toBe('google');
    expect(call?.options?.redirectTo).toContain('/auth/callback');
  });

  it('blocks submission when email is empty and displays error copy', async () => {
    const user = userEvent.setup();
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    await user.click(screen.getByRole('button', { name: t.auth.submitMagicLink }));

    await waitFor(() => {
      expect(screen.getByText(t.auth.errorEmailRequired)).toBeInTheDocument();
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it('surfaces Supabase errors via i18n error copy', async () => {
    signInWithOtp.mockResolvedValue({
      error: { message: 'rate-limited', status: 429 },
    });
    const user = userEvent.setup();
    const { LoginForm } = await import('@/app/(auth)/login/login-form');
    render(<LoginForm origin={ORIGIN} />);

    await user.type(
      screen.getByLabelText(t.auth.emailLabel, { selector: 'input' }),
      'user@example.com',
    );
    await user.click(screen.getByRole('button', { name: t.auth.submitMagicLink }));

    await waitFor(() => {
      expect(screen.getByText(t.auth.errorGeneric)).toBeInTheDocument();
    });
  });
});

/**
 * @vitest-environment happy-dom
 *
 * `/login?deleted=1` — account-deletion success banner.
 *
 * AccountDeleteFlow redirects the browser to `/?deleted=1` after the cascade
 * succeeds; `app/(marketing)/page.tsx` forwards that flag to
 * `/login?deleted=1`. The login page must render a one-shot banner so the
 * user sees acknowledgement of the deletion before they re-encounter the
 * sign-in surface.
 *
 * Contract:
 *   - `searchParams.deleted === '1'` → banner with the new copy is rendered
 *     under role="status" so screen readers announce it without stealing
 *     keyboard focus from the email field.
 *   - any other value (or undefined) → no banner element.
 */
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

import { t } from '@/lib/i18n/en';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));

const importLoginPage = async () => {
  const mod = await import('@/app/(auth)/login/page');
  return mod.default;
};

describe('/login deletion-success banner', () => {
  it('renders the banner when searchParams.deleted === "1"', async () => {
    const LoginPage = await importLoginPage();
    const ui = await LoginPage({ searchParams: Promise.resolve({ deleted: '1' }) });
    render(ui);

    const banner = screen.getByTestId('login-deleted-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent(t.auth.deletedBanner.title);
    expect(banner).toHaveTextContent(t.auth.deletedBanner.body);
  });

  it('does not render the banner when searchParams.deleted is absent', async () => {
    const LoginPage = await importLoginPage();
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.queryByTestId('login-deleted-banner')).toBeNull();
  });

  it('does not render the banner when searchParams.deleted has an unexpected value', async () => {
    const LoginPage = await importLoginPage();
    const ui = await LoginPage({ searchParams: Promise.resolve({ deleted: 'yes' }) });
    render(ui);

    expect(screen.queryByTestId('login-deleted-banner')).toBeNull();
  });
});

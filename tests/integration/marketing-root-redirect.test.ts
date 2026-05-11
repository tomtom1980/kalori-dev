/**
 * @vitest-environment node
 *
 * Task B.1 (US-STAB-B1) — root `/` redirect contract.
 *
 * Pre-fix (commit `d2e287c`): anon visitors redirected to `/login`. That
 * matched AC1 (authed → /dashboard) but VIOLATED AC2 ("anon sees the public
 * landing page, no auth gate, no redirect to dashboard"). Path under work
 * for B.1 is "implement AC2".
 *
 * Post-fix contract:
 *   - Authed visitor: redirect to `/dashboard` (forwards `?deleted=1`).
 *   - Anon visitor (or auth-error visitor — fail closed by treating like
 *     anon, NEVER expose authed-only routes): render
 *     `<MarketingLanding deleted={...} />` inline. NO redirect call.
 *   - `?deleted=1` reaches the landing component as the `deleted` boolean
 *     prop so the account-deletion success banner can render in-place.
 *   - Any other `deleted` query value (e.g. `deleted=other`) is treated as
 *     `false` — banner omitted from DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

type SearchParams = { deleted?: string | string[] };

async function invokePage(searchParams?: SearchParams): Promise<unknown> {
  const { default: MarketingLandingPage } = await import('@/app/(marketing)/page');
  if (searchParams === undefined) {
    return MarketingLandingPage({});
  }
  return MarketingLandingPage({ searchParams: Promise.resolve(searchParams) });
}

/**
 * Inspect a returned React element's props.
 *
 * The page is a Server Component so the call returns a React element
 * (`{ type, props, ... }`) we can shallow-inspect in node env without a
 * DOM. We do NOT render to HTML here; the visual surface is asserted by
 * the Playwright E2E `tests/e2e/web/user-stories/US-STAB-B1.spec.ts`.
 */
function elementProps(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`Expected a React element, got: ${String(value)}`);
  }
  const candidate = value as { props?: Record<string, unknown> };
  if (!candidate.props || typeof candidate.props !== 'object') {
    throw new Error('React element has no `props`');
  }
  return candidate.props;
}

describe('marketing `/` root contract', () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.redirect.mockReset();
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('anonymous visitor (no user) renders the landing — does NOT redirect', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await invokePage();

    expect(result).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
    // Default render: no `?deleted=1` → banner omitted (deleted prop = false).
    expect(elementProps(result).deleted).toBe(false);
  });

  it('authenticated visitor redirects to /dashboard', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-authed' } },
      error: null,
    });

    await expect(invokePage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('auth lookup error treated as anonymous → renders landing (no redirect)', async () => {
    // A failure on `auth.getUser()` (e.g. transient Supabase outage) must not
    // expose authed-only screens. Treat as anonymous — render the landing
    // so the user can still navigate. Redirecting to `/login` would be a
    // ping-pong risk if `/login` itself depends on the same auth call.
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'transient' },
    });

    const result = await invokePage();

    expect(result).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(elementProps(result).deleted).toBe(false);
  });

  // Account-deletion success: `AccountDeleteFlow` navigates the browser to
  // `/?deleted=1` after the cascade. The new contract surfaces the banner
  // INLINE on the landing instead of bouncing to `/login?deleted=1`. The
  // landing component receives `deleted=true` and renders
  // `landing-deleted-banner` above the wordmark.
  it('anonymous visitor with ?deleted=1 renders landing with deleted banner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await invokePage({ deleted: '1' });

    expect(result).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(elementProps(result).deleted).toBe(true);
  });

  it('authenticated visitor with ?deleted=1 redirects to /dashboard?deleted=1', async () => {
    // Authed-with-deleted=1 should not happen post-cascade (auth has been
    // revoked) but if it ever does we forward the flag rather than swallow
    // it — failing closed on observability rather than UX.
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-authed' } },
      error: null,
    });

    await expect(invokePage({ deleted: '1' })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard?deleted=1');
  });

  it('ignores `deleted` values other than "1" (banner omitted from landing)', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await invokePage({ deleted: 'yes' });

    expect(result).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(elementProps(result).deleted).toBe(false);
  });
});

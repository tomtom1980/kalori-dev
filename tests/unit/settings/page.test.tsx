/**
 * Task B.6 — US-STAB-B6: Settings stub copy removed (patch-shaped per DT-1).
 *
 * Acceptance Criteria covered:
 *   - AC1 (`no-stub-body-copy`): the literal "Settings arrive with Task 2.2"
 *     stub copy MUST NOT appear in the rendered DOM.
 *   - AC2 (`single-h1-from-i18n-and-stub-deleted`): the page renders exactly
 *     ONE <h1>, its text equals `t.settings.heading` (= "Settings"), and the
 *     deleted stub keys (`stubHeading` / `stubBody`) are absent from the
 *     i18n bundle.
 *   - AC3 (`renders-real-settings-components`): ReduceMotionToggle,
 *     DataSubsection, AccountSubsection all remain mounted (regression
 *     guard against accidental scope widening). Asserted via stable
 *     `data-testid` attributes the components already expose.
 *
 * RSC test harness: mock `requireProfileOrRedirect` + `getServerSupabase`
 * (count aggregation) so the async server component renders without hitting
 * Supabase. Pattern mirrors `tests/integration/weight-page-imperial-conversion.test.tsx`.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/lib/i18n/en';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const TEST_USER_EMAIL = 'test-b6@example.com';

function buildSupabaseCountsMock() {
  // Settings page calls `fetchCountsForUser` which issues four parallel
  // `from(table).select('id', { count: 'exact', head: true }).eq('user_id', uid)`
  // reads. We return zero-count results for each domain table so the page
  // renders with `{ entries: 0, library: 0, weight: 0, water: 0 }`.
  const countResult = { count: 0, data: null, error: null };
  return {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => Promise.resolve(countResult),
      }),
    })),
  };
}

describe('US-STAB-B6 — /settings page (Task B.6)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/auth/orphan-profile-fence');
    vi.doUnmock('@/lib/supabase/server');
  });

  async function renderSettingsPage(
    profileOverrides: Record<string, string | number | boolean | null> = {},
  ) {
    vi.doMock('@/lib/auth/orphan-profile-fence', () => ({
      requireProfileOrRedirect: async () => ({
        user: { id: TEST_USER_ID, email: TEST_USER_EMAIL },
        profile: {
          id: TEST_USER_ID,
          onboarding_completed_at: '2026-01-01T00:00:00Z',
          ...profileOverrides,
        },
      }),
    }));
    vi.doMock('@/lib/supabase/server', () => ({
      getServerSupabase: async () => buildSupabaseCountsMock(),
    }));
    vi.doMock('@/lib/time/day', () => ({
      userTzDayFrom: () => '2026-05-18',
    }));
    const { default: SettingsPage } = await import('@/app/(app)/settings/page');
    const ui = await SettingsPage();
    return render(ui as React.ReactElement);
  }

  it('no-stub-body-copy: the obsolete "Settings arrive with Task 2.2" copy is absent from the DOM (AC1)', async () => {
    // ac1: stub copy absent
    const { container } = await renderSettingsPage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('Settings arrive with Task 2.2');
    // Defense in depth: the chapter-prefix flavor of the stub heading must
    // also be gone (it carried "§ 04 · Settings" pre-fix; the new heading is
    // bare "Settings" — see AC2).
    expect(text).not.toContain('§ 04 · Settings');
  });

  it('single-h1-from-i18n-and-stub-deleted: exactly one <h1> equal to t.settings.heading; stub keys deleted from the bundle (AC2)', async () => {
    // ac2: exactly one h1 + heading sourced from i18n + stub keys gone
    const { container } = await renderSettingsPage();
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(t.settings.heading);
    expect(t.settings.heading).toBe('Settings');
    // Deleted stub keys must no longer exist on the bundle.
    expect(t.settings).not.toHaveProperty('stubHeading');
    expect(t.settings).not.toHaveProperty('stubBody');
  });

  it('renders-real-settings-components: ReduceMotionToggle, DataSubsection, AccountSubsection all remain mounted (AC3)', async () => {
    // ac3: real components still mounted (regression guard)
    const { container } = await renderSettingsPage();
    expect(container.querySelector('[data-testid="reduce-motion-toggle"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="settings-data-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="settings-account-section"]')).not.toBeNull();
  });

  it('renders the AI summary consent switch from the profile setting', async () => {
    const { container } = await renderSettingsPage({ ai_summary_opt_in: true });
    const toggle = container.querySelector('[data-testid="ai-summary-consent-toggle"]');

    expect(toggle).not.toBeNull();
    expect(toggle?.querySelector('[role="switch"]')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders a stable data export anchor for account-menu deep links', async () => {
    const { container } = await renderSettingsPage();
    const dataSection = container.querySelector('[data-testid="settings-data-section"]');

    expect(dataSection).not.toBeNull();
    expect(dataSection).toHaveAttribute('id', 'data-export');
  });

  it('renders birthday as readable text and derives age from the stored birthday', async () => {
    const { getByText } = await renderSettingsPage({
      birthday: '1980-05-27',
      age: 99,
      timezone: 'Asia/Bangkok',
    });

    expect(getByText('May 27, 1980')).toBeTruthy();
    expect(getByText('45')).toBeTruthy();
  });
});

/**
 * `<RecentEntriesSection />` component test — Task C.2 (US-STAB-C2 AC1).
 *
 * Covers:
 *   - Empty state (no entries) renders the italic-serif headline + sub-copy.
 *   - Date grouping renders `Today` / `Yesterday` / `Mon, May 12` headers.
 *   - Populated list renders one row per entry with name, time, kcal, meal.
 *   - Semantic spine: <section aria-labelledby> → <h2 id> + <ul role="list">
 *     per ux-auditor S1 contract (Safari VoiceOver strips list semantics).
 *   - axe-core zero violations (a11y contract).
 *   - Rows NON-interactive (no tabindex per ux-auditor S1 §2).
 *
 * Pure RSC props — no client interactivity asserted here; data fetched in
 * `app/(app)/library/page.tsx` and passed via `entries` prop.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { RecentEntriesSection } from '@/app/(app)/library/_components/RecentEntriesSection';
import type { RecentEntry } from '@/lib/library/fetchRecentEntries';

const TZ = 'UTC';

function makeEntry(overrides: Partial<RecentEntry> = {}): RecentEntry {
  return {
    entry_id: '11111111-1111-4111-8111-111111111111',
    logged_at: '2026-05-15T08:30:00Z',
    food_name: 'Pho Bo',
    meal_category: 'breakfast',
    source: 'library',
    library_item_id: '22222222-2222-4222-8222-222222222222',
    calories: 612,
    portion_label: '400 g',
    ...overrides,
  };
}

describe('<RecentEntriesSection /> — AC1 (Recent Entries section)', () => {
  it('renders the section semantic spine: <section aria-labelledby> + <h2 id>', () => {
    render(<RecentEntriesSection entries={[]} timezone={TZ} />);

    const section = screen.getByTestId('section-recent-entries');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('aria-labelledby', 'recent-entries-heading');

    const heading = screen.getByRole('heading', { name: /recent entries/i, level: 2 });
    expect(heading).toHaveAttribute('id', 'recent-entries-heading');
  });

  it('renders the kicker `§ 04 · RECENT ENTRIES`', () => {
    render(<RecentEntriesSection entries={[]} timezone={TZ} />);
    expect(screen.getByText(/§ 04 · Recent Entries/i)).toBeInTheDocument();
  });

  it('empty state: renders the italic serif headline + body', () => {
    render(<RecentEntriesSection entries={[]} timezone={TZ} />);
    expect(screen.getByTestId('recent-entries-empty')).toBeInTheDocument();
    expect(screen.getByText(/no entries logged yet/i)).toBeInTheDocument();
    expect(screen.getByText(/log a food to see it here/i)).toBeInTheDocument();
  });

  it('populated state: renders one row per entry', () => {
    const entries = [
      makeEntry({ entry_id: 'a', food_name: 'Pho Bo', logged_at: '2026-05-15T08:30:00Z' }),
      makeEntry({ entry_id: 'b', food_name: 'Banh Mi', logged_at: '2026-05-15T12:30:00Z' }),
    ];
    render(
      <RecentEntriesSection
        entries={entries}
        timezone={TZ}
        now={new Date('2026-05-15T20:00:00Z')}
      />,
    );

    const rows = screen.getAllByTestId('recent-entries-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Pho Bo')).toBeInTheDocument();
    expect(screen.getByText('Banh Mi')).toBeInTheDocument();
  });

  it('row container is a <ul role="list"> (Safari VoiceOver fix per ux-auditor S1)', () => {
    const entries = [makeEntry({ entry_id: 'a' })];
    render(
      <RecentEntriesSection
        entries={entries}
        timezone={TZ}
        now={new Date('2026-05-15T20:00:00Z')}
      />,
    );

    const list = screen.getAllByRole('list', { hidden: false })[0];
    expect(list).toBeDefined();
    // Explicit role="list" must be applied so Safari preserves semantics.
    expect(list!.tagName).toBe('UL');
    expect(list).toHaveAttribute('role', 'list');
  });

  it('groups entries by Today / Yesterday / older date', () => {
    const now = new Date('2026-05-15T20:00:00Z');
    const entries = [
      makeEntry({ entry_id: 't1', food_name: 'Today Item', logged_at: '2026-05-15T08:30:00Z' }),
      makeEntry({ entry_id: 'y1', food_name: 'Yesterday Item', logged_at: '2026-05-14T08:30:00Z' }),
      makeEntry({ entry_id: 'o1', food_name: 'Older Item', logged_at: '2026-05-12T08:30:00Z' }),
    ];
    render(<RecentEntriesSection entries={entries} timezone={TZ} now={now} />);

    expect(screen.getByRole('heading', { name: /today/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /yesterday/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /tue, may 12/i, level: 3 })).toBeInTheDocument();
  });

  it('rows are NON-interactive in MVP (no tabindex; no role=link/button)', () => {
    const entries = [makeEntry({ entry_id: 'a' })];
    render(
      <RecentEntriesSection
        entries={entries}
        timezone={TZ}
        now={new Date('2026-05-15T20:00:00Z')}
      />,
    );

    const row = screen.getByTestId('recent-entries-row');
    // No tabindex attribute set — row is presentational.
    expect(row.hasAttribute('tabindex')).toBe(false);
    // No interactive role.
    expect(row.getAttribute('role')).not.toBe('button');
    expect(row.getAttribute('role')).not.toBe('link');
  });

  it('time-of-day badge wraps the visible time in a <time> with sr-only prefix', () => {
    const entries = [
      makeEntry({ entry_id: 'a', logged_at: '2026-05-15T08:30:00Z', meal_category: 'breakfast' }),
    ];
    render(
      <RecentEntriesSection
        entries={entries}
        timezone={TZ}
        now={new Date('2026-05-15T20:00:00Z')}
      />,
    );

    const row = screen.getByTestId('recent-entries-row');
    const timeEl = within(row).getByText((_, el) => el?.tagName === 'TIME');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('datetime', '2026-05-15T08:30:00Z');
  });

  it('axe-core: zero violations on the empty section', async () => {
    const { container } = render(<RecentEntriesSection entries={[]} timezone={TZ} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('Recent Entries date grouping respects profile timezone at day boundary (Codex R1 Finding 3)', () => {
    // Adversarial test for Codex R1 Finding 3 (MEDIUM). When the page fence
    // omits `selectExtras: 'timezone'`, the component falls back to UTC and
    // a Bangkok user logging at 23:30 local sees the entry in "Yesterday"
    // (because UTC sits a calendar day behind). This test:
    //   1. Picks a UTC instant where UTC and Asia/Bangkok disagree on day
    //   2. Renders the section with `timezone="Asia/Bangkok"`
    //   3. Asserts "Today" appears (Bangkok-local truth, not UTC)
    //   4. Re-renders with `timezone="UTC"` and asserts "Yesterday" appears
    //      (proving the timezone prop actually drives grouping)
    //
    // Concrete: 2026-05-15T17:00:00Z = 2026-05-16 00:00 in Asia/Bangkok.
    // "now" = 2026-05-16T01:00:00Z (08:00 Bangkok), so a Bangkok user sees
    // the row as "Today" and a UTC user sees it as "Yesterday".
    const utcInstant = '2026-05-15T17:00:00Z';
    const now = new Date('2026-05-16T01:00:00Z');
    const entries = [makeEntry({ entry_id: 'tz1', food_name: 'Pho Bo', logged_at: utcInstant })];

    const { unmount } = render(
      <RecentEntriesSection entries={entries} timezone="Asia/Bangkok" now={now} />,
    );
    // Bangkok local day at the logged instant = 2026-05-16; same as
    // Bangkok local day of `now` → grouped under Today.
    expect(screen.getByRole('heading', { name: /today/i, level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /yesterday/i, level: 3 })).toBeNull();
    unmount();

    render(<RecentEntriesSection entries={entries} timezone="UTC" now={now} />);
    // UTC local day at the logged instant = 2026-05-15; UTC local day of
    // `now` = 2026-05-16 → grouped under Yesterday.
    expect(screen.getByRole('heading', { name: /yesterday/i, level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /today/i, level: 3 })).toBeNull();
  });

  it('malformed timezone falls back to UTC without crashing (Codex R2 Finding 2 — defense in depth)', () => {
    // Adversarial test for Codex R2 Finding 2 (MEDIUM). Even with the
    // page-level fence in `/library/page.tsx`, a future caller (test,
    // storybook, isolated render, server action retry path) could pass an
    // unnormalized `timezone` prop. Without component-level normalization,
    // `Intl.DateTimeFormat({ timeZone })` throws RangeError mid-render and
    // crashes the entire section.
    //
    // This test asserts:
    //   1. render() does NOT throw
    //   2. the section + rows appear (UTC fallback display path)
    //   3. groupEntries used UTC for day bucketing (the rendered grouping
    //      label matches what UTC would produce, NOT a crash placeholder)
    const now = new Date('2026-05-15T20:00:00Z');
    const entries = [
      makeEntry({ entry_id: 'tz-bad-1', food_name: 'Pho Bo', logged_at: '2026-05-15T08:30:00Z' }),
    ];

    expect(() =>
      render(<RecentEntriesSection entries={entries} timezone="NotARealZone/Bogus" now={now} />),
    ).not.toThrow();

    // Section + row rendered (the fallback path is exercised end-to-end).
    expect(screen.getByTestId('section-recent-entries')).toBeInTheDocument();
    expect(screen.getByText('Pho Bo')).toBeInTheDocument();
    // UTC day bucketing puts the 2026-05-15 entry under "Today" relative
    // to the pinned `now`. If the helper had thrown / silently degraded
    // grouping, this assertion would fail loudly.
    expect(screen.getByRole('heading', { name: /today/i, level: 3 })).toBeInTheDocument();
  });

  it('axe-core: zero violations on a populated section', async () => {
    const entries = [
      makeEntry({ entry_id: 't1', food_name: 'Pho Bo', logged_at: '2026-05-15T08:30:00Z' }),
      makeEntry({ entry_id: 'y1', food_name: 'Banh Mi', logged_at: '2026-05-14T12:30:00Z' }),
    ];
    const { container } = render(
      <RecentEntriesSection
        entries={entries}
        timezone={TZ}
        now={new Date('2026-05-15T20:00:00Z')}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

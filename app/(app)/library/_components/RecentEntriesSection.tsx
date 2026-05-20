/**
 * `<RecentEntriesSection />` — Task C.2 (US-STAB-C2 AC1).
 *
 * Pure Server Component rendering the last-N `food_entries` for the user.
 * Stacked below the existing My Library grid on `/library`. No client island
 * (read-only history in MVP per briefing Open Q #2). Parent `page.tsx`
 * owns the fetch via `lib/library/fetchRecentEntries.ts` and passes the
 * resolved rows as the `entries` prop.
 *
 * Semantic spine (ux-auditor S1 contract):
 *   <section aria-labelledby="recent-entries-heading">
 *     <header><p kicker>§ 04 · Recent Entries</p>
 *             <h2 id="recent-entries-heading">Recent Entries</h2></header>
 *     <h3 id="re-group-today">Today</h3>
 *     <ul role="list" aria-labelledby="re-group-today">
 *       <li data-testid="recent-entries-row">…</li>
 *     </ul>
 *   </section>
 *
 * Safari VoiceOver strips list semantics from `<ul>`s with `list-style:none`
 * — `role="list"` re-asserts it (per ux-auditor S1 §1).
 *
 * Date grouping: Today / Yesterday / `EEE, MMM d` per the user's timezone
 * (`profiles.timezone`; defaults to UTC). Rows are NON-interactive (no
 * tabindex) — focus would be a dead-end stop until /entries/[id] ships
 * post-MVP (ux-auditor S1 §2).
 *
 * Tokens-only: relies on `kalori-re-*` utility classes that map to project
 * design tokens (no inline color, no Tailwind colour utilities, no shadows,
 * zero radius — Ledger aesthetic invariants).
 */
import type { RecentEntry } from '@/lib/library/fetchRecentEntries';
import { t } from '@/lib/i18n/en';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

import { RecentEntriesEmpty } from './RecentEntriesEmpty';

export interface RecentEntriesSectionProps {
  entries: ReadonlyArray<RecentEntry>;
  /** IANA timezone string (e.g. 'Asia/Ho_Chi_Minh'); falls back to 'UTC'. */
  timezone?: string;
  /** Test seam — pin "now" deterministically; defaults to new Date(). */
  now?: Date;
  /** Renders an inline error fallback instead of the row list. */
  errored?: boolean;
}

const MEAL_LABEL: Record<RecentEntry['meal_category'], string> = {
  breakfast: t.library.recentEntries.mealBreakfast,
  lunch: t.library.recentEntries.mealLunch,
  dinner: t.library.recentEntries.mealDinner,
  snack: t.library.recentEntries.mealSnack,
  // `drink` is in the DB enum but UX presents it as snack-equivalent label.
  drink: t.library.recentEntries.mealSnack,
};

type Group = {
  key: string;
  label: string;
  entries: RecentEntry[];
};

function getLocalDateParts(iso: string, timezone: string): { y: number; m: number; d: number } {
  const date = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === 'year')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? '0');
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? '0');
  return { y, m, d };
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function formatOlderHeader(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

function groupEntries(entries: ReadonlyArray<RecentEntry>, now: Date, timezone: string): Group[] {
  const today = getLocalDateParts(now.toISOString(), timezone);
  const yesterdayMs = now.getTime() - 24 * 60 * 60 * 1000;
  const yesterday = getLocalDateParts(new Date(yesterdayMs).toISOString(), timezone);

  const map = new Map<string, Group>();
  for (const entry of entries) {
    const parts = getLocalDateParts(entry.logged_at, timezone);
    const key = `${parts.y}-${parts.m}-${parts.d}`;
    let label: string;
    if (parts.y === today.y && parts.m === today.m && parts.d === today.d) {
      label = t.library.recentEntries.groupToday;
    } else if (parts.y === yesterday.y && parts.m === yesterday.m && parts.d === yesterday.d) {
      label = t.library.recentEntries.groupYesterday;
    } else {
      label = formatOlderHeader(entry.logged_at, timezone);
    }
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
    } else {
      map.set(key, { key, label, entries: [entry] });
    }
  }
  // Preserve incoming order (caller is responsible for logged_at DESC sort).
  return Array.from(map.values());
}

export function RecentEntriesSection({
  entries,
  timezone = 'UTC',
  now = new Date(),
  errored = false,
}: RecentEntriesSectionProps) {
  // Codex R2 Finding 2 (MEDIUM) — defense-in-depth normalization. The
  // page-level fence normalizes `profile.timezone` before passing it here,
  // but a future caller (test, isolated rendering, storybook) may pass a
  // malformed string. Without this, `Intl.DateTimeFormat({ timeZone })`
  // throws RangeError + crashes `/library` render. Falls back to UTC.
  const tz = normalizeProfileTimezone(timezone, { sentryTag: 'recent-entries-section' });
  const groups = groupEntries(entries, now, tz);

  return (
    <section
      data-testid="section-recent-entries"
      aria-labelledby="recent-entries-heading"
      className="kalori-re-section"
    >
      <header className="kalori-re-header">
        <p className="kalori-re-kicker">{t.library.recentEntries.kicker}</p>
        <h2 id="recent-entries-heading" className="kalori-re-title">
          {t.library.recentEntries.title}
        </h2>
      </header>

      {errored ? (
        <p data-testid="recent-entries-error" role="alert" className="kalori-re-error">
          {/* Section-scoped error — page-level fetcher captures + flags `errored`. */}
          {t.library.recentEntries.errorMessage}
        </p>
      ) : entries.length === 0 ? (
        <RecentEntriesEmpty />
      ) : (
        groups.map((group, idx) => {
          const groupId = `re-group-${idx}-${group.key}`;
          return (
            <div key={group.key} className="kalori-re-group">
              <h3 id={groupId} className="kalori-re-group-heading">
                {group.label}
              </h3>
              <ul role="list" aria-labelledby={groupId} className="kalori-re-list">
                {group.entries.map((entry) => {
                  const visibleTime = formatTime(entry.logged_at, tz);
                  const mealLabel = MEAL_LABEL[entry.meal_category];
                  const rowAria = t.library.recentEntries.rowAriaLabel
                    .replace('{name}', entry.food_name)
                    .replace('{meal}', mealLabel)
                    .replace('{time}', visibleTime)
                    .replace('{kcal}', String(entry.calories));
                  return (
                    <li
                      key={entry.entry_id}
                      data-testid="recent-entries-row"
                      data-entry-id={entry.entry_id}
                      aria-label={rowAria}
                      className="kalori-re-row"
                    >
                      <span className="kalori-re-name">{entry.food_name}</span>
                      <span className="kalori-re-meal">{mealLabel}</span>
                      <span className="kalori-re-time">
                        <span className="sr-only">{t.library.recentEntries.timeSrPrefix} </span>
                        <time dateTime={entry.logged_at}>{visibleTime}</time>
                      </span>
                      {entry.portion_label ? (
                        <span className="kalori-re-portion" aria-hidden="true">
                          {entry.portion_label}
                        </span>
                      ) : null}
                      <span className="kalori-re-kcal">
                        {entry.calories}
                        <span className="kalori-re-kcal-suffix" aria-hidden="true">
                          {t.library.recentEntries.kcalSuffix}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

export default RecentEntriesSection;

'use client';

/**
 * <MealColumn /> - dashboard meal category column.
 *
 * Renders one meal category (breakfast/lunch/dinner/snack/drink). Entry
 * action controls remain client leaves; timestamps are formatted in the
 * user's profile/device timezone supplied by the dashboard page.
 */
import { EntryRowActions, MealAddButton } from './MealEntryContextTrigger';

import { t } from '@/lib/i18n/en';
import { m, AnimatePresence, useReducedMotion } from '@/lib/motion/defaults';
import { formatTimeInTimeZone } from '@/lib/time/format';
import type { FoodEntry, MealCategory, MealColumnData } from '@/lib/dashboard/types';

export interface MealColumnProps {
  data: MealColumnData;
  timezone?: string;
  viewedDay?: string | undefined;
}

function formatEntryTime(iso: string, timezone: string): string {
  return formatTimeInTimeZone(iso, timezone);
}

function entryTotalKcal(e: FoodEntry): number {
  return e.items.reduce((n, it) => n + it.kcal, 0);
}

function primaryName(e: FoodEntry): string {
  return e.items[0]?.name ?? 'Entry';
}

function primaryPortion(e: FoodEntry): string {
  const first = e.items[0];
  if (!first) return '';
  return `${first.portion} ${first.unit}`;
}

export function MealColumn({ data, timezone = 'UTC', viewedDay }: MealColumnProps) {
  const reducedMotion = useReducedMotion();
  const cat: MealCategory = data.category;
  const headingId = `meal-head-${cat}`;
  const kcal = data.totalKcal;
  const timeRange = t.dashboard.meals.timeRange[cat];
  const label = t.dashboard.meals.categoryLabel[cat];
  const kicker = t.dashboard.meals.kicker[cat];
  const empty = t.dashboard.meals.empty[cat];
  const isEmpty = data.entries.length === 0;

  return (
    <section
      data-testid={`meal-column-${cat}`}
      aria-labelledby={headingId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--spacing-3)',
        borderRight: '1px solid var(--color-rule)',
      }}
    >
      <p
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
        }}
      >
        {kicker}
      </p>
      <h2
        id={headingId}
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 24,
          fontWeight: 300,
          lineHeight: 1.2,
          margin: 0,
          marginTop: 'var(--spacing-1)',
          color: 'var(--color-ivory)',
        }}
      >
        {label.toUpperCase()}
        {kcal > 0 ? (
          <span
            className="num"
            style={{
              fontStyle: 'italic',
              fontSize: 14,
              color: 'var(--color-sand)',
              marginLeft: 'var(--spacing-3)',
            }}
          >
            {`${kcal} ${t.dashboard.ring.kcalUnit}`}
          </span>
        ) : null}
      </h2>
      <p
        className="num"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-dust)',
          margin: 0,
          marginTop: 'var(--spacing-1)',
        }}
      >
        {timeRange}
      </p>
      <hr
        style={{
          border: 0,
          borderTop: '1px solid var(--color-rule)',
          marginBlock: 'var(--spacing-2)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-3)',
          minHeight: 60,
        }}
      >
        <AnimatePresence mode="popLayout">
          {isEmpty ? (
            <m.p
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              data-testid={`meal-empty-${cat}`}
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--color-sand)',
                margin: 0,
              }}
            >
              {empty}
            </m.p>
          ) : (
          data.entries.map((entry) => {
            const isHeaviest = entry.id === data.heaviestEntryId;
            const entryKcal = entryTotalKcal(entry);
            return (
              <m.article
                layout="position"
                initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileTap={{ scale: 0.97 }}
                viewport={{ once: true, margin: '0px 0px -20px 0px' }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                key={entry.id}
                data-testid={`entry-${entry.id}`}
                role="button"
                tabIndex={0}
                aria-label={t.dashboard.meals.entryAriaLabel
                  .replace('{name}', primaryName(entry))
                  .replace('{portion}', primaryPortion(entry))
                  .replace('{kcal}', String(entryKcal))
                  .replace('{time}', formatEntryTime(entry.logged_at, timezone))}
                aria-haspopup="menu"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--spacing-1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 18,
                      color: 'var(--color-ivory)',
                    }}
                  >
                    {primaryName(entry)}
                  </span>
                  <EntryRowActions entry={entry} timezone={timezone} viewedDay={viewedDay} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--color-dust)',
                  }}
                >
                  <span className="num">{primaryPortion(entry)}</span>
                  <span
                    className="num"
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontStyle: 'italic',
                      fontSize: 14,
                      color: isHeaviest ? 'var(--color-ember)' : 'var(--color-sand)',
                    }}
                  >
                    {`${entryKcal} ${t.dashboard.ring.kcalUnit}`}
                  </span>
                </div>
              </m.article>
            );
          })
          )}
        </AnimatePresence>
      </div>

      <MealAddButton category={cat} timezone={timezone} viewedDay={viewedDay} />
    </section>
  );
}

export default MealColumn;

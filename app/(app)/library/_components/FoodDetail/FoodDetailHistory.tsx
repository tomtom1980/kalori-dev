'use client';

/**
 * <FoodDetailHistory /> — Task 4.2.
 *
 * § 05 · HISTORY block. Shows first-logged timestamp, total count, and
 * the 5 most-recent uses. Empty-state banner when the item has never
 * been logged.
 */
import { t } from '@/lib/i18n/en';

import { formatFiledDate } from './foodDetail.format';

export interface HistoryRow {
  id: string;
  loggedAt: string;
  mealCategory: string;
}

export interface HistoryData {
  firstLoggedAt: string | null;
  totalLogCount: number;
  recent: HistoryRow[];
}

export interface FoodDetailHistoryProps {
  history: HistoryData;
}

export function FoodDetailHistory({ history }: FoodDetailHistoryProps) {
  const hasHistory = history.totalLogCount > 0;
  if (!hasHistory) {
    return (
      <p role="status" data-testid="food-detail-never-logged" className="kalori-fd-never-logged">
        {t.library.detail.neverLogged}
      </p>
    );
  }

  return (
    <div data-testid="food-detail-history">
      <div className="kalori-fd-history-stats">
        <span data-testid="food-detail-history-first">
          {t.library.detail.firstLoggedFormat.replace(
            '{date}',
            formatFiledDate(history.firstLoggedAt),
          )}
        </span>
        <span data-testid="food-detail-history-count">
          {t.library.detail.totalCountFormat.replace('{count}', String(history.totalLogCount))}
        </span>
      </div>
      {history.recent.length > 0 ? (
        <>
          <p
            className="kalori-fd-kicker"
            style={{ marginTop: 'var(--spacing-6)', marginBottom: 0 }}
          >
            {t.library.detail.recentUsesHeading}
          </p>
          <ul className="kalori-fd-history-recent" data-testid="food-detail-history-recent">
            {history.recent.map((row) => (
              <li key={row.id} className="kalori-fd-history-row">
                <time dateTime={row.loggedAt} className="kalori-fd-history-date num">
                  {formatFiledDate(row.loggedAt)}
                </time>
                <span className="kalori-fd-history-meal">{row.mealCategory}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default FoodDetailHistory;

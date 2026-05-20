'use client';

import { CalendarDays, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';

export interface DashboardDateControlProps {
  viewedDay: string;
  today: string;
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date, 12, 0, 0)));
}

function isIsoDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * DashboardDateControl
 *
 * Renders the native `<input type="date">` directly as the tap target so iOS
 * Safari opens its OS-level wheel picker on a real user tap. The visible
 * calendar icon is a decorative overlay (`pointer-events: none`,
 * `aria-hidden="true"`). The input itself is positioned absolutely over a
 * 44×44 wrapper, kept layout-preserving with `opacity: 0`, but
 * `pointer-events: auto` so taps land on the input — which is the gesture
 * iOS requires before opening the picker.
 *
 * This pattern aligns with `Planning/ui-design.md` §10.6.1 line 2990:
 * "<input type='time'> and <input type='date'> ALREADY render an OS-level
 * wheel on iOS/Android — do NOT shim them." Sibling precedent:
 * `WeightQuickAdd.tsx` and `Confirmation/TimeEditor.tsx` both use the native
 * input directly with no proxy button + showPicker shim.
 */
export function DashboardDateControl({ viewedDay, today }: DashboardDateControlProps) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const loadingDay = useDashboardDateTransitionStore((state) => state.loadingDay);
  const setLoadingDay = useDashboardDateTransitionStore((state) => state.setLoadingDay);
  const clearLoadingDay = useDashboardDateTransitionStore((state) => state.clearLoadingDay);
  const isToday = viewedDay === today;
  const isLoading = loadingDay !== null && loadingDay !== viewedDay;

  useEffect(() => {
    if (loadingDay === viewedDay) {
      clearLoadingDay();
    }
  }, [clearLoadingDay, loadingDay, viewedDay]);

  function goToDay(day: string): void {
    if (!isIsoDay(day)) return;
    if (day === viewedDay || isLoading) return;
    if (day > today) {
      setMessage(t.dashboard.date.futureBlocked);
      return;
    }
    setMessage('');
    setLoadingDay(day);
    router.push(day === today ? '/dashboard' : `/dashboard?day=${day}`);
  }

  return (
    <section
      data-testid="dashboard-date-control"
      aria-label={t.dashboard.date.viewedDateLabel}
      aria-busy={isLoading}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacing-3)',
        flexWrap: 'wrap',
        borderTop: '1px solid var(--color-rule)',
        borderBottom: '1px solid var(--color-rule)',
        paddingBlock: 'var(--spacing-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
        <span
          className="kalori-dashboard-date-trigger"
          style={{
            position: 'relative',
            display: 'inline-grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            flex: '0 0 auto',
            background: isLoading ? 'var(--color-bg)' : 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            color: 'var(--color-sand)',
            cursor: isLoading ? 'wait' : 'pointer',
            opacity: isLoading ? 0.72 : 1,
          }}
        >
          <span
            data-testid="dashboard-date-icon"
            aria-hidden="true"
            style={{
              pointerEvents: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <input
            type="date"
            value={viewedDay}
            max={today}
            disabled={isLoading}
            data-testid="dashboard-date-input"
            aria-label={t.dashboard.date.pickerA11y}
            aria-busy={isLoading || undefined}
            onChange={(event) => goToDay(event.currentTarget.value)}
            // Desktop browsers (Chromium, Firefox, Safari) open the native
            // date picker on the spinner chevron — NOT on a click anywhere
            // in the field. Because this input is transparent (opacity: 0),
            // there is no visible chevron to click, so a plain field click
            // just focused the input without opening the picker. Calling
            // `showPicker()` inside the click handler — which always runs
            // under a user activation — opens the picker reliably on
            // desktop. iOS/Android keep working as before (they open the
            // OS-level wheel on field focus regardless of showPicker).
            onClick={(event) => {
              const el = event.currentTarget;
              if (typeof el.showPicker === 'function') {
                try {
                  el.showPicker();
                } catch {
                  /* picker unsupported / blocked — fall back to native focus */
                }
              }
            }}
            // FIX-5-A F2: inline `outline: none` previously overrode the
            // global `:focus-visible` ivory ring (2px solid ivory @ 2px
            // offset). The input is visually invisible (opacity: 0) but
            // remains the tab stop, so keyboard users need the canonical
            // focus ring to render on it. Inline outline removed; the
            // global rule now applies. `color: transparent` is retained
            // so the value text doesn't show through the decorative
            // calendar-icon overlay.
            style={{
              appearance: 'none',
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              margin: 0,
              padding: 0,
              pointerEvents: 'auto',
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: 0,
              background: 'transparent',
              border: 'none',
              outlineColor: 'var(--color-ivory)',
              font: 'inherit',
              color: 'transparent',
            }}
          />
        </span>
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: isToday ? 'var(--color-dust)' : 'var(--color-ember)',
            }}
          >
            {isToday ? t.dashboard.date.todayBadge : t.dashboard.date.pastBadge}
          </p>
          <p
            data-testid="dashboard-viewed-date"
            style={{
              margin: 0,
              marginTop: 2,
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 18,
              color: 'var(--color-ivory)',
            }}
          >
            {formatDay(viewedDay)}
          </p>
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              aria-label={t.dashboard.date.loadingDay}
              data-testid="dashboard-date-loading"
              style={{
                marginTop: 'var(--spacing-2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacing-2)',
                color: 'var(--color-sand)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--type-label)',
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              <span className="kalori-dashboard-date-spinner" aria-hidden="true" />
              {t.dashboard.date.loadingDay}
            </div>
          ) : null}
        </div>
      </div>

      {!isToday ? (
        <button
          type="button"
          aria-label={t.dashboard.date.resetTodayA11y}
          onClick={() => goToDay(today)}
          disabled={isLoading}
          style={{
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-2)',
            background: 'transparent',
            border: '1px solid var(--color-rule-strong)',
            color: 'var(--color-sand)',
            padding: '0 var(--spacing-3)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            cursor: isLoading ? 'wait' : 'pointer',
            opacity: isLoading ? 0.72 : 1,
          }}
        >
          <RotateCcw size={15} strokeWidth={1.6} aria-hidden="true" />
          {t.dashboard.date.todayButton}
        </button>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
      {isLoading ? (
        <div
          data-testid="dashboard-date-transition-shield"
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 42,
            background: 'rgba(10, 10, 10, 0.28)',
            backdropFilter: 'grayscale(0.25)',
            pointerEvents: 'auto',
            cursor: 'progress',
          }}
        />
      ) : null}
    </section>
  );
}

export default DashboardDateControl;

'use client';

import { CalendarDays, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

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

export function DashboardDateControl({ viewedDay, today }: DashboardDateControlProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  function openPicker(): void {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
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
        <button
          type="button"
          aria-label={t.dashboard.date.pickerA11y}
          onClick={openPicker}
          disabled={isLoading}
          style={{
            width: 44,
            height: 44,
            display: 'grid',
            placeItems: 'center',
            background: isLoading ? 'var(--color-bg)' : 'var(--color-bg-1)',
            border: '1px solid var(--color-rule-strong)',
            color: 'var(--color-sand)',
            cursor: isLoading ? 'wait' : 'pointer',
            opacity: isLoading ? 0.72 : 1,
          }}
        >
          <CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <input
          ref={inputRef}
          type="date"
          value={viewedDay}
          max={today}
          disabled={isLoading}
          data-testid="dashboard-date-input"
          aria-label={t.dashboard.date.pickerA11y}
          onChange={(event) => goToDay(event.currentTarget.value)}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
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

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';

import { PopoverInline } from '@/components/primitives/PopoverInline';
import { t } from '@/lib/i18n/en';

export type ProgressRangeMode = 'last_7' | 'last_30' | 'custom';

const ORDER: readonly ProgressRangeMode[] = ['last_7', 'last_30', 'custom'] as const;

export interface ProgressRangeToolbarProps {
  active: ProgressRangeMode;
  today: string;
  customStart?: string | undefined;
  customEnd?: string | undefined;
  windowLabel?: string;
}

export function ProgressRangeToolbar({
  active,
  today,
  customStart,
  customEnd,
  windowLabel,
}: ProgressRangeToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();
  const [pendingRange, setPendingRange] = useState<ProgressRangeMode | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const customAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const refs = useRef<Record<ProgressRangeMode, HTMLAnchorElement | null>>({
    last_7: null,
    last_30: null,
    custom: null,
  });
  const customStateKey = `${active}:${customStart ?? today}:${customEnd ?? today}`;
  const [customState, setCustomState] = useState({
    key: customStateKey,
    start: customStart ?? today,
    end: customEnd ?? today,
    error: null as string | null,
  });
  const currentCustomState =
    customState.key === customStateKey
      ? customState
      : {
          key: customStateKey,
          start: customStart ?? today,
          end: customEnd ?? today,
          error: null,
        };
  const { start, end, error } = currentCustomState;
  const resetCustomState = () => ({
    key: customStateKey,
    start: customStart ?? today,
    end: customEnd ?? today,
    error: null as string | null,
  });
  const setStart = (value: string) =>
    setCustomState((prev) => ({
      ...(prev.key === customStateKey ? prev : resetCustomState()),
      start: value,
      error: null,
    }));
  const setEnd = (value: string) =>
    setCustomState((prev) => ({
      ...(prev.key === customStateKey ? prev : resetCustomState()),
      end: value,
      error: null,
    }));
  const setCustomError = (validation: string | null) =>
    setCustomState((prev) => ({
      ...(prev.key === customStateKey
        ? prev
        : {
            key: customStateKey,
            start,
            end,
            error: null,
          }),
      error: validation,
    }));
  const pendingRangeSettled =
    pendingRange === null ||
    (pendingRange !== 'custom' && active === pendingRange) ||
    (pendingRange === 'custom' &&
      active === 'custom' &&
      customStart === start &&
      customEnd === end);
  const visiblePendingRange = pendingRangeSettled ? null : pendingRange;
  const controlsLocked = visiblePendingRange !== null;

  const openCustomEditor = useCallback(() => {
    setPendingRange(null);
    setCustomOpen(true);
  }, []);

  const hrefFor = useMemo(
    () =>
      (mode: ProgressRangeMode): string => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('range', mode);
        if (mode === 'custom') {
          params.set('start', customStart ?? start);
          params.set('end', customEnd ?? end);
        } else {
          params.delete('start');
          params.delete('end');
        }
        return `${pathname}?${params.toString()}`;
      },
    [customEnd, customStart, end, pathname, searchParams, start],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>, current: ProgressRangeMode) => {
      if (controlsLocked) {
        event.preventDefault();
        return;
      }
      const idx = ORDER.indexOf(current);
      let nextIdx = idx;
      if (event.key === 'ArrowRight') {
        nextIdx = (idx + 1) % ORDER.length;
      } else if (event.key === 'ArrowLeft') {
        nextIdx = (idx - 1 + ORDER.length) % ORDER.length;
      } else if (event.key === 'Home') {
        nextIdx = 0;
      } else if (event.key === 'End') {
        nextIdx = ORDER.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const target = ORDER[nextIdx]!;
      refs.current[target]?.focus();
      if (target === 'custom') {
        openCustomEditor();
        return;
      }
      setPendingRange(target);
      startNavigation(() => {
        router.replace(hrefFor(target), { scroll: false });
      });
    },
    [controlsLocked, hrefFor, openCustomEditor, router, startNavigation],
  );

  const applyCustom = () => {
    const validation = validateCustomRange(start, end, today);
    setCustomError(validation);
    if (validation) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', 'custom');
    params.set('start', start);
    params.set('end', end);
    setPendingRange('custom');
    setCustomOpen(false);
    startNavigation(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-2)',
      }}
    >
      {visiblePendingRange ? (
        <ProgressRangeLoadingOverlay pendingRange={visiblePendingRange} />
      ) : null}
      <nav
        role="tablist"
        aria-label={t.progress.toolbar.ariaLabel}
        data-testid="progress-range-toolbar"
        className="progress-range-toolbar"
        data-pending-navigation={controlsLocked ? 'true' : undefined}
        aria-busy={controlsLocked ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-4)',
          padding: 'var(--spacing-4)',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 10.5,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-oxblood-soft)',
          }}
        >
          {t.progress.toolbar.kicker}
        </span>
        <div style={{ display: 'flex', gap: 'var(--spacing-1)', flex: '1 1 auto', minWidth: 0 }}>
          {ORDER.map((mode) => {
            const isActive = mode === active;
            const isPending =
              visiblePendingRange === mode ||
              (!pendingRangeSettled && isNavigating && pendingRange === mode);
            const isDisabled = controlsLocked;
            return (
              <a
                key={mode}
                ref={(el) => {
                  refs.current[mode] = el;
                  if (mode === 'custom') customAnchorRef.current = el;
                }}
                role="tab"
                aria-selected={isActive}
                aria-busy={isPending ? 'true' : undefined}
                aria-disabled={isDisabled ? 'true' : undefined}
                aria-label={t.progress.toolbar.ariaDesc[mode]}
                tabIndex={isDisabled ? -1 : isActive ? 0 : -1}
                // @nav-audit href: /progress
                href={hrefFor(mode)}
                onKeyDown={(e) => onKeyDown(e, mode)}
                onClick={(e) => {
                  e.preventDefault();
                  if (isDisabled) return;
                  if (mode === 'custom') {
                    openCustomEditor();
                    return;
                  }
                  if (mode === active) return;
                  setPendingRange(mode);
                  startNavigation(() => {
                    router.replace(hrefFor(mode), { scroll: false });
                  });
                }}
                data-testid={`progress-range-chip-${mode}`}
                data-pending={isPending ? 'true' : undefined}
                className="chip"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  lineHeight: 1.2,
                  padding: '10px 16px',
                  minHeight: 44,
                  minWidth: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  border: `1px solid ${isActive ? 'var(--color-ivory)' : 'var(--color-rule)'}`,
                  background: isActive ? 'var(--color-ivory)' : 'transparent',
                  color: isActive ? 'var(--color-bg-0)' : 'var(--color-sand)',
                  borderRadius: 'var(--radius-input)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  opacity: isDisabled ? (isPending ? 0.72 : 0.42) : 1,
                  cursor: isDisabled ? 'wait' : 'pointer',
                  pointerEvents: isDisabled ? 'none' : undefined,
                }}
              >
                {t.progress.toolbar.labels[mode]}
              </a>
            );
          })}
        </div>
        <PopoverInline
          open={customOpen}
          onOpenChange={setCustomOpen}
          anchorRef={customAnchorRef}
          ariaLabel={t.progress.toolbar.ariaDesc.custom}
          data-testid="progress-custom-range-popover"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              applyCustom();
            }}
            style={{
              display: 'grid',
              gap: 'var(--spacing-3)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'var(--spacing-2)',
              }}
            >
              <DateField
                label={t.progress.toolbar.startDateLabel}
                value={start}
                max={today}
                onChange={setStart}
                disabled={controlsLocked}
              />
              <DateField
                label={t.progress.toolbar.endDateLabel}
                value={end}
                max={today}
                onChange={setEnd}
                disabled={controlsLocked}
              />
            </div>
            {error ? (
              <p role="alert" style={{ margin: 0, color: 'var(--color-error-text)' }}>
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={controlsLocked}
              aria-busy={visiblePendingRange === 'custom' ? 'true' : undefined}
              style={{
                minHeight: 44,
                border: '1px solid var(--color-oxblood)',
                background: 'var(--color-oxblood)',
                color: 'var(--color-ivory)',
                padding: '0 var(--spacing-4)',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: controlsLocked ? 'wait' : 'pointer',
                opacity: controlsLocked ? 0.68 : 1,
              }}
            >
              {t.progress.toolbar.applyCustom}
            </button>
          </form>
        </PopoverInline>
      </nav>
      {windowLabel ? (
        <p
          style={{
            margin: 0,
            padding: '0 var(--spacing-4)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-oxblood-soft)',
          }}
          data-testid="progress-range-window-label"
        >
          {windowLabel}
        </p>
      ) : null}
    </div>
  );
}

function ProgressRangeLoadingOverlay({ pendingRange }: { pendingRange: ProgressRangeMode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t.progress.toolbar.loadingTitle}
      data-testid="progress-range-loading-overlay"
      className="progress-range-loading-overlay"
    >
      <div className="progress-range-loading-panel">
        <span aria-hidden="true" className="progress-range-loading-mark">
          <span />
          <span />
          <span />
        </span>
        <span className="progress-range-loading-kicker">{t.progress.toolbar.kicker}</span>
        <strong>{t.progress.toolbar.loadingTitle}</strong>
        <span>{t.progress.toolbar.loadingBody(t.progress.toolbar.labels[pendingRange])}</span>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-1)',
        fontFamily: 'var(--font-sans)',
        fontSize: 11,
        color: 'var(--color-dust)',
      }}
    >
      {label}
      <input
        type="date"
        value={value}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{
          minHeight: 44,
          border: '1px solid var(--color-rule-strong)',
          background: 'transparent',
          color: 'var(--color-ivory)',
          fontFamily: 'var(--font-mono)',
          padding: '0 var(--spacing-3)',
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </label>
  );
}

function validateCustomRange(start: string, end: string, today: string): string | null {
  if (!start || !end) return t.progress.toolbar.errors.required;
  if (!isIsoDay(start) || !isIsoDay(end)) return t.progress.toolbar.errors.required;
  if (start > end) return t.progress.toolbar.errors.startAfterEnd;
  if (end > today) return t.progress.toolbar.errors.futureEnd;
  const days = inclusiveDayCount(start, end);
  if (days > 365) return t.progress.toolbar.errors.tooLong;
  return null;
}

function inclusiveDayCount(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
}

function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

import { authFetch, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import type { DashboardSnapshot } from '@/lib/dashboard/types';
import { t } from '@/lib/i18n/en';
import { useReducedMotion } from '@/lib/motion/defaults';
import { normalizeProfileTimezone } from '@/lib/time/device-timezone';

type BacSnapshot = DashboardSnapshot['bac'];

export interface BacTrackerProps {
  bac: BacSnapshot;
  /**
   * IANA timezone identifier (e.g. `'Asia/Ho_Chi_Minh'`). Sourced from
   * `profile.timezone` — the same value `DeviceTimezoneSync` keeps in
   * sync with the device. Required so SSR and client hydration both
   * render the as-of stamp against the user's local clock without a
   * hydration mismatch (no `useEffect` after-mount dance, no
   * `suppressHydrationWarning`). Mirrors the `WaterTracker` /
   * `ChronometerRing` / `MealsBulletin` sibling pattern.
   */
  timezone: string;
}

function formatBacValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.0';
  return value.toFixed(3);
}

/**
 * Render `iso` as `YYYY-MM-DD HH:MM` in the supplied IANA timezone using
 * `Intl.DateTimeFormat` + `formatToParts` (locale-independent shape).
 * Falls back to `t.dashboard.bac.emptyAsOf` only when the ISO itself is
 * unparseable — at `value === 0` the timestamp is still shown because
 * "checked at 14:00, no alcohol" is more informative than "as of now".
 */
function formatAsOf(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t.dashboard.bac.emptyAsOf;
  const tz = normalizeProfileTimezone(timezone, { sentryTag: 'bac-tracker' });

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  // 24-hour clock at midnight renders as `'24'` in some Intl
  // implementations — normalise to `'00'` so the stamp stays in the
  // canonical `00:00` shape we promise the UI.
  const hour = lookup('hour') === '24' ? '00' : lookup('hour');

  const stamp =
    `${lookup('year')}-${lookup('month')}-${lookup('day')} ` + `${hour}:${lookup('minute')}`;
  return t.dashboard.bac.asOfFormat.replace('{time}', stamp);
}

export function BacTracker({ bac, timezone }: BacTrackerProps) {
  const [localBac, setLocalBac] = useState<BacSnapshot>(bac);
  const [isPending, startTransition] = useTransition();
  const isReducedMotion = useReducedMotion();

  // Prop-sync discriminator — mirrors `WaterTracker.tsx` lines 131-136.
  // "Storing information from previous renders" / "Adjusting state while
  // rendering" — the React 19 idiomatic replacement for
  // `useEffect(() => setState(...))` for prop-derived state. Without this
  // guard the mount-time `useState` initializer would shadow every
  // subsequent prop update (e.g. a sibling-driven `router.refresh()`
  // delivers a fresh snapshot via the parent RSC; the BAC widget would
  // otherwise stay stuck on its first-mount value).
  const [prevBacProp, setPrevBacProp] = useState<BacSnapshot>(bac);
  if (prevBacProp.value !== bac.value || prevBacProp.calculatedAt !== bac.calculatedAt) {
    setPrevBacProp(bac);
    setLocalBac(bac);
  }

  function refreshBac() {
    startTransition(async () => {
      try {
        const res = await authFetch('/api/dashboard/bac');
        if (!res.ok) {
          // Non-2xx: preserve the prior value, surface the failure via
          // aria-busy clearing + the (logged) error. Refresh-interceptor
          // already handled the 401 → refresh → retry → forced-sign-out
          // dance for us; a non-2xx here means the route itself failed.
          return;
        }
        const payload = (await res.json()) as BacSnapshot;
        setLocalBac(payload);
      } catch (err) {
        // Re-throw `SessionExpiredError` so the refresh-interceptor's
        // forced-sign-out path is honoured (the user is already being
        // redirected to /login). Any other error is swallowed so the
        // value/timestamp stay stable.
        if (err instanceof SessionExpiredError) throw err;
      }
    });
  }

  return (
    <section
      data-testid="bac-tracker"
      aria-labelledby="bac-tracker-heading"
      aria-busy={isPending ? 'true' : 'false'}
      style={{
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: 'var(--spacing-4)',
        display: 'grid',
        gap: 'var(--spacing-3)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-3)',
        }}
      >
        <div>
          <h2
            id="bac-tracker-heading"
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-dust)',
            }}
          >
            {t.dashboard.bac.headerLeft}
          </h2>
          <p
            style={{
              margin: 'var(--spacing-1) 0 0',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-dust)',
            }}
          >
            {t.dashboard.bac.headerRight}
          </p>
        </div>
        <button
          type="button"
          aria-label={isPending ? t.dashboard.bac.refreshingA11y : t.dashboard.bac.refreshA11y}
          onClick={refreshBac}
          disabled={isPending}
          aria-disabled={isPending}
          style={{
            minHeight: 44,
            minWidth: 44,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid var(--color-rule-strong)',
            background: 'transparent',
            color: 'var(--color-ivory)',
            cursor: isPending ? 'progress' : 'pointer',
            outlineColor: 'var(--color-ivory)',
            transition: 'border-color 160ms ease, color 160ms ease',
          }}
        >
          <RefreshCw
            size={18}
            aria-hidden="true"
            strokeWidth={1.8}
            style={
              isPending && !isReducedMotion
                ? { animation: 'kalori-water-spin 700ms linear infinite' }
                : undefined
            }
          />
        </button>
      </header>

      <div>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--color-dust)',
          }}
        >
          {t.dashboard.bac.description}
        </p>
        <p
          data-testid="bac-value"
          className="num"
          style={{
            margin: 'var(--spacing-1) 0 0',
            fontFamily: 'var(--font-serif)',
            fontSize: 30,
            fontWeight: 300,
            color: 'var(--color-ivory)',
            // Calm "stale" fade while a refresh is in flight — value is
            // still readable, but the user has a visual signal that the
            // displayed number will update momentarily.
            opacity: isPending ? 0.4 : 1,
            transition: isReducedMotion ? undefined : 'opacity 160ms ease',
          }}
        >
          {formatBacValue(localBac.value)}
        </p>
      </div>
      <p
        data-testid="bac-as-of"
        aria-live="polite"
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-dust)',
        }}
      >
        {formatAsOf(localBac.calculatedAt, timezone)}
      </p>
    </section>
  );
}

export default BacTracker;

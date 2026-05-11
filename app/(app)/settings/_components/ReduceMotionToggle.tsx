'use client';

/**
 * Task 5.1.6 — `<ReduceMotionToggle />` Settings panel switch.
 *
 * Surface contract (briefing §4c + ui-design §10.7):
 *   - Single `role="switch"` button. Visible label "Reduce motion".
 *     Description "Disable transitions and animations across the app."
 *   - Persistence: writes `data-reduce-motion="1"` on `<html>` AND
 *     mirrors to `localStorage['kalori.reduce-motion']`. On mount the
 *     toggle reads localStorage + initial OS pref to derive checked
 *     state.
 *   - Additive: toggle ON forces reduce; toggle OFF inherits OS pref.
 *     NEVER cancels OS-says-reduce. The rendered checked state always
 *     reflects the EFFECTIVE reduce-motion (OS OR user override).
 *   - Hydration safety: `useSyncExternalStore` two-phase pattern with
 *     `getServerSnapshot` returning false (no SSR mismatch).
 *
 * R1 / I11 / R3:
 *   - No raw fetch / mutation paths touched. Pure UI + localStorage.
 *
 * Accessibility:
 *   - `role="switch" aria-checked` on the visible button (per
 *     ux-specialist consolidation; no Radix dep — a single button is
 *     enough and avoids extra runtime weight).
 *   - `aria-describedby` wires the description text to the switch.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { t } from '@/lib/i18n/en';

const STORAGE_KEY = 'kalori.reduce-motion';

/**
 * Notify subscribers that the override flag changed. Two tracks:
 *   1. In-process listeners — multiple `<ReduceMotionToggle />` instances
 *      AND `useReducedMotionPreference()` consumers (in `network-state`)
 *      both re-read the override on the next React tick.
 *   2. `window.dispatchEvent('kalori:reduce-motion-change')` — same-tab
 *      cross-component fan-out. `useReducedMotionPreference()` subscribes
 *      to this CustomEvent so a Settings toggle change immediately
 *      re-renders the OfflineQueueProvider's reduced-motion-driven
 *      decisions (e.g. transition skipping in OfflineBar). Cross-tab is
 *      handled by the standard `storage` event.
 *
 * Codex Round 1 (C-1): the in-process listener Set was previously the
 * only fan-out path. `useReducedMotionPreference()` did not read
 * localStorage at all, so even with this notify firing, downstream
 * consumers never saw the override. The hook now reads the override
 * AND subscribes to the CustomEvent below.
 */
const overrideListeners = new Set<() => void>();
function notifyOverrideChange(): void {
  overrideListeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('kalori:reduce-motion-change'));
    } catch {
      // CustomEvent constructor unavailable (legacy IE, ancient JSDOM).
      // Safe to fall through — in-process listeners still fire.
    }
  }
}

function subscribeOverride(listener: () => void): () => void {
  overrideListeners.add(listener);
  if (typeof window !== 'undefined') {
    // Cross-tab sync: another tab toggling the override fires `storage`
    // and we re-read here.
    const onStorage = (event: StorageEvent): void => {
      if (event.key === STORAGE_KEY || event.key === null) {
        listener();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      overrideListeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }
  return () => {
    overrideListeners.delete(listener);
  };
}

function getOverrideSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getOverrideServerSnapshot(): boolean {
  return false;
}

function subscribeOsPref(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(listener);
    return () => {
      if (typeof mql.removeListener === 'function') mql.removeListener(listener);
    };
  }
  return () => undefined;
}

function getOsSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getOsServerSnapshot(): boolean {
  return false;
}

function applyHtmlDataAttr(effective: boolean): void {
  if (typeof document === 'undefined') return;
  if (effective) {
    document.documentElement.setAttribute('data-reduce-motion', '1');
  } else {
    document.documentElement.removeAttribute('data-reduce-motion');
  }
}

export function ReduceMotionToggle(): React.ReactElement {
  // OS preference and user override are independent reactive sources.
  // Derive the effective state during render (no `useEffect` cascade
  // per `vercel-react-best-practices` `rerender-derived-state-no-effect`).
  const osPrefersReduce = useSyncExternalStore<boolean>(
    subscribeOsPref,
    getOsSnapshot,
    getOsServerSnapshot,
  );
  const userOverride = useSyncExternalStore<boolean>(
    subscribeOverride,
    getOverrideSnapshot,
    getOverrideServerSnapshot,
  );
  const effective = osPrefersReduce || userOverride;

  // Apply the html data attribute synchronously on every render where
  // the effective state changes. We use a render-time side effect
  // guarded by document presence — safe in React 19 because
  // `applyHtmlDataAttr` is idempotent (set or remove based on the
  // boolean) and never reads from React state. This keeps the DOM
  // attribute in lockstep with the rendered checked state without a
  // dedicated `useEffect`.
  if (typeof document !== 'undefined') {
    applyHtmlDataAttr(effective);
  }

  const onToggle = useCallback(() => {
    if (typeof window === 'undefined') return;
    const next = !userOverride;
    try {
      if (next) {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage may throw in private mode / quota exceeded —
      // fall through; the in-memory listener still fires so the UI
      // updates within the current tab.
    }
    notifyOverrideChange();
  }, [userOverride]);

  const descriptionId = 'kalori-reduce-motion-description';

  return (
    <div
      data-testid="reduce-motion-toggle"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 0',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={effective}
        aria-describedby={descriptionId}
        onClick={onToggle}
        style={{
          width: '44px',
          minWidth: '44px',
          height: '24px',
          borderRadius: 0,
          background: effective ? 'var(--color-oxblood)' : 'transparent',
          border: '1px solid var(--color-rule-strong)',
          cursor: 'pointer',
          padding: 0,
          position: 'relative',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'block',
            position: 'absolute',
            top: '3px',
            left: effective ? '23px' : '3px',
            width: '16px',
            height: '16px',
            background: effective ? 'var(--color-ivory)' : 'var(--color-dust)',
            transition: 'left var(--motion-micro) var(--ease-editorial)',
          }}
        />
        <span style={visuallyHidden}>{t.settings.reduceMotionLabel}</span>
      </button>
      <div style={{ flex: 1 }}>
        <label
          htmlFor=""
          style={{
            display: 'block',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 'var(--type-body-sm)',
            color: 'var(--color-ivory)',
            marginBottom: '4px',
          }}
          // The label sits next to the switch; clicking it does not
          // forward to the button (the visually-hidden label inside
          // the button is the accessible name). Keep the label
          // visually-paired but non-interactive so screen readers
          // don't double-announce.
        >
          {t.settings.reduceMotionLabel}
        </label>
        <p
          id={descriptionId}
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-mono)',
            color: 'var(--color-sand)',
            lineHeight: 1.5,
          }}
        >
          {t.settings.reduceMotionDescription}
        </p>
      </div>
    </div>
  );
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default ReduceMotionToggle;

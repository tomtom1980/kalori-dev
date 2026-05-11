'use client';

/**
 * `<WeightQuickAdd />` — Task 4.3b optimistic weight-log form (F3 pattern).
 *
 * Mirrors `<WaterTracker />` pattern: `useOptimistic` for render-time mirror,
 * `useWeightQuickAddStore` for cross-component optimistic state, `authPost`
 * for the network call (R1 contract — never a local refresh shim).
 *
 * Two modes:
 *   - 'page' — full form with kg/lb input, date picker, optional note. Used
 *             on /weight.
 *   - 'inline' — compact variant with just weight input + save button. Used
 *             inline in the Progress page trajectory section.
 *
 * Rollback UX (F3): on server 500 / ValidationError, the optimistic state
 * reverts and `role="alert"` + `aria-live="assertive"` announces the exact
 * ARIA-live string specified in ux-specialist §9.1. An "undo" button re-mints
 * the clientId and re-submits with the previous optimistic value.
 */
import { useRouter } from 'next/navigation';
import {
  startTransition,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import { announceAssertive, announcePolite } from '@/lib/a11y/announce';
import { authPost, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import { useWeightQuickAddStore } from '@/lib/stores/useWeightQuickAddStore';
import { KG_PER_LB, kgToLb, lbToKg, roundToOneDecimal } from '@/lib/units/conversion';

const ROLLBACK_TOAST_DISMISS_MS = 7000;

// External-store subscriber per react-hooks/set-state-in-effect: `document.body`
// is a browser-only API. useSyncExternalStore lets us read it during render
// without a setState-in-effect cascade.
function subscribePortalTarget(): () => void {
  return () => undefined;
}
function getPortalTargetSnapshot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.body;
}
function getPortalTargetServerSnapshot(): HTMLElement | null {
  return null;
}

export interface WeightLogRow {
  id: string;
  client_id: string;
  date: string;
  weight_kg: number;
  note: string | null;
}

interface WeightLogResponse {
  row: WeightLogRow;
  replayed?: boolean;
  recalc?: {
    newBmr: number;
    newTdee: number;
    newTarget: number;
  };
}

export interface WeightQuickAddProps {
  mode: 'page' | 'inline';
  unitPref: 'metric' | 'imperial';
  todayUserTz: string;
  minDateUserTz: string;
  initialWeightKg?: number | null;
  onCommitted?: (row: WeightLogRow, recalc?: WeightLogResponse['recalc']) => void;
}

function mintClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function WeightQuickAdd({
  mode,
  unitPref,
  todayUserTz,
  minDateUserTz,
  initialWeightKg,
  onCommitted,
}: WeightQuickAddProps) {
  const weightInputId = useId();
  const dateInputId = useId();
  const noteInputId = useId();
  const helpId = useId();
  const errorId = useId();
  const statusId = useId();

  // Task B.4 (US-STAB-B4) — App-Router-native RSC revalidation. After a
  // successful weight commit, call `router.refresh()` so the active route's
  // Suspense boundaries re-stream with the freshly-saved row included.
  // This is NOT a refresh shim — it does not interact with the auth
  // refresh-interceptor (R1 firewall) and does not trigger a full document
  // navigation. Import path is `next/navigation` (App Router); never
  // `next/router` (Pages Router legacy).
  const router = useRouter();

  const [weightInput, setWeightInput] = useState('');
  const [dateInput, setDateInput] = useState(todayUserTz);
  const [noteInput, setNoteInput] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollbackState, setRollbackState] = useState<{
    previousWeight: number | null;
    rolledBackClientId: string;
  } | null>(null);
  const [statusText, setStatusText] = useState('');

  const weightInputRef = useRef<HTMLInputElement>(null);
  const toastPauseRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastElapsedRef = useRef(0);
  const toastStartRef = useRef(0);
  const emberPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [emberPulseActive, setEmberPulseActive] = useState(false);

  // Task B.4 Codex Round 1 #1 — synchronous in-flight latch. The previous
  // `if (busy) return` guard was raceable: `setBusy(true)` lived inside
  // `startTransition`, so two same-tick `requestSubmit()` calls both
  // observed `busy === false` and both ran past the guard. The
  // `inFlightRef` is a synchronous mirror: set BEFORE entering the
  // transition, reset only in `finally` (or in the synchronous early-exit
  // paths for validation failures, where no network call ever fires).
  // `useRef` mutation does not trigger re-renders — see Vercel React
  // best practices (`rerender-use-ref-transient-values`).
  const inFlightRef = useRef(false);
  // Task B.4 Codex Round 1 #3 — refresh-deferral timer handle so we can
  // clear on unmount and prevent setState-after-unmount.
  const refreshDeferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task B.4 Codex Round 2 #2 — mounted-ref for post-unmount refresh safety.
  // Round 1's setTimeout cleanup only clears EXISTING timers; it cannot
  // prevent a NEW timer being scheduled by an in-flight `authPost` that
  // resolves AFTER unmount (e.g., user navigates away mid-submit). Without
  // this guard, the success branch would still call `setTimeout(refresh, 200)`
  // on a destroyed component, leaking `router.refresh()` into whatever route
  // the user is on now. We check `mountedRef.current` at BOTH the schedule
  // site (covers async-resolves-after-unmount) AND the timer-callback site
  // (covers a tiny race where unmount happens between scheduling and timer
  // firing). Belt-and-suspenders per Vercel React best practices
  // (`advanced-event-handler-refs` — refs survive unmount and are the right
  // place for transient lifecycle state).
  const mountedRef = useRef(true);
  const portalTarget = useSyncExternalStore(
    subscribePortalTarget,
    getPortalTargetSnapshot,
    getPortalTargetServerSnapshot,
  );

  const clearToastTimer = () => {
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const dismissRollbackToast = () => {
    clearToastTimer();
    setRollbackState(null);
    // Restore focus to the weight input (M4).
    if (typeof window !== 'undefined') {
      window.setTimeout(() => weightInputRef.current?.focus(), 0);
    }
  };

  // Auto-dismiss timer (M2) — pause on hover/focus-within.
  useEffect(() => {
    if (!rollbackState) {
      clearToastTimer();
      toastElapsedRef.current = 0;
      return;
    }
    toastElapsedRef.current = 0;
    toastStartRef.current = Date.now();
    toastTimerRef.current = setTimeout(() => {
      // Full-duration elapsed without pause — auto-dismiss.
      setRollbackState(null);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => weightInputRef.current?.focus(), 0);
      }
    }, ROLLBACK_TOAST_DISMISS_MS);
    return () => {
      clearToastTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackState?.rolledBackClientId]);

  const handleToastPauseEnter = () => {
    if (!rollbackState || toastPauseRef.current) return;
    toastPauseRef.current = true;
    toastElapsedRef.current += Date.now() - toastStartRef.current;
    clearToastTimer();
  };

  const handleToastPauseLeave = () => {
    if (!rollbackState || !toastPauseRef.current) return;
    toastPauseRef.current = false;
    const remaining = Math.max(100, ROLLBACK_TOAST_DISMISS_MS - toastElapsedRef.current);
    toastStartRef.current = Date.now();
    toastTimerRef.current = setTimeout(() => {
      setRollbackState(null);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => weightInputRef.current?.focus(), 0);
      }
    }, remaining);
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearToastTimer();
      if (emberPulseTimerRef.current !== null) {
        clearTimeout(emberPulseTimerRef.current);
        emberPulseTimerRef.current = null;
      }
      // Task B.4 Codex Round 1 #3 — clear the deferred-refresh timer so
      // we never call `router.refresh()` after unmount.
      if (refreshDeferTimerRef.current !== null) {
        clearTimeout(refreshDeferTimerRef.current);
        refreshDeferTimerRef.current = null;
      }
      // Task B.4 Codex Round 2 #2 — flip the mounted flag BEFORE returning.
      // The schedule-site and timer-callback-site checks both consult this
      // ref to skip `router.refresh()` after unmount. Also release the
      // synchronous in-flight latch — if the component remounts later (e.g.,
      // dev HMR or the parent re-renders the form into existence), it must
      // not believe a stale in-flight POST is still pending.
      mountedRef.current = false;
      inFlightRef.current = false;
    };
  }, []);

  const store = useWeightQuickAddStore();
  const committedMirror = store.lastCommittedWeightKg ?? initialWeightKg ?? null;
  // Task 4.5 R2 S2: widen the action type to `number | null` so the rollback
  // branch can call `setOpt(null)` for first-time loggers (previousWeight is
  // null when there was no prior committed weight). Pre-R2 the action type
  // was narrowed to `number`, forcing an `if (previousWeight !== null)` guard
  // that silently skipped the revert for first-time loggers — they were on a
  // race-y natural-revert path rather than the explicit setOpt path.
  const [opt, setOpt] = useOptimistic<number | null, number | null>(committedMirror, (_, v) => v);

  const submit = () => {
    // Task B.4 Codex Round 1 #1 — synchronous race latch. Must be the
    // FIRST action in `submit()` so two same-tick `requestSubmit()` calls
    // are both observed here in lockstep. The first call flips the latch
    // and proceeds; the second call sees the latch already set and aborts
    // immediately, before any state mutation, before any client_id mint,
    // before any network. The latch is paired with the `busy` boolean
    // (which still drives UI rendering — aria-busy, disabled button) but
    // is the load-bearing guard for the same-tick race that `busy` cannot
    // catch (because `setBusy(true)` lives inside `startTransition`).
    if (inFlightRef.current) return;

    setInlineError(null);
    setStatusText(t.weight.liveSubmitting);

    // Codex R1 C-3: imperial users type lb — convert to kg before
    // validation AND before submission. Storage is kg-canonical per
    // design-doc §18.2 I6; lb is a display unit only. The [30, 350] kg
    // bound is authoritative per briefing §Route Contract + DDL CHECK.
    const parsedInput = Number(weightInput);
    if (!Number.isFinite(parsedInput)) {
      setInlineError(t.weight.errorOutOfRange);
      setStatusText('');
      return;
    }
    const weightKg = unitPref === 'imperial' ? lbToKg(parsedInput) : parsedInput;
    if (weightKg < 30 || weightKg > 350) {
      setInlineError(t.weight.errorOutOfRange);
      setStatusText('');
      return;
    }

    // Phase B Codex R1 #4 — cross-remount in-flight latch on the SHARED
    // store, keyed by date. The component-local `inFlightRef` only
    // protects the same component instance; it is reset by `useRef(false)`
    // when a fresh `WeightQuickAdd` mounts after a navigate-away. Without
    // this store-level guard, a user can submit weight, navigate away
    // before the POST resolves, return to the dashboard (fresh remount,
    // fresh `inFlightRef`, fresh `client_id` mint), and re-submit — the
    // schema enforces uniqueness only on `client_id`, not on
    // `(user_id, date)` (architecture.md §2.5), so two rows for the same
    // day land and `recalculate_target` fires twice. We acquire atomically
    // so two same-tick acquisitions cannot both succeed; a failed acquire
    // means another submission is in flight for this date and we abort
    // before mutating any state, minting any client_id, or hitting the
    // network. Released in `finally` regardless of success/failure.
    const submitDate = dateInput;
    if (!store.acquireInFlight(submitDate)) {
      // Provide a soft hint that the form is busy (covers the rare path
      // where the user remounts and clicks Save while the previous POST
      // is still pending). The previous in-flight POST will reach its
      // finally and release the latch — no permanent lock.
      setStatusText('');
      return;
    }

    const clientId = mintClientId();
    const previousWeight = opt ?? initialWeightKg ?? null;

    // Task B.4 Codex Round 1 #1 — flip the latch BEFORE entering the
    // transition. The reset lives in `finally` below.
    inFlightRef.current = true;

    startTransition(async () => {
      setBusy(true);
      setOpt(weightKg);
      store.submit({
        clientId,
        weightKg,
        date: dateInput,
        ...(noteInput ? { note: noteInput } : {}),
      });
      announcePolite(t.weight.liveSubmitting);

      try {
        const result = await authPost<WeightLogResponse>('/api/weight/log', {
          client_id: clientId,
          date: dateInput,
          weight_kg: weightKg,
          ...(noteInput ? { note: noteInput } : {}),
        });

        store.commit(clientId, { weightKg, date: dateInput }, result.recalc);

        // Idempotent-replay guard: the server says this was a replay. The
        // store.commit() above already returns a no-op in that case, but we
        // also suppress the announcement here to match ux-specialist §8.3.
        const announcedWeight =
          unitPref === 'imperial' ? parsedInput.toFixed(1) : weightKg.toFixed(1);
        if (!result.replayed) {
          const successCopy = t.weight.liveSaveSuccessFormat
            .replace('{weight}', announcedWeight)
            .replace('{dateHuman}', dateInput === todayUserTz ? 'today' : dateInput);
          announcePolite(successCopy);
          setStatusText(successCopy);
          if (result.recalc) {
            announcePolite(
              t.weight.liveTargetUpdatedFormat.replace(
                '{newTarget}',
                String(result.recalc.newTarget),
              ),
            );
          }
        } else {
          // On replay still populate the <output> so aria-describedby has
          // a meaningful live companion, but skip the re-announce.
          setStatusText(
            t.weight.liveSaveSuccessFormat
              .replace('{weight}', announcedWeight)
              .replace('{dateHuman}', dateInput === todayUserTz ? 'today' : dateInput),
          );
        }

        onCommitted?.(result.row, result.recalc);
        setWeightInput('');
        setNoteInput('');

        // Task B.4 (US-STAB-B4) — RSC revalidation. Codex Round 1 #3:
        // the shared announcer (`lib/a11y/announce.ts`) debounces writes
        // by 150ms. Calling `router.refresh()` synchronously after
        // `announcePolite(successCopy)` would race with the debounce: the
        // RSC re-stream may mutate the DOM (or the live region's parent)
        // BEFORE the announcer's trailing-edge timer flushes, dropping the
        // polite "Weight saved." message. The fix defers `router.refresh()`
        // by 200ms — past the announcer's 150ms debounce + a 50ms safety
        // buffer — so the polite live region is guaranteed to land in a
        // stable DOM before the Suspense boundary re-streams.
        //
        // Why a `setTimeout` instead of awaiting a promise: the announcer
        // does not expose its debounce as a thenable; reading its internal
        // timer would couple this component to the announcer module's
        // implementation. The 200ms budget is well within AC3's 1500ms
        // chart-update SLA (cross-region SG→IAD ~150-200ms RTT + this
        // 200ms defer = ~350-400ms head, leaving ~1100ms for the actual
        // RSC re-stream).
        //
        // The handle is captured in a ref so unmount cleanup can clear
        // the pending timer.
        //
        // Task B.4 Codex Round 2 #2 — guard the schedule site with
        // `mountedRef.current`. If `authPost` resolved AFTER the component
        // unmounted (e.g., user navigated away mid-submit), the cleanup
        // effect already ran and cleared any pending timer — but cleanup
        // cannot stop the success branch from scheduling a fresh timer that
        // would land 200ms later on a destroyed component. Skip both
        // scheduling and execution if no longer mounted.
        if (!mountedRef.current) {
          return;
        }
        if (refreshDeferTimerRef.current !== null) {
          clearTimeout(refreshDeferTimerRef.current);
        }
        refreshDeferTimerRef.current = setTimeout(() => {
          refreshDeferTimerRef.current = null;
          // Task B.4 Codex Round 2 #2 — second mounted check at the timer
          // callback site. Covers the tiny race where unmount happens AFTER
          // the schedule-site check passed but BEFORE the 200ms timer
          // fires. Belt-and-suspenders.
          if (!mountedRef.current) {
            return;
          }
          router.refresh();
        }, 200);
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          // Refresh-interceptor has already signed out + redirected. Rollback
          // locally but don't announce — the login page will take over.
          store.rollback(clientId, 'server-error');
          // Task 4.5 R2 S2: unconditional rollback (including null). The R1
          // `if (previousWeight !== null)` guard was only there because the
          // action type was narrowed to `number`; with the widened action
          // type `number | null`, first-time loggers (previousWeight === null)
          // now get an explicit `setOpt(null)` call rather than relying on
          // the natural transition-end revert.
          setOpt(previousWeight);
          setStatusText('');
          throw err;
        }
        // Rollback path.
        store.rollback(clientId, 'server-error');
        // Task 4.5 R2 S2: unconditional rollback — see SessionExpiredError
        // branch above for rationale. Previously guarded by
        // `if (previousWeight !== null)`, which silently dropped the revert
        // for first-time loggers.
        setOpt(previousWeight);
        // Ember-pulse window (C2): 200ms flare on the weight input via a
        // CSS class toggle. `filter: drop-shadow()` is Tier-A per
        // web-ui-guide.md §12, suppressed under prefers-reduced-motion.
        if (emberPulseTimerRef.current !== null) {
          clearTimeout(emberPulseTimerRef.current);
        }
        setEmberPulseActive(true);
        emberPulseTimerRef.current = setTimeout(() => {
          setEmberPulseActive(false);
          emberPulseTimerRef.current = null;
        }, 220);
        setRollbackState({ previousWeight, rolledBackClientId: clientId });
        // Codex R2-I1: rollback ARIA-live string is unit-aware. We keep
        // `previousWeight` in kg internally (for re-submit accuracy) but
        // display it in lb for imperial users and say "pounds" instead of
        // "kilograms" in the live region string.
        const prevForDisplay =
          previousWeight !== null
            ? unitPref === 'imperial'
              ? roundToOneDecimal(kgToLb(previousWeight)).toString()
              : roundToOneDecimal(previousWeight).toString()
            : '—';
        const unitLabel =
          unitPref === 'imperial'
            ? t.weight.liveRollbackUnitLabelLb
            : t.weight.liveRollbackUnitLabelKg;
        const rollbackCopy = t.weight.liveRollbackFormat
          .replace('{previousWeight}', prevForDisplay)
          .replace('{unitLabel}', unitLabel);
        announceAssertive(rollbackCopy);
        setStatusText(rollbackCopy);
      } finally {
        setBusy(false);
        // Task B.4 Codex Round 1 #1 — release the synchronous race
        // latch so a subsequent submit (after this in-flight resolves
        // OR rejects) can proceed.
        inFlightRef.current = false;
        // Phase B Codex R1 #4 — release the shared cross-remount latch.
        // Even if this component has unmounted between acquire and now,
        // the store-level latch must be released so a fresh remount can
        // submit again. This runs unconditionally — Zustand `set` is
        // safe to invoke after the component is gone.
        store.releaseInFlight(submitDate);
      }
    });
  };

  const handleUndoRollback = () => {
    clearToastTimer();
    setRollbackState(null);
    submit();
  };

  const displayValue =
    opt !== null && opt !== undefined
      ? unitPref === 'imperial'
        ? (opt * 2.20462).toFixed(1)
        : opt.toFixed(1)
      : '';

  return (
    <section
      data-testid={`weight-quick-add-${mode}`}
      aria-label={mode === 'inline' ? 'Log today’s weight inline' : 'Log today’s weight'}
      className={mode === 'page' ? 'kalori-weight-page-form' : undefined}
      style={{
        border: mode === 'page' ? '1px solid var(--color-rule-strong)' : 'none',
        background: mode === 'page' ? 'var(--color-bg-1)' : 'transparent',
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) submit();
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-3)',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <label
              htmlFor={weightInputId}
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--type-label)',
                fontWeight: 500,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-dust)',
                marginBottom: 'var(--spacing-2)',
              }}
            >
              {t.weight.weightLabel}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
              <input
                id={weightInputId}
                ref={weightInputRef}
                type="number"
                inputMode="decimal"
                step="0.1"
                // Codex R1 C-3: when unitPref=imperial, the user types lb.
                // Reflect the lb-equivalent bounds (30 kg ≈ 66.14 lb,
                // 350 kg ≈ 771.62 lb) so native HTML5 validation matches
                // our kg-internal bounds after conversion.
                min={unitPref === 'imperial' ? (30 / KG_PER_LB).toFixed(2) : '30'}
                max={unitPref === 'imperial' ? (350 / KG_PER_LB).toFixed(2) : '350'}
                autoComplete="off"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                aria-invalid={inlineError !== null}
                aria-describedby={inlineError !== null ? errorId : helpId}
                data-testid="weight-quick-add-input"
                disabled={busy}
                // Task 4.5 R1 Pass 2 S1: array+join pattern. Pre-fix the
                // template literal `\`kalori-weight-input${active ? 'pulse' : ''}\``
                // dropped the space between the two class names, producing
                // `kalori-weight-inputkalori-weight-ember-pulse` — neither
                // class was ever applied during ember pulse.
                className={['kalori-weight-input', emberPulseActive && 'kalori-weight-ember-pulse']
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: `1px solid ${
                    inlineError ? 'var(--color-oxblood)' : 'var(--color-rule-strong)'
                  }`,
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 300,
                  fontSize: 28,
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  minHeight: 44,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--color-dust)',
                }}
              >
                {unitPref === 'imperial' ? t.weight.unitLb : t.weight.unitKg}
              </span>
            </div>
            <p
              id={helpId}
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: 'var(--color-dust)',
                margin: 'var(--spacing-2) 0 0',
              }}
            >
              {t.weight.inputHelper}
            </p>
            {opt !== null && opt !== undefined ? (
              <p
                data-testid="weight-quick-add-optimistic-mirror"
                className="num"
                aria-hidden="true"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--color-dust)',
                  margin: 'var(--spacing-1) 0 0',
                }}
              >
                {displayValue}
              </p>
            ) : null}
            {inlineError ? (
              <p
                id={errorId}
                role="alert"
                data-testid="weight-quick-add-error"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--color-ivory)',
                  margin: 'var(--spacing-2) 0 0',
                }}
              >
                {inlineError}
              </p>
            ) : null}
          </div>

          {mode === 'page' ? (
            <div style={{ flex: '0 0 160px' }}>
              <label
                htmlFor={dateInputId}
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--type-label)',
                  fontWeight: 500,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--color-dust)',
                  marginBottom: 'var(--spacing-2)',
                }}
              >
                {t.weight.dateLabel}
              </label>
              <input
                id={dateInputId}
                type="date"
                value={dateInput}
                min={minDateUserTz}
                max={todayUserTz}
                onChange={(e) => setDateInput(e.target.value)}
                data-testid="weight-quick-add-date"
                disabled={busy}
                className="kalori-weight-date"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid var(--color-rule-strong)',
                  color: 'var(--color-ivory)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  padding: 'var(--spacing-2) var(--spacing-3)',
                  minHeight: 44,
                }}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            aria-describedby={statusId}
            data-testid="weight-quick-add-submit"
            className="kalori-weight-submit"
            style={{
              flex: '0 0 auto',
              border: '1px solid var(--color-oxblood)',
              background: 'var(--color-oxblood)',
              color: 'var(--color-ivory)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--type-label)',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: 'var(--spacing-3) var(--spacing-5)',
              minHeight: 44,
            }}
          >
            {busy ? t.weight.saveEntryLoading : t.weight.saveEntryCta}
          </button>
        </div>

        {mode === 'page' ? (
          <div style={{ marginTop: 'var(--spacing-4)' }}>
            <label
              htmlFor={noteInputId}
              style={{
                display: 'block',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--type-label)',
                fontWeight: 500,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-dust)',
                marginBottom: 'var(--spacing-2)',
              }}
            >
              {t.weight.noteLabel}
            </label>
            <textarea
              id={noteInputId}
              rows={2}
              placeholder={t.weight.notePlaceholder}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              disabled={busy}
              data-testid="weight-quick-add-note"
              className="kalori-weight-note"
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid var(--color-rule-strong)',
                color: 'var(--color-ivory)',
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                padding: 'var(--spacing-2) var(--spacing-3)',
                resize: 'vertical',
              }}
            />
          </div>
        ) : null}
      </form>

      {/* Polite status region — success announcements flow here. Submit
         button is aria-describedby this id so SR users hear save status. */}
      <output
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="weight-quick-add-status"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {statusText}
      </output>

      {/* Rollback toast (F3). role="alert" + aria-live="assertive" per ux §8.2.
          Portalled to <body> so it's not a11y-nested inside the <form> (M1). */}
      {rollbackState && portalTarget
        ? createPortal(
            <aside
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-testid="weight-rollback-toast"
              className="kalori-weight-rollback-toast kalori-softFadeIn"
              onMouseEnter={handleToastPauseEnter}
              onMouseLeave={handleToastPauseLeave}
              onFocus={handleToastPauseEnter}
              onBlur={handleToastPauseLeave}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  color: 'var(--color-ivory)',
                }}
              >
                {t.weight.rollbackToastBodyFormat
                  .replace(
                    '{previousWeight}',
                    rollbackState.previousWeight !== null
                      ? unitPref === 'imperial'
                        ? roundToOneDecimal(kgToLb(rollbackState.previousWeight)).toString()
                        : roundToOneDecimal(rollbackState.previousWeight).toString()
                      : '—',
                  )
                  .replace('{unit}', unitPref === 'imperial' ? t.weight.unitLb : t.weight.unitKg)}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-4)',
                  marginTop: 'var(--spacing-2)',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={handleUndoRollback}
                  data-testid="weight-rollback-undo"
                  className="kalori-weight-toast-undo"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--color-oxblood-soft)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    minHeight: 44,
                    padding: 'var(--spacing-2) 0',
                  }}
                >
                  {t.weight.rollbackToastUndo}
                </button>
                <button
                  type="button"
                  onClick={dismissRollbackToast}
                  data-testid="weight-rollback-dismiss"
                  aria-label={t.weight.rollbackToastDismissSr}
                  className="kalori-weight-toast-dismiss"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--color-dust)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    minHeight: 44,
                    padding: 'var(--spacing-2) 0',
                  }}
                >
                  {t.weight.rollbackToastDismiss}
                </button>
              </div>
            </aside>,
            portalTarget,
          )
        : null}
    </section>
  );
}

export default WeightQuickAdd;

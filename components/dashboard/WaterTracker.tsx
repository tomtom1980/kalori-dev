'use client';

/**
 * <WaterTracker /> — Task 3.5 water island.
 *
 * Composes the bullet grid + ml readout + quick-add chips in a single
 * client component so the optimistic state flows to every visible node
 * without prop-drilling through RSC boundaries. Per react-perf §2 the
 * optimistic reducer lives inside `useOptimistic`; React Compiler handles
 * any further memoization.
 *
 * 8-bullet grid (250 ml each) against a 2000 ml target. Each bullet is
 * aria-hidden (the numeric readout carries SR context via the wrapper's
 * aria-label). Slate fill per tiebreaker #7 (briefing §5.5); outline
 * retained when filled per ux-auditor V10 so the fill/empty distinction
 * is not color-only.
 *
 * Wire payload: client sends `{ unit: 'glass'|'bottle', count: 1 }` — ml
 * derivation lives in `lib/dashboard/types.ts`.
 *
 * Bug-2 (bugfix-tomi 2026-05-09-water-fab-ux) — `useState(initial.consumedMl)`
 * shadowed fresh `initial.consumedMl` after `router.refresh()` re-rendered
 * this client island with new server data. The `useEffect` below re-syncs
 * `committedConsumedMl` whenever the prop changes and bumps `resetKey` so
 * any in-flight optimistic delta against the OLD baseline is discarded.
 * Pattern: "always re-sync local state when its source-of-truth prop
 * changes; don't shadow." (React docs "You Might Not Need an Effect" lists
 * this as a legitimate use of effects.)
 *
 * F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — chip used to receive a
 * precomputed `loggedOn` prop captured at server render time. A long-lived
 * dashboard tab crossing local midnight then logging water would write to
 * YESTERDAY's date. Fix mirrors the C2 nav-shell pattern: receive
 * `timezone` and call `userTzToday(timezone)` AT TAP TIME inside the
 * handler.
 */
import {
  startTransition,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { announcePolite } from '@/lib/a11y/announce';
import { authFetch, SessionExpiredError } from '@/lib/auth/refresh-interceptor';
import { t } from '@/lib/i18n/en';
import { MAX_DAILY_WATER_ML, ML_PER_UNIT, type WaterLogEntry } from '@/lib/dashboard/types';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { useReducedMotion } from '@/lib/motion/defaults';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { useWaterMutationStore } from '@/lib/stores/useWaterMutationStore';
import { userTzToday } from '@/lib/time/day';
import { getDeviceTimeZone } from '@/lib/time/device-timezone';
import { MobileWheelPicker } from '@/components/primitives/MobileWheelPicker';
import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';
import { PopoverInline } from '@/components/primitives/PopoverInline';
// Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — `mintClientId` was
// promoted to a shared module so the nav-shell water FAB can share the
// same UUID-v4 fallback shape. Behavior unchanged here; only the import
// path moved.
import { mintClientId } from '@/lib/water/client-id';

const ML_PER_BULLET = 250;
const EDIT_STEP_ML = 50;

/** Snap display-only edit drafts to the wheel/input step. */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export interface WaterTrackerInitial {
  consumedMl: number;
  targetMl: number;
  entries: WaterLogEntry[];
}

export interface WaterTrackerProps {
  initial: WaterTrackerInitial;
  /**
   * F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — IANA timezone (e.g.,
   * `'Asia/Ho_Chi_Minh'`) drilled from the dashboard RSC. The chip
   * computes `userTzToday(timezone)` at tap time so a long-lived
   * dashboard render that crosses local midnight cannot durably write
   * to yesterday's `logged_on`. This replaces the prior `loggedOn`
   * prop, which captured the date at server render time.
   */
  timezone: string;
  viewedDay?: string;
}

interface OptimisticState {
  consumedMl: number;
  resetKey: number;
}

type WaterUnit = Extract<WaterLogEntry['unit'], 'glass' | 'bottle'>;

export function WaterTracker({ initial, timezone, viewedDay }: WaterTrackerProps) {
  const [committedConsumedMl, setCommittedConsumedMl] = useState(initial.consumedMl);
  const [resetKey, setResetKey] = useState(0);
  const isReducedMotion = useReducedMotion();
  const waterMutationsInFlight = useWaterMutationStore((state) => state.inFlight);
  const pendingServerTotalMl = useWaterMutationStore((state) => state.pendingServerTotalMl);
  const waterBusy = waterMutationsInFlight > 0;

  // Bug-2 (bugfix-tomi 2026-05-09-water-fab-ux) — re-sync the local
  // committed total whenever the server-fed `initial.consumedMl` prop
  // changes (e.g., after the FAB's `router.refresh()` re-renders this
  // island with a fresh `snapshot.water.consumedMl`). Without this
  // sync, the mount-time `useState` initializer shadows every
  // subsequent prop update and the chip stays stuck at its first-mount
  // value.
  //
  // Pattern: "Storing information from previous renders" / "Adjusting
  // state while rendering" from React docs ("You Might Not Need an
  // Effect"). Setting state DURING render — guarded by a previous-prop
  // discriminator so it runs at most once per prop change — is the
  // canonical replacement for the antipattern of `useEffect(...) =>
  // setState(...)` for prop-derived state. React 19's
  // `react-hooks/set-state-in-effect` lint rule flags the effect form;
  // this form is rule-clean.
  //
  // Bumping `resetKey` is defense-in-depth: if a chip-tap optimistic
  // add is mid-flight when fresh server data arrives, the resetKey
  // change makes the optimistic reducer discard the pending delta
  // against the OLD baseline (see reducer below) so the user does not
  // briefly see double-counted water (newServerTotal + chipPendingDelta).
  const [prevInitialConsumedMl, setPrevInitialConsumedMl] = useState(initial.consumedMl);
  if (prevInitialConsumedMl !== initial.consumedMl) {
    setPrevInitialConsumedMl(initial.consumedMl);
    setCommittedConsumedMl(initial.consumedMl);
    setResetKey((k) => k + 1);
  }

  useEffect(() => {
    if (pendingServerTotalMl === null) return;
    if (initial.consumedMl !== pendingServerTotalMl) return;
    useWaterMutationStore.getState().completeServerTotal(initial.consumedMl);
  }, [initial.consumedMl, pendingServerTotalMl]);

  // R3-C2-prime (bugfix-tomi 2026-05-09-water-fab-ux Codex round 3, Option B) —
  // server-authoritative totalMl removes the resetKeyRef + useLayoutEffect
  // mirror that earlier rounds (R1 C1 + R2 C1-prime) introduced. Those
  // additions guarded against a double-count when the baseline absorbed
  // the same in-flight write, but they ALSO dropped successful writes
  // when the baseline shift was orthogonal to the write — the chip
  // undercounted, the user re-tapped, and we got duplicate logging
  // (round-3 NEW Critical C2-prime).
  //
  // `/api/water/log` now returns `{ row, totalMl: <SUM-of-day> }`. The
  // chip sets `committedConsumedMl` DIRECTLY from the response total, so
  // both the double-count case (server-side absorb) and the undercount
  // case (orthogonal shift) collapse into a single trivially-correct
  // path: trust the server. The `c + ml` local-prediction path remains
  // as a fallback for the rare aggregation-read failure (server returns
  // null/omits totalMl); see `addWater` below.

  const baseState: OptimisticState = {
    consumedMl: committedConsumedMl,
    resetKey,
  };
  const [opt, addOptimistic] = useOptimistic<
    OptimisticState,
    { clientId: string; ml: number; issuedResetKey: number }
  >(baseState, (state, delta) => {
    // Bug-2 (bugfix-tomi 2026-05-09-water-fab-ux) — discard any
    // optimistic delta whose `issuedResetKey` no longer matches the
    // current baseline. React 19's `useOptimistic` replays pending
    // actions through the reducer on every base-state change; without
    // this guard, an in-flight chip-tap delta would be re-applied on
    // top of a fresh server total delivered via `router.refresh()`,
    // showing the user `newServerTotal + chipPendingDelta` (double-
    // counted). Skipping non-matching actions makes the resetKey bump
    // in the prop-sync `useEffect` semantically meaningful.
    if (delta.issuedResetKey !== state.resetKey) {
      return state;
    }
    return {
      consumedMl: state.consumedMl + delta.ml,
      resetKey: state.resetKey,
    };
  });

  const consumedMl = opt.consumedMl;
  const targetMl = initial.targetMl;
  const bulletCount = Math.max(1, Math.round(targetMl / ML_PER_BULLET));
  const bulletsFilled = Math.min(bulletCount, Math.floor(consumedMl / ML_PER_BULLET));

  // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — cap-toast dedupe
  // gate. A button-mash at the cap should produce ONE toast within a
  // 1.5 s window, not N. We track the last-shown timestamp in a ref
  // (synchronous read at click time — `useState` would not commit before
  // the next mash hits the handler). Also used by the 409 server-driven
  // path so server-rejection bursts dedupe identically.
  const capToastLastShownRef = useRef<number>(0);
  const CAP_TOAST_DEDUPE_MS = 1500;

  // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — EDIT surface.
  // Mobile: `MobileWheelSheet` + `MobileWheelPicker`. Desktop: Radix
  // popover anchored to the EDIT chip with a numeric input.
  const isMobile = useIsMobile();
  const editAnchorRef = useRef<HTMLButtonElement | null>(null);
  const editToastLastShownRef = useRef<number>(0);
  const editMinMl = 0;
  const editInitialMl = Math.max(
    editMinMl,
    Math.min(MAX_DAILY_WATER_ML, roundToStep(committedConsumedMl, EDIT_STEP_ML)),
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editDraftMl, setEditDraftMl] = useState<number>(editInitialMl);
  // Codex round 1 I2 — Save disabled until user interacts. The EDIT
  // surface auto-rounds an off-step current total (e.g. 4775 → 4800)
  // into the prefill, so a stray click on Save without any wheel/input
  // movement would silently post a +25ml delta the user never asked
  // for. Tracking an explicit "user has interacted" flag (set on input
  // onChange / wheel onChange) gates Save behind a deliberate gesture.
  // The flag resets on every open-edge so the guard re-applies to each
  // popover/sheet session.
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  // Per-render snapshot of editOpen so we can sync editDraftMl to a fresh
  // lower bound only at the OPEN-edge, not on every render. Re-synchronizing
  // on each render would clobber the user's in-progress wheel/input value.
  const [prevEditOpen, setPrevEditOpen] = useState(false);
  if (prevEditOpen !== editOpen) {
    setPrevEditOpen(editOpen);
    if (editOpen) {
      // Opening — reset draft to the nearest wheel step AND clear
      // the interaction flag (Codex round 1 I2). Closing also clears
      // the flag so a re-open restarts from the disabled-Save state.
      setEditDraftMl(editInitialMl);
      setHasUserInteracted(false);
    } else {
      setHasUserInteracted(false);
    }
  }
  // Wheel options: [0, 50, ..., 5000].
  // Up to 101 rows when committedConsumedMl=0 — documented one-time
  // §10.6.1 50-row a11y guideline relax for this surface
  // (see `outputs/bug-2.md`). Memoised so the wheel doesn't churn its
  // option list on every render.
  const editWheelOptions = useMemo(() => {
    const out: Array<{ value: number; label: string }> = [];
    for (let v = editMinMl; v <= MAX_DAILY_WATER_ML; v += EDIT_STEP_ML) {
      out.push({ value: v, label: `${v} ml` });
    }
    return out;
  }, [editMinMl]);

  function showEditOutOfRangeAnnounce() {
    announcePolite(t.dashboard.water.editOutOfRange.replace('{lower}', String(editMinMl)));
  }

  function showCapToast(clientId: string): void {
    const now = Date.now();
    if (now - capToastLastShownRef.current < CAP_TOAST_DEDUPE_MS) {
      return;
    }
    capToastLastShownRef.current = now;
    useUndoQueueStore.getState().pushToast({
      clientId,
      kind: 'delete-failed',
      description: t.dashboard.water.capReachedToast,
      serverRowId: null,
      commit: async () => {},
      revert: async () => {},
      ttlMs: 2000,
    });
    announcePolite(t.dashboard.water.capReachedAnnounce);
  }

  function mutationDay(): string {
    const deviceTz = getDeviceTimeZone(timezone);
    const today = userTzToday(deviceTz);
    if (viewedDay && viewedDay < today) return viewedDay;
    return today;
  }

  function addWater(unit: WaterUnit) {
    if (waterBusy) return;
    const clientId = mintClientId();
    const ml = ML_PER_UNIT[unit];
    // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — pre-emptive
    // client guard. Suppress the POST + show the cap toast when the
    // current committed total + delta would exceed MAX_DAILY_WATER_ML.
    // The server still enforces (defense in depth + multi-tab race
    // handler at the 409 branch below).
    if (committedConsumedMl + ml > MAX_DAILY_WATER_ML) {
      showCapToast(clientId);
      return;
    }
    // F-WATER-CHIP-STALE-LOGGEDON-2026-05-09 — compute today-in-user-TZ
    // AT TAP TIME (not at render time). The dashboard page is
    // `force-dynamic` so each RSC pass already produces a fresh date,
    // BUT a client tab left open across local midnight will keep
    // rendering with the captured render-time prop until the next
    // navigation. `userTzToday(timezone)` runs synchronously on the
    // tap event tick using `Intl.DateTimeFormat` (client-safe).
    const loggedOn = mutationDay();
    // Capture the current resetKey at issue time. Used by the reducer
    // (Bug-2): discards the optimistic delta if the baseline gets reset
    // (e.g., by the prop-sync block on `router.refresh()` data) so the
    // user does not briefly see a double-counted total during the
    // transition window. Server-authoritative totalMl (Option B, below)
    // makes the success-path post-commit invariant trivially correct
    // regardless of resetKey shifts; the discriminator is now used ONLY
    // to coordinate the optimistic-replay path inside useOptimistic.
    const issuedResetKey = resetKey;
    useWaterMutationStore.getState().begin();
    startTransition(async () => {
      addOptimistic({ clientId, ml, issuedResetKey });
      try {
        // Bug-1 (bugfix-tomi 2026-05-09-water-custom-button) — switched
        // from `authPost` to `authFetch` so the 409 OVER_DAILY_LIMIT
        // response body can be inspected by status code. `authPost`
        // throws a generic Error on non-2xx that does NOT expose the
        // status — and the R1 firewall forbids editing the
        // refresh-interceptor module. Direct `authFetch` is the
        // existing pattern for status-code-sensitive consumers
        // (`ConfirmationScreen.tsx` does the same for /api/entries/save).
        const res = await authFetch('/api/water/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            unit,
            count: 1,
            logged_on: loggedOn,
          }),
        });
        if (res.status === 409) {
          // Server-side cap hit (race with other tab / FAB). Re-sync
          // the chip's committed total to the unchanged server value
          // and show the cap toast. Bump resetKey so the in-flight
          // optimistic delta is discarded.
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            currentTotalMl?: number;
          };
          if (typeof body.currentTotalMl === 'number') {
            setCommittedConsumedMl(body.currentTotalMl);
          }
          setResetKey((current) => current + 1);
          showCapToast(clientId);
          return;
        }
        if (!res.ok) {
          throw new Error(`POST /api/water/log failed: ${res.status}`);
        }
        const response = (await res.json()) as { totalMl?: number | null };
        // R3-C2-prime (Option B) — set committed baseline from
        // server-authoritative total when present. The server SUMs all
        // water_log rows for (user_id, logged_on) AFTER this insert
        // (or replay/race) settles, so:
        //   - In the "baseline absorbed our write" case (R1 C1), totalMl
        //     equals the new baseline, no double-count.
        //   - In the "baseline shifted to OTHER activity that excludes
        //     our write" case (R3 C2-prime), totalMl includes our write
        //     atop the other activity, no undercount.
        // Both prior-round Critical bugs collapse into "trust the server."
        if (typeof response?.totalMl === 'number') {
          setCommittedConsumedMl(response.totalMl);
        } else {
          // Fallback path — server's aggregation read failed and the
          // route omitted totalMl (or returned null). The row IS
          // persisted (request succeeded), so we still need to advance
          // local state. Fall back to the original local-prediction
          // form. We deliberately do NOT re-introduce the C1 resetKey
          // guard here: the guard's failure mode (skipping a successful
          // write under an orthogonal shift) is strictly worse than the
          // already-rare double-count case under this fallback path
          // (which requires both a baseline shift mid-flight AND a
          // server-side aggregation glitch). Net: simpler and biases
          // toward over-counting rather than dropping writes.
          setCommittedConsumedMl((current) => current + ml);
        }
        announcePolite(
          t.dashboard.water.liveAddedFormat
            .replace('{amount}', String(ml))
            .replace('{unit}', t.dashboard.water.mlUnit)
            .replace('{consumedMl}', String(baseState.consumedMl + ml)),
        );
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        setResetKey((current) => current + 1);
        useUndoQueueStore.getState().pushToast({
          clientId,
          kind: 'delete-failed',
          description: t.dashboard.water.errorToast,
          serverRowId: null,
          commit: async () => {},
          revert: async () => {},
        });
      } finally {
        useWaterMutationStore.getState().end();
      }
    });
  }

  // Bug-2 (bugfix-tomi 2026-05-09-water-custom-button) — commit the
  // EDIT surface. SET semantics: the entered value REPLACES today's
  // total, so the POST carries `delta = entered - currentTotalMl`.
  // The editor allows the full 0..5000 ml range; negative ml deltas
  // correct over-entries.
  // Equal value → no-op close. POST shape mirrors the chip's
  // `unit:'ml'`/`count:<delta>` payload — Bug-2's Zod relax raised
  // the per-row cap to 5000 for `unit:'ml'` only.
  function commitEdit(rawValue: number): void {
    if (waterBusy) return;
    const clamped = Math.max(
      editMinMl,
      Math.min(MAX_DAILY_WATER_ML, Math.round(rawValue / EDIT_STEP_ML) * EDIT_STEP_ML),
    );
    const delta = clamped - committedConsumedMl;
    if (delta === 0) {
      // No-op (user committed the same effective value).
      setEditOpen(false);
      return;
    }
    const clientId = mintClientId();
    const loggedOn = mutationDay();
    const issuedResetKey = resetKey;
    setEditOpen(false);
    useWaterMutationStore.getState().begin();
    startTransition(async () => {
      addOptimistic({ clientId, ml: delta, issuedResetKey });
      try {
        const res = await authFetch('/api/water/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: clientId,
            unit: 'ml',
            count: delta,
            logged_on: loggedOn,
          }),
        });
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            currentTotalMl?: number;
          };
          if (typeof body.currentTotalMl === 'number') {
            setCommittedConsumedMl(body.currentTotalMl);
          }
          setResetKey((current) => current + 1);
          // Reuse the chip's cap-toast helper — same dedupe gate, same
          // i18n keys (`capReachedToast`/`capReachedAnnounce`). Uses a
          // dedicated edit-side ref so chip-mash dedupe and edit-mash
          // dedupe don't share state.
          const now = Date.now();
          if (now - editToastLastShownRef.current >= CAP_TOAST_DEDUPE_MS) {
            editToastLastShownRef.current = now;
            useUndoQueueStore.getState().pushToast({
              clientId,
              kind: 'delete-failed',
              description: t.dashboard.water.capReachedToast,
              serverRowId: null,
              commit: async () => {},
              revert: async () => {},
              ttlMs: 2000,
            });
            announcePolite(t.dashboard.water.capReachedAnnounce);
          }
          return;
        }
        if (!res.ok) {
          throw new Error(`POST /api/water/log failed: ${res.status}`);
        }
        const response = (await res.json()) as { totalMl?: number | null };
        if (typeof response?.totalMl === 'number') {
          setCommittedConsumedMl(response.totalMl);
        } else {
          setCommittedConsumedMl((current) => current + delta);
        }
        const announceTemplate =
          delta > 0 ? t.dashboard.water.liveAddedFormat : t.dashboard.water.liveCorrectedFormat;
        announcePolite(
          announceTemplate
            .replace('{amount}', String(Math.abs(delta)))
            .replace('{unit}', t.dashboard.water.mlUnit)
            .replace('{consumedMl}', String(clamped)),
        );
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        setResetKey((current) => current + 1);
        useUndoQueueStore.getState().pushToast({
          clientId,
          kind: 'delete-failed',
          description: t.dashboard.water.errorToast,
          serverRowId: null,
          commit: async () => {},
          revert: async () => {},
        });
      } finally {
        useWaterMutationStore.getState().end();
      }
    });
  }

  const litres = (consumedMl / 1000).toFixed(1);
  const goalLitres = (targetMl / 1000).toFixed(1);

  const eyebrowRight = t.dashboard.water.eyebrowRightFormat
    .replace('{bulletsFilled}', String(bulletsFilled))
    .replace('{bulletCount}', String(bulletCount));

  const groupA11y = t.dashboard.water.groupA11y
    .replace('{consumedMl}', String(consumedMl))
    .replace('{targetMl}', String(targetMl));

  return (
    <section
      data-testid="water-tracker"
      role="group"
      aria-label={groupA11y}
      aria-busy={waterBusy ? 'true' : 'false'}
      style={{
        border: '1px solid var(--color-rule-strong)',
        background: 'var(--color-bg-1)',
        padding: 'var(--spacing-4)',
        position: 'relative',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-3)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
          }}
        >
          {t.dashboard.water.eyebrowLeft}
        </span>
        <span
          className="num"
          data-testid="water-bullets-ratio"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--type-label)',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-dust)',
          }}
        >
          {eyebrowRight}
        </span>
      </header>

      {/* Bullet grid */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          gap: 'var(--spacing-2)',
          marginBottom: 'var(--spacing-3)',
        }}
      >
        {Array.from({ length: bulletCount }, (_, i) => (
          <span
            key={i}
            style={{
              width: 16,
              height: 16,
              border: '1.5px solid var(--color-rule-strong)',
              background: i < bulletsFilled ? 'var(--color-slate)' : 'transparent',
            }}
          />
        ))}
      </div>

      {/* Readout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--spacing-2)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        <span
          className="num"
          data-testid="water-consumed-ml"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 28,
            fontWeight: 300,
            color: 'var(--color-ivory)',
          }}
        >
          {consumedMl}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--color-dust)',
          }}
        >
          {`${t.dashboard.water.mlUnit}${t.dashboard.water.mlLitreSeparator}${litres} ${t.dashboard.water.displayLitreUnit}`}
        </span>
      </div>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
          margin: 0,
          marginBottom: 'var(--spacing-3)',
        }}
      >
        {t.dashboard.water.goalFormat.replace('{goalL}', goalLitres)}
      </p>

      {/* Chip row */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-2)',
          flexWrap: 'wrap',
        }}
      >
        <Chip
          testId="water-glass"
          label={t.dashboard.water.glass}
          sublabel={t.dashboard.water.glassSublabel}
          a11y={t.dashboard.water.glassA11y}
          disabled={waterBusy}
          onClick={() => addWater('glass')}
        />
        <Chip
          testId="water-bottle"
          label={t.dashboard.water.bottle}
          sublabel={t.dashboard.water.bottleSublabel}
          a11y={t.dashboard.water.bottleA11y}
          disabled={waterBusy}
          onClick={() => addWater('bottle')}
        />
        <Chip
          testId="water-edit-button"
          buttonRef={editAnchorRef}
          label={t.dashboard.water.editButtonLabel}
          sublabel=""
          a11y={t.dashboard.water.editButtonA11y}
          disabled={waterBusy}
          onClick={() => {
            setEditOpen(true);
          }}
        />
      </div>

      {/* Bug-2 — desktop popover. Mounted only when not mobile so the
          mobile branch's `MobileWheelSheet` doesn't render alongside. */}
      {!isMobile && (
        <PopoverInline
          open={editOpen}
          onOpenChange={setEditOpen}
          anchorRef={editAnchorRef}
          ariaLabel={t.dashboard.water.editPopoverTitle}
          data-testid="water-edit-popover"
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              commitEdit(editDraftMl);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}
          >
            <p
              id="water-edit-popover-title"
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: 'var(--color-sand)',
              }}
            >
              {t.dashboard.water.editPopoverTitle}
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: '13px',
                color: 'var(--color-dust)',
              }}
            >
              {t.dashboard.water.editPopoverHint}
            </p>
            <input
              data-testid="water-edit-input"
              autoFocus
              type="number"
              inputMode="numeric"
              min={editMinMl}
              max={MAX_DAILY_WATER_ML}
              step={EDIT_STEP_ML}
              aria-label={t.dashboard.water.editInputA11y}
              disabled={waterBusy}
              value={editDraftMl}
              onChange={(ev) => {
                const next = Number(ev.target.value);
                if (Number.isNaN(next)) return;
                setEditDraftMl(next);
                // Codex round 1 I2 — any input edit counts as
                // interaction (even returning to the prefill value).
                setHasUserInteracted(true);
              }}
              onBlur={() => {
                if (editDraftMl < editMinMl || editDraftMl > MAX_DAILY_WATER_ML) {
                  showEditOutOfRangeAnnounce();
                }
              }}
              style={{
                background: 'transparent',
                border: 0,
                borderBottom: '1px solid var(--color-rule-strong)',
                color: 'var(--color-ivory)',
                fontFamily: 'var(--font-serif)',
                fontSize: '20px',
                padding: 'var(--spacing-2) 0',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-2)',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                data-testid="water-edit-cancel"
                onClick={() => setEditOpen(false)}
                style={{
                  height: 44,
                  padding: '0 var(--spacing-3)',
                  background: 'transparent',
                  color: 'var(--color-dust)',
                  border: '1px solid var(--color-rule-strong)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {t.dashboard.water.editCancelLabel}
              </button>
              <button
                type="submit"
                data-testid="water-edit-save"
                disabled={!hasUserInteracted || waterBusy}
                aria-disabled={hasUserInteracted && !waterBusy ? 'false' : 'true'}
                style={{
                  height: 44,
                  padding: '0 var(--spacing-4)',
                  background: 'var(--color-oxblood)',
                  color: 'var(--color-ivory)',
                  border: 0,
                  fontFamily: 'var(--font-sans)',
                  fontSize: '10.5px',
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: hasUserInteracted && !waterBusy ? 'pointer' : 'not-allowed',
                  opacity: hasUserInteracted && !waterBusy ? 1 : 0.55,
                }}
              >
                {t.dashboard.water.editSaveLabel}
              </button>
            </div>
          </form>
        </PopoverInline>
      )}

      {/* Bug-2 — mobile bottom-sheet wheel. Mounted only when mobile so
          the desktop popover doesn't double-render under SSR + hydration.
          Codex round 1 I2 — Save (Done) gated on `hasUserInteracted`
          via `doneDisabled`; the wheel's onChange flips the flag at
          first row movement. Enter/Commit on a non-interacted wheel is
          short-circuited the same way (no commitEdit call). */}
      {isMobile && editOpen && (
        <MobileWheelSheet
          open
          onCancel={() => setEditOpen(false)}
          onDone={() => {
            if (!hasUserInteracted) return;
            commitEdit(editDraftMl);
          }}
          title={t.dashboard.water.editWheelTitle}
          description={t.dashboard.water.editWheelDescription}
          doneLabel={t.dashboard.water.editSaveLabel}
          cancelLabel={t.dashboard.water.editCancelLabel}
          doneDisabled={!hasUserInteracted || waterBusy}
          data-testid="water-edit-wheel-sheet"
        >
          <MobileWheelPicker
            value={editDraftMl}
            onChange={(next) => {
              setEditDraftMl(next);
              // Codex round 1 I2 — any wheel movement counts as
              // interaction. The wheel's onChange fires on snap-end
              // (touch) and on row tap (jsdom-friendly), so the
              // disabled-Save state is reachable in both real-device
              // touch and the unit-test surface.
              setHasUserInteracted(true);
            }}
            onCommit={(value) => {
              if (!hasUserInteracted) return;
              commitEdit(value);
            }}
            onCancel={() => setEditOpen(false)}
            options={editWheelOptions}
            ariaLabel={t.dashboard.water.editWheelA11y}
            data-testid="water-edit-wheel"
          />
        </MobileWheelSheet>
      )}
      {waterBusy ? (
        <div
          data-testid="water-tracker-loading"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(10, 10, 10, 0.55)',
            backdropFilter: 'blur(1px)',
            pointerEvents: 'auto',
            cursor: 'progress',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              border: '2px solid var(--color-rule-strong)',
              borderTopColor: 'var(--color-ivory)',
              borderRadius: '999px',
              animation: isReducedMotion ? 'none' : 'kalori-water-spin 800ms linear infinite',
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

function Chip({
  testId,
  label,
  sublabel,
  a11y,
  onClick,
  disabled,
  buttonRef,
}: {
  testId: string;
  label: string;
  sublabel: string;
  a11y: string;
  onClick: () => void;
  disabled?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={testId}
      aria-label={a11y}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        background: 'transparent',
        border: '1px solid var(--color-rule-strong)',
        padding: 'var(--spacing-3) var(--spacing-4)',
        minHeight: 44,
        minWidth: 44,
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--type-label)',
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: disabled ? 'var(--color-dust)' : 'var(--color-sand)',
        outlineColor: 'var(--color-ivory)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span>{label}</span>
      {sublabel ? (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.05em',
            color: 'var(--color-dust)',
            marginTop: 2,
            textTransform: 'none',
          }}
        >
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

export default WaterTracker;

/**
 * `useWeightQuickAddStore` — Task 4.3b optimistic weight-log store (F3 pattern).
 *
 * Mirrors the `WaterTracker` optimistic+rollback approach (Task 3.5), adapted
 * for the longer-lived weight trajectory: the store owns the pending/committed
 * map while render-side optimism flows through React 19 `useOptimistic` in the
 * consuming components.
 *
 * Store is pure (no network IO): the component is the one that invokes
 * `authPost` from `lib/auth/refresh-interceptor.ts` and dispatches
 * `commit()` / `rollback()` based on the server's reply. This keeps the
 * store F12-safe — the refresh-interceptor sits between the component and
 * network; the store never sees 401s.
 *
 * Idempotent-replay guard: `commit()` is a no-op if the same `clientId` has
 * already committed. This defends against the I11 replay path where
 * `authPost` retried a 401 and the server returns `replayed: true` — the
 * component should call `commit()` on the second response, but the UI must
 * not re-announce or re-play toast chrome.
 */
import { create } from 'zustand';

/**
 * Phase B Codex R2 #F-PB-R2-2 — staleness window for the cross-remount
 * in-flight latch. authPost has no built-in timeout or AbortController
 * plumbing, so a hung POST (e.g., network drop after the request left the
 * client) can park the latch forever, permanently blocking the same date.
 * The store now stores `(date -> acquired-at)` rather than just `date`,
 * and `isInFlight()` evicts entries older than this window on read.
 *
 * 30s budget rationale: typical server-side ceiling is <10s
 * (Vercel function default 10s on Hobby; cross-region SG→IAD adds
 * ~150-200ms RTT each way); 30s gives ample slack for retries inside the
 * refresh-interceptor while still recovering well within a user's
 * "is this stuck?" patience window.
 */
export const IN_FLIGHT_TIMEOUT_MS = 30_000;

export interface PendingWeightEntry {
  clientId: string;
  weightKg: number;
  date: string; // YYYY-MM-DD user-TZ
  note?: string | undefined;
  submittedAt: number;
  status: 'pending' | 'rolled-back';
  rollbackReason?: 'server-error' | 'validation' | undefined;
}

export interface ServerWeightRow {
  weightKg: number;
  date: string;
}

interface RecalcSummary {
  newBmr: number;
  newTdee: number;
  newTarget: number;
}

export interface WeightQuickAddState {
  pending: Record<string, PendingWeightEntry>;
  lastCommittedWeightKg: number | null;
  lastCommittedAt: number | null;
  lastCommittedClientIds: Set<string>;
  /**
   * Phase B Codex R1 #4 + R2 #F-PB-R2-2 — map of `YYYY-MM-DD` user-TZ dates
   * to the `Date.now()` at which the latch was acquired. Module-scoped via
   * Zustand so the latch survives `WeightQuickAdd` unmount/remount: a user
   * submitting weight, navigating away, returning before the POST resolves,
   * and submitting again would otherwise mint a fresh `client_id` on the
   * new component instance and insert a duplicate row (the schema only
   * enforces uniqueness on `client_id`, not on `(user_id, date)` — see
   * `architecture.md` §2.5).
   *
   * R2 staleness: `acquireInFlight` records the acquire-time. `isInFlight`
   * and `acquireInFlight` evict entries older than `IN_FLIGHT_TIMEOUT_MS`
   * on read so a hung POST cannot permanently block the date.
   */
  inFlightDates: Map<string, number>;

  submit: (entry: Omit<PendingWeightEntry, 'submittedAt' | 'status'>) => void;
  commit: (clientId: string, row: ServerWeightRow, recalc?: RecalcSummary) => void;
  rollback: (clientId: string, reason: PendingWeightEntry['rollbackReason']) => void;
  reset: () => void;
  hasPendingFor: (clientId: string) => boolean;

  /** Phase B Codex R1 #4 — atomic test-and-set on the per-date in-flight
   * latch. Returns `true` if the latch was acquired (submission may
   * proceed), `false` if a same-date POST is already in flight (caller
   * MUST abort). Atomic so two same-tick callers cannot both succeed. */
  acquireInFlight: (date: string) => boolean;
  /** Phase B Codex R1 #4 — release the per-date in-flight latch. Must be
   * called in `finally` of the network round-trip, regardless of success
   * or failure. Idempotent. */
  releaseInFlight: (date: string) => void;
  /** Phase B Codex R1 #4 — read-only check (test introspection / debug). */
  isInFlight: (date: string) => boolean;
}

export const useWeightQuickAddStore = create<WeightQuickAddState>((set, get) => ({
  pending: {},
  lastCommittedWeightKg: null,
  lastCommittedAt: null,
  lastCommittedClientIds: new Set<string>(),
  inFlightDates: new Map<string, number>(),

  submit: (entry) => {
    set((s) => ({
      pending: {
        ...s.pending,
        [entry.clientId]: {
          ...entry,
          submittedAt: Date.now(),
          status: 'pending',
        },
      },
    }));
  },

  commit: (clientId, row) => {
    set((s) => {
      // Idempotent replay guard — re-commit for same clientId is a no-op.
      // The server sends `replayed: true` in this case and our UI must not
      // re-fire announcements. See briefing §9.6 + §8.3 for the a11y
      // reasoning; this is the store-side half.
      if (s.lastCommittedClientIds.has(clientId)) {
        return s;
      }
      const nextPending = { ...s.pending };
      delete nextPending[clientId];
      const nextIds = new Set(s.lastCommittedClientIds);
      nextIds.add(clientId);
      return {
        pending: nextPending,
        lastCommittedWeightKg: row.weightKg,
        lastCommittedAt: Date.now(),
        lastCommittedClientIds: nextIds,
      };
    });
  },

  rollback: (clientId, reason) => {
    set((s) => {
      const existing = s.pending[clientId];
      if (!existing) return s;
      return {
        pending: {
          ...s.pending,
          [clientId]: { ...existing, status: 'rolled-back', rollbackReason: reason },
        },
      };
    });
  },

  reset: () => {
    set(() => ({
      pending: {},
      lastCommittedWeightKg: null,
      lastCommittedAt: null,
      lastCommittedClientIds: new Set<string>(),
      inFlightDates: new Map<string, number>(),
    }));
  },

  hasPendingFor: (clientId) => {
    return get().pending[clientId] !== undefined;
  },

  // Phase B Codex R1 #4 — atomic test-and-set. We MUST read-and-mutate in
  // a single Zustand `set` callback rather than `if (get().inFlightDates...)
  // ... set(...)`, otherwise two same-tick callers (e.g. a same-tick double
  // submit OR a remount + submit while a previous POST is in flight) can
  // both observe the latch as clear and both acquire it. The Zustand
  // `set((s) => ...)` callback runs synchronously and serializes, so the
  // first call wins and the second call sees the freshly-mutated state.
  //
  // Phase B Codex R2 #F-PB-R2-2 — staleness eviction. authPost has no
  // timeout / AbortController plumbing, so a hung POST would otherwise
  // park the latch forever. We tag each acquire with `Date.now()` and
  // treat entries older than `IN_FLIGHT_TIMEOUT_MS` as already released.
  // The eviction happens here (atomic with the acquire) so two same-tick
  // callers still serialize correctly: the first stale-evicts AND
  // re-acquires; the second sees the freshly-acquired (non-stale) latch
  // and is rejected.
  acquireInFlight: (date) => {
    let acquired = false;
    set((s) => {
      const existingAt = s.inFlightDates.get(date);
      const now = Date.now();
      const isStale = existingAt !== undefined && now - existingAt >= IN_FLIGHT_TIMEOUT_MS;
      if (existingAt !== undefined && !isStale) {
        acquired = false;
        return s;
      }
      const next = new Map(s.inFlightDates);
      next.set(date, now);
      acquired = true;
      return { inFlightDates: next };
    });
    return acquired;
  },

  releaseInFlight: (date) => {
    set((s) => {
      if (!s.inFlightDates.has(date)) return s;
      const next = new Map(s.inFlightDates);
      next.delete(date);
      return { inFlightDates: next };
    });
  },

  // Phase B Codex R2 #F-PB-R2-2 — read-time staleness check. An entry
  // older than `IN_FLIGHT_TIMEOUT_MS` is considered released. We do NOT
  // mutate the store from this read-only path (callers that need to
  // acquire will call `acquireInFlight`, which performs atomic eviction
  // + re-acquire in one Zustand transaction).
  isInFlight: (date) => {
    const acquiredAt = get().inFlightDates.get(date);
    if (acquiredAt === undefined) return false;
    return Date.now() - acquiredAt < IN_FLIGHT_TIMEOUT_MS;
  },
}));

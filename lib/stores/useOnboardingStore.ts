/**
 * `useOnboardingStore` — Zustand store for the 8-step onboarding wizard.
 *
 * Contract (briefing §10):
 *   - Persisted slice → sessionStorage under `kalori:onboarding:v1`
 *     (currentStep, draftProfile, unitSystem, startedAt, clientIds).
 *   - Ephemeral slice → in-memory only
 *     (validationErrors, stepVisitedSet, isSaving, saveError).
 *   - 30-min TTL on rehydrate — stale sessions are discarded.
 *   - `ensureClientId(step)` idempotent per step (reused on retries for
 *     I11 idempotency handoff).
 *
 * Perf (react-perf §2): callers must use narrow selectors (single
 * primitive or `useShallow`) so a typing interaction on one step does
 * not cascade renders across the wizard.
 *
 * SSR safety: sessionStorage access is wrapped in `createJSONStorage`
 * lazy callback. This module MUST NOT be imported from any RSC — all
 * consumers carry `'use client'`.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';

import type { ActivityLevel, BioSex, GoalPace, UnitSystem } from '@/lib/validation/onboarding';

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type DraftProfile = Partial<{
  bio_sex: BioSex;
  age: number;
  height_cm: number;
  current_weight_kg: number;
  goal_weight_kg: number;
  goal_pace: GoalPace;
  activity_level: ActivityLevel;
}>;

type PersistedState = {
  currentStep: Step;
  draftProfile: DraftProfile;
  unitSystem: UnitSystem;
  startedAt: number;
  clientIds: Partial<Record<Step, string>>;
};

type EphemeralState = {
  validationErrors: Record<string, string>;
  stepVisitedSet: Set<number>;
  isSaving: boolean;
  saveError: string | null;
};

type Actions = {
  setDraftField: <K extends keyof DraftProfile>(key: K, value: DraftProfile[K]) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setStep: (step: Step) => void;
  markSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  setValidationErrors: (errors: Record<string, string>) => void;
  ensureClientId: (step: Step) => string;
  reset: () => void;
};

export type OnboardingState = PersistedState & EphemeralState & Actions;

const STORAGE_KEY = 'kalori:onboarding:v1';
const TTL_MS = 30 * 60 * 1000;
const PERSIST_THROTTLE_MS = 500;

/**
 * Wrap a `Storage` implementation so `setItem` writes are throttled
 * (leading + trailing edge) to at most one per `windowMs`. Rapid
 * keystrokes therefore produce at most two sessionStorage writes per
 * 500ms window instead of one-per-character. A `visibilitychange` /
 * `pagehide` listener flushes the pending trailing write so the draft
 * survives the user closing the tab mid-window.
 *
 * Fixes react-perf V3 / briefing §10.3 rule 5.
 *
 * Codex Round 1 MEDIUM fix — `reset()` must route clears through the
 * same wrapper instance so a pending trailing write cannot resurrect
 * cleared state. See `storageSingleton` below.
 */
function throttledStorage(base: Storage, windowMs: number): Storage {
  let pendingKey: string | null = null;
  let pendingValue: string | null = null;
  let lastWrittenAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingKey = null;
    pendingValue = null;
  };

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingKey !== null && pendingValue !== null) {
      base.setItem(pendingKey, pendingValue);
      lastWrittenAt = Date.now();
      pendingKey = null;
      pendingValue = null;
    }
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // Fire the trailing write before the user navigates away — sessionStorage
    // survives within the tab, but the wizard's 30-min TTL relies on the
    // most recent `startedAt` being on disk.
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  return {
    get length(): number {
      return base.length;
    },
    clear: () => {
      cancel();
      base.clear();
    },
    getItem: (key) => base.getItem(key),
    key: (index) => base.key(index),
    removeItem: (key) => {
      cancel();
      base.removeItem(key);
    },
    setItem: (key, value) => {
      const now = Date.now();
      const elapsed = now - lastWrittenAt;
      if (elapsed >= windowMs) {
        // Leading edge — write immediately.
        base.setItem(key, value);
        lastWrittenAt = now;
        cancel();
        return;
      }
      // Inside the window — defer to trailing edge.
      pendingKey = key;
      pendingValue = value;
      if (timer) return;
      timer = setTimeout(flush, windowMs - elapsed);
    },
  };
}

/**
 * Module-scoped singleton of the throttled sessionStorage wrapper.
 *
 * `persist` and `reset()` must share the SAME wrapper instance so that
 * clearing from `reset()` also cancels the trailing flush timer owned
 * by the same wrapper. If `reset()` called raw
 * `sessionStorage.removeItem`, a pending trailing write from earlier
 * typing (and/or the persist middleware's own reset-state write) would
 * fire after reset and resurrect cleared onboarding data — Codex
 * Round 1 MEDIUM regression.
 *
 * Lazy-initialised in `getStorageSingleton()` so SSR imports pay no
 * cost and tests that call `vi.resetModules()` get a fresh wrapper.
 */
let storageSingleton: Storage | null = null;

function getStorageSingleton(): Storage {
  if (storageSingleton) return storageSingleton;
  if (typeof window === 'undefined') {
    // Noop storage for SSR — the store should never be hydrated
    // from server code, but Zustand may probe on import. We
    // satisfy the full DOM Storage interface so TypeScript strict
    // mode accepts the return shape.
    const noop: Storage = {
      length: 0,
      clear: () => void 0,
      getItem: () => null,
      key: () => null,
      removeItem: () => void 0,
      setItem: () => void 0,
    };
    storageSingleton = noop;
    return noop;
  }
  // 500ms leading+trailing throttle per briefing §10.3 rule 5.
  storageSingleton = throttledStorage(sessionStorage, PERSIST_THROTTLE_MS);
  return storageSingleton;
}

const INITIAL_PERSISTED: PersistedState = {
  currentStep: 1,
  draftProfile: {},
  unitSystem: 'metric',
  startedAt: 0,
  clientIds: {},
};

const INITIAL_EPHEMERAL: EphemeralState = {
  validationErrors: {},
  stepVisitedSet: new Set(),
  isSaving: false,
  saveError: null,
};

/** Generate a UUID using the browser `crypto` API with a dev fallback. */
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Deterministic fallback — only hit in exotic test shims lacking crypto.
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useOnboardingStore = create<OnboardingState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...INITIAL_PERSISTED,
        ...INITIAL_EPHEMERAL,

        setDraftField: (key, value) => {
          set((s) => {
            const nextStarted = s.startedAt || Date.now();
            return {
              draftProfile: { ...s.draftProfile, [key]: value },
              startedAt: nextStarted,
            };
          });
        },

        setUnitSystem: (unit) => {
          set({ unitSystem: unit });
        },

        setStep: (step) => {
          set({ currentStep: step });
        },

        markSaving: (saving) => {
          set({ isSaving: saving });
        },

        setSaveError: (error) => {
          set({ saveError: error });
        },

        setValidationErrors: (errors) => {
          set({ validationErrors: errors });
        },

        ensureClientId: (step) => {
          const existing = get().clientIds[step];
          if (existing) return existing;
          const id = generateClientId();
          set((s) => ({ clientIds: { ...s.clientIds, [step]: id } }));
          return id;
        },

        reset: () => {
          set({
            ...INITIAL_PERSISTED,
            ...INITIAL_EPHEMERAL,
            stepVisitedSet: new Set(),
          });
          // Route removal through the SAME wrapper the persist middleware
          // writes to, so any in-flight trailing flush timer is cancelled.
          // Raw `sessionStorage.removeItem` would leave the pending write
          // queued and resurrect stale state — Codex Round 1 MEDIUM.
          if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
            getStorageSingleton().removeItem(STORAGE_KEY);
          }
        },
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => getStorageSingleton()),
        partialize: (s): PersistedState => ({
          currentStep: s.currentStep,
          draftProfile: s.draftProfile,
          unitSystem: s.unitSystem,
          startedAt: s.startedAt,
          clientIds: s.clientIds,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          const age = Date.now() - (state.startedAt || 0);
          if (state.startedAt === 0 || age > TTL_MS) {
            // Stale — wipe and reset to initial defaults.
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem(STORAGE_KEY);
            }
            Object.assign(state, INITIAL_PERSISTED);
            state.startedAt = 0;
          }
        },
      },
    ),
  ),
);

/** Sentinel export so consumers can reference the sessionStorage key in tests. */
export const ONBOARDING_STORAGE_KEY = STORAGE_KEY;

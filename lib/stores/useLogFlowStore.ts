/**
 * `useLogFlowStore` — Zustand store for the 3-tab log flow modal (Task 3.3).
 *
 * Mirrors `useOnboardingStore`'s SSR-safe throttled persistence pattern:
 *   - Persisted slice → sessionStorage under `kalori:log-flow:v1`
 *   - Ephemeral slice → in-memory only (blobs + AbortController branches)
 *   - 500ms throttled write with trailing-edge flush on pagehide
 *   - 30-min TTL via `restoredAt` + `onRehydrateStorage`
 *   - `ensureClientId(tab)` idempotent per tab for I11 retry handoff
 *
 * Design-doc §11 mandates: `isOpen` and mid-flight snap branches
 * (capturing/compressing/uploading/analyzing) are NOT persisted — the blob
 * + AbortController aren't serialisable and any interrupted run is lost
 * by definition.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';

import type { ParseResultT, ParsedItemT } from '@/lib/ai/schemas';

export type LogTab = 'type' | 'snap' | 'library';
export type FailureMode = 'network' | 'timeout' | 'rate-limit' | 'zod' | null;

/**
 * Log-flow mode — gates which surface the modal renders and where saves go.
 *
 *   - `'standard'` (default): full 3-tab Type/Snap/Library switchboard →
 *     ConfirmationScreen → POST /api/entries/save (with optional
 *     save_to_library side effect). Entered from the dashboard `+ ADD`
 *     button per meal column, or via direct nav to `/log`.
 *   - `'library-only'`: single-input AI-parse → ConfirmationScreen with
 *     meal-slot / time / save-to-library / dedup-banner hidden →
 *     POST /api/library/create. Entered from the library page's "Add Item"
 *     button. Does NOT create a `food_entries` row — pure library insert.
 *
 * Ephemeral (never persisted) — a reload resets the modal entirely.
 */
export type LogFlowMode = 'standard' | 'library-only';

/**
 * Meals-bulletin category — mirrors the 5-tuple in
 * `app/api/entries/save/route.ts:54` (Task 3.4 Codex R1 I1 authoritative).
 * Used by the dashboard's `+ ADD` per-column affordance to pre-select the
 * meal category on the ConfirmationScreen after the user chooses text/snap/
 * library input.
 */
export type MealCategoryHint = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

/**
 * Modal phase — `entry` = the 3-tab Type/Snap/Library switchboard; `confirmation`
 * = the ConfirmationScreen takeover that swaps `<Tabs.Root>` with the editable
 * items + save CTA (synthesis §2.3 + §3.4).
 */
export type LogPhase = 'entry' | 'confirmation';

export interface ConfirmationPayload {
  source: 'text' | 'photo' | 'library' | 'manual';
  tab: LogTab;
  items: ParsedItemT[];
  reasoning: string | null;
  dedupMatch: { id: string; normalized_name: string; display_name: string } | null;
  /**
   * Codex Round 1 CRITICAL — per-item library row id (one entry per
   * `items[]`, in matching order). Set by:
   *   - `<LibraryTab />` Continue CTA: `[firstSelectedId, null, null, ...]`
   *   - `<LogPageClient />` deep-link path: `[deepLinkItem.id]`
   *   - `<ConfirmationScreen />` text/photo dedupMatch+reuseExisting branch:
   *     not used (the existing `dedupMatch + reuseExisting` path keeps its
   *     own pathway).
   *
   * The save endpoint persists ONE `library_item_id` per food_entries row
   * (column is scalar). ConfirmationScreen forwards `libraryItemIds[0]`
   * when truthy. Multi-item dedup expansion deferred to Phase 5 per
   * task-4.7.4-output.md decision §2.
   *
   * Optional for backwards compatibility — legacy text/photo flows that
   * don't pass it default to `undefined` and the save body omits the
   * field, preserving the original behaviour.
   */
  libraryItemIds?: (string | null)[] | undefined;
  editEntryId?: string | undefined;
  originalLoggedAt?: string | undefined;
}

export type SnapDraft =
  | { status: 'idle' }
  | { status: 'capturing' }
  | { status: 'compressing'; progress: number }
  | { status: 'uploading'; progress: number; thumbnailDataUrl: string }
  | { status: 'analyzing'; thumbnailDataUrl: string; abortController: AbortController }
  | {
      status: 'done';
      thumbnailDataUrl: string;
      parsed: ParsedItemT[];
      /**
       * Task 4.7.5 — `true` when the thumbnail-route POST failed after a
       * successful vision parse. Non-blocking: the entry is still saved
       * (parsed items are load-bearing; the thumbnail is enrichment per
       * design-doc §10.3). Surfaces an inline warning in SnapTab and is
       * captured to Sentry. Phase 5's offline outbox will own the retry.
       */
      thumbnailUploadFailed?: boolean;
    }
  | {
      status: 'error';
      error: string;
      thumbnailDataUrl: string | null;
      reason?: 'no_food';
    };

export interface LibrarySelectionItem {
  itemId: string;
  quantity: number;
}

/**
 * Task 4.7.4 — UI shape for hydrated library items rendered in
 * `<LibraryTab />`. Mirrors the LibraryItem DB row shape but flattens
 * macros into the top-level fields the card + CTA mappers consume.
 *
 * Carbs / fat / fiber / unit are included so the ConfirmationScreen
 * pre-fills accurately when the user clicks "LOG SELECTED" — without
 * them, library re-logs would lose macros until the user manually
 * re-edits the row.
 *
 * Not persisted — hydrated server-side per request via the page.tsx
 * fetch + `setLibraryItems` action; stale local cache would drift on
 * merge / delete actions handled elsewhere.
 */
export interface LogLibraryItem {
  id: string;
  name: string;
  kcal: number;
  lastUsedIso: string | null;
  logCount: number;
  /**
   * Saved standard serving amount for this library item. Nutrition values are
   * stored for this baseline serving, so log-flow quantity edits scale by
   * quantity / defaultPortion when present.
   */
  defaultPortion?: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  // Phase 2C — 5th macro (unit: mg). Optional so legacy fixtures don't
  // need to thread a phantom 0 through every construction site.
  cholesterolMg?: number;
  micros?: Record<string, number>;
  approxGrams?: number;
  unit: string;
  thumbnailUrl?: string | null;
}

export type LibrarySort = 'name-asc' | 'frequent' | 'recent' | 'highest-protein';

/**
 * Bug 7b — runtime list of valid `LibrarySort` values. Used by
 * `isLibrarySort` to defend `onRehydrateStorage` against a stale persisted
 * value that isn't a member of the current union (typo, removed value,
 * rolled-back migration). Coerce-only-invalid semantics: valid values
 * survive the rehydrate untouched; invalid ones snap to the new
 * `'name-asc'` default.
 */
const LIBRARY_SORT_VALUES: readonly LibrarySort[] = [
  'name-asc',
  'frequent',
  'recent',
  'highest-protein',
] as const;

function isLibrarySort(v: unknown): v is LibrarySort {
  return typeof v === 'string' && (LIBRARY_SORT_VALUES as readonly string[]).includes(v);
}

/**
 * PERSISTED subset — only serialisable branches. Mid-flight snap transitions
 * collapse to `{ status: 'idle' }` on write.
 */
type PersistedState = {
  activeTab: LogTab;
  typeDraft: string;
  typeParsed: ParseResultT | null;
  snapDraft: Extract<SnapDraft, { status: 'idle' | 'done' | 'error' }>;
  librarySelection: LibrarySelectionItem[];
  librarySort: LibrarySort;
  librarySearch: string;
  failureMode: FailureMode;
  originalInput: string | null;
  restoredAt: number;
  clientIds: Partial<Record<LogTab, string>>;
  /**
   * F-UI-3.6-B-2 — user-scope the persisted draft. The chrome calls
   * `syncUserId(uid)` once per session; if the persisted `lastUserId`
   * differs from the current session's uid (User A's drafts linger on a
   * shared device after logout → login as User B), the draft slice is
   * cleared before the new user can see or replay it.
   */
  lastUserId: string | null;
};

/**
 * EPHEMERAL subset — never touches sessionStorage.
 */
type EphemeralState = {
  isOpen: boolean;
  snapDraftEphemeral: Extract<
    SnapDraft,
    { status: 'capturing' | 'compressing' | 'uploading' | 'analyzing' }
  > | null;
  /**
   * Task 3.4 — modal phase. `entry` = 3-tab switchboard; `confirmation` =
   * ConfirmationScreen takeover. Never persisted (a reload resets to `entry`
   * so a stale confirmation snapshot can't resurface).
   */
  phase: LogPhase;
  /**
   * Task 3.4 — confirmation payload. Seeded by `enterConfirmation(payload)`
   * when a tab completes a parse; cleared by `exitConfirmation()` or a
   * successful save/close. Never persisted (see phase rationale).
   */
  confirmationPayload: ConfirmationPayload | null;
  /**
   * Task 3.5 — pending meal-category hint. The meals-bulletin `+ ADD`
   * affordance on the dashboard passes `{ mealCategory: 'breakfast' }` (etc.)
   * to `openModal(tab, opts)`. ConfirmationScreen reads this slot to
   * pre-select the meal_category radio for first-class column-scoped logging.
   * Cleared on `closeModal` / `resetDraft`. Never persisted — a reload shouldn't
   * retain a stale category intent.
   */
  pendingMealCategory: MealCategoryHint | null;
  pendingLogDate: string | null;
  pendingLogTimezone: string | null;
  /**
   * Task 4.7.4 — server-hydrated list of LogLibraryItem rows for the
   * Library tab grid. Seeded by the page-level RSC fetch on `/log` and
   * pushed into the store via `setLibraryItems`. Never persisted — the
   * server is authoritative per request; a cached local copy would
   * drift on merge / delete actions handled outside the log flow.
   */
  libraryItems: LogLibraryItem[];
  /**
   * Active modal mode — see `LogFlowMode`. Seeded by `openModal({ mode })`,
   * defaults to `'standard'`, reset to `'standard'` on `closeModal` /
   * `resetDraft` so a subsequent dashboard `+ ADD` doesn't inherit a
   * stale library-only state.
   */
  mode: LogFlowMode;
};

type Actions = {
  openModal: (
    tab?: LogTab,
    opts?: {
      mealCategory?: MealCategoryHint;
      logDate?: string;
      timezone?: string;
      mode?: LogFlowMode;
    },
  ) => void;
  closeModal: (opts?: { discardDraft?: boolean }) => void;
  setActiveTab: (tab: LogTab) => void;
  setTypeDraft: (text: string) => void;
  setTypeParsed: (parsed: ParseResultT | null) => void;
  setSnapDraft: (draft: SnapDraft) => void;
  setLibrarySelection: (selection: LibrarySelectionItem[]) => void;
  setLibrarySort: (sort: LibrarySort) => void;
  setLibrarySearch: (q: string) => void;
  /**
   * Task 4.7.4 — replace the hydrated library list. Called once per
   * `/log` page render after the server-side fetch resolves. Idempotent.
   */
  setLibraryItems: (items: LogLibraryItem[]) => void;
  setFailureMode: (mode: FailureMode, originalInput: string | null) => void;
  resetDraft: () => void;
  ensureClientId: (tab: LogTab) => string;
  /**
   * I7 fix (Codex round 1): clear the stored client_id for the given tab
   * after a successful submit, so the NEXT logically-new submission minted
   * from that tab gets a fresh UUID. Without this, the server's idempotency
   * index (keyed on client_id) would reject repeat submits from the same
   * tab within the 30-min TTL. Task 3.4 Confirmation MUST call this after
   * writing a food_entries row — 3.3 exposes the action, 3.4 wires the call.
   *
   * NOTE: also called by `<ManualEntryFallback />` BEFORE the manual submit
   * to mint a fresh client_id for the manual path — that case must NOT
   * also clear the user's draft. Use `commitSaveSuccess` for the
   * server-confirmed save-success transition; `clearClientId` is the
   * narrower id-only reset.
   */
  clearClientId: (tab: LogTab) => void;
  /**
   * Phase B Codex R1 F-PB-R1-1 — atomic post-SAVE_OK transition. Called by
   * `<ConfirmationScreen />` after `/api/entries/save` returns 200. Clears
   * the per-tab `client_id` (so the next submit mints a fresh UUID) AND the
   * tab's user-facing draft (so the form is empty next time the user
   * returns to that tab). Replaces the previous TypeTab subscription
   * pattern, which was unreachable: TypeTab unmounts during
   * `phase === 'confirmation'` and so its useEffect listener was torn down
   * BEFORE the SAVE_OK transition could fire.
   */
  commitSaveSuccess: (tab: LogTab) => void;
  /**
   * Task 3.4 — swap modal into ConfirmationScreen takeover. Seeds
   * `confirmationPayload` and flips `phase: 'confirmation'`.
   */
  enterConfirmation: (payload: ConfirmationPayload) => void;
  /**
   * Task 3.4 — return from ConfirmationScreen to the tab-view. Called by
   * the `← EDIT INPUT` tertiary link and by `closeModal()` cleanup.
   */
  exitConfirmation: () => void;
  /**
   * F-UI-3.6-B-2 — reconcile persisted draft against the current session
   * user. Called once by the chrome (Supabase-resolved userId from the
   * `(app)` layout). When `lastUserId !== userId`, purge persisted draft
   * fields (drafts, clientIds, library selection, failure mode) so User A's
   * drafts never leak to User B on a shared device. When equal, no-op.
   */
  syncUserId: (userId: string) => void;
};

export type LogFlowState = PersistedState & EphemeralState & Actions;

const STORAGE_KEY = 'kalori:log-flow:v1';
const TTL_MS = 30 * 60 * 1000;
const PERSIST_THROTTLE_MS = 500;

// ---------------------------------------------------------------------------
// Throttled Storage singleton — identical pattern to useOnboardingStore.
// ---------------------------------------------------------------------------

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
        base.setItem(key, value);
        lastWrittenAt = now;
        cancel();
        return;
      }
      pendingKey = key;
      pendingValue = value;
      if (timer) return;
      timer = setTimeout(flush, windowMs - elapsed);
    },
  };
}

let storageSingleton: Storage | null = null;

function getStorageSingleton(): Storage {
  if (storageSingleton) return storageSingleton;
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
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
  storageSingleton = throttledStorage(sessionStorage, PERSIST_THROTTLE_MS);
  return storageSingleton;
}

// ---------------------------------------------------------------------------
// Initial state.
// ---------------------------------------------------------------------------

const INITIAL_PERSISTED: PersistedState = {
  activeTab: 'type',
  typeDraft: '',
  typeParsed: null,
  snapDraft: { status: 'idle' },
  librarySelection: [],
  // Bug 7b — default sort is alphabetical (A→Z) to mirror the `/library`
  // page's default after the parent batch's Bug 7 fix.
  librarySort: 'name-asc',
  librarySearch: '',
  failureMode: null,
  originalInput: null,
  restoredAt: 0,
  clientIds: {},
  lastUserId: null,
};

const INITIAL_EPHEMERAL: EphemeralState = {
  isOpen: false,
  snapDraftEphemeral: null,
  phase: 'entry',
  confirmationPayload: null,
  pendingMealCategory: null,
  pendingLogDate: null,
  pendingLogTimezone: null,
  libraryItems: [],
  mode: 'standard',
};

export function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // POST-MVP-BUGFIX-2026-05-17-LM-SEC-2 — Cryptographically secure v4
  // fallback per RFC 4122 §4.4 (sibling of mintLibraryClientId in
  // ConfirmationScreen). `crypto.getRandomValues` is universally present
  // wherever `crypto.randomUUID` is missing (old Safari, old Node, jsdom).
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // `bytes` is allocated with length 16, so indices 0..15 are populated.
    // `noUncheckedIndexedAccess` cannot prove this, so `!` is required.
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }
  // Last-resort fallback. Only reachable from environments without ANY
  // crypto API (vanishingly rare); preserved so the function never throws
  // and the schema-validation contract (z.string().uuid()) still gets a
  // syntactically-valid UUID string even there.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Store.
// ---------------------------------------------------------------------------

export const useLogFlowStore = create<LogFlowState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...INITIAL_PERSISTED,
        ...INITIAL_EPHEMERAL,

        openModal: (tab, opts) => {
          set((s) => {
            const mode: LogFlowMode = opts?.mode ?? 'standard';
            // E.CODEX Round-2 I1 — library-only mode is an isolated Add-Item
            // flow that must not inherit the persisted dashboard Type draft.
            // Reset the Type-tab slice (draft text, parsed result, per-type
            // client id, failure banner) so the form opens empty. Other tabs'
            // drafts (snap blob, library selection) survive because they're
            // unrelated to the Type input surface the library-only view
            // renders. Standard mode continues to preserve drafts.
            const libraryOnlyTypeReset =
              mode === 'library-only'
                ? (() => {
                    const nextClientIds = { ...s.clientIds };
                    delete nextClientIds.type;
                    return {
                      typeDraft: '',
                      typeParsed: null,
                      failureMode: null,
                      originalInput: null,
                      clientIds: nextClientIds,
                    } satisfies Partial<LogFlowState>;
                  })()
                : {};
            return {
              isOpen: true,
              activeTab: tab ?? s.activeTab,
              restoredAt: s.restoredAt || Date.now(),
              // Task 3.5: accept a meal-category hint from the dashboard's
              // `+ ADD` affordance. `undefined` leaves existing null intact
              // (no-op); explicit value records it for ConfirmationScreen.
              ...(opts?.mealCategory !== undefined
                ? { pendingMealCategory: opts.mealCategory }
                : {}),
              ...(opts?.logDate !== undefined ? { pendingLogDate: opts.logDate } : {}),
              ...(opts?.timezone !== undefined ? { pendingLogTimezone: opts.timezone } : {}),
              // `mode` defaults to `'standard'` if the caller doesn't pass
              // one; explicit `'library-only'` switches the modal into the
              // library-create surface (single Type input, no meal slot /
              // time / save-to-library toggle, save → /api/library/create).
              mode,
              ...libraryOnlyTypeReset,
            };
          });
        },

        closeModal: (opts) => {
          if (opts?.discardDraft) {
            get().resetDraft();
            return;
          }
          set({
            isOpen: false,
            snapDraftEphemeral: null,
            phase: 'entry',
            confirmationPayload: null,
            pendingMealCategory: null,
            pendingLogDate: null,
            pendingLogTimezone: null,
            mode: 'standard',
          });
        },

        setActiveTab: (tab) => {
          set({ activeTab: tab, failureMode: null, originalInput: null });
        },

        setTypeDraft: (text) => {
          set((s) => ({
            typeDraft: text,
            restoredAt: s.restoredAt || Date.now(),
          }));
        },

        setTypeParsed: (parsed) => {
          set({ typeParsed: parsed });
        },

        setSnapDraft: (draft) => {
          // Route mid-flight branches into the ephemeral slot; persistable
          // branches into the persisted field. Consumers read via
          // `selectCurrentSnapDraft` which collapses the two.
          if (
            draft.status === 'capturing' ||
            draft.status === 'compressing' ||
            draft.status === 'uploading' ||
            draft.status === 'analyzing'
          ) {
            set({
              snapDraftEphemeral: draft,
              restoredAt: get().restoredAt || Date.now(),
            });
          } else {
            set({
              snapDraft: draft,
              snapDraftEphemeral: null,
              restoredAt: get().restoredAt || Date.now(),
            });
          }
        },

        setLibrarySelection: (selection) => {
          set((s) => ({
            librarySelection: selection,
            restoredAt: s.restoredAt || Date.now(),
          }));
        },

        setLibrarySort: (sort) => {
          set({ librarySort: sort });
        },

        setLibrarySearch: (q) => {
          set({ librarySearch: q });
        },

        // Task 4.7.4 — seed the hydrated library list from the page RSC.
        // Codex Round 1 IMPROVEMENT — prune `librarySelection` against the
        // new items list. Without this, deleted/merged items linger in the
        // selection and the Continue CTA stays enabled but click builds an
        // empty `parsedItems[]` (silent no-op).
        setLibraryItems: (items) => {
          set((s) => {
            const ids = new Set(items.map((i) => i.id));
            const prunedSelection = s.librarySelection.filter((sel) => ids.has(sel.itemId));
            const selectionChanged = prunedSelection.length !== s.librarySelection.length;
            return selectionChanged
              ? { libraryItems: items, librarySelection: prunedSelection }
              : { libraryItems: items };
          });
        },

        setFailureMode: (mode, originalInput) => {
          set({ failureMode: mode, originalInput });
        },

        resetDraft: () => {
          set({
            ...INITIAL_PERSISTED,
            ...INITIAL_EPHEMERAL,
            restoredAt: 0,
          });
          getStorageSingleton().removeItem(STORAGE_KEY);
        },

        ensureClientId: (tab) => {
          const existing = get().clientIds[tab];
          if (existing) return existing;
          const id = generateClientId();
          set((s) => ({ clientIds: { ...s.clientIds, [tab]: id } }));
          return id;
        },

        // I7: clear the stored client_id for a tab so the next submit
        // gets a fresh UUID. Called by Task 3.4 Confirmation after a
        // successful food_entries write AND by ManualEntryFallback before
        // delegating a manual submit (the latter MUST NOT also wipe the
        // draft — see commitSaveSuccess for the save-success path).
        clearClientId: (tab) => {
          set((s) => {
            const next = { ...s.clientIds };
            delete next[tab];
            return { clientIds: next };
          });
        },

        // Phase B Codex R1 F-PB-R1-1 — atomic post-SAVE_OK transition.
        // Combines `clearClientId(tab)` with a per-tab draft reset so the
        // user's input clears as soon as the server confirms the entry was
        // written. Replaces the previous TypeTab subscription pattern,
        // which never fired because TypeTab unmounts during
        // `phase === 'confirmation'`. Only the matching tab's draft is
        // touched; other tabs' work-in-progress is preserved.
        commitSaveSuccess: (tab) => {
          set((s) => {
            const nextClientIds = { ...s.clientIds };
            delete nextClientIds[tab];
            const patch: Partial<LogFlowState> = { clientIds: nextClientIds };
            if (tab === 'type') {
              patch.typeDraft = '';
              patch.typeParsed = null;
            } else if (tab === 'snap') {
              patch.snapDraft = { status: 'idle' };
              patch.snapDraftEphemeral = null;
            } else if (tab === 'library') {
              patch.librarySelection = [];
              patch.librarySearch = '';
            }
            return patch;
          });
        },

        // Task 3.4 — enter the ConfirmationScreen takeover.
        enterConfirmation: (payload) => {
          set({ phase: 'confirmation', confirmationPayload: payload });
        },

        // Task 3.4 — return to the tab-view (← EDIT INPUT or cleanup).
        exitConfirmation: () => {
          set({ phase: 'entry', confirmationPayload: null });
        },

        // F-UI-3.6-B-2 — user-scoped purge on auth change.
        syncUserId: (userId) => {
          const currentLast = get().lastUserId;
          if (currentLast === userId) {
            // Same user — no-op. Ensures a late-second call from a hot-reload
            // or a React double-invoke doesn't wipe a live draft.
            return;
          }
          if (currentLast === null) {
            // First session for this device / store — record the user but
            // keep whatever was already in local state (covers the fresh
            // login on an untouched store).
            set({ lastUserId: userId });
            return;
          }
          // User changed — purge all persisted draft fields + session store.
          // We deliberately keep ephemeral phase/confirmationPayload alone;
          // the chrome will unmount the modal shell on route change anyway.
          set({
            ...INITIAL_PERSISTED,
            lastUserId: userId,
            restoredAt: 0,
          });
          getStorageSingleton().removeItem(STORAGE_KEY);
        },
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => getStorageSingleton()),
        partialize: (s): PersistedState => ({
          activeTab: s.activeTab,
          typeDraft: s.typeDraft,
          typeParsed: s.typeParsed,
          snapDraft: s.snapDraft,
          librarySelection: s.librarySelection,
          librarySort: s.librarySort,
          librarySearch: s.librarySearch,
          failureMode: s.failureMode,
          originalInput: s.originalInput,
          restoredAt: s.restoredAt,
          clientIds: s.clientIds,
          lastUserId: s.lastUserId,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          // Bug 7b — defensive coercion: persisted `librarySort` from a
          // pre-Bug-7b session might hold a value that isn't a member of
          // the widened union (e.g., a typo, a removed value, or
          // anything written by a future migration). The persist
          // middleware has no `version` field, so we cannot rely on a
          // `migrate` callback here. Snap unknown values to the new
          // default; preserve valid values (frequent / recent /
          // highest-protein) so users keep their explicit choice.
          if (!isLibrarySort(state.librarySort)) {
            state.librarySort = 'name-asc';
          }
          const age = Date.now() - (state.restoredAt || 0);
          if (state.restoredAt === 0 || age > TTL_MS) {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.removeItem(STORAGE_KEY);
            }
            Object.assign(state, INITIAL_PERSISTED);
            state.restoredAt = 0;
          }
          // Always force ephemeral back to clean defaults on hydrate.
          state.isOpen = false;
          state.snapDraftEphemeral = null;
          state.phase = 'entry';
          state.confirmationPayload = null;
          state.pendingMealCategory = null;
          state.pendingLogDate = null;
          state.pendingLogTimezone = null;
          state.libraryItems = [];
        },
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// Selectors — per-slice to keep re-renders narrow (react-perf rerender-defer-reads).
// ---------------------------------------------------------------------------

export const selectIsOpen = (s: LogFlowState): boolean => s.isOpen;
export const selectActiveTab = (s: LogFlowState): LogTab => s.activeTab;
export const selectTypeDraft = (s: LogFlowState): string => s.typeDraft;
export const selectTypeParsed = (s: LogFlowState): ParseResultT | null => s.typeParsed;
export const selectCurrentSnapDraft = (s: LogFlowState): SnapDraft =>
  s.snapDraftEphemeral ?? s.snapDraft;
export const selectLibrarySelection = (s: LogFlowState): LibrarySelectionItem[] =>
  s.librarySelection;
export const selectLibrarySort = (s: LogFlowState): LibrarySort => s.librarySort;
export const selectLibrarySearch = (s: LogFlowState): string => s.librarySearch;
export const selectFailureMode = (s: LogFlowState): FailureMode => s.failureMode;
export const selectOriginalInput = (s: LogFlowState): string | null => s.originalInput;
export const selectPhase = (s: LogFlowState): LogPhase => s.phase;
export const selectConfirmationPayload = (s: LogFlowState): ConfirmationPayload | null =>
  s.confirmationPayload;
export const selectPendingMealCategory = (s: LogFlowState): MealCategoryHint | null =>
  s.pendingMealCategory;
export const selectPendingLogDate = (s: LogFlowState): string | null => s.pendingLogDate;
export const selectPendingLogTimezone = (s: LogFlowState): string | null => s.pendingLogTimezone;
export const selectLibraryItems = (s: LogFlowState): LogLibraryItem[] => s.libraryItems;

/** Sentinel export so consumers / tests can reference the sessionStorage key. */
export const LOG_FLOW_STORAGE_KEY = STORAGE_KEY;
/** Sentinel TTL so tests can simulate expiry. */
export const LOG_FLOW_TTL_MS = TTL_MS;

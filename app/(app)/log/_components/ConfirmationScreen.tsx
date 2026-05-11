'use client';

/**
 * <ConfirmationScreen /> — Task 3.4 compound (synthesis §2.3 + §6.1 + ui-design
 * §4.2.2 + §7.2.6) implementing the ledger-editorial confirmation UI.
 *
 * Structure per skill G1/G9 + vercel-composition-patterns:
 *   Confirmation.Root          — Provider, owns useReducer + ConfirmationContext
 *   Confirmation.Masthead      — kicker + double-hairline
 *   Confirmation.ItemList      — maps over context.items to ConfirmationItemRow
 *   Confirmation.Reasoning     — WhyTheseNumbers (self-gates via context.source)
 *   Confirmation.MealSlot      — kicker-row radio (§ 01..04)
 *   Confirmation.DedupBanner   — inline banner when dedupMatch truthy
 *   Confirmation.SaveToLibraryToggle — switch; self-gates via context.source
 *   Confirmation.ErrorBanner   — lifecycle=error ARIA alert
 *   Confirmation.SaveAction    — Save CTA wrapped in useTransition
 *   ConfirmationScreen         — public explicit variant that composes all
 *
 * Save contract (I8 + I11 + F12):
 *   1. Read client_id via useLogFlowStore.ensureClientId(tab).
 *   2. Build body { client_id, logged_at, meal_category, source, items, ai_reasoning }.
 *   3. authFetch('/api/entries/save', body) — used directly for status-code
 *      discrimination (architecture §10.2).
 *   4. On success: clearClientId(tab), push undo toast, onClose().
 *   5. On failure: lifecycle=error, banner shown + focus to Retry.
 *
 * R1 contract: routes through `authFetch` from the refresh-interceptor. Zero
 * raw fetch under app/(app)/log.
 */
import { useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react';

import { authFetch } from '@/lib/auth/refresh-interceptor';
import { MobileWheelPicker } from '@/components/primitives/MobileWheelPicker';
import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { t } from '@/lib/i18n/en';
import type { ParsedItemT } from '@/lib/ai/schemas';
import { normalizeName } from '@/lib/text/normalize';
import { useLogFlowStore, type LogTab } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { getDeviceTimeZone } from '@/lib/time/device-timezone';
import { userTzDayMidpointIso, userTzToday } from '@/lib/time/day';

import { WhyTheseNumbers } from './WhyTheseNumbers';

/**
 * Bug 4 — portion options for the mobile wheel picker. Range 0.25–10
 * step 0.25 = 40 rows, well inside the §10.6.1 high-cardinality cap.
 */
const PORTION_WHEEL_OPTIONS = (() => {
  const opts: { value: number; label: string }[] = [];
  for (let v = 0.25; v <= 10.0001; v += 0.25) {
    const rounded = Math.round(v * 100) / 100;
    opts.push({ value: rounded, label: rounded.toString() });
  }
  return opts;
})();

/**
 * Snap an arbitrary numeric portion to the nearest wheel option so the
 * sheet always opens with an option matching `value`. Without this, a
 * server-supplied portion like 1.7 would not resolve to any row and the
 * picker would fall back to its first-enabled rule.
 */
function snapPortionToWheel(portion: number): number {
  if (!Number.isFinite(portion) || portion <= 0) return 1;
  const snapped = Math.max(0.25, Math.min(10, Math.round(portion * 4) / 4));
  return snapped;
}

export type ConfirmationSource = 'text' | 'photo' | 'library' | 'manual';
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export interface DedupMatch {
  id: string;
  normalized_name: string;
  display_name: string;
}

/** Stable row id — minted in reducer init; shared with DOM keys. */
type RowId = string;

export interface ConfirmationRow {
  id: RowId;
  item: ParsedItemT;
}

export interface ConfirmationScreenProps {
  source: ConfirmationSource;
  tab: LogTab;
  items: ParsedItemT[];
  reasoning: string | null;
  dedupMatch: DedupMatch | null;
  /**
   * Codex Round 1 CRITICAL — per-item library row id, positionally aligned
   * with `items[]`. ConfirmationScreen forwards `libraryItemIds[0]` as
   * `library_item_id` on save when truthy (links food_entries → library row
   * per I12). Set by:
   *   - `<LibraryTab />` Continue CTA: `[firstId, null, null, ...]`
   *   - `<LogPageClient />` deep-link path: `[deepLinkItem.id]`
   * Optional: text/photo flows omit it; the existing
   * `dedupMatch + reuseExisting` path keeps its own pathway.
   */
  libraryItemIds?: (string | null)[] | undefined;
  editEntryId?: string | undefined;
  originalLoggedAt?: string | undefined;
  onClose: () => void;
}

type Lifecycle =
  | { status: 'editing' }
  | { status: 'saving' }
  | { status: 'error'; message: string };

type Action =
  | { type: 'START_SAVE' }
  | { type: 'SAVE_OK' }
  | { type: 'SAVE_ERROR'; message: string }
  | { type: 'EDIT_ITEM_NAME'; id: RowId; name: string }
  | { type: 'EDIT_ITEM_KCAL'; id: RowId; kcal: number }
  | { type: 'EDIT_ITEM_PORTION'; id: RowId; portion: number }
  | { type: 'REMOVE_ITEM'; id: RowId }
  | { type: 'SET_MEAL'; meal: MealCategory }
  | { type: 'SET_SAVE_TO_LIBRARY'; on: boolean }
  | { type: 'SET_REUSE_EXISTING'; on: boolean }
  | { type: 'SET_DEDUP_MATCH'; match: DedupMatch | null };

interface State {
  lifecycle: Lifecycle;
  rows: ConfirmationRow[];
  meal: MealCategory;
  saveToLibrary: boolean;
  reuseExisting: boolean;
  dedupMatch: DedupMatch | null;
}

function defaultMealForNow(): MealCategory {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

function mintRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * I7 — Route an a11y announcement to the chrome-level `#kalori-live-polite`
 * region if present; otherwise attach a transient live region to `<body>` so
 * the announcement is not lost. The fallback region is auto-removed after the
 * announcement propagates so it does not leak into the DOM.
 *
 * The chrome region can be absent when Next 16 unmounts the `(app)` layout
 * during a route transition between save-completion and the user clicking
 * UNDO (or when tests render ConfirmationScreen outside the full chrome).
 */
function announcePolite(message: string): void {
  if (typeof document === 'undefined') return;
  const chromeRegion = document.getElementById('kalori-live-polite');
  if (chromeRegion) {
    chromeRegion.textContent = message;
    return;
  }
  const fallback = document.createElement('span');
  fallback.setAttribute('role', 'status');
  fallback.setAttribute('aria-live', 'polite');
  fallback.setAttribute('aria-atomic', 'true');
  fallback.setAttribute('data-kalori-live-polite-fallback', 'true');
  // sr-only positioning so the region exists in DOM for SR but is not visible.
  fallback.style.position = 'absolute';
  fallback.style.width = '1px';
  fallback.style.height = '1px';
  fallback.style.overflow = 'hidden';
  fallback.style.clip = 'rect(0 0 0 0)';
  fallback.textContent = message;
  document.body.appendChild(fallback);
  // Let the assistive tech observe + then garbage-collect the node.
  setTimeout(() => {
    fallback.parentNode?.removeChild(fallback);
  }, 5000);
}

function roundKcal(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function roundNutrition(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

function scaleMicros(micros: ParsedItemT['micros'], ratio: number): ParsedItemT['micros'] {
  return Object.fromEntries(
    Object.entries(micros).map(([key, value]) => [key, roundNutrition(value * ratio)]),
  );
}

function rescaleItemForPortion(item: ParsedItemT, portion: number): ParsedItemT {
  const previousPortion = item.portion;
  if (
    !Number.isFinite(portion) ||
    portion <= 0 ||
    !Number.isFinite(previousPortion) ||
    previousPortion <= 0
  ) {
    return { ...item, portion };
  }

  const ratio = portion / previousPortion;
  const macros = item.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  const micros = item.micros ?? {};
  return {
    ...item,
    portion,
    kcal: roundKcal(item.kcal * ratio),
    macros: {
      protein_g: roundNutrition(macros.protein_g * ratio),
      carbs_g: roundNutrition(macros.carbs_g * ratio),
      fat_g: roundNutrition(macros.fat_g * ratio),
      fiber_g: roundNutrition(macros.fiber_g * ratio),
    },
    micros: scaleMicros(micros, ratio),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START_SAVE':
      return { ...state, lifecycle: { status: 'saving' } };
    case 'SAVE_OK':
      return { ...state, lifecycle: { status: 'editing' } };
    case 'SAVE_ERROR':
      return {
        ...state,
        lifecycle: { status: 'error', message: action.message },
      };
    case 'EDIT_ITEM_NAME': {
      const rows = state.rows.map((r) =>
        r.id === action.id ? { ...r, item: { ...r.item, name: action.name } } : r,
      );
      return { ...state, rows };
    }
    case 'EDIT_ITEM_KCAL': {
      const rows = state.rows.map((r) =>
        r.id === action.id ? { ...r, item: { ...r.item, kcal: action.kcal } } : r,
      );
      return { ...state, rows };
    }
    case 'EDIT_ITEM_PORTION': {
      const rows = state.rows.map((r) =>
        r.id === action.id ? { ...r, item: rescaleItemForPortion(r.item, action.portion) } : r,
      );
      return { ...state, rows };
    }
    case 'REMOVE_ITEM': {
      const rows = state.rows.filter((r) => r.id !== action.id);
      return { ...state, rows };
    }
    case 'SET_MEAL':
      return { ...state, meal: action.meal };
    case 'SET_SAVE_TO_LIBRARY':
      return { ...state, saveToLibrary: action.on };
    case 'SET_REUSE_EXISTING':
      return { ...state, reuseExisting: action.on };
    case 'SET_DEDUP_MATCH':
      return { ...state, dedupMatch: action.match };
    default:
      return state;
  }
}

// --------------------------------------------------------------------------
// ConfirmationContext — generic { state, actions, meta } shape per
// vercel-composition-patterns state-context-interface rule.
// --------------------------------------------------------------------------

interface ConfirmationActions {
  editName: (id: RowId, name: string) => void;
  editKcal: (id: RowId, kcal: number) => void;
  editPortion: (id: RowId, portion: number) => void;
  removeItem: (id: RowId) => void;
  setMeal: (meal: MealCategory) => void;
  setSaveToLibrary: (on: boolean) => void;
  setReuseExisting: (on: boolean) => void;
  save: () => void;
}

interface ConfirmationMeta {
  source: ConfirmationSource;
  tab: LogTab;
  reasoning: string | null;
  isSaving: boolean;
  isEditing: boolean;
  /** I2 — true when `state.rows.length === 0`; disables Save CTA. */
  isEmpty: boolean;
  titleId: string;
  liveRegionId: string;
}

export interface ConfirmationContextValue {
  state: State;
  actions: ConfirmationActions;
  meta: ConfirmationMeta;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

function useConfirmation(): ConfirmationContextValue {
  const ctx = use(ConfirmationContext);
  if (!ctx) {
    throw new Error('Confirmation children must be rendered inside <Confirmation.Root>');
  }
  return ctx;
}

// --------------------------------------------------------------------------
// Confirmation.Root — provider that owns reducer + side-effects.
// --------------------------------------------------------------------------

interface RootProps {
  source: ConfirmationSource;
  tab: LogTab;
  items: ParsedItemT[];
  reasoning: string | null;
  dedupMatch: DedupMatch | null;
  libraryItemIds?: (string | null)[] | undefined;
  editEntryId?: string | undefined;
  originalLoggedAt?: string | undefined;
  onClose: () => void;
  children: React.ReactNode;
}

function Root({
  source,
  tab,
  items,
  reasoning,
  dedupMatch,
  libraryItemIds,
  editEntryId,
  originalLoggedAt,
  onClose,
  children,
}: RootProps) {
  const router = useRouter();
  const ensureClientId = useLogFlowStore((s) => s.ensureClientId);
  // Phase B Codex R1 F-PB-R1-1 — `commitSaveSuccess` atomically clears the
  // tab's `client_id` AND its user-facing draft on a confirmed save. The
  // older `clearClientId(tab)` variant only handled the id; the draft
  // reset relied on a TypeTab subscription that was unreachable because
  // TypeTab unmounts during `phase === 'confirmation'`.
  const commitSaveSuccess = useLogFlowStore((s) => s.commitSaveSuccess);
  // Task 3.5 M1.5 — meals-bulletin `+ ADD` affordance writes a hint into
  // the store so ConfirmationScreen can pre-select the meal radio. Read
  // once at mount-init via getState() to avoid a resubscription that would
  // reset the reducer on every store update.
  const pendingMealCategory = useLogFlowStore.getState().pendingMealCategory;
  const pendingLogDate = useLogFlowStore.getState().pendingLogDate;
  const pendingLogTimezone = useLogFlowStore.getState().pendingLogTimezone;
  const titleId = useId();
  const liveRegionId = useId();

  // Lazy init — reducer initializer is a function per rerender-lazy-state-init.
  const [state, dispatch] = useReducer(
    reducer,
    { items, dedupMatch, source, pendingMealCategory },
    (seed): State => ({
      lifecycle: { status: 'editing' },
      rows: seed.items.map((item) => ({ id: mintRowId(), item })),
      meal: seed.pendingMealCategory ?? defaultMealForNow(),
      saveToLibrary: seed.source === 'text' || seed.source === 'photo',
      reuseExisting: false,
      dedupMatch: seed.dedupMatch,
    }),
  );

  const [isPending, startTransition] = useTransition();

  // Dedup preflight (perf I6 + synthesis §2.11). Debounced 200ms on the
  // primary item name when source is text/photo. AbortController on unmount
  // or input change.
  const abortRef = useRef<AbortController | null>(null);
  const primaryName = state.rows[0]?.item.name ?? '';
  useEffect(() => {
    if (editEntryId) return;
    if (source === 'library' || source === 'manual') return;
    if (!primaryName || primaryName.trim().length < 2) return;
    if (state.dedupMatch?.normalized_name === normalizeName(primaryName)) return;
    const handle = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      authFetch('/api/library/dedup-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalized_name: normalizeName(primaryName) }),
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { match: DedupMatch | null } | null) => {
          if (controller.signal.aborted) return;
          dispatch({ type: 'SET_DEDUP_MATCH', match: json?.match ?? null });
        })
        .catch(() => {
          // Swallow — preflight is best-effort; save still enforces at commit.
        });
    }, 200);
    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEntryId, primaryName, source]);

  const editName = useCallback((id: RowId, name: string) => {
    dispatch({ type: 'EDIT_ITEM_NAME', id, name });
  }, []);
  const editKcal = useCallback((id: RowId, kcal: number) => {
    dispatch({ type: 'EDIT_ITEM_KCAL', id, kcal });
  }, []);
  const editPortion = useCallback((id: RowId, portion: number) => {
    dispatch({ type: 'EDIT_ITEM_PORTION', id, portion });
  }, []);
  const removeItem = useCallback((id: RowId) => {
    dispatch({ type: 'REMOVE_ITEM', id });
  }, []);
  const setMeal = useCallback((meal: MealCategory) => {
    dispatch({ type: 'SET_MEAL', meal });
  }, []);
  const setSaveToLibrary = useCallback((on: boolean) => {
    dispatch({ type: 'SET_SAVE_TO_LIBRARY', on });
  }, []);
  const setReuseExisting = useCallback((on: boolean) => {
    dispatch({ type: 'SET_REUSE_EXISTING', on });
  }, []);

  const save = useCallback((): void => {
    // I2 — zero-item save guard. Without this the route returns 400 from the
    // `z.array(...).min(1)` refinement and the user sees an opaque "500"
    // banner. Short-circuit before any round-trip.
    if (state.rows.length === 0) return;
    const clientId = ensureClientId(tab);
    const currentItems = state.rows.map((r) => r.item);
    const logTimezone = getDeviceTimeZone(pendingLogTimezone ?? undefined);
    const todayForLogTimezone = userTzToday(logTimezone);
    const loggedAt =
      editEntryId && originalLoggedAt
        ? originalLoggedAt
        : pendingLogDate && pendingLogDate < todayForLogTimezone
          ? userTzDayMidpointIso(pendingLogDate, logTimezone)
          : new Date().toISOString();
    const body: Record<string, unknown> = editEntryId
      ? {
          meal_category: state.meal,
          items: currentItems,
        }
      : {
          client_id: clientId,
          logged_at: loggedAt,
          meal_category: state.meal,
          source,
          items: currentItems,
        };
    if (reasoning && reasoning.length > 0) body.ai_reasoning = reasoning;
    if (!editEntryId && state.saveToLibrary && source !== 'library') {
      body.save_to_library = true;
    }
    if (state.dedupMatch && state.reuseExisting) {
      body.library_item_id = state.dedupMatch.id;
    }
    // Codex Round 1 CRITICAL — library re-log path. When LibraryTab
    // Continue CTA or LogPageClient deep-link forwarded a library row id
    // for the first item, surface it on the save body so the server links
    // the food_entries row to the source library row (I12 contract).
    // Skipped when the dedupMatch + reuseExisting branch already wrote
    // `library_item_id` to avoid clobbering an explicit user choice.
    if (!body.library_item_id && libraryItemIds && libraryItemIds[0]) {
      body.library_item_id = libraryItemIds[0];
    }

    startTransition(() => {
      dispatch({ type: 'START_SAVE' });
      (async () => {
        try {
          const endpoint = editEntryId ? `/api/entries/${editEntryId}` : '/api/entries/save';
          const method = editEntryId ? 'PATCH' : 'POST';
          const res = await authFetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const msg = `${res.status}: ${res.statusText}`;
            dispatch({ type: 'SAVE_ERROR', message: msg });
            return;
          }
          const json = (await res.json()) as { entry: { id: string } };
          const pushToast = useUndoQueueStore.getState().pushToast;
          const firstName = currentItems[0]?.name ?? '';
          pushToast({
            clientId,
            kind: editEntryId ? 'delete-failed' : 'saved',
            description: editEntryId
              ? t.log.entryUpdatedToast.replace('{label}', firstName)
              : t.log.undoToastSaved.replace('{label}', firstName),
            serverRowId: json.entry.id,
            commit: async () => {},
            revert: async () => {
              if (editEntryId) return;
              // AC7 / F3 — when the server rejects the DELETE, the row is
              // still persisted. Push a follow-up `delete-failed` toast so
              // the user is told the un-save didn't take. revert + commit
              // are no-ops; the save-toast was already popped by `undoTop()`.
              const surfaceRestored = (): void => {
                useUndoQueueStore.getState().pushToast({
                  clientId,
                  kind: 'delete-failed',
                  description: t.log.undoToastDeleteRestored,
                  serverRowId: json.entry.id,
                  commit: async () => {},
                  revert: async () => {},
                });
                // I7 — resilient a11y announcement: falls back to a transient
                // aria-live region if the chrome-level one was unmounted.
                announcePolite(t.log.undoToastDeleteRestored);
              };
              try {
                const delRes = await authFetch(`/api/entries/${json.entry.id}`, {
                  method: 'DELETE',
                });
                if (!delRes.ok) surfaceRestored();
                else {
                  // Un-save succeeded — re-run the dashboard RSC so the
                  // row disappears immediately (no manual reload).
                  router.refresh();
                }
              } catch {
                surfaceRestored();
              }
            },
          });
          // Announce in the shared chrome-level polite region per
          // synthesis §2.12. I7 — falls back to a transient live region if
          // the chrome region was unmounted between save and this callback.
          announcePolite(
            editEntryId
              ? t.log.entryUpdatedToast.replace('{label}', firstName)
              : t.log.undoToastSaved.replace('{label}', firstName),
          );
          commitSaveSuccess(tab);
          dispatch({ type: 'SAVE_OK' });
          // Dashboard readers use React `cache()` only — writers' server
          // `revalidateTag(...)` doesn't cross-request invalidate (deferred
          // to F-UI-3.5-10). `router.refresh()` is the minimal client-side
          // fix so the dashboard RSC re-runs and shows the new entry.
          router.refresh();
          onClose();
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          dispatch({ type: 'SAVE_ERROR', message });
        }
      })();
    });
  }, [
    commitSaveSuccess,
    editEntryId,
    ensureClientId,
    libraryItemIds,
    onClose,
    originalLoggedAt,
    pendingLogDate,
    pendingLogTimezone,
    reasoning,
    router,
    source,
    state.dedupMatch,
    state.meal,
    state.reuseExisting,
    state.rows,
    state.saveToLibrary,
    tab,
  ]);

  const value: ConfirmationContextValue = {
    state,
    actions: {
      editName,
      editKcal,
      editPortion,
      removeItem,
      setMeal,
      setSaveToLibrary,
      setReuseExisting,
      save,
    },
    meta: {
      source,
      tab,
      reasoning,
      isSaving: state.lifecycle.status === 'saving' || isPending,
      isEditing: !!editEntryId,
      isEmpty: state.rows.length === 0,
      titleId,
      liveRegionId,
    },
  };

  return (
    <ConfirmationContext value={value}>
      <section
        data-testid="confirmation-screen"
        aria-labelledby={value.meta.titleId}
        className="kalori-confirmation-screen"
      >
        {children}
      </section>
    </ConfirmationContext>
  );
}

// --------------------------------------------------------------------------
// Confirmation.Masthead — kicker + double-hairline (skill G5 + ui-design §7.2.6)
// --------------------------------------------------------------------------

function Masthead() {
  const { meta } = useConfirmation();
  return (
    <header className="kalori-confirmation-masthead">
      <h2 id={meta.titleId} className="kalori-confirmation-kicker">
        {t.log.confirmationKicker}
      </h2>
      <span aria-hidden="true" className="kalori-confirmation-masthead-rule" />
    </header>
  );
}

// --------------------------------------------------------------------------
// Confirmation.ItemList + ConfirmationItemRow — extracted per skill G2.
// --------------------------------------------------------------------------

function ItemList() {
  const { state } = useConfirmation();
  const politeRef = useRef<HTMLSpanElement | null>(null);
  const rowCount = state.rows.length;

  // Announce row count on mount (a11y C3 + ux-auditor §3.1).
  useEffect(() => {
    if (!politeRef.current) return;
    politeRef.current.textContent = t.log.confirmationItemsCount.replace(
      '{count}',
      String(rowCount),
    );
  }, [rowCount]);

  return (
    <>
      <span
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <ul role="list" className="kalori-confirmation-items">
        {state.rows.map((row, index) => (
          <ConfirmationItemRow key={row.id} rowId={row.id} index={index} />
        ))}
      </ul>
    </>
  );
}

interface ConfirmationItemRowProps {
  rowId: RowId;
  index: number;
}

function ConfirmationItemRow({ rowId, index }: ConfirmationItemRowProps) {
  const { state, actions } = useConfirmation();
  const row = state.rows.find((r) => r.id === rowId);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameErrorId = useId();
  const portionErrorId = useId();
  const kcalErrorId = useId();
  const groupLabelId = useId();

  // Bug 4 — mobile wheel-picker bottom-sheet for portion editing
  // (`Planning/ui-design.md` §7.2.6 + tiebreaker #23). Desktop keeps the
  // inline ± stepper. Mobile shows a tap-to-open trigger backed by the
  // sheet; the sheet holds an in-progress draft so the consumer's
  // `editPortion` only fires on DONE (matches §10.6.1 commit grammar).
  const isMobile = useIsMobile();
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelDraft, setWheelDraft] = useState<number>(() =>
    row ? snapPortionToWheel(row.item.portion) : 1,
  );

  if (!row) return null;
  const { item } = row;

  // Field-level error suggestions (a11y C2 + SC 3.3.1/3.3.3).
  const portionInvalid = !Number.isFinite(item.portion) || item.portion <= 0;
  const kcalInvalid = !Number.isFinite(item.kcal) || item.kcal < 0;
  const nameInvalid = !item.name.trim();

  return (
    <li
      role="listitem"
      data-testid={`confirmation-item-${index}`}
      className="kalori-confirmation-item"
    >
      <div role="group" aria-labelledby={groupLabelId} className="kalori-confirmation-item-inner">
        <span
          id={groupLabelId}
          className="kalori-confirmation-item-section-number"
          aria-hidden="true"
        >{`§ ${String(index + 1).padStart(2, '0')}`}</span>

        <div className="kalori-confirmation-item-name-slot">
          <label className="sr-only" htmlFor={`item-${rowId}-name`}>
            {t.log.confirmationItemNameLabel}
          </label>
          <input
            id={`item-${rowId}-name`}
            ref={nameInputRef}
            data-testid={`confirmation-item-${index}-name`}
            value={item.name}
            onChange={(e) => actions.editName(rowId, e.target.value)}
            aria-required="true"
            aria-invalid={nameInvalid ? 'true' : 'false'}
            aria-describedby={nameInvalid ? nameErrorId : undefined}
            className="kalori-confirmation-name"
          />
          {nameInvalid ? (
            <span id={nameErrorId} role="alert" className="kalori-confirmation-field-error">
              {t.log.confirmationItemNameError}
            </span>
          ) : null}
        </div>

        {isMobile ? (
          <div
            className="kalori-confirmation-stepper"
            role="group"
            aria-label={t.log.confirmationPortionStepperLabel}
          >
            <button
              type="button"
              data-testid={`confirmation-item-${index}-portion-wheel-trigger`}
              onClick={() => {
                setWheelDraft(snapPortionToWheel(item.portion));
                setWheelOpen(true);
              }}
              aria-haspopup="listbox"
              aria-label={t.log.confirmationPortionStepperLabel}
              aria-describedby={portionInvalid ? portionErrorId : undefined}
              className="kalori-confirmation-portion-trigger num"
              style={{
                minHeight: 44,
                minWidth: 88,
                background: 'var(--color-bg-1)',
                border: '1px solid var(--color-rule-strong)',
                color: 'var(--color-ivory)',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              {item.portion} {item.unit} <span aria-hidden="true">▾</span>
            </button>
            {portionInvalid ? (
              <span id={portionErrorId} role="alert" className="kalori-confirmation-field-error">
                {t.log.confirmationItemPortionError}
              </span>
            ) : null}
            <MobileWheelSheet
              open={wheelOpen}
              onCancel={() => setWheelOpen(false)}
              onDone={() => {
                actions.editPortion(rowId, wheelDraft);
                setWheelOpen(false);
              }}
              title={t.log.confirmationPortionStepperLabel}
              description={`${item.name} · ${item.unit}`}
              data-testid={`confirmation-item-${index}-portion-wheel-sheet`}
            >
              <MobileWheelPicker
                value={wheelDraft}
                onChange={setWheelDraft}
                onCommit={(v) => {
                  actions.editPortion(rowId, v);
                  setWheelOpen(false);
                }}
                onCancel={() => setWheelOpen(false)}
                options={PORTION_WHEEL_OPTIONS}
                ariaLabel={t.log.confirmationPortionStepperLabel}
                data-testid={`confirmation-item-${index}-portion-wheel`}
              />
            </MobileWheelSheet>
          </div>
        ) : (
          <div
            className="kalori-confirmation-stepper"
            role="group"
            aria-label={t.log.confirmationPortionStepperLabel}
          >
            <button
              type="button"
              aria-label={t.log.confirmationPortionDecrease}
              data-testid={`confirmation-item-${index}-portion-decrease`}
              className="kalori-confirmation-stepper-btn"
              onClick={() => actions.editPortion(rowId, Math.max(0, item.portion - 0.5))}
            >
              −
            </button>
            <label className="sr-only" htmlFor={`item-${rowId}-portion`}>
              {t.log.confirmationItemPortionLabel}
            </label>
            <input
              id={`item-${rowId}-portion`}
              data-testid={`confirmation-item-${index}-portion`}
              type="number"
              min="0"
              step="0.5"
              value={item.portion}
              onChange={(e) => actions.editPortion(rowId, Number(e.target.value))}
              role="spinbutton"
              aria-valuenow={item.portion}
              aria-valuemin={0}
              aria-invalid={portionInvalid ? 'true' : 'false'}
              aria-describedby={portionInvalid ? portionErrorId : undefined}
              className="kalori-confirmation-portion num"
            />
            <button
              type="button"
              aria-label={t.log.confirmationPortionIncrease}
              data-testid={`confirmation-item-${index}-portion-increase`}
              className="kalori-confirmation-stepper-btn"
              onClick={() => actions.editPortion(rowId, item.portion + 0.5)}
            >
              +
            </button>
            <span aria-hidden="true" className="kalori-confirmation-unit">
              {item.unit}
            </span>
            {portionInvalid ? (
              <span id={portionErrorId} role="alert" className="kalori-confirmation-field-error">
                {t.log.confirmationItemPortionError}
              </span>
            ) : null}
          </div>
        )}

        <div className="kalori-confirmation-kcal-slot">
          <label className="sr-only" htmlFor={`item-${rowId}-kcal`}>
            {t.log.confirmationItemKcalLabel}
          </label>
          <div className="kalori-confirmation-kcal-field">
            <input
              id={`item-${rowId}-kcal`}
              data-testid={`confirmation-item-${index}-kcal`}
              type="number"
              min="0"
              inputMode="numeric"
              value={item.kcal}
              onChange={(e) => actions.editKcal(rowId, Number(e.target.value))}
              aria-required="true"
              aria-invalid={kcalInvalid ? 'true' : 'false'}
              aria-describedby={kcalInvalid ? kcalErrorId : undefined}
              className="kalori-confirmation-kcal num"
            />
            <span className="kalori-confirmation-kcal-unit">{t.log.confirmationItemKcalUnit}</span>
          </div>
          {kcalInvalid ? (
            <span id={kcalErrorId} role="alert" className="kalori-confirmation-field-error">
              {t.log.confirmationItemKcalError}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          aria-label={t.log.confirmationItemRemove.replace(
            '{name}',
            item.name || t.log.confirmationItemNameLabel,
          )}
          data-testid={`confirmation-item-${index}-remove`}
          className="kalori-confirmation-remove"
          onClick={() => actions.removeItem(rowId)}
        >
          ×
        </button>
      </div>
    </li>
  );
}

// --------------------------------------------------------------------------
// Confirmation.Reasoning — self-gates via context.source (skill G9).
// --------------------------------------------------------------------------

function Reasoning() {
  const { meta } = useConfirmation();
  return <WhyTheseNumbers source={meta.source} reasoning={meta.reasoning} />;
}

// --------------------------------------------------------------------------
// Confirmation.MealSlot — kicker-row radio (§ 01..04) with 1/2/3/4 shortcut.
// --------------------------------------------------------------------------

const MEAL_OPTIONS: ReadonlyArray<{ value: MealCategory; label: string; digit: string }> = [
  { value: 'breakfast', label: t.log.confirmationMealBreakfast, digit: '1' },
  { value: 'lunch', label: t.log.confirmationMealLunch, digit: '2' },
  { value: 'dinner', label: t.log.confirmationMealDinner, digit: '3' },
  { value: 'snack', label: t.log.confirmationMealSnack, digit: '4' },
  // I1 — 5th option mirrors the server Zod + DB check-constraint (which accept
  // 'drink'). Shortcut `5` matches the meal-slot pattern.
  { value: 'drink', label: t.log.confirmationMealDrink, digit: '5' },
];

function MealSlot() {
  const { state, actions } = useConfirmation();
  const legendId = useId();

  const onKeyDown = (ev: React.KeyboardEvent<HTMLFieldSetElement>): void => {
    const target = ev.target as HTMLElement;
    if (target.tagName.toLowerCase() === 'input') {
      // Let native radio handle space/enter; also accept 1/2/3/4 shortcut.
      const match = MEAL_OPTIONS.find((o) => o.digit === ev.key);
      if (match) {
        ev.preventDefault();
        actions.setMeal(match.value);
      }
    }
  };

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      className="kalori-confirmation-meal"
      onKeyDown={onKeyDown}
    >
      <legend id={legendId} className="sr-only">
        {t.log.confirmationMealLabel}
      </legend>
      {MEAL_OPTIONS.map((m, i) => {
        const active = state.meal === m.value;
        return (
          <label
            key={m.value}
            className={`kalori-confirmation-meal-row${active ? 'is-active' : ''}`}
          >
            <input
              type="radio"
              name="meal-category"
              value={m.value}
              checked={active}
              onChange={() => actions.setMeal(m.value)}
              data-testid={`confirmation-meal-${m.value}`}
              className="kalori-confirmation-meal-radio"
            />
            <span className="kalori-confirmation-meal-number" aria-hidden="true">
              {`§ ${String(i + 1).padStart(2, '0')}`}
            </span>
            <span className="kalori-confirmation-meal-label">{m.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

// --------------------------------------------------------------------------
// Confirmation.SaveToLibraryToggle — self-gates via context.source.
// --------------------------------------------------------------------------

function SaveToLibraryToggle() {
  const { state, actions, meta } = useConfirmation();
  const labelId = useId();
  if (meta.isEditing || meta.source === 'library' || meta.source === 'manual') return null;
  const firstName = state.rows[0]?.item.name ?? '';
  return (
    <div className="kalori-confirmation-save-to-library">
      <span id={labelId} className="kalori-confirmation-save-to-library-kicker">
        {t.log.confirmationSaveToLibraryLabel}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={state.saveToLibrary}
        aria-labelledby={labelId}
        data-testid="confirmation-save-to-library"
        onClick={() => actions.setSaveToLibrary(!state.saveToLibrary)}
        className={`kalori-confirmation-switch${state.saveToLibrary ? 'is-on' : ''}`}
      >
        <span className="kalori-confirmation-switch-knob" aria-hidden="true" />
      </button>
      {firstName ? (
        <span className="kalori-confirmation-save-to-library-name" aria-hidden="true">
          {firstName}
        </span>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------------------
// Confirmation.DedupBanner — inline banner, self-gates on state.dedupMatch.
// --------------------------------------------------------------------------

function DedupBanner() {
  const { state, actions } = useConfirmation();
  const headingId = useId();
  if (!state.dedupMatch) return null;
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-testid="dedup-prompt"
      className="kalori-confirmation-dedup"
    >
      <p id={headingId} aria-live="polite" className="kalori-confirmation-dedup-header">
        {t.log.confirmationDedupHeader}
      </p>
      <div className="kalori-confirmation-dedup-actions">
        <button
          type="button"
          data-testid="dedup-reuse"
          onClick={() => actions.setReuseExisting(true)}
          className={`kalori-confirmation-dedup-reuse${state.reuseExisting ? 'is-selected' : ''}`}
          aria-pressed={state.reuseExisting}
        >
          {t.log.confirmationDedupReuse}
        </button>
        <button
          type="button"
          data-testid="dedup-create"
          onClick={() => actions.setReuseExisting(false)}
          className={`kalori-confirmation-dedup-create${!state.reuseExisting ? 'is-selected' : ''}`}
          aria-pressed={!state.reuseExisting}
        >
          {t.log.confirmationDedupCreate}
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Confirmation.ErrorBanner — lifecycle=error; focuses Retry.
// --------------------------------------------------------------------------

function ErrorBanner() {
  const { state, actions } = useConfirmation();
  const retryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (state.lifecycle.status === 'error') {
      retryRef.current?.focus();
    }
  }, [state.lifecycle.status]);

  if (state.lifecycle.status !== 'error') return null;
  return (
    <div data-testid="confirmation-error-banner" role="alert" className="kalori-confirmation-error">
      <span className="kalori-confirmation-error-text">{t.log.confirmationErrorBanner}</span>
      <button
        type="button"
        ref={retryRef}
        data-testid="confirmation-retry"
        onClick={actions.save}
        className="kalori-confirmation-retry"
      >
        {t.log.confirmationRetryCTA}
      </button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Confirmation.SaveAction — the Save CTA; useTransition wired inside Root.
// --------------------------------------------------------------------------

function SaveAction() {
  const { actions, meta } = useConfirmation();
  // I2 — disable Save when the user has removed every row. aria-disabled is
  // the authoritative a11y signal; the onClick/onMouseDown no-op prevents a
  // stray pointer event from issuing the 400-guaranteed request. The
  // accompanying caption tells the user what to do next.
  const disabled = meta.isSaving || meta.isEmpty;
  return (
    <>
      {meta.isEmpty ? (
        <p
          data-testid="confirmation-empty-caption"
          className="kalori-confirmation-empty-caption"
          role="status"
          aria-live="polite"
        >
          {t.log.confirmationEmptyCaption}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="confirmation-save"
        onClick={(e) => {
          if (disabled) {
            e.preventDefault();
            return;
          }
          actions.save();
        }}
        aria-disabled={disabled}
        aria-busy={meta.isSaving ? 'true' : undefined}
        className="kalori-log-cta kalori-confirmation-save-cta"
        onMouseDown={(e) => {
          if (disabled) e.preventDefault();
        }}
      >
        {meta.isSaving ? (
          <span className="kalori-log-cta-content">
            <span
              aria-hidden="true"
              data-testid="confirmation-save-spinner"
              className="kalori-log-cta-spinner"
            />
            <span>{t.onboarding.buttonNextLoading}</span>
          </span>
        ) : (
          t.log.confirmationSaveCTA
        )}
      </button>
    </>
  );
}

// --------------------------------------------------------------------------
// Public compound API.
// --------------------------------------------------------------------------

export const Confirmation = {
  Root,
  Masthead,
  ItemList,
  Reasoning,
  MealSlot,
  SaveToLibraryToggle,
  DedupBanner,
  ErrorBanner,
  SaveAction,
};

/**
 * Default explicit variant that composes the full ledger-editorial
 * Confirmation surface. Consumers (LogFlowTabs) use this; tests can
 * compose a leaner subset via the named compound children.
 */
export function ConfirmationScreen(props: ConfirmationScreenProps) {
  // Initial-focus latch + Esc route-through + header kicker — handled by
  // LogFlowModal's parent Radix Dialog. ConfirmationScreen is a plain
  // section inside that Dialog (no nested role="dialog"). Escape lands on
  // the Dialog's onEscapeKeyDown; Tab-trap lives in Radix FocusScope.
  const firstNameRef = useRef<HTMLInputElement | null>(null);
  const {
    source,
    tab,
    items,
    reasoning,
    dedupMatch,
    libraryItemIds,
    editEntryId,
    originalLoggedAt,
    onClose,
  } = props;
  return (
    <Confirmation.Root
      source={source}
      tab={tab}
      items={items}
      reasoning={reasoning}
      dedupMatch={dedupMatch}
      libraryItemIds={libraryItemIds}
      editEntryId={editEntryId}
      originalLoggedAt={originalLoggedAt}
      onClose={onClose}
    >
      <Confirmation.Masthead />
      <Confirmation.ItemList />
      <Confirmation.Reasoning />
      <Confirmation.MealSlot />
      <Confirmation.SaveToLibraryToggle />
      <Confirmation.DedupBanner />
      <Confirmation.ErrorBanner />
      <Confirmation.SaveAction />
      {/* Ref holder so the variant can land initial focus if needed;
          the ItemList's first input naturally picks up focus via Radix
          Dialog's auto-focus when it's the first focusable element. */}
      <input type="hidden" ref={firstNameRef} />
    </Confirmation.Root>
  );
}

export default ConfirmationScreen;

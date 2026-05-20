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
import * as Collapsible from '@radix-ui/react-collapsible';
import { useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react';

import { authFetch } from '@/lib/auth/refresh-interceptor';
import { useDuplicateLogConfirm } from '@/components/primitives/DuplicateLogConfirmDialog';
import { MobileWheelPicker } from '@/components/primitives/MobileWheelPicker';
import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';
import { useIsMobile } from '@/lib/hooks/use-is-mobile';
import { t } from '@/lib/i18n/en';
import type { ParsedItemT } from '@/lib/ai/schemas';
import { isDiscreteUnit, isWholeStyleUnit, normalizePortionUnit } from '@/lib/log/portion-unit';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';
import { formatMicroPercent, sortAndFilterMicrosByRdaPct } from '@/lib/nutrition/display-micros';
import { normalizeName } from '@/lib/text/normalize';
import { useLogFlowStore, type LogFlowMode, type LogTab } from '@/lib/stores/useLogFlowStore';
import { useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';
import { getDeviceTimeZone } from '@/lib/time/device-timezone';
import { userTzDayMidpointIso, userTzToday } from '@/lib/time/day';

import { TimeEditor } from './Confirmation/TimeEditor';
import { WhyTheseNumbers } from './WhyTheseNumbers';

function isDuplicateFoodEntryPayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { error?: unknown }).error === 'duplicate_food_entry'
  );
}

function isLibraryQuotaExceededPayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { error?: unknown }).error === 'library_create_quota_exceeded'
  );
}

function isLoggedAtFuturePayload(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { error?: unknown }).error === 'logged_at_future'
  );
}

/**
 * Derive a stepper/wheel increment proportional to the BASELINE parsed
 * portion. Replaces the previous fixed 0.5 step (which produced silly UX
 * like ±0.5 g on a 100 g default). Rough tiers — 10 % of baseline, then
 * rounded to a "nice" unit:
 *   baseline ≥ 50 → round to nearest 5 (50→5, 100→10, 250→25, 1000→100)
 *   baseline ≥ 10 → round to nearest 1 (10→1, 30→3, 49→5-ish)
 *   baseline ≥ 1  → round to nearest 0.1 (1→0.1, 5→0.5)
 *   else           → 0.1 floor (covers small or unset baselines)
 */
function deriveStep(baseline: number): number {
  if (!Number.isFinite(baseline) || baseline <= 0) return 0.5;
  const raw = baseline / 10;
  if (raw >= 5) return Math.max(5, Math.round(raw / 5) * 5);
  if (raw >= 1) return Math.max(1, Math.round(raw));
  if (raw >= 0.1) return Math.max(0.1, Math.round(raw * 10) / 10);
  return 0.1;
}

/**
 * Bug 4 — per-row mobile wheel options. Range scales with the baseline
 * portion (0.1× → 3× baseline) and step matches `deriveStep`, so the
 * wheel always opens with values that are meaningful for the unit.
 * Capped near 30 rows to stay inside the §10.6.1 cardinality budget.
 */
function buildWheelOptions(baseline: number): { value: number; label: string }[] {
  const step = deriveStep(baseline);
  const safeBaseline = Number.isFinite(baseline) && baseline > 0 ? baseline : 1;
  const min = Math.max(step, Math.round((safeBaseline * 0.1) / step) * step);
  const max = Math.max(step * 5, Math.round((safeBaseline * 3) / step) * step);
  const opts: { value: number; label: string }[] = [];
  for (let v = min; v <= max + step * 0.001; v += step) {
    const rounded = Math.round(v * 1000) / 1000;
    opts.push({ value: rounded, label: rounded.toString() });
  }
  return opts;
}

/**
 * Discrete-unit (piece / slice / egg / serving / …) wheel options.
 * Range is a 20-row window centered on the parsed baseline so the
 * wheel opens with a sensible neighborhood — e.g. baseline 1 →
 * [1..20], baseline 10 → [5..24], baseline 50 → [45..64]. Pure integer
 * values so users never see "1.25 pieces" on the wheel.
 */
function buildIntegerWheelOptions(baseline: number): { value: number; label: string }[] {
  const center = Math.max(1, Math.round(Number.isFinite(baseline) ? baseline : 1));
  const min = Math.max(1, center - 5);
  const max = min + 19;
  const opts: { value: number; label: string }[] = [];
  for (let v = min; v <= max; v += 1) {
    opts.push({ value: v, label: String(v) });
  }
  return opts;
}

/**
 * Snap an arbitrary numeric portion to the nearest option in the supplied
 * wheel-options list so the sheet always opens with an option matching
 * `value`. Falls back to the closest neighbor if `portion` doesn't land
 * on a row exactly.
 */
function snapPortionToWheel(portion: number, options: { value: number }[]): number {
  if (!options.length) return Number.isFinite(portion) && portion > 0 ? portion : 1;
  if (!Number.isFinite(portion) || portion <= 0) return options[0]!.value;
  let best = options[0]!.value;
  let bestDiff = Math.abs(portion - best);
  for (const opt of options) {
    const d = Math.abs(portion - opt.value);
    if (d < bestDiff) {
      best = opt.value;
      bestDiff = d;
    }
  }
  return best;
}

export type ConfirmationSource = 'text' | 'photo' | 'library' | 'manual';
export type MealCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';

export interface DedupMatch {
  id: string;
  normalized_name: string;
  display_name: string;
}

/**
 * Bug A (bugfix-tomi 2026-05-19-bac-improvements) — the manual
 * AlcoholControls toggle (and AlcoholState reducer slot + ALCOHOL_PRESETS
 * constant + isValidAlcoholState helper) were removed. Gemini's parse
 * output now carries `is_alcoholic` + `volume_ml` + `abv_percent` per
 * item; the read-only `Confirmation.AlcoholLabel` reflects those fields
 * when meal=drink. The save route reads alcohol directly off `items[]`
 * — no client-side lift needed. See `lib/ai/prompts.ts`
 * (ALCOHOL_DETECTION_DIRECTIVE) and `app/api/entries/save/route.ts`
 * (collectAlcoholPayloads) for the rest of the contract.
 */

/** Stable row id — minted in reducer init; shared with DOM keys. */
type RowId = string;

export interface ConfirmationRow {
  id: RowId;
  item: ParsedItemT;
  /**
   * Snapshot of the row's portion at reducer-init time. Used as the
   * baseline for `deriveStep` so the +/- stepper and mobile wheel scale
   * proportionally to the original parsed amount (e.g., 100 g → ±10 g
   * steps, 1 serving → ±0.1 steps). Never mutated by EDIT_ITEM_PORTION
   * so stepping stays linear instead of compounding.
   */
  baselinePortion: number;
  /**
   * POST-MVP-CODEX-R3-C1 — per-row idempotency token. Minted once at
   * row-creation time (reducer init) and reused across every save()
   * invocation for this row. The library-only save loop reads
   * `row.clientId` instead of minting a fresh UUID per-attempt, so a
   * retry of a row replays the server's I11 dedup-by-client_id contract
   * (200 + replayed:true) instead of being treated as a new request
   * (which would 409 on normalized-name dedup → user dead-ended).
   */
  clientId: string;
  /**
   * POST-MVP-CODEX-R3-C2 — per-row dedup conflict state. Set when:
   *   - the row-0 debounce preflight detects a normalized-name collision
   *     against the user's library (row-0 only; row 1+ have no preflight)
   *   - the library-only save loop receives a 409 from /api/library/create
   *     for THIS row's POST body
   * Cleared when:
   *   - the row's name changes via EDIT_ITEM_NAME (previous verdict is stale)
   *   - the row-0 preflight resolves with null match
   *   - SET_ROW_DEDUP_MATCH explicitly dispatches null for this rowId
   * In `mode === 'library-only'`, the inline `LibraryOnlyDedupBanner`
   * renders next to the row whenever this slot is non-null, and
   * `saveBlockedByDuplicate` returns true if ANY row has a conflict.
   */
  dedupMatch: DedupMatch | null;
}

export interface ConfirmationScreenProps {
  source: ConfirmationSource;
  tab: LogTab;
  items: ParsedItemT[];
  reasoning: string | null;
  dedupMatch: DedupMatch | null;
  /**
   * POST-MVP-CODEX-R3-C2 — optional per-row dedup match seed, positionally
   * aligned with `items[]`. Mostly exposed so test consumers can drive the
   * Confirmation surface deterministically (avoiding the async race with
   * the row-0 preflight setTimeout). Production callers omit it; the
   * reducer initializer falls back to `null` for each row.
   */
  dedupMatchByRow?: ReadonlyArray<DedupMatch | null> | undefined;
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
  /**
   * Modal mode threaded down from the store. Defaults to `'standard'` when
   * omitted (mostly for tests that mount ConfirmationScreen in isolation).
   * In `'library-only'` mode the meal slot / time editor / save-to-library
   * toggle / dedup banner are hidden and the save handler POSTs to
   * `/api/library/create` instead of `/api/entries/save`.
   */
  mode?: LogFlowMode;
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
  // Bug 1 (bugfix-tomi 2026-05-17-library-micros) — library-only mode lets
  // the user adjust individual micronutrient values before the row is
  // POSTed to /api/library/create. Code is one of the canonical
  // DEFAULT_MICROS_LIST codes; `value` is the rounded amount in the
  // canonical unit declared by the corresponding MicroRdaEntry.
  | { type: 'EDIT_ITEM_MICRO'; id: RowId; code: string; value: number }
  | { type: 'REMOVE_ITEM'; id: RowId }
  | { type: 'SET_MEAL'; meal: MealCategory }
  | { type: 'SET_SAVE_TO_LIBRARY'; on: boolean }
  | { type: 'SET_REUSE_EXISTING'; on: boolean }
  | { type: 'SET_DEDUP_MATCH'; match: DedupMatch | null }
  /**
   * POST-MVP-CODEX-R3-C2 — per-row dedup conflict. Replaces (and
   * complements) `SET_DEDUP_MATCH` for library-only mode. Standard mode
   * still uses `SET_DEDUP_MATCH` for the global row-0 reuse-existing
   * path. Library-only mode dispatches `SET_ROW_DEDUP_MATCH` for the
   * specific row that 409'd or that the preflight matched.
   */
  | { type: 'SET_ROW_DEDUP_MATCH'; id: RowId; match: DedupMatch | null }
  // Task C.5 (F-VERIFY-203) — backfill horizon. Reducer field drives the
  // `Confirmation.TimeEditor` native datetime-local input. Stored as UTC ISO
  // ('YYYY-MM-DDTHH:mm:ss.sssZ'); the TimeEditor converts to/from local-time
  // strings at the input boundary.
  | { type: 'SET_LOGGED_AT'; loggedAt: string }
  | { type: 'SET_LOGGED_AT_FUTURE_REJECTED'; rejected: boolean };

interface State {
  lifecycle: Lifecycle;
  rows: ConfirmationRow[];
  meal: MealCategory;
  saveToLibrary: boolean;
  reuseExisting: boolean;
  dedupMatch: DedupMatch | null;
  // Bug A — alcohol state removed; the AI's per-item is_alcoholic +
  // volume_ml + abv_percent fields ride on `rows[].item` and are read
  // straight from there by `Confirmation.AlcoholLabel` + the save body.
  /** Task C.5 — backfill horizon. UTC ISO. Default `new Date().toISOString()`
   *  unless the copy-yesterday route primed `pendingLogDate`. */
  loggedAt: string;
  /** True after a future datetime-local edit was rejected by TimeEditor. */
  loggedAtFutureRejected: boolean;
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
 * E.CODEX Round-2 R2 / POST-MVP-CODEX-R2-C1 — per-row `client_id` token for
 * `POST /api/library/create`. The shared `CreateLibraryBodySchema` validates
 * `client_id` with `z.string().uuid()`, so suffixed forms (`${baseId}:${idx}`)
 * are rejected with 400 on row 1+. Each emitted body MUST carry a fresh UUIDv4
 * to satisfy the schema AND to keep the server's I11 dedup-by-client_id from
 * collapsing the multi-row batch onto row-0's clientId.
 *
 * Mirrors `generateClientId` in `lib/stores/useLogFlowStore.ts` — keeping the
 * v4 fallback inline rather than exporting the store helper because the store
 * file is otherwise unrelated to this surface (surgical-change discipline).
 */
export function mintLibraryClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // POST-MVP-BUGFIX-2026-05-17-LM-SEC-2 — Cryptographically secure v4
  // fallback per RFC 4122 §4.4. `crypto.getRandomValues` is present in
  // every runtime that lacks `crypto.randomUUID` (old Safari, old Node,
  // jsdom), so this branch fires in the rare environments that miss the
  // fast path. The bit-twiddle on bytes[6] / bytes[8] preserves the v4
  // version + variant nibbles that `z.string().uuid()` validates on the
  // server.
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

const FUTURE_LOG_CLIENT_SKEW_MS = 30_000;
const MIN_DISPLAY_APPROX_GRAMS = 5;
const MAX_DISPLAY_APPROX_GRAMS = 2000;

function shouldDisplayApproxGrams(unit: string | undefined | null, approxGrams: unknown): boolean {
  const normalized = normalizePortionUnit(unit);
  return (
    typeof approxGrams === 'number' &&
    Number.isFinite(approxGrams) &&
    approxGrams >= MIN_DISPLAY_APPROX_GRAMS &&
    approxGrams <= MAX_DISPLAY_APPROX_GRAMS &&
    normalized !== 'g' &&
    normalized !== 'gram' &&
    normalized !== 'grams'
  );
}

function formatApproxGrams(grams: number): string {
  return t.log.confirmationApproxGrams.replace('{grams}', String(Math.round(grams)));
}

function parsedMicroRows(micros: ParsedItemT['micros']) {
  const source = micros ?? {};
  const rows = DEFAULT_MICROS_LIST.map((micro) => {
    const raw = source[micro.code];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    return {
      key: micro.code,
      displayName: micro.name,
      unit: micro.unit,
      value,
      pct: formatMicroPercent(value, micro.rda),
    };
  });
  return sortAndFilterMicrosByRdaPct(rows, {
    minPct: 1,
    includeUnknownRda: false,
  });
}

function scaleMicros(micros: ParsedItemT['micros'], ratio: number): ParsedItemT['micros'] {
  return Object.fromEntries(
    Object.entries(micros).map(([key, value]) => [key, roundNutrition(value * ratio)]),
  );
}

function scaleApproxGrams(approxGrams: number | undefined, ratio: number): number | undefined {
  if (
    typeof approxGrams !== 'number' ||
    !Number.isFinite(approxGrams) ||
    approxGrams <= 0 ||
    !Number.isFinite(ratio) ||
    ratio <= 0
  ) {
    return undefined;
  }
  return roundNutrition(approxGrams * ratio);
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
    approxGrams: scaleApproxGrams(item.approxGrams, ratio),
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
      // POST-MVP-CODEX-R3-C2 — clearing the row's `dedupMatch` here gives
      // the user a clear "rename to resolve" recovery path. Whatever the
      // previous verdict was (preflight match or server 409), once the
      // name changes the verdict is stale. Row-0's debounce preflight
      // will re-evaluate against the new name; row 1+'s next save
      // attempt will re-test against the server. Avoids the global
      // dead-end where renaming row N+1 couldn't lift the Save block.
      const rows = state.rows.map((r) =>
        r.id === action.id ? { ...r, item: { ...r.item, name: action.name }, dedupMatch: null } : r,
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
      const rows = state.rows.map((r) => {
        if (r.id !== action.id) return r;
        const isRejectedWholeDecimal =
          isWholeStyleUnit(r.item.unit) &&
          Number.isFinite(action.portion) &&
          action.portion > 0 &&
          !Number.isInteger(action.portion);
        return isRejectedWholeDecimal
          ? r
          : { ...r, item: rescaleItemForPortion(r.item, action.portion) };
      });
      return { ...state, rows };
    }
    case 'EDIT_ITEM_MICRO': {
      // Bug 1 — write the edited micro back into the row's `item.micros`
      // bag. Reuses the existing `roundNutrition` rounding contract so the
      // persisted value matches the rest of the EDIT_ITEM_* surface.
      // Negative / NaN inputs are coerced to 0 (in-input guard already
      // filters those, but defense-in-depth here too).
      const safeValue = roundNutrition(action.value);
      const rows = state.rows.map((r) => {
        if (r.id !== action.id) return r;
        const micros = { ...(r.item.micros ?? {}), [action.code]: safeValue };
        return { ...r, item: { ...r.item, micros } };
      });
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
    case 'SET_ROW_DEDUP_MATCH': {
      // POST-MVP-CODEX-R3-C2 — write the dedup match into the specific
      // row's `dedupMatch` slot. Used by the library-only 409 handler
      // and by the row-0 preflight in library-only mode. Standard mode
      // keeps the legacy global `state.dedupMatch` reuse-existing path.
      const rows = state.rows.map((r) =>
        r.id === action.id ? { ...r, dedupMatch: action.match } : r,
      );
      return { ...state, rows };
    }
    case 'SET_LOGGED_AT':
      return { ...state, loggedAt: action.loggedAt, loggedAtFutureRejected: false };
    case 'SET_LOGGED_AT_FUTURE_REJECTED':
      return { ...state, loggedAtFutureRejected: action.rejected };
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
  /**
   * Bug 1 (bugfix-tomi 2026-05-17-library-micros) — emitted by
   * `ConfirmationItemMicros` when the user edits one of the 30 canonical
   * micronutrient inputs. Only wired through in `mode === 'library-only'`
   * (the component itself self-gates), but the callback lives on the
   * shared `ConfirmationActions` so the dispatch path is uniform.
   */
  editMicro: (id: RowId, code: string, value: number) => void;
  removeItem: (id: RowId) => void;
  setMeal: (meal: MealCategory) => void;
  setSaveToLibrary: (on: boolean) => void;
  setReuseExisting: (on: boolean) => void;
  // Bug A — setAlcoholic / setAlcoholPreset / setAlcoholVolume /
  // setAlcoholAbv removed; the manual AlcoholControls fieldset no longer
  // exists. The AI-derived alcohol metadata is read-only on the
  // confirmation surface (see Confirmation.AlcoholLabel) and ships
  // straight through items[] to the save route.
  /** Task C.5 — emitted by `Confirmation.TimeEditor` on user change. ISO UTC. */
  setLoggedAt: (loggedAt: string) => void;
  setLoggedAtFutureRejected: (rejected: boolean) => void;
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
  /**
   * True when save-to-library is on, the typed name collides with an
   * existing library item, AND the user has NOT explicitly chosen to
   * link this entry to the existing row via REUSE EXISTING. Disables
   * the Save CTA so duplicates cannot be created — the user must
   * either change the name or pick reuse.
   */
  saveBlockedByDuplicate: boolean;
  saveBlockedByFutureTime: boolean;
  /** Active modal mode — children self-gate on `'library-only'`. */
  mode: LogFlowMode;
  titleId: string;
  liveRegionId: string;
}

export interface ConfirmationContextValue {
  state: State;
  actions: ConfirmationActions;
  meta: ConfirmationMeta;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

/**
 * Task C.5 — exported so the sibling `Confirmation/TimeEditor.tsx` can
 * consume the same context provider from a different file. Internal usage
 * inside this module (MealSlot, SaveAction, etc.) unchanged.
 */
export function useConfirmation(): ConfirmationContextValue {
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
  dedupMatchByRow?: ReadonlyArray<DedupMatch | null> | undefined;
  libraryItemIds?: (string | null)[] | undefined;
  editEntryId?: string | undefined;
  originalLoggedAt?: string | undefined;
  mode?: LogFlowMode;
  onClose: () => void;
  children: React.ReactNode;
}

function Root({
  source,
  tab,
  items,
  reasoning,
  dedupMatch,
  dedupMatchByRow,
  libraryItemIds,
  editEntryId,
  originalLoggedAt,
  mode = 'standard',
  onClose,
  children,
}: RootProps) {
  const router = useRouter();
  const { confirm: confirmDuplicateLog, dialog: duplicateLogConfirmDialog } =
    useDuplicateLogConfirm(t.log.duplicateFoodConfirmMessage);
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
  // Task C.5 — seed `loggedAt` per §7.3 refactor rule:
  //   1. Edit-entry path (editEntryId + originalLoggedAt): preserve original ISO.
  //   2. Copy-yesterday path (pendingLogDate < today): user-TZ day midpoint ISO.
  //   3. Default path: now().
  //
  // Codex R1 Finding #3 — the seed logic lives inside the `useReducer` lazy
  // initializer (third arg) so the `getDeviceTimeZone()` + `userTzToday()`
  // computations only run ONCE at mount, not on every `Root` re-render. The
  // dispatchable `seed` parameter forwards the four primitive inputs the
  // initializer needs to compute `loggedAt`.
  const [state, dispatch] = useReducer(
    reducer,
    {
      items,
      dedupMatch,
      dedupMatchByRow,
      source,
      pendingMealCategory,
      editEntryId,
      originalLoggedAt,
      pendingLogDate,
      pendingLogTimezone,
    },
    (seed): State => {
      let initialLoggedAt: string;
      if (seed.editEntryId && seed.originalLoggedAt) {
        initialLoggedAt = seed.originalLoggedAt;
      } else if (seed.pendingLogDate) {
        const logTimezoneSeed = getDeviceTimeZone(seed.pendingLogTimezone ?? undefined);
        const todayForLogTimezone = userTzToday(logTimezoneSeed);
        if (seed.pendingLogDate < todayForLogTimezone) {
          initialLoggedAt = userTzDayMidpointIso(seed.pendingLogDate, logTimezoneSeed);
        } else {
          initialLoggedAt = new Date().toISOString();
        }
      } else {
        initialLoggedAt = new Date().toISOString();
      }
      return {
        lifecycle: { status: 'editing' },
        rows: seed.items.map((item, idx) => ({
          id: mintRowId(),
          item,
          // Snapshot now so subsequent EDIT_ITEM_PORTION actions keep
          // the same step size (proportional to the original parse).
          baselinePortion: item.portion,
          // POST-MVP-CODEX-R3-C1 — mint the row's idempotency token ONCE
          // here. The library-only save loop reuses it across every
          // retry of this row, so the server's I11 replay-by-client_id
          // path stays intact instead of getting bypassed by a fresh
          // UUID per save().
          clientId: mintLibraryClientId(),
          // POST-MVP-CODEX-R3-C2 — per-row dedup conflict slot. Seeded
          // from the optional `dedupMatchByRow` prop (positional with
          // items) when provided; defaults to null so production
          // callers don't need to thread it.
          dedupMatch: seed.dedupMatchByRow?.[idx] ?? null,
        })),
        meal: seed.pendingMealCategory ?? defaultMealForNow(),
        saveToLibrary: seed.source === 'text' || seed.source === 'photo',
        reuseExisting: false,
        dedupMatch: seed.dedupMatch,
        // Bug A — `alcohol` slot removed from State. AI's per-item
        // is_alcoholic / volume_ml / abv_percent ride on `rows[].item`.
        loggedAt: initialLoggedAt,
        loggedAtFutureRejected: false,
      };
    },
  );

  const [isPending, startTransition] = useTransition();

  // Dedup preflight (perf I6 + synthesis §2.11). Debounced 200ms on the
  // primary item name when source is text/photo. AbortController on unmount
  // or input change.
  const abortRef = useRef<AbortController | null>(null);
  const primaryName = state.rows[0]?.item.name ?? '';
  const primaryRowId = state.rows[0]?.id;
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
          // POST-MVP-CODEX-R3-C2 — write the preflight verdict into the
          // appropriate dedup-state surface:
          //   - library-only mode: row 0's per-row slot (so the inline
          //     banner attaches to row 0, and rename-to-resolve clears
          //     just row 0's slot)
          //   - standard mode: legacy global `state.dedupMatch` (keeps
          //     the REUSE EXISTING reuse-existing path for the
          //     save-to-library toggle on row 0)
          // The decoupled paths prevent the global-state race where the
          // preflight's stale `null` resolved AFTER a server 409 wiped
          // the dedupMatch the user needed to see.
          if (mode === 'library-only') {
            if (primaryRowId) {
              dispatch({
                type: 'SET_ROW_DEDUP_MATCH',
                id: primaryRowId,
                match: json?.match ?? null,
              });
            }
          } else {
            dispatch({ type: 'SET_DEDUP_MATCH', match: json?.match ?? null });
          }
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
  }, [editEntryId, primaryName, source, mode, primaryRowId]);

  const editName = useCallback((id: RowId, name: string) => {
    dispatch({ type: 'EDIT_ITEM_NAME', id, name });
  }, []);
  const editKcal = useCallback((id: RowId, kcal: number) => {
    dispatch({ type: 'EDIT_ITEM_KCAL', id, kcal });
  }, []);
  const editPortion = useCallback((id: RowId, portion: number) => {
    dispatch({ type: 'EDIT_ITEM_PORTION', id, portion });
  }, []);
  // Bug 1 — per-micro setter wired into the reducer's EDIT_ITEM_MICRO case.
  // Library-only surface only — the consumer component self-gates on
  // `meta.mode === 'library-only'`.
  const editMicro = useCallback((id: RowId, code: string, value: number) => {
    dispatch({ type: 'EDIT_ITEM_MICRO', id, code, value });
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
  // Bug A — setAlcoholic / setAlcoholPreset / setAlcoholVolume /
  // setAlcoholAbv removed; the manual AlcoholControls toggle no longer
  // exists. AI alcohol detection rides on `rows[].item.is_alcoholic`
  // (read-only on the confirmation surface).
  // Task C.5 — guarded setter; refuses to dispatch on unparseable input so the
  // reducer never holds a NaN-Date ISO. The TimeEditor only ever calls this
  // with `new Date(input.value).toISOString()`, which would throw on NaN — the
  // try/catch is defense-in-depth against programmatic mutation / paste of
  // garbage strings (design spec §12 risk #1).
  const setLoggedAt = useCallback((loggedAt: string) => {
    const ms = Date.parse(loggedAt);
    if (!Number.isFinite(ms)) return; // keep previous valid value
    dispatch({ type: 'SET_LOGGED_AT', loggedAt });
  }, []);
  const setLoggedAtFutureRejected = useCallback((rejected: boolean) => {
    dispatch({ type: 'SET_LOGGED_AT_FUTURE_REJECTED', rejected });
  }, []);

  const save = useCallback((): void => {
    // I2 — zero-item save guard. Without this the route returns 400 from the
    // `z.array(...).min(1)` refinement and the user sees an opaque "500"
    // banner. Short-circuit before any round-trip.
    if (state.rows.length === 0) return;
    if (!editEntryId && state.loggedAtFutureRejected) {
      dispatch({ type: 'SAVE_ERROR', message: t.log.confirmationFutureTimeError });
      return;
    }
    const selectedLoggedAtMs = Date.parse(state.loggedAt);
    if (
      !editEntryId &&
      Number.isFinite(selectedLoggedAtMs) &&
      selectedLoggedAtMs > Date.now() + FUTURE_LOG_CLIENT_SKEW_MS
    ) {
      dispatch({ type: 'SAVE_ERROR', message: t.log.confirmationFutureTimeError });
      return;
    }
    const clientId = ensureClientId(tab);
    const currentItems = state.rows.map((r) => r.item);

    // library-only branch — POST /api/library/create instead of
    // /api/entries/save. Pure library insert (no food_entries row, no log
    // entry side effect).
    //
    // E.CODEX Round-2 C1: persist EVERY visible row. Previously this took
    // only `state.rows[0]` and silently dropped the rest, even though the
    // user could review/edit/delete each row in the multi-item parse list.
    // Now we POST one library-create per row (sequentially so we don't
    // amplify a partial-failure mode into N concurrent half-saves) and
    // surface aggregate results.
    //
    // Empty-name short-circuit (pre-network): if any visible row has an
    // empty trimmed name, abort the batch before touching the network —
    // partial saves of a multi-row batch are worse UX than a single
    // "fix this then retry" banner.
    if (mode === 'library-only') {
      if (state.rows.length === 0) return;
      // Pre-flight name validation across the whole batch.
      const trimmedNames = state.rows.map((r) => r.item.name.trim());
      if (trimmedNames.some((n) => n.length === 0)) {
        dispatch({ type: 'SAVE_ERROR', message: t.log.confirmationItemNameError });
        return;
      }
      // Build all bodies up-front so we don't half-mutate state during
      // the async loop. Each body carries the ROW's own UUID `client_id`
      // minted at reducer-init time and persisted on the row state
      // (POST-MVP-CODEX-R3-C1). Reading from `row.clientId` (instead of
      // calling `mintLibraryClientId()` per attempt) preserves the
      // server's I11 replay-by-client_id contract across retries — the
      // SAME UUID survives across every save() invocation for the same
      // row, so a retry of an already-succeeded row replays as 200 +
      // replayed:true rather than colliding via normalized-name dedup
      // and dead-ending the user.
      //
      // CreateLibraryBodySchema validates `client_id` as
      // `z.string().uuid()` (see `lib/library/create-schema.ts`); the
      // row-creation mint uses `crypto.randomUUID()` (or v4 fallback),
      // so this contract is preserved.
      const rowsToPersist = state.rows.map((row, idx) => {
        const macros = row.item.macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
        type CholesterolCarrier = { cholesterol_mg?: number };
        const cholesterol = (macros as CholesterolCarrier).cholesterol_mg ?? 0;
        // AI parse populates micros across all 30 canonical codes with
        // most values at zero. Persisting all 30 bloats the JSONB
        // without adding signal — and downstream FoodDetail surfaces
        // (view-mode Bug 9 collapsible + edit-mode collapsible) treat
        // zero as "hide this row" anyway. Drop zeros so the persisted
        // library row carries only the nutrients the AI actually
        // identified as present.
        const parsedMicros = row.item.micros ?? {};
        const nonZeroMicros = Object.fromEntries(
          Object.entries(parsedMicros).filter(
            ([, value]) => Number.isFinite(value) && (value as number) > 0,
          ),
        );
        const nutrition: Record<string, unknown> = {
          kcal: roundKcal(row.item.kcal),
          macros: {
            protein_g: roundNutrition(macros.protein_g),
            carbs_g: roundNutrition(macros.carbs_g),
            fat_g: roundNutrition(macros.fat_g),
            fiber_g: roundNutrition(macros.fiber_g),
            cholesterol_mg: roundNutrition(cholesterol),
          },
        };
        if (Object.keys(nonZeroMicros).length > 0) {
          nutrition.micros = nonZeroMicros;
        }
        if (shouldDisplayApproxGrams(row.item.unit, row.item.approxGrams)) {
          nutrition.approxGrams = roundNutrition(row.item.approxGrams!);
        }
        const body: Record<string, unknown> = {
          // POST-MVP-CODEX-R3-C1 — per-row stable UUID minted at row-creation
          // time. Reused across every retry of this row so the server's
          // I11 dedup-by-client_id replays the request idempotently.
          client_id: row.clientId,
          display_name: trimmedNames[idx]!,
          nutrition,
        };
        if (row.item.recipeEligible !== undefined) {
          body.recipe_eligibility = row.item.recipeEligible ? 'eligible' : 'ineligible';
        }
        if (row.item.recipeEligibilityReason) {
          body.recipe_eligibility_reason = row.item.recipeEligibilityReason;
        }
        if (Number.isFinite(row.item.portion) && row.item.portion > 0) {
          body.default_portion = row.item.portion;
        }
        const trimmedUnit = row.item.unit?.trim();
        if (trimmedUnit) {
          body.default_unit = trimmedUnit;
        }
        return { body, displayName: trimmedNames[idx]!, rowId: row.id };
      });
      startTransition(() => {
        dispatch({ type: 'START_SAVE' });
        (async () => {
          for (const { body: libraryBody, displayName, rowId } of rowsToPersist) {
            try {
              const res = await authFetch('/api/library/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(libraryBody),
              });
              if (res.status === 409) {
                // POST-MVP-CODEX-R3-C2 — server-side duplicate-name
                // collision. The pre-flight dedup-check only looks at
                // row[0], so a duplicate on row 1+ (or a race on row 0)
                // only surfaces here. The route returns
                // `{ error: 'duplicate_name', existing: <ExistingLibraryRow> }`
                // with the colliding row's full payload. Parse it and
                // dispatch SET_ROW_DEDUP_MATCH so the row-scoped inline
                // `LibraryOnlyDedupBanner` renders next to THIS specific
                // row, telling the user which row to rename. Replaces the
                // prior global `SET_DEDUP_MATCH` dispatch, which couldn't
                // be cleared by renaming row 1+.
                //
                // The batch also HALTS here — subsequent rows are not
                // POSTed, so we don't continue inserting after a collision
                // (the user must rename + retry from a known-clean state).
                let dedupMatch: DedupMatch | null = null;
                try {
                  const payload = (await res.json()) as {
                    error?: string;
                    existing?: {
                      id?: string;
                      normalized_name?: string;
                      display_name?: string;
                    };
                  };
                  const existing = payload?.existing;
                  if (
                    existing &&
                    typeof existing.id === 'string' &&
                    typeof existing.normalized_name === 'string' &&
                    typeof existing.display_name === 'string'
                  ) {
                    dedupMatch = {
                      id: existing.id,
                      normalized_name: existing.normalized_name,
                      display_name: existing.display_name,
                    };
                  }
                } catch {
                  // Best-effort parse; if the response body is malformed
                  // we still surface the standard duplicate error message
                  // below so the user is not left with no feedback.
                }
                if (dedupMatch) {
                  dispatch({ type: 'SET_ROW_DEDUP_MATCH', id: rowId, match: dedupMatch });
                }
                dispatch({ type: 'SAVE_ERROR', message: t.log.confirmationDuplicateNameError });
                return;
              }
              if (res.status === 429) {
                let payload: unknown = null;
                try {
                  payload = await res.json();
                } catch {
                  payload = null;
                }
                dispatch({
                  type: 'SAVE_ERROR',
                  message: isLibraryQuotaExceededPayload(payload)
                    ? t.library.addItemLimitReached
                    : `${res.status}: ${res.statusText}`,
                });
                return;
              }
              if (!res.ok) {
                dispatch({ type: 'SAVE_ERROR', message: `${res.status}: ${res.statusText}` });
                return;
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Unknown error';
              dispatch({ type: 'SAVE_ERROR', message });
              return;
            }
            announcePolite(t.log.undoToastSaved.replace('{label}', displayName));
          }
          commitSaveSuccess(tab);
          dispatch({ type: 'SAVE_OK' });
          // Refresh /library so the new cards land immediately. The
          // create endpoint already fires revalidatePath('/library')
          // server-side, but router.refresh() forces the active page
          // to re-fetch its RSC tree.
          router.refresh();
          onClose();
        })();
      });
      return;
    }
    // Task C.5 (F-VERIFY-203) — `state.loggedAt` is the single source of
    // truth on create-path save: it is seeded by the reducer initializer
    // (originalLoggedAt > pendingLogDate-midpoint > now) and updated by
    // `Confirmation.TimeEditor` within the 30-day backfill window. Edit-path
    // keeps using `originalLoggedAt` directly to preserve the historical
    // timestamp on PATCH (logged_at is omitted from the edit body anyway —
    // see ternary below). `logTimezone` / `todayForLogTimezone` are no
    // longer needed in this scope but the dependencies (pendingLogDate,
    // pendingLogTimezone) stay in the useCallback deps because the reducer
    // initializer captures them at mount.
    const loggedAt = editEntryId && originalLoggedAt ? originalLoggedAt : state.loggedAt;
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
      // Forward a free-text description to the sketch prompt so Gemini
      // sees more than the bare display name. Text source = the user's
      // original input; photo source falls back server-side to
      // ai_reasoning (already in the body). Capped at 500 chars to
      // match the server schema; the prompt builder caps again as a
      // belt-and-braces guard.
      if (source === 'text') {
        const typedRaw = useLogFlowStore.getState().typeDraft.trim();
        if (typedRaw) body.description = typedRaw.slice(0, 500);
      }
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
    if (body.library_item_id) {
      delete body.save_to_library;
      delete body.description;
    }
    // Bug A (bugfix-tomi 2026-05-19-bac-improvements) — no client-side
    // alcohol lift. AI-derived `is_alcoholic` / `volume_ml` / `abv_percent`
    // live on each parsed item and ride through `currentItems` (already
    // attached to `body.items`) to the save route, which reads them via
    // `collectAlcoholPayloads()` and writes per-item `alcohol_logs` rows
    // when meal_category === 'drink'.

    startTransition(() => {
      dispatch({ type: 'START_SAVE' });
      (async () => {
        try {
          const endpoint = editEntryId ? `/api/entries/${editEntryId}` : '/api/entries/save';
          const method = editEntryId ? 'PATCH' : 'POST';
          let res = await authFetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!editEntryId && res.status === 409) {
            let payload: unknown = null;
            try {
              payload = await res.json();
            } catch {
              payload = null;
            }
            if (isDuplicateFoodEntryPayload(payload)) {
              const confirmed = await confirmDuplicateLog();
              if (!confirmed) {
                dispatch({ type: 'SAVE_ERROR', message: t.log.duplicateFoodCancelled });
                return;
              }
              res = await authFetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, allow_duplicate: true }),
              });
            }
          }
          if (!res.ok) {
            let payload: unknown = null;
            try {
              payload = await res.clone().json();
            } catch {
              payload = null;
            }
            dispatch({
              type: 'SAVE_ERROR',
              message: isLoggedAtFuturePayload(payload)
                ? t.log.confirmationFutureTimeError
                : `${res.status}: ${res.statusText}`,
            });
            return;
          }
          const json = (await res.json()) as {
            entry: { id: string };
            libraryQuotaExceeded?: boolean;
          };
          const pushToast = useUndoQueueStore.getState().pushToast;
          const firstName = currentItems[0]?.name ?? '';
          if (json.libraryQuotaExceeded) {
            pushToast({
              clientId: `${clientId}:library-quota`,
              kind: 'delete-failed',
              description: t.log.confirmationLibraryLimitReached,
              serverRowId: null,
              commit: async () => {},
              revert: async () => {},
            });
            announcePolite(t.log.confirmationLibraryLimitReached);
          }
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
    confirmDuplicateLog,
    editEntryId,
    ensureClientId,
    libraryItemIds,
    mode,
    onClose,
    originalLoggedAt,
    reasoning,
    router,
    source,
    // Bug A — `state.alcohol` removed from deps; the AI alcohol fields
    // live on `state.rows[].item` which is already in the deps array via
    // `state.rows`.
    state.dedupMatch,
    state.loggedAtFutureRejected,
    state.loggedAt,
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
      editMicro,
      removeItem,
      setMeal,
      setSaveToLibrary,
      setReuseExisting,
      // Bug A — alcohol setters removed (no manual toggle anymore).
      setLoggedAt,
      setLoggedAtFutureRejected,
      save,
    },
    meta: {
      source,
      tab,
      reasoning,
      isSaving: state.lifecycle.status === 'saving' || isPending,
      isEditing: !!editEntryId,
      isEmpty: state.rows.length === 0,
      // Hard-reject duplicates: when save-to-library is engaged AND a
      // dedup match exists, the only way forward is to either change
      // the FILE UNDER name to something unique (clears state.dedupMatch
      // via the existing pre-flight) or click REUSE EXISTING. In
      // library-only mode the dedup match still blocks save (a name
      // collision would 409 server-side), but the resolution is just
      // "rename" — there is no REUSE EXISTING path because we are
      // creating a new library row, not logging against an old one.
      //
      // POST-MVP-CODEX-R3-C2 — library-only mode now keys on PER-ROW
      // `row.dedupMatch` slots so the user can resolve by renaming
      // whichever row actually collided. Save is blocked if ANY row has
      // a non-null dedupMatch. The global `state.dedupMatch` is
      // preserved for the legacy preflight pathway in case any leftover
      // dispatch path still flows through it (defense-in-depth — every
      // current dispatch in library-only mode goes via SET_ROW_DEDUP_MATCH).
      saveBlockedByDuplicate:
        mode === 'library-only'
          ? state.rows.some((r) => r.dedupMatch !== null) || state.dedupMatch !== null
          : state.saveToLibrary && state.dedupMatch !== null && !state.reuseExisting,
      saveBlockedByFutureTime: !editEntryId && state.loggedAtFutureRejected,
      mode,
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
      {duplicateLogConfirmDialog}
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
  // Wheel options + step scale with the row's BASELINE portion (the
  // value parsed initially). Snapshotting via baselinePortion keeps
  // the increments stable as the user steps up/down — otherwise the
  // step would compound each click. Falls back to 1 for not-yet-seeded
  // rows during the very first render.
  //
  // Unit-aware: discrete units (piece / egg / slice / serving / …)
  // force step=1 + integer wheel rows so users never see "1.5 pieces"
  // when clicking − from a baseline of 1 piece. Continuous units
  // (g / ml / cup / …) keep the proportional 10%-of-baseline step.
  const baseline = row?.baselinePortion ?? row?.item.portion ?? 1;
  const discreteUnit = isDiscreteUnit(row?.item.unit);
  const wheelOptions = useMemo(
    () => (discreteUnit ? buildIntegerWheelOptions(baseline) : buildWheelOptions(baseline)),
    [baseline, discreteUnit],
  );
  const portionStep = useMemo(
    () => (discreteUnit ? 1 : deriveStep(baseline)),
    [baseline, discreteUnit],
  );
  const [wheelDraft, setWheelDraft] = useState<number>(() =>
    row ? snapPortionToWheel(row.item.portion, wheelOptions) : 1,
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
          <div className="kalori-confirmation-name-line">
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
          </div>
          {nameInvalid ? (
            <span id={nameErrorId} role="alert" className="kalori-confirmation-field-error">
              {t.log.confirmationItemNameError}
            </span>
          ) : null}
          {shouldDisplayApproxGrams(item.unit, item.approxGrams) ? (
            <p
              className="kalori-confirmation-approx-grams"
              data-testid={`confirmation-item-${index}-approx-grams`}
            >
              {formatApproxGrams(item.approxGrams!)}
            </p>
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
                setWheelDraft(snapPortionToWheel(item.portion, wheelOptions));
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
                options={wheelOptions}
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
              onClick={() =>
                actions.editPortion(
                  rowId,
                  discreteUnit
                    ? // Discrete: snap to whole numbers. If the current
                      // portion is fractional (rare — direct typing), `ceil
                      // - step` snaps DOWN to the next integer instead of
                      // landing on another fractional value.
                      Math.max(portionStep, Math.ceil(item.portion) - portionStep)
                    : Math.max(portionStep, item.portion - portionStep),
                )
              }
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
              step={portionStep}
              inputMode={discreteUnit ? 'numeric' : 'decimal'}
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
              onClick={() =>
                actions.editPortion(
                  rowId,
                  discreteUnit
                    ? // Discrete: `floor + step` snaps UP to the next
                      // integer even when current is fractional (e.g.
                      // 1.5 + → 2, not 2.5).
                      Math.floor(item.portion) + portionStep
                    : item.portion + portionStep,
                )
              }
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
      {/* Phase 2C — Macros summary strip. Renders the 5 macros so the
          user can verify them before saving. Compact read-only line;
          full per-macro editing lives in the post-save library
          detail page. */}
      <ConfirmationItemMacros rowId={rowId} index={index} />
      <ConfirmationParsedMicros rowId={rowId} index={index} />
      {/* Bug 1 (bugfix-tomi 2026-05-17-library-micros) — library-only mode
          exposes the 30 canonical micronutrients in a default-closed Radix
          Collapsible so the user can adjust the AI-parsed values before
          /api/library/create. Self-gates on meta.mode === 'library-only'
          so the standard log flow is unchanged. */}
      <ConfirmationItemMicros rowId={rowId} index={index} />
      {/* POST-MVP-CODEX-R3-C2 — per-row inline dedup banner. Renders
          immediately below the offending row in library-only mode when
          that row carries an active `dedupMatch` (from preflight or
          server-409). Distinct testid per row enables row-scoped
          assertions and provides the rename target context users need
          to recover from non-primary-row collisions. */}
      <ConfirmationItemDedupBanner rowId={rowId} index={index} />
    </li>
  );
}

interface ConfirmationItemMacrosProps {
  rowId: RowId;
  index: number;
}

function ConfirmationItemMacros({ rowId, index }: ConfirmationItemMacrosProps) {
  const { state } = useConfirmation();
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const macros = row.item.macros;
  // Coalesce + round so legacy ParsedItem rows (pre-cholesterol) show
  // a clean integer line instead of "undefined mg".
  const protein = Math.round(macros?.protein_g ?? 0);
  const carbs = Math.round(macros?.carbs_g ?? 0);
  const fat = Math.round(macros?.fat_g ?? 0);
  const fiber = Math.round(macros?.fiber_g ?? 0);
  // Phase 2C — cholesterol_mg surfaces here so the user can verify the
  // AI-parsed / library re-log value before commit. Unit is mg.
  const cholesterol = Math.round(
    (macros as { cholesterol_mg?: number } | undefined)?.cholesterol_mg ?? 0,
  );
  return (
    <dl
      data-testid={`confirmation-item-${index}-macros`}
      className="kalori-confirmation-item-macros"
    >
      <div className="kalori-confirmation-item-macro">
        <dt>{t.log.confirmationItemMacroProtein}</dt>
        <dd className="num">
          {protein}
          {t.log.confirmationItemMacroUnitGrams}
        </dd>
      </div>
      <div className="kalori-confirmation-item-macro">
        <dt>{t.log.confirmationItemMacroCarbs}</dt>
        <dd className="num">
          {carbs}
          {t.log.confirmationItemMacroUnitGrams}
        </dd>
      </div>
      <div className="kalori-confirmation-item-macro">
        <dt>{t.log.confirmationItemMacroFat}</dt>
        <dd className="num">
          {fat}
          {t.log.confirmationItemMacroUnitGrams}
        </dd>
      </div>
      <div className="kalori-confirmation-item-macro">
        <dt>{t.log.confirmationItemMacroFiber}</dt>
        <dd className="num">
          {fiber}
          {t.log.confirmationItemMacroUnitGrams}
        </dd>
      </div>
      <div className="kalori-confirmation-item-macro">
        <dt>{t.log.confirmationItemMacroCholesterol}</dt>
        <dd className="num" data-testid={`confirmation-item-${index}-cholesterol_mg`}>
          {cholesterol}
          {t.log.confirmationItemMacroUnitMg}
        </dd>
      </div>
    </dl>
  );
}

// --------------------------------------------------------------------------
// ConfirmationItemDedupBanner — POST-MVP-CODEX-R3-C2.
//
// Inline per-row duplicate-name banner that renders next to the offending
// row in `mode === 'library-only'` when `row.dedupMatch` is non-null. The
// row-scoped surface makes the rename target unambiguous: each row carries
// its own dedup state, so the user knows exactly which name to change to
// resolve a multi-row collision (vs the previous global banner that
// referenced no specific row and dead-ended renames on row 1+).
//
// Self-gates on `meta.mode === 'library-only'` AND on the row's own
// `dedupMatch` slot, so standard mode and clean rows never render this.
// EDIT_ITEM_NAME automatically clears `row.dedupMatch`, so typing in the
// row's name input naturally hides the banner.
// --------------------------------------------------------------------------

interface ConfirmationItemDedupBannerProps {
  rowId: RowId;
  index: number;
}

function ConfirmationItemDedupBanner({ rowId, index }: ConfirmationItemDedupBannerProps) {
  const { state, meta } = useConfirmation();
  const headingId = useId();
  const row = state.rows.find((r) => r.id === rowId);
  if (meta.mode !== 'library-only') return null;
  if (!row || !row.dedupMatch) return null;
  return (
    <div
      role="alert"
      aria-labelledby={headingId}
      data-testid={`confirmation-item-${index}-dedup-banner`}
      className="kalori-confirmation-dedup"
      style={{ gridColumn: '1 / -1' }}
    >
      <p id={headingId} className="kalori-confirmation-dedup-header">
        {t.log.confirmationLibraryOnlyDedupHeader}
      </p>
      <p className="kalori-confirmation-dedup-hint">{t.log.confirmationLibraryOnlyDedupHint}</p>
    </div>
  );
}

// --------------------------------------------------------------------------
// ConfirmationItemMicros — Bug 1 (bugfix-tomi 2026-05-17-library-micros).
//
// Library-only mode renders a default-closed Radix Collapsible that exposes
// all 30 canonical micronutrients from `DEFAULT_MICROS_LIST`. The user can
// adjust each value before the row is POSTed to /api/library/create.
//
// Self-gates on `meta.mode === 'library-only'` so the standard log flow is
// unchanged — `confirmation-item-{i}-micros-trigger` MUST NOT appear in
// mode === 'standard' (test #2 asserts this).
//
// Pattern + CSS classes mirror
// `app/(app)/library/_components/FoodDetail/FoodDetailMacros.tsx::EditMicrosCollapsible`
// verbatim so the visual + ARIA contract matches the library-detail edit
// surface the user is already familiar with.
// --------------------------------------------------------------------------

interface ConfirmationItemMicrosProps {
  rowId: RowId;
  index: number;
}

function ConfirmationParsedMicros({ rowId, index }: ConfirmationItemMicrosProps) {
  const { state, meta } = useConfirmation();
  const [expanded, setExpanded] = useState(false);
  if (meta.mode === 'library-only') return null;
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return null;
  const rows = parsedMicroRows(row.item.micros);
  if (rows.length === 0) return null;
  const visibleRows = expanded ? rows : rows.slice(0, 1);
  return (
    <div
      className="kalori-confirmation-parsed-micros"
      data-testid={`confirmation-item-${index}-parsed-micros`}
    >
      <dl className="kalori-confirmation-parsed-micros-list">
        {visibleRows.map((micro) => (
          <div key={micro.key} className="kalori-confirmation-parsed-micro">
            <dt>{micro.displayName}</dt>
            <dd>
              <span className="num">
                {micro.value} {micro.unit}
              </span>
              <span className="kalori-fd-micro-dv">
                {micro.pct}
                {t.log.confirmationWhyDvSuffix}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      {rows.length > 1 ? (
        <button
          type="button"
          className="kalori-confirmation-parsed-micros-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? t.log.confirmationParsedMicrosExpandHide
            : t.log.confirmationParsedMicrosExpandShow}
        </button>
      ) : null}
    </div>
  );
}

function ConfirmationItemMicros({ rowId, index }: ConfirmationItemMicrosProps) {
  const { state, actions, meta } = useConfirmation();
  const row = state.rows.find((r) => r.id === rowId);
  const panelId = useId();
  const micros = row?.item.micros ?? {};
  // Codex R1 Improvement I1 (bugfix-tomi 2026-05-17-micros-display-
  // consistency) — freeze the editable-list sort order at the moment the
  // collapsible is mounted. The previous implementation rebuilt + re-sorted
  // rows on every render from LIVE `micros`, so clearing or lowering a
  // high-%RDA input (e.g., iron 100% → 0%) would immediately reorder the
  // input column under the user's cursor and yank focus. The `useState`
  // lazy-initializer below runs exactly once at mount and pins the sorted
  // key order for the lifetime of the component instance. Amounts still
  // bind to live `micros` via the `display` expression below; only the
  // iteration ORDER is locked.
  //
  // (We do NOT use `useMemo` with empty deps — React's react-hooks/refs
  // lint rule and React 19 docs explicitly warn against reading refs
  // during render. A lazy useState initializer is the canonical pattern
  // for "compute exactly once at mount" and satisfies the rules of hooks.)
  const [sortedMicros] = useState(() => {
    const initial = micros as Record<string, number | undefined>;
    const rows = DEFAULT_MICROS_LIST.map((micro) => {
      const raw = initial[micro.code];
      const value = Number.isFinite(raw) ? (raw as number) : 0;
      return {
        key: micro.code,
        displayName: micro.name,
        pct: formatMicroPercent(value, micro.rda),
        micro,
      };
    });
    // `minPct: 0` keeps every input reachable even at 0% (editable surface
    // must NOT filter), and `includeUnknownRda: true` is forward-compat
    // (every entry in DEFAULT_MICROS_LIST currently has a positive RDA,
    // but the option lets future non-RDA additions still surface).
    return sortAndFilterMicrosByRdaPct(rows, {
      minPct: 0,
      includeUnknownRda: true,
    });
  });
  if (meta.mode !== 'library-only') return null;
  if (!row) return null;
  return (
    <Collapsible.Root style={{ gridColumn: '1 / -1' }}>
      <Collapsible.Trigger
        type="button"
        className="kalori-fd-micros-expand-trigger"
        data-testid={`confirmation-item-${index}-micros-trigger`}
        aria-controls={panelId}
      >
        <span data-state-label="show">{t.log.confirmationItemMicrosExpandShow}</span>
        <span data-state-label="hide">{t.log.confirmationItemMicrosExpandHide}</span>
        <span aria-hidden="true" className="kalori-fd-micros-expand-caret" />
      </Collapsible.Trigger>
      <Collapsible.Content
        id={panelId}
        className="kalori-fd-micros-expand-content"
        data-testid={`confirmation-item-${index}-micros-content`}
      >
        <div className="kalori-fd-micros-expand-grid">
          {sortedMicros.map(({ micro }) => {
            const inputId = `confirmation-item-${index}-micro-${micro.code}`;
            // Amounts bind to LIVE `micros` (not the frozen snapshot) so the
            // displayed input value reflects the user's keystrokes. Only
            // the iteration ORDER is locked by `sortedMicros`.
            const raw = (micros as Record<string, number | undefined>)[micro.code];
            // Coerce undefined / null / NaN to '' so the input renders an
            // empty string rather than 'NaN' / 'undefined'. Numeric 0 is a
            // legitimate value and is rendered as '0'.
            const display = Number.isFinite(raw) ? String(raw) : '';
            return (
              <div key={micro.code} style={{ display: 'contents' }}>
                <label htmlFor={inputId} className="kalori-fd-micro-name">
                  {micro.name} ({micro.unit})
                </label>
                <input
                  id={inputId}
                  data-testid={`confirmation-item-${index}-micro-${micro.code}-input`}
                  type="number"
                  min="0"
                  max="999999"
                  step="any"
                  inputMode="decimal"
                  value={display}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === '') {
                      actions.editMicro(rowId, micro.code, 0);
                      return;
                    }
                    const parsed = Number(next);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      // LM-SEC-1 (bugfix-tomi 2026-05-17-followups) — cap
                      // absurd inputs at 999_999 to prevent paste of
                      // scientific notation (`1e300`) from persisting
                      // through the reducer. The Zod schema enforces a
                      // matching ceiling at 1_000_000 server-side
                      // (`lib/library/micros-bounds.ts`); the 1-unit
                      // headroom absorbs `roundNutrition`'s 1-decimal
                      // rounding so cap-at-edge never false-positives at
                      // the schema boundary. RLS already gates writes to
                      // the user's own row — defense-in-depth for future
                      // programmatic callers that bypass this onChange.
                      const capped = Math.min(parsed, 999999);
                      actions.editMicro(rowId, micro.code, capped);
                    }
                  }}
                  aria-label={`${micro.name} (${micro.unit})`}
                  className="kalori-fd-input kalori-fd-input-num"
                />
              </div>
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// --------------------------------------------------------------------------
// Confirmation.Reasoning — self-gates via context.source (skill G9).
// --------------------------------------------------------------------------

function Reasoning() {
  const { meta, state } = useConfirmation();
  return (
    <WhyTheseNumbers
      source={meta.source}
      reasoning={meta.reasoning}
      items={state.rows.map((row) => row.item)}
    />
  );
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
            className={['kalori-confirmation-meal-row', active && 'is-active']
              .filter(Boolean)
              .join(' ')}
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
// Confirmation.AlcoholLabel — read-only "Detected" caption for AI-flagged
// alcoholic drinks (Bug A, bugfix-tomi 2026-05-19-bac-improvements).
//
// Replaces the deleted `AlcoholControls` fieldset. Self-gates on
// meal === 'drink' AND the presence of at least one item with
// `is_alcoholic === true`. Renders the first alcoholic item's
// volume / ABV / computed grams in a one-line caption — no toggle,
// no fields, no validation surface.
//
// The save route now writes one alcohol_logs row per alcoholic item
// (see `app/api/entries/save/route.ts::collectAlcoholPayloads`); this
// label intentionally surfaces only the FIRST alcoholic item so a
// "burger + IPA" parse doesn't visually grow into a multi-line stack.
// Multi-drink edge case is acknowledged in `bug-A.md` Open Questions §6.
// --------------------------------------------------------------------------

const ETHANOL_DENSITY_G_PER_ML = 0.789;

function findFirstAlcoholicRow(rows: ConfirmationRow[]): ConfirmationRow | undefined {
  return rows.find(
    (r) =>
      r.item.is_alcoholic === true &&
      typeof r.item.volume_ml === 'number' &&
      typeof r.item.abv_percent === 'number',
  );
}

function formatAlcoholGrams(volumeMl: number, abvPercent: number): number {
  return Math.round(volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML);
}

function formatAbvDisplay(abvPercent: number): string {
  // Show integers without a trailing .0 ("5" not "5.0"); fractional ABVs
  // (e.g. 6.5 for IPA) display with one decimal.
  return Number.isInteger(abvPercent) ? String(abvPercent) : String(abvPercent);
}

function AlcoholLabel() {
  const { state } = useConfirmation();
  const a11yId = useId();
  if (state.meal !== 'drink') return null;
  const row = findFirstAlcoholicRow(state.rows);
  if (!row) return null;
  // Refinement narrowing — both fields are guaranteed by findFirstAlcoholicRow.
  const volumeMl = row.item.volume_ml as number;
  const abvPercent = row.item.abv_percent as number;
  const grams = formatAlcoholGrams(volumeMl, abvPercent);
  const formatted = t.log.confirmationAlcoholDetectedFormat
    .replace('{volume}', String(Math.round(volumeMl)))
    .replace('{abv}', formatAbvDisplay(abvPercent))
    .replace('{grams}', String(grams));
  const a11yText = t.log.confirmationAlcoholDetectedA11y
    .replace('{volume}', String(Math.round(volumeMl)))
    .replace('{abv}', formatAbvDisplay(abvPercent))
    .replace('{grams}', String(grams));
  return (
    <p
      data-testid="confirmation-alcohol-detected"
      className="kalori-confirmation-alcohol-detected"
      aria-describedby={a11yId}
      style={{
        margin: 0,
        padding: 'var(--spacing-3) 0',
        borderTop: '1px solid var(--color-rule-strong)',
        borderBottom: '1px solid var(--color-rule-strong)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--color-ivory)',
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--spacing-3)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--type-label)',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-dust)',
        }}
      >
        {t.log.confirmationAlcoholDetectedLabel}
      </span>
      <span>{formatted}</span>
      <span id={a11yId} className="sr-only">
        {a11yText}
      </span>
    </p>
  );
}

// --------------------------------------------------------------------------
// Confirmation.SaveToLibraryToggle — self-gates via context.source.
// --------------------------------------------------------------------------

function SaveToLibraryToggle() {
  const { state, actions, meta } = useConfirmation();
  const labelId = useId();
  const nameInputId = useId();
  const errorId = useId();
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const quotaNoticeSent = useRef(false);
  const setSaveToLibrary = actions.setSaveToLibrary;

  useEffect(() => {
    if (meta.isEditing || meta.source === 'library' || meta.source === 'manual') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/library/quota', { method: 'GET' });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          quota?: { exceeded?: boolean };
        };
        if (cancelled || !payload.quota?.exceeded) return;
        setQuotaBlocked(true);
        setSaveToLibrary(false);
        if (!quotaNoticeSent.current) {
          quotaNoticeSent.current = true;
          useUndoQueueStore.getState().pushToast({
            clientId:
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `library-quota-${Date.now()}`,
            kind: 'delete-failed',
            description: t.log.confirmationLibraryLimitReached,
            serverRowId: null,
            commit: async () => {},
            revert: async () => {},
          });
          announcePolite(t.log.confirmationLibraryLimitReached);
        }
      } catch {
        // Quota preflight is progressive enhancement; server routes enforce.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta.isEditing, meta.source, setSaveToLibrary]);

  if (meta.isEditing || meta.source === 'library' || meta.source === 'manual') return null;
  const firstRow = state.rows[0];
  const firstName = firstRow?.item.name ?? '';
  // Show the inline error only when save-to-library is on AND the
  // typed name collides AND the user has not opted into reuse. The
  // DedupBanner below offers the REUSE EXISTING resolution.
  const hasDuplicateConflict = meta.saveBlockedByDuplicate;
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
        aria-disabled={quotaBlocked ? 'true' : undefined}
        disabled={quotaBlocked}
        data-testid="confirmation-save-to-library"
        onClick={() => {
          if (quotaBlocked) return;
          actions.setSaveToLibrary(!state.saveToLibrary);
        }}
        className={['kalori-confirmation-switch', state.saveToLibrary && 'is-on']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="kalori-confirmation-switch-knob" aria-hidden="true" />
      </button>
      {firstRow ? (
        <>
          <label className="sr-only" htmlFor={nameInputId}>
            {t.log.confirmationSaveToLibraryNameLabel}
          </label>
          <input
            id={nameInputId}
            type="text"
            value={firstName}
            onChange={(e) => actions.editName(firstRow.id, e.target.value)}
            disabled={!state.saveToLibrary || quotaBlocked}
            aria-labelledby={labelId}
            aria-invalid={hasDuplicateConflict ? 'true' : undefined}
            aria-describedby={hasDuplicateConflict ? errorId : undefined}
            placeholder={t.log.confirmationSaveToLibraryNamePlaceholder}
            maxLength={200}
            data-testid="confirmation-save-to-library-name"
            className={[
              'kalori-confirmation-save-to-library-name',
              hasDuplicateConflict && 'is-invalid',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          {hasDuplicateConflict ? (
            <span
              id={errorId}
              role="alert"
              data-testid="confirmation-save-to-library-duplicate-error"
              className="kalori-confirmation-save-to-library-error"
            >
              {t.log.confirmationDuplicateNameError}
            </span>
          ) : null}
        </>
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
          className={['kalori-confirmation-dedup-reuse', state.reuseExisting && 'is-selected']
            .filter(Boolean)
            .join(' ')}
          aria-pressed={state.reuseExisting}
        >
          {t.log.confirmationDedupReuse}
        </button>
        {/*
         * CREATE NEW removed 2026-05-16 — duplicates are now hard-
         * rejected at the FILE UNDER input. The only resolutions are
         * (a) edit the name to something unique (clears dedupMatch via
         * the pre-flight) or (b) click REUSE EXISTING above.
         */}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Confirmation.LibraryOnlyDedupBanner — visible duplicate surface for
// `mode === 'library-only'`. The standard DedupBanner is hidden in
// library-only mode because REUSE EXISTING makes no sense for a create-only
// flow (there is no food_entries row to link to an existing library row).
// However, without ANY duplicate banner the user sees Save aria-disabled
// with no explanation — see E.CODEX Round-2 C2. This banner surfaces the
// collision + tells the user to rename, which is the only resolution path.
// --------------------------------------------------------------------------

function LibraryOnlyDedupBanner() {
  const { state, meta } = useConfirmation();
  const headingId = useId();
  if (meta.mode !== 'library-only') return null;
  // POST-MVP-CODEX-R3-C2 — show the top-level surface whenever ANY row
  // has a conflict (or the legacy global state.dedupMatch is set, which
  // can still happen if the preflight seed path is used). The per-row
  // inline banner inside `ConfirmationItemRow` (testid
  // `confirmation-item-{i}-dedup-banner`) carries the row-specific
  // rename target; this top-level surface is kept for backwards-compat
  // with R2 tests that assert the generic banner testid is present and
  // for the prop-seeded `dedupMatch` path that still uses global state.
  const hasRowConflict = state.rows.some((r) => r.dedupMatch !== null);
  if (!hasRowConflict && !state.dedupMatch) return null;
  return (
    <div
      role="alert"
      aria-labelledby={headingId}
      data-testid="library-only-dedup-banner"
      className="kalori-confirmation-dedup"
    >
      <p id={headingId} className="kalori-confirmation-dedup-header">
        {t.log.confirmationLibraryOnlyDedupHeader}
      </p>
      <p className="kalori-confirmation-dedup-hint">{t.log.confirmationLibraryOnlyDedupHint}</p>
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
      <span className="kalori-confirmation-error-text">{state.lifecycle.message}</span>
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
  const disabled =
    meta.isSaving || meta.isEmpty || meta.saveBlockedByDuplicate || meta.saveBlockedByFutureTime;
  const ctaLabel =
    meta.mode === 'library-only' ? t.log.confirmationLibrarySaveCTA : t.log.confirmationSaveCTA;
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
          ctaLabel
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
  // Bug A (bugfix-tomi 2026-05-19-bac-improvements) — AlcoholControls
  // removed; replaced by AlcoholLabel (read-only "Detected" caption fed
  // by AI per-item is_alcoholic + volume_ml + abv_percent fields).
  AlcoholLabel,
  // Task C.5 (F-VERIFY-203) — backfill horizon editor; native datetime-local
  // input clamped to [now - 30d, now] on the client (server enforces
  // identical bounds via the `'logged_at_too_old'` / `'logged_at_future'`
  // imperative guards in `app/api/entries/save/route.ts`). Renders between
  // MealSlot and SaveToLibraryToggle per PRD §3.5 ordering.
  TimeEditor,
  SaveToLibraryToggle,
  DedupBanner,
  // E.CODEX Round-2 C2 — visible duplicate surface for library-only mode.
  LibraryOnlyDedupBanner,
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
    dedupMatchByRow,
    libraryItemIds,
    editEntryId,
    originalLoggedAt,
    mode = 'standard',
    onClose,
  } = props;
  const isLibraryOnly = mode === 'library-only';
  return (
    <Confirmation.Root
      source={source}
      tab={tab}
      items={items}
      reasoning={reasoning}
      dedupMatch={dedupMatch}
      dedupMatchByRow={dedupMatchByRow}
      libraryItemIds={libraryItemIds}
      editEntryId={editEntryId}
      originalLoggedAt={originalLoggedAt}
      mode={mode}
      onClose={onClose}
    >
      <Confirmation.Masthead />
      <Confirmation.ItemList />
      <Confirmation.Reasoning />
      {/* Meal slot, time editor, and save-to-library toggle are
          log-specific — in `library-only` mode the modal exists purely
          to author a library item, so these are omitted. The DedupBanner
          (reuse-existing path) is also omitted because library-only mode
          forces "rename to avoid collision" semantics: there is no log
          entry to link against an existing library row, so reusing makes
          no sense. The ErrorBanner still renders so name collisions /
          server errors surface inline. */}
      {isLibraryOnly ? (
        // E.CODEX Round-2 C2 — library-only mode shows the dedicated
        // duplicate banner so the user understands WHY Save is disabled
        // and how to resolve (rename). The standard SaveToLibraryToggle
        // / DedupBanner pair is omitted because there's no log-entry
        // surface to attach to in library-only mode.
        <Confirmation.LibraryOnlyDedupBanner />
      ) : (
        <>
          <Confirmation.MealSlot />
          {/* Bug A — AlcoholControls (toggle + presets + inputs) deleted;
              replaced by the read-only AlcoholLabel caption fed by AI-derived
              per-item is_alcoholic + volume_ml + abv_percent. */}
          <Confirmation.AlcoholLabel />
          <Confirmation.TimeEditor />
          <Confirmation.SaveToLibraryToggle />
          <Confirmation.DedupBanner />
        </>
      )}
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

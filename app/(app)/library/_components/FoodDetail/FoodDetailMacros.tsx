'use client';

/**
 * <FoodDetailMacros /> — Task 4.2 + Bug 8 / Bug 9
 * (library overhaul batch 2026-05-16).
 *
 * § 04 · NUTRITION block. Four-sided hairline frame with ember corner
 * labels. Kcal hero right-aligned inside the frame. Macro bars + micro
 * table beneath. In edit mode, each numeric becomes a 44px Mono input.
 *
 * Bug 8 (2026-05-16): Fiber is promoted from the italic-serif micros
 * block into the Inter UPPERCASE macros block alongside Protein / Carbs /
 * Fat. Every macro row gets an FDA-DV-% suffix derived from
 * `lib/nutrition/macro-dv.ts` (FDA 21 CFR §101.9 reference table).
 *
 * Bug 9 (2026-05-16): Micros beyond the always-visible sodium row are
 * wrapped in a Radix `<Collapsible.Root />`, default closed, with an
 * `aria-expanded`-driven toggle. Hidden when there's nothing to expand.
 */
import * as Collapsible from '@radix-ui/react-collapsible';
import { useId } from 'react';

import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';
import {
  canonicalizeMicroKey,
  canonicalMicroRda,
  canonicalMicroUnit,
} from '@/lib/dashboard/micros-rda-resolver';
import { MACRO_DV_G, macroDvPct, type MacroDvKey } from '@/lib/nutrition/macro-dv';
import { formatMicroPercent, sortAndFilterMicrosByRdaPct } from '@/lib/nutrition/display-micros';

import type { DraftState, EditErrors, DraftKey } from './useFoodDetailEdit';
import { DEFAULT_MICROS_LIST } from '@/lib/nutrition/micros-rda';
import {
  formatGrams,
  formatKcal,
  formatMilligrams,
  humanizeMicroKey,
  unitFromMicroKey,
} from './foodDetail.format';

const MACRO_COLORS: Record<'protein' | 'carbs' | 'fat' | 'fiber' | 'cholesterol', string> = {
  protein: 'var(--color-ivory)',
  carbs: 'var(--color-ochre)',
  fat: 'var(--color-ember)',
  // Matches `MACRO_COLORS.fiber` in components/dashboard/MacroBars.tsx —
  // fiber treated as a first-class macro app-wide.
  fiber: 'var(--color-slate)',
  // Matches `MACRO_COLORS.cholesterol` in components/dashboard/MacroBars.tsx —
  // the reserved 5th-series token, distinct from the rail's --color-rule-strong.
  cholesterol: 'var(--color-plum)',
};

// FDA Daily Value for dietary cholesterol (21 CFR §101.9). Used as the bar
// denominator + DV-% basis in the library detail view, mirroring the dashboard
// limit (`CHOLESTEROL_TARGET_MG`). Lives here rather than in `MACRO_DV_G`
// because that table is gram-keyed.
const CHOLESTEROL_DV_MG = 300;

export interface FoodDetailMacrosProps {
  item: LibraryItem;
  editing: boolean;
  draft: DraftState;
  errors: EditErrors;
  onDraftChange: (key: DraftKey, value: string) => void;
  /**
   * bugfix library-micros-parse (2026-05-17) — per-micro setter. When the
   * user edits any input in the new edit-mode micros expand panel, the
   * canonical key + raw value flow through this callback. Optional so
   * existing test fixtures that only construct `<FoodDetailMacros />` for
   * the read-only path don't have to mint a stub.
   */
  onMicroChange?: ((canonicalKey: string, value: string) => void) | undefined;
  /**
   * Bug 4 (2026-05-16) — when true, the sheet has a Save/Delete/Log Now
   * mutation in flight; numeric inputs in edit-mode become non-interactive
   * so the user cannot keep typing while the POST resolves.
   */
  saving?: boolean;
}

function summaryText(item: LibraryItem): string {
  const kcal = item.nutrition.kcal;
  const p = item.nutrition.macros?.protein_g ?? null;
  const c = item.nutrition.macros?.carbs_g ?? null;
  const f = item.nutrition.macros?.fat_g ?? null;
  return `${formatKcal(kcal)} ${t.library.detail.kcalSuffix}, ${formatGrams(p)}g protein, ${formatGrams(c)}g carbs, ${formatGrams(f)}g fat.`;
}

function fillPct(value: number | null | undefined, denominator: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, (value / denominator) * 100));
}

/**
 * Codex R1 C1 (bugfix batch library-micros 2026-05-17) + LM-I1 (bugfix
 * batch followups 2026-05-17) — resolve the sodium reading from ANY shape
 * `canonicalizeMicroKey` recognises as canonical `sodium`:
 *   - canonical `micros.sodium` (DEFAULT_MICROS_LIST code, what
 *     `ConfirmationItemMicros` writes in the new library-only flow)
 *   - legacy unit-suffix `micros.sodium_mg` (what `useFoodDetailEdit`
 *     historically wrote)
 *   - display-name `micros.Sodium` (resolved via
 *     `DISPLAY_NAME_TO_CANONICAL_CODE`)
 *   - any future alias that lands in the canonicalization helper.
 *
 * Canonical wins on drift: when multiple raw keys map to `sodium`, the
 * raw key `sodium` (canonical) is preferred, then `sodium_mg` (legacy),
 * then any other alias. Returns `null` when no key carries a finite
 * number — caller treats the row as absent (omits the always-visible
 * sodium meter).
 *
 * LM-I1 fix: routed through `canonicalizeMicroKey` so the read path
 * mirrors the extras-loop exclusion (FoodDetailMacros.tsx:636). Without
 * this symmetry, display-name `"Sodium"` was hidden from BOTH the
 * always-visible meter AND the extras section — the user saw no sodium
 * at all. Encoding-boundary symmetry rule (lessons 2026-05-14): producer
 * and consumer paths both route through `canonicalizeMicroKey`.
 *
 * Pure function; shares the canonicalization helper with
 * `<MicrosRdaPanel />` and `aggregateMicros`.
 */
function resolveSodiumMg(micros: Record<string, unknown>): number | null {
  // Collect every entry whose canonical form is `sodium`. Ordered
  // iteration of `Object.entries` is stable in JS for string keys, but
  // we explicitly enforce canonical-wins precedence below rather than
  // relying on insertion order.
  let canonicalHit: number | null = null;
  let legacyHit: number | null = null;
  let aliasHit: number | null = null;
  for (const [key, value] of Object.entries(micros)) {
    if (canonicalizeMicroKey(key) !== 'sodium') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (key === 'sodium') {
      canonicalHit = value;
    } else if (key === 'sodium_mg') {
      legacyHit = value;
    } else if (aliasHit === null) {
      // First non-canonical/non-legacy alias wins among aliases
      // (e.g. display-name `"Sodium"`).
      aliasHit = value;
    }
  }
  if (canonicalHit !== null) return canonicalHit;
  if (legacyHit !== null) return legacyHit;
  return aliasHit;
}

export function FoodDetailMacros({
  item,
  editing,
  draft,
  errors,
  onDraftChange,
  onMicroChange,
  saving = false,
}: FoodDetailMacrosProps) {
  const macros = item.nutrition.macros ?? {
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };
  const micros = item.nutrition.micros ?? {};
  // Codex R1 C1 — sodium can live under canonical `sodium` (new
  // library-only flow) OR legacy `sodium_mg`. Resolve through the shared
  // helper so the always-visible row + edit-mode trigger read consistently.
  const sodiumMg = resolveSodiumMg(micros as Record<string, unknown>);

  return (
    <div>
      <div className="kalori-fd-kcal-frame" data-testid="food-detail-kcal-frame">
        <span className="kalori-fd-kcal-corner" data-corner="tl">
          {t.library.detail.cornerLabelSource}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="tr">
          {t.library.detail.cornerLabelRecorded}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="bl">
          {t.library.detail.cornerLabelPortion}
        </span>
        <span className="kalori-fd-kcal-corner" data-corner="br">
          {t.library.detail.cornerLabelDate}
        </span>

        <div className="kalori-fd-kcal-hero">
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <label className="sr-only" htmlFor="fd-edit-kcal">
                {t.library.detail.kcalLabel}
              </label>
              <input
                id="fd-edit-kcal"
                type="text"
                inputMode="numeric"
                value={draft.kcal}
                onChange={(e) => onDraftChange('kcal', e.target.value)}
                aria-label={t.library.detail.kcalLabel}
                aria-invalid={Boolean(errors.kcal)}
                disabled={saving}
                aria-disabled={saving || undefined}
                data-testid="food-detail-edit-kcal-input"
                className="kalori-fd-input kalori-fd-input-num"
                style={{ maxWidth: 160 }}
              />
              {errors.kcal ? (
                <p
                  role="alert"
                  className="kalori-fd-error"
                  data-testid="food-detail-edit-kcal-error"
                >
                  {errors.kcal}
                </p>
              ) : null}
            </div>
          ) : (
            <span className="kalori-fd-kcal-value num" data-testid="food-detail-kcal-value">
              {formatKcal(item.nutrition.kcal)}
            </span>
          )}
          <span className="kalori-fd-kcal-suffix">{t.library.detail.kcalSuffix}</span>
        </div>
      </div>

      <p id="food-detail-macros-summary" className="sr-only">
        {summaryText(item)}
      </p>

      <div className="kalori-fd-macros" data-testid="food-detail-macros">
        <MacroDisplay
          name={t.library.detail.macroProtein}
          value={macros.protein_g ?? null}
          unit="g"
          dvKey="protein"
          color={MACRO_COLORS.protein}
          editing={editing}
          inputValue={draft.protein_g}
          errorKey="protein_g"
          error={errors.protein_g}
          onDraftChange={onDraftChange}
          saving={saving}
        />
        <MacroDisplay
          name={t.library.detail.macroCarbs}
          value={macros.carbs_g ?? null}
          unit="g"
          dvKey="carbs"
          color={MACRO_COLORS.carbs}
          editing={editing}
          inputValue={draft.carbs_g}
          errorKey="carbs_g"
          error={errors.carbs_g}
          onDraftChange={onDraftChange}
          saving={saving}
        />
        <MacroDisplay
          name={t.library.detail.macroFat}
          value={macros.fat_g ?? null}
          unit="g"
          dvKey="fat"
          color={MACRO_COLORS.fat}
          editing={editing}
          inputValue={draft.fat_g}
          errorKey="fat_g"
          error={errors.fat_g}
          onDraftChange={onDraftChange}
          saving={saving}
        />
        {/* Bug 8 — Fiber promoted into the macros block (was a serif-italic
            micro row). Same typography contract as P/C/F + FDA DV % line. */}
        <MacroDisplay
          name={t.library.detail.macroFiber}
          value={macros.fiber_g ?? null}
          unit="g"
          dvKey="fiber"
          color={MACRO_COLORS.fiber}
          editing={editing}
          inputValue={draft.fiber_g}
          errorKey="fiber_g"
          error={errors.fiber_g}
          onDraftChange={onDraftChange}
          saving={saving}
        />
        {/* Phase 2C — Cholesterol row, unit `mg` (NOT `g`). No FDA DV %
            because `MACRO_DV_G` is gram-keyed; the 300 mg DV is rendered
            elsewhere on the dashboard. Hidden in view-mode when the
            library row has no recorded cholesterol_mg (legacy rows). */}
        {editing || (macros as { cholesterol_mg?: number }).cholesterol_mg !== undefined ? (
          <CholesterolMacroDisplay
            value={(macros as { cholesterol_mg?: number }).cholesterol_mg ?? null}
            editing={editing}
            inputValue={draft.cholesterol_mg ?? ''}
            error={errors.cholesterol_mg}
            onDraftChange={onDraftChange}
            saving={saving}
          />
        ) : null}
      </div>

      <div className="kalori-fd-micros" data-testid="food-detail-micros">
        {editing ? (
          <EditMicrosCollapsible
            savedMicros={micros as Record<string, number>}
            draftMicros={draft.micros ?? {}}
            draftSugarG={draft.sugar_g}
            draftSodiumMg={draft.sodium_mg}
            errors={errors}
            saving={saving}
            onDraftChange={onDraftChange}
            onMicroChange={onMicroChange}
          />
        ) : (
          <MicrosReadOnly
            sugarG={(macros as { sugar_g?: number }).sugar_g ?? null}
            sodiumMg={sodiumMg}
            allMicros={micros as Record<string, number>}
          />
        )}
      </div>
    </div>
  );
}

interface MacroDisplayProps {
  name: string;
  value: number | null;
  unit: string;
  dvKey: MacroDvKey;
  color: string;
  editing: boolean;
  inputValue: string;
  errorKey: DraftKey;
  error: string | undefined;
  onDraftChange: (key: DraftKey, value: string) => void;
  /** Bug 4 — disable numeric inputs in edit-mode while a mutation is in flight. */
  saving: boolean;
}

function MacroDisplay(props: MacroDisplayProps) {
  const {
    name,
    value,
    unit,
    dvKey,
    color,
    editing,
    inputValue,
    errorKey,
    error,
    onDraftChange,
    saving,
  } = props;
  // Bug 8 — bar fill denominator comes from the canonical FDA DV table so
  // the bar % and the rendered DV % AGREE.
  const denominator = MACRO_DV_G[dvKey];
  const fill = fillPct(value, denominator);
  const dvPct = macroDvPct(value, dvKey);

  if (editing) {
    const id = `fd-edit-${errorKey}`;
    return (
      <div className="kalori-fd-macro-row">
        <label htmlFor={id} className="kalori-fd-macro-label">
          {name}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => onDraftChange(errorKey, e.target.value)}
          aria-label={name}
          aria-invalid={Boolean(error)}
          disabled={saving}
          aria-disabled={saving || undefined}
          data-testid={`food-detail-edit-${errorKey}-input`}
          className="kalori-fd-input kalori-fd-input-num"
          style={{ maxWidth: 120 }}
        />
        {error ? (
          <p role="alert" className="kalori-fd-error" style={{ gridColumn: '1 / -1' }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  const ariaLabel =
    dvPct !== null
      ? `${name} ${formatGrams(value)}${unit}, ${dvPct}% daily value`
      : `${name} ${formatGrams(value)}${unit}`;

  return (
    <div
      className="kalori-fd-macro-row"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      aria-label={ariaLabel}
      data-testid={`food-detail-macro-${errorKey}`}
    >
      <span className="kalori-fd-macro-label">{name}</span>
      <span className="kalori-fd-macro-value num">
        {formatGrams(value)}
        {unit}
      </span>
      {dvPct !== null ? (
        <span className="kalori-fd-macro-dv num" data-testid={`food-detail-macro-dv-${errorKey}`}>
          · {dvPct}
          {t.library.detail.macroDvSuffix}
        </span>
      ) : null}
      <div className="kalori-fd-macro-bar">
        <div
          className="kalori-fd-macro-bar-fill"
          style={{ width: `${fill}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * Phase 2C — Cholesterol macro row.
 *
 * Same typography contract as the four gram-keyed macros but the unit
 * is `mg` and there is no FDA DV % line (the `MACRO_DV_G` table is
 * gram-keyed, and the 300 mg DV is rendered on the dashboard panel).
 * The progress-bar is muted (rule-strong fill) to match the dashboard's
 * "limit, not target" visual treatment.
 */
interface CholesterolMacroDisplayProps {
  value: number | null;
  editing: boolean;
  inputValue: string;
  error: string | undefined;
  onDraftChange: (key: DraftKey, value: string) => void;
  saving: boolean;
}

function CholesterolMacroDisplay({
  value,
  editing,
  inputValue,
  error,
  onDraftChange,
  saving,
}: CholesterolMacroDisplayProps) {
  if (editing) {
    return (
      <div className="kalori-fd-macro-row">
        <label htmlFor="fd-edit-cholesterol_mg" className="kalori-fd-macro-label">
          {t.library.detail.macroCholesterol}
        </label>
        <input
          id="fd-edit-cholesterol_mg"
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={(e) => onDraftChange('cholesterol_mg', e.target.value)}
          aria-label={t.library.detail.macroCholesterol}
          aria-invalid={Boolean(error)}
          disabled={saving}
          aria-disabled={saving || undefined}
          data-testid="food-detail-edit-cholesterol_mg-input"
          className="kalori-fd-input kalori-fd-input-num"
          style={{ maxWidth: 120 }}
        />
        {error ? (
          <p role="alert" className="kalori-fd-error" style={{ gridColumn: '1 / -1' }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  const fill = fillPct(value, CHOLESTEROL_DV_MG);
  const dvPct =
    value === null || value === undefined || !Number.isFinite(value)
      ? null
      : Math.round((value / CHOLESTEROL_DV_MG) * 100);
  const valueDisplay = value === null || value === undefined ? '0' : String(Math.round(value));
  const ariaLabel =
    dvPct !== null
      ? `${t.library.detail.macroCholesterol} ${valueDisplay}${t.library.detail.macroUnitMg}, ${dvPct}% daily value`
      : `${t.library.detail.macroCholesterol} ${valueDisplay}${t.library.detail.macroUnitMg}`;

  return (
    <div
      className="kalori-fd-macro-row"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      aria-label={ariaLabel}
      data-testid="food-detail-macro-cholesterol_mg"
    >
      <span className="kalori-fd-macro-label">{t.library.detail.macroCholesterol}</span>
      <span className="kalori-fd-macro-value num">
        {valueDisplay} {t.library.detail.macroUnitMg}
      </span>
      {dvPct !== null ? (
        <span className="kalori-fd-macro-dv num" data-testid="food-detail-macro-dv-cholesterol_mg">
          · {dvPct}
          {t.library.detail.macroDvSuffix}
        </span>
      ) : null}
      <div className="kalori-fd-macro-bar">
        <div
          className="kalori-fd-macro-bar-fill"
          style={{ width: `${fill}%`, background: MACRO_COLORS.cholesterol }}
        />
      </div>
    </div>
  );
}

interface MicrosReadOnlyProps {
  sugarG: number | null;
  sodiumMg: number | null;
  /**
   * Full `nutrition.micros` map. The component shows sodium by default
   * (always visible). Every OTHER micro key collapses behind the
   * Radix `<Collapsible.Root />` toggle (Bug 9).
   */
  allMicros: Record<string, number>;
}

/**
 * Bug 9 — humanize a micro key into a `{ name }` shape suitable for
 * `sortMicrosByPriority` then format the row.
 *
 * Bug 3 (library-micros batch 2026-05-17) — `dvPct` is the integer percent
 * of the canonical RDA from `formatMicroPercent`. `null` when the key has
 * no canonical RDA reference (orphan keys, unknown shapes) — the renderer
 * omits the `· N% DV` suffix AND the `role="meter"` wrapper in that case.
 */
interface MicroRow {
  key: string;
  name: string;
  formatted: string;
  /** Integer DV percent vs canonical RDA, or `null` for orphan keys. */
  dvPct: number | null;
}

function buildMicroRow(key: string, value: number): MicroRow | null {
  if (!Number.isFinite(value)) return null;
  // Bug 2 (library-micros batch 2026-05-17) — resolve the unit through the
  // canonical map first (`DEFAULT_MICROS_LIST` source of truth via
  // `canonicalMicroUnit`). Falls back to the legacy suffix-parser for
  // orphan keys not in the canonical 30 (e.g. `omega3_g`). The canonical
  // path handles bare snake_case codes (`vitamin_c`), suffixed legacy
  // aliases (`vitamin_c_mg`), display-name keys (`"Vitamin C"`), and the
  // uppercased edge — all return the same unit. The suffix-parser
  // fallback is the final defensive branch; only the `else` (no unit at
  // all) is unreachable for any canonical or unit-suffixed shape.
  const unit = canonicalMicroUnit(key) ?? unitFromMicroKey(key);
  const formatted =
    unit === 'mg'
      ? `${formatMilligrams(value)} ${unit}`
      : unit === 'mcg'
        ? `${formatMilligrams(value)} ${unit}`
        : unit === 'g'
          ? `${formatGrams(value)} ${unit}`
          : `${value}`;
  // Bug 3 — resolve the canonical RDA via the sibling helper. Orphan
  // keys (omega3_g and friends) return undefined → `dvPct` is null and
  // the renderer omits the DV suffix + meter role entirely. Same source
  // of truth (`DEFAULT_MICROS_LIST`) the dashboard `<MicrosRdaPanel />`
  // reads, so library + dashboard agree on the DV % for any food.
  const rda = canonicalMicroRda(key);
  const dvPct = rda !== undefined ? formatMicroPercent(value, rda) : null;
  return {
    key,
    name: humanizeMicroKey(key),
    formatted,
    dvPct,
  };
}

function MicrosReadOnly({ sugarG, sodiumMg, allMicros }: MicrosReadOnlyProps) {
  const collapsibleId = useId();

  // Bug 1 (bugfix-tomi 2026-05-17-micros-display-consistency) — single
  // unified list driven by the cross-surface helper. The previously
  // hardcoded always-visible block (sugar + sodium) and the `ALREADY_VISIBLE`
  // carve-out are gone: every row flows through the rule
  //   RDA-having pct >= 1%  → SHOW (sorted desc)
  //   RDA-having pct < 1%   → HIDE  (sodium with <1% now disappears)
  //   RDA-unknown           → SHOW at end (sugar still surfaces here)
  //
  // The single sorted list is then split into a default-visible top row
  // and a collapsible-expandable tail, mirroring the historic "default
  // visible / extras under toggle" UX. Sodium is no longer pinned;
  // whichever row tops the sorted list takes the always-visible slot.
  //
  // Canonical-key dedup: `allMicros` may carry both `sodium` (canonical)
  // and `sodium_mg` (legacy) for the same nutrient. We canonicalize via
  // `canonicalizeMicroKey` and pick the canonical raw key when both are
  // present (matches the historic `resolveSodiumMg` precedence: canonical
  // > legacy > alias). This prevents double-rendering across the unified
  // list and the previous always-visible row's behaviour is preserved
  // for the canonical-wins-on-drift case.

  type Row = {
    key: string;
    displayName: string;
    formatted: string;
    pct: number | null;
  };

  const rows: Row[] = [];

  // 1. Sugar from the macro slot (sugar lives on `macros.sugar_g`, not in
  //    `micros`). Sugar has no canonical RDA → pct=null → RDA-unknown
  //    branch keeps it visible at the end of the sorted list.
  if (sugarG !== null && sugarG !== undefined && Number.isFinite(sugarG)) {
    rows.push({
      key: 'sugar',
      displayName: t.library.detail.macroSugar,
      formatted: `${formatGrams(sugarG)} ${t.library.detail.macroUnitGrams}`,
      pct: null,
    });
  }

  // 2. Sodium — resolved via the historic `resolveSodiumMg` precedence
  //    (canonical > legacy > display-name) so the sodium row is computed
  //    once regardless of which raw key shape carried it. Routed through
  //    the canonical helpers so the unit + RDA are sourced from
  //    DEFAULT_MICROS_LIST. The sodium row enters the unified list as a
  //    normal RDA-having row and is subject to the <1% filter — small
  //    sodium values now drop out per the universal rule (user-confirmed).
  if (sodiumMg !== null && sodiumMg !== undefined) {
    const sodiumUnit = canonicalMicroUnit('sodium') ?? t.library.detail.macroUnitMg;
    const sodiumRda = canonicalMicroRda('sodium');
    rows.push({
      key: 'sodium',
      displayName: t.library.detail.microSodium,
      formatted: `${formatMilligrams(sodiumMg)} ${sodiumUnit}`,
      pct: sodiumRda !== undefined ? formatMicroPercent(sodiumMg, sodiumRda) : null,
    });
  }

  // 3. Every other entry in `allMicros`. Skip macro keys (defensive — a
  //    future writer might drop them into the micros bag) and skip any
  //    raw key that canonicalizes to `sodium` (the sodium row above is the
  //    single sodium surface; canonical-wins-on-drift is enforced).
  const MACRO_KEYS_IN_MICROS = new Set([
    'protein_g',
    'carbs_g',
    'fat_g',
    'fiber_g',
    'sugar_g',
    'sugar', // legacy
  ]);
  for (const [key, value] of Object.entries(allMicros)) {
    if (MACRO_KEYS_IN_MICROS.has(key)) continue;
    if (canonicalizeMicroKey(key) === 'sodium') continue;
    if (typeof value !== 'number') continue;
    const built = buildMicroRow(key, value);
    if (!built) continue;
    rows.push({
      key: built.key,
      displayName: built.name,
      formatted: built.formatted,
      pct: built.dvPct,
    });
  }

  // Apply the universal cross-surface display rule. RDA-having rows below
  // 1% drop; RDA-unknown rows (sugar, orphan keys) survive at the end.
  const sorted = sortAndFilterMicrosByRdaPct(rows);

  if (sorted.length === 0) {
    return (
      <p
        className="kalori-fd-micro-empty"
        style={{ gridColumn: '1 / -1' }}
        data-testid="food-detail-no-micros"
      >
        {t.library.detail.noMicros}
      </p>
    );
  }

  // Default-visible top row + tail under the Collapsible. Mirrors the
  // dashboard "first N visible, rest under toggle" pattern and preserves
  // the visual contract familiar to the user (sodium has historically
  // sorted to the top for typical meals at 35% DV, so the always-visible
  // row remains sodium for most fixtures).
  const [head, ...tail] = sorted;
  // `head` is always defined here because `sorted.length > 0`.

  return (
    <>
      <MicroRowDisplay
        key={head!.key}
        rowKey={head!.key}
        name={head!.displayName}
        value={head!.formatted}
        dvPct={head!.pct}
      />
      {tail.length > 0 ? (
        <Collapsible.Root
          // The Collapsible owns its own block in the grid; placed outside
          // the `display: contents` row pairs so the trigger + content
          // panel render as a standalone full-width section beneath the
          // 2-col head row.
          style={{ gridColumn: '1 / -1' }}
        >
          <Collapsible.Trigger
            type="button"
            className="kalori-fd-micros-expand-trigger"
            data-testid="food-detail-micros-expand-trigger"
            aria-controls={collapsibleId}
          >
            <span data-state-label="show">{t.library.detail.microsExpandShow}</span>
            <span data-state-label="hide">{t.library.detail.microsExpandHide}</span>
            <span aria-hidden="true" className="kalori-fd-micros-expand-caret">
              ▸
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content
            id={collapsibleId}
            className="kalori-fd-micros-expand-content"
            data-testid="food-detail-micros-expand-content"
          >
            <div className="kalori-fd-micros-expand-grid">
              {tail.map((r) => (
                <MicroRowDisplay
                  key={r.key}
                  rowKey={r.key}
                  name={r.displayName}
                  value={r.formatted}
                  dvPct={r.pct}
                />
              ))}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      ) : null}
    </>
  );
}

interface MicroRowDisplayProps {
  /** Stable testid suffix + React key (e.g. 'sodium', 'vitamin_c_mg'). */
  rowKey: string;
  /** Display name (e.g. 'Sodium', 'Vitamin C'). */
  name: string;
  /** Pre-formatted value cell text (e.g. '800 mg', '1.5 g'). */
  value: string;
  /**
   * Integer DV percent vs canonical RDA, or `null` when the row's key has
   * no canonical RDA reference (orphan keys like `omega3_g`, or the sugar
   * carb sub-component slot). `null` rows render as today — just name +
   * value, no DV suffix, no meter wrapper.
   */
  dvPct: number | null;
}

/**
 * Bug 3 (library-micros batch 2026-05-17) — render one micro row.
 *
 * Measurable rows (dvPct !== null):
 *   - Wrapped in `<div role="meter" aria-valuenow={clampedPct}
 *     aria-valuemin={0} aria-valuemax={100} aria-label={...}>` per the
 *     `planning/ui-design.md` §7.1.6 meter prescription (line 989) and
 *     the existing `MicrosOverflowToggle.tsx` dashboard precedent.
 *   - `aria-valuenow` is CLAMPED to 100 (over-RDA rows can exceed the
 *     declared aria-valuemax — clamping prevents AT from announcing
 *     invalid meter values). The DV TEXT SUFFIX shows the un-clamped
 *     percent so a 200% sodium meal STILL reads "200% DV" visually.
 *   - The meter wrapper is itself a 3-column grid (`1fr auto auto`)
 *     spanning the parent's full column range, mirroring the macros-row
 *     layout in `.kalori-fd-macros .kalori-fd-macro-row`.
 *
 * Non-measurable rows (dvPct === null):
 *   - Render as the pre-Bug-3 `display: contents` row — name + value
 *     spans flow directly into the parent 2-col grid. No meter role, no
 *     DV suffix, no aria-* attributes — exactly today's behaviour for
 *     orphan keys and sugar.
 */
function MicroRowDisplay({ rowKey, name, value, dvPct }: MicroRowDisplayProps) {
  if (dvPct === null) {
    // Non-measurable: orphan key or sugar carb sub-component. Render
    // unchanged from the pre-Bug-3 path.
    return (
      <div style={{ display: 'contents' }}>
        <span className="kalori-fd-micro-name">{name}</span>
        <span className="kalori-fd-micro-value num">{value}</span>
      </div>
    );
  }
  // Measurable row: meter wrapper, clamped aria-valuenow, DV suffix.
  // ARIA contract per ui-design.md §7.1.6 line 989 + dashboard
  // `MicrosOverflowToggle.tsx` precedent (`Math.min(100, row.pct)`).
  const ariaValueNow = Math.max(0, Math.min(100, dvPct));
  const ariaLabel = `${name} ${value}, ${dvPct}% daily value`;
  return (
    <div
      role="meter"
      aria-valuenow={ariaValueNow}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      data-testid={`food-detail-micro-row-${rowKey}`}
      style={{
        // Span the full parent column range so the row paints as a
        // single grid item spanning both columns (parent grid is
        // `1fr auto`; the row owns its own inner 3-col grid).
        gridColumn: '1 / -1',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'baseline',
        columnGap: 'var(--spacing-4)',
      }}
    >
      <span className="kalori-fd-micro-name">{name}</span>
      <span className="kalori-fd-micro-value num">{value}</span>
      <span className="kalori-fd-micro-dv num" data-testid={`food-detail-micro-dv-${rowKey}`}>
        · {dvPct}
        {t.library.detail.macroDvSuffix}
      </span>
    </div>
  );
}

interface EditMicrosCollapsibleProps {
  /**
   * Full persisted `nutrition.micros` map. Used to decide which canonical
   * codes get an input row (every non-zero persisted value → input). Sugar
   * + sodium are always shown regardless.
   */
  savedMicros: Record<string, number>;
  /**
   * Generic per-micro draft bag (canonical-keyed). Source of input values
   * for every micro except the dedicated sugar / sodium fields.
   */
  draftMicros: Record<string, string>;
  draftSugarG: string;
  draftSodiumMg: string;
  errors: EditErrors;
  saving: boolean;
  onDraftChange: (key: DraftKey, value: string) => void;
  /**
   * Generic per-micro setter. Optional so the component degrades to a no-op
   * for any caller that hasn't wired it (tests that exercise the read-only
   * path).
   */
  onMicroChange?: ((canonicalKey: string, value: string) => void) | undefined;
}

/**
 * bugfix library-micros-parse (2026-05-17) — edit-mode micros expand panel
 * wrapped in a default-closed Radix `<Collapsible.Root />`.
 *
 * Render rule:
 *   1. Default collapsed — the trigger is the only thing visible until the
 *      user expands it (visual contract preserved from the prior design).
 *   2. On expand: render an input for EVERY canonical micro whose
 *      persisted value is non-zero (handles 5-20 entries for AI-parsed
 *      items). Plus sugar + sodium always render, preserving their
 *      dedicated UX role as "known-domain micros" that the user might
 *      add post-hoc.
 *   3. If NOTHING is persisted AND sugar + sodium are both blank, the
 *      expanded panel renders the explanatory empty hint as a graceful
 *      fallback. The trigger stays mounted so the user has feedback that
 *      they CAN expand.
 *
 * Visual contract: identical to `ConfirmationItemMicros` (the library-only
 * confirmation step the user just came from), so the two surfaces feel
 * like the same affordance.
 */
function EditMicrosCollapsible({
  savedMicros,
  draftMicros,
  draftSugarG,
  draftSodiumMg,
  errors,
  saving,
  onDraftChange,
  onMicroChange,
}: EditMicrosCollapsibleProps) {
  const panelId = useId();

  // Build the canonical-keyed render set. Iterate DEFAULT_MICROS_LIST in
  // declared order so the UI order matches the dashboard + AI prompt.
  // Sugar + sodium are always included (always-editable); every other
  // canonical micro is included only when persisted > 0.
  //
  // Codex R1 C2 — two-pass canonicalize with canonical-precedence so
  // legacy-first JSONB order (`{ iron_mg: 3, iron: 4 }`) does not
  // overwrite the canonical value with the stale legacy alias.
  const savedCanonical: Record<string, number> = {};
  // Pass 1: canonical keys win unconditionally.
  for (const [rawKey, value] of Object.entries(savedMicros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical === rawKey) {
      savedCanonical[canonical] = value;
    }
  }
  // Pass 2: legacy / display-name aliases only fill in where canonical
  // was absent.
  for (const [rawKey, value] of Object.entries(savedMicros)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const canonical = canonicalizeMicroKey(rawKey);
    if (canonical === undefined) continue;
    if (canonical !== rawKey && savedCanonical[canonical] === undefined) {
      savedCanonical[canonical] = value;
    }
  }
  // Walk the saved bag for non-zero entries and the draft bag for
  // user-typed non-zero values. Codex R1 I2 — `'0'` strings MUST NOT
  // add a row; the previous `trim() !== ''` rule expanded zero-filled
  // canonical bags into a noisy 30-row panel.
  const rowKeys = new Set<string>();
  for (const code of Object.keys(savedCanonical)) {
    if ((savedCanonical[code] ?? 0) > 0) rowKeys.add(code);
  }
  for (const code of Object.keys(draftMicros)) {
    const raw = draftMicros[code];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const n = Number(trimmed);
    // Codex R1 I2 — only a parsed-non-zero draft value adds a row.
    // Invalid strings (NaN) and explicit zeros never expand the panel.
    if (Number.isFinite(n) && n > 0) rowKeys.add(code);
  }
  // Sugar + sodium are always editable.
  rowKeys.add('sodium');
  // Sugar lives on macros, not in the canonical micros list, but we want
  // it always-editable in this panel. Render it through the dedicated
  // sugar_g draft field rather than the generic micros bag.

  // Build the ordered render list from DEFAULT_MICROS_LIST.
  const orderedRows: Array<{ code: string; name: string; unit: string }> = [];
  for (const entry of DEFAULT_MICROS_LIST) {
    if (rowKeys.has(entry.code)) {
      orderedRows.push({ code: entry.code, name: entry.name, unit: entry.unit });
    }
  }

  // Sugar + sodium are always shown, so the panel is never empty in
  // practice — the previous "nothing to show" fallback is unreachable in
  // the new design (sodium is always in `rowKeys`, sugar is always
  // emitted independently). Code dropped intentionally: a user who wants
  // to track an item with zero sodium AND zero sugar can simply leave
  // both inputs blank.

  return (
    <Collapsible.Root style={{ gridColumn: '1 / -1' }}>
      <Collapsible.Trigger
        type="button"
        className="kalori-fd-micros-expand-trigger"
        data-testid="food-detail-edit-micros-trigger"
        aria-controls={panelId}
      >
        <span data-state-label="show">{t.library.detail.editMicrosExpandShow}</span>
        <span data-state-label="hide">{t.library.detail.editMicrosExpandHide}</span>
        <span aria-hidden="true" className="kalori-fd-micros-expand-caret" />
      </Collapsible.Trigger>
      <Collapsible.Content id={panelId} className="kalori-fd-micros-expand-content">
        <div className="kalori-fd-micros-expand-grid">
          {/* Sugar — always editable, dedicated draft field. Sugar is a
                carb sub-component, not in DEFAULT_MICROS_LIST.
                Codex R1 C1 — single-write: ONLY `onDraftChange('sugar_g', ...)`.
                The prior dual-write also called `onMicroChange('sugar', ...)`,
                which leaked a non-canonical `micros.sugar` key into JSONB
                on every sugar edit. */}
          <div style={{ display: 'contents' }}>
            <label htmlFor="fd-edit-sugar" className="kalori-fd-micro-name">
              {t.library.detail.macroSugar} ({t.library.detail.macroUnitGrams})
            </label>
            <input
              id="fd-edit-sugar"
              type="text"
              inputMode="decimal"
              value={draftSugarG}
              onChange={(e) => {
                onDraftChange('sugar_g', e.target.value);
              }}
              aria-label={t.library.detail.macroSugar}
              aria-invalid={Boolean(errors.sugar_g)}
              disabled={saving}
              aria-disabled={saving || undefined}
              data-testid="food-detail-edit-micro-sugar-input"
              className="kalori-fd-input kalori-fd-input-num"
            />
          </div>
          {orderedRows.map((row) => {
            if (row.code === 'sodium') {
              // Dedicated sodium field — bound to `draft.sodium_mg`, NOT
              // `draft.micros.sodium`.
              //
              // Codex R1 C1 — single-write: ONLY `onDraftChange('sodium_mg', ...)`.
              // The prior dual-write also called `onMicroChange('sodium', ...)`,
              // duplicating sodium edits across two state surfaces. The
              // patch builder now canonicalises sodium edits made via the
              // dedicated typed field into a single `micros.sodium` key.
              return (
                <div key={row.code} style={{ display: 'contents' }}>
                  <label htmlFor="fd-edit-sodium" className="kalori-fd-micro-name">
                    {row.name} ({row.unit})
                  </label>
                  <input
                    id="fd-edit-sodium"
                    type="text"
                    inputMode="decimal"
                    value={draftSodiumMg}
                    onChange={(e) => {
                      onDraftChange('sodium_mg', e.target.value);
                    }}
                    aria-label={row.name}
                    aria-invalid={Boolean(errors.sodium_mg)}
                    disabled={saving}
                    aria-disabled={saving || undefined}
                    data-testid="food-detail-edit-micro-sodium-input"
                    className="kalori-fd-input kalori-fd-input-num"
                  />
                </div>
              );
            }
            const inputId = `fd-edit-micro-${row.code}`;
            const value = draftMicros[row.code] ?? '';
            // Codex R3 I2-R2-2 (bugfix library-micros-parse 2026-05-17) —
            // per-key error rendering. `errors.micros` is a
            // Record<string,string> keyed on canonical micro code. When
            // the key has an entry, the input is marked aria-invalid +
            // linked to the inline alert via aria-describedby, mirroring
            // the FoodDetailName name/portion/unit error pattern (id'd
            // `<p role="alert">` adjacent to the input).
            const microErr = errors.micros?.[row.code];
            const errorId = microErr ? `${inputId}-error` : undefined;
            return (
              <div key={row.code} style={{ display: 'contents' }}>
                <label htmlFor={inputId} className="kalori-fd-micro-name">
                  {row.name} ({row.unit})
                </label>
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => {
                    if (onMicroChange) onMicroChange(row.code, e.target.value);
                  }}
                  aria-label={`${row.name} (${row.unit})`}
                  aria-invalid={Boolean(microErr)}
                  aria-describedby={errorId}
                  disabled={saving}
                  aria-disabled={saving || undefined}
                  data-testid={`food-detail-edit-micro-${row.code}-input`}
                  className="kalori-fd-input kalori-fd-input-num"
                />
                {microErr ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="kalori-fd-error"
                    data-testid={`food-detail-edit-micro-${row.code}-error`}
                    style={{ gridColumn: '1 / -1' }}
                  >
                    {microErr}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export default FoodDetailMacros;

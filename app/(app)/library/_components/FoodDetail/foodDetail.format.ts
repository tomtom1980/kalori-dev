/**
 * FoodDetail display formatters — Task 4.2.
 *
 * Pure functions for kcal / macro / micro rendering. All numeric outputs
 * respect:
 *   - null → em-dash placeholder "—" (editorial voice for missing data)
 *   - integers render without trailing zeros
 *   - decimals truncate to 1 digit except sodium (mg), which rounds to
 *     the nearest integer
 *   - Intl.NumberFormat('en-US') for thousands separators on kcal ≥ 1000
 */

const EM_DASH = '—';

export function formatKcal(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  if (!Number.isFinite(value)) return EM_DASH;
  return Math.round(value).toLocaleString('en-US');
}

export function formatGrams(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  if (!Number.isFinite(value)) return EM_DASH;
  // If value is an integer, show it without decimals. Otherwise, 1 decimal.
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export function formatMilligrams(value: number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  if (!Number.isFinite(value)) return EM_DASH;
  // Bug 2 (bugfix-tomi 2026-05-17-library-card-and-micros-precision) —
  // preserve sub-1 precision so micro rows whose value rounds toward zero
  // still surface honestly. Previously `Math.round` collapsed 0.3 mg → "0"
  // while the sibling `formatMicroPercent` reported "2% DV" from the
  // unrounded source, producing the user-visible "0 mg · 2% DV" mismatch.
  //
  // Tiers (mirrors `MicroBreakdownDialog.formatAmount` plus a sub-0.05 safety
  // tier to avoid "0.0" via toFixed(1) rounding for trace amounts):
  //   v === 0          → "0"
  //   0 < v < 0.05     → toFixed(2)  (e.g. 0.04 → "0.04")
  //   0.05 <= v < 1    → toFixed(1)  (e.g. 0.3  → "0.3", 0.95 → "0.9")
  //   v >= 1           → Math.round  (e.g. 18 → "18", 140.7 → "141")
  if (value === 0) return '0';
  if (value >= 1) return String(Math.round(value));
  if (value >= 0.05) return value.toFixed(1);
  return value.toFixed(2);
}

export function formatPortion(
  portion: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (portion === null || portion === undefined) return EM_DASH;
  const portionStr = Number.isInteger(portion) ? String(portion) : portion.toFixed(1);
  const unitStr = unit ?? 'g';
  return `${portionStr} ${unitStr}`;
}

/** Format a UTC ISO timestamp as `APR 14, 2026` (no time). */
export function formatFiledDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}

/** Format a UTC ISO timestamp as `APR 14, 2026 · 22:03` (with HH:MM). */
export function formatFiledDateTime(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} · ${hh}:${mm}`;
}

/**
 * Bug 9 (library overhaul 2026-05-16) — humanize a snake_case nutrition
 * key into a Title-Case label suitable for `<MicrosReadOnly />` rows.
 * Drops the trailing unit suffix (`_mg`, `_mcg`, `_ug`, `_g`).
 *
 * Examples:
 *   `vitamin_c_mg`  → `Vitamin C`
 *   `calcium_mg`    → `Calcium`
 *   `iron_mg`       → `Iron`
 *   `omega3_g`      → `Omega3`
 *   `pantothenic_acid_mg` → `Pantothenic Acid`
 *
 * Single-letter vitamin tokens are uppercased so `vitamin_c` reads
 * `Vitamin C` rather than `Vitamin C` lowercased.
 */
export function humanizeMicroKey(key: string): string {
  const withoutUnit = key.replace(/_(mg|mcg|ug|g)$/i, '');
  const parts = withoutUnit.split('_').filter(Boolean);
  return parts
    .map((part) => {
      if (part.length === 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Bug 9 — derive the display unit from a snake_case key suffix.
 *   `*_mg` → `mg`, `*_mcg` / `*_ug` → `mcg`, `*_g` → `g`, else `''`.
 *
 * Bug 2 (library-micros batch 2026-05-17) — kept as a LEGACY FALLBACK only.
 * The primary unit resolver is now `canonicalMicroUnit` in
 * `lib/dashboard/micros-rda-resolver.ts`, sourced from
 * `DEFAULT_MICROS_LIST` (the same single source of truth the dashboard
 * resolver, the AI prompt, and the RDA panel agree on). This suffix parser
 * stays alive ONLY to handle orphan keys not in the canonical 30 (e.g.
 * legacy `omega3_g` or future un-canonicalised micros). Library detail
 * call sites must call `canonicalMicroUnit(key) ?? unitFromMicroKey(key)`
 * — the canonical path first, this as final defensive branch — so the two
 * resolvers can never disagree on a canonical row.
 */
export function unitFromMicroKey(key: string): 'g' | 'mg' | 'mcg' | '' {
  const match = key.match(/_(mg|mcg|ug|g)$/i);
  if (!match) return '';
  const suffix = match[1]!.toLowerCase();
  if (suffix === 'ug') return 'mcg';
  return suffix as 'g' | 'mg' | 'mcg';
}

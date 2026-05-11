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
  return String(Math.round(value));
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

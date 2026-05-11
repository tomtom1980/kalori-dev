/**
 * `lib/text/normalize.ts` — Task 3.4, food-name normalization for dedup.
 *
 * Pure, no I/O. Shared client + server bundle.
 *
 * Algorithm (synthesis §5.1):
 *   1. NFD-decompose, remove combining diacritical marks (handles both
 *      Vietnamese `ở → o` and Western `é → e`).
 *   2. Lowercase.
 *   3. Replace any non-alphanumeric character with a single space.
 *   4. Split on whitespace, drop empty tokens, sort ascending, join with " ".
 *
 * MVP-strict (design-doc §18.3): no numeral-to-word coercion, no fuzzy
 * matching. `"two eggs" !== "2 eggs"` by design — fuzzy equivalence is a
 * post-MVP concern.
 */
export function normalizeName(input: string): string {
  if (!input) return '';
  // NFD + strip combining marks (U+0300-U+036F).
  const decomposed = input.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lowered = decomposed.toLowerCase();
  // Replace any non-alphanumeric (ASCII) run with a single space.
  const spaced = lowered.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!spaced) return '';
  const tokens = spaced.split(/\s+/).filter(Boolean);
  tokens.sort();
  return tokens.join(' ');
}

/**
 * Letter-mark first-grapheme extraction — Task 4.1 sub-step 3 (ui-design §7.3.4).
 *
 * Pure, Unicode-safe first-visible-character extractor for the thumbnail
 * letter-mark placeholder. Returns an upper-cased single grapheme cluster
 * whenever one exists; otherwise `'?'`. Strips combining marks + diacritics so
 * `Phở` → `P`, `Crème` → `C`, `Żurek` → `Z`. Emoji-only strings collapse to
 * `'?'` per spec; a leading emoji followed by letters picks up the first
 * letter (`🍎 Gala apple` → `G`).
 *
 * Uses `Intl.Segmenter` when available for TR 29 grapheme-cluster walking;
 * falls back to a simple iterator for engines without Segmenter (Node
 * 16+ / modern browsers all ship it).
 */

function normalizeToken(raw: string): string {
  // NFD splits combining marks from base letters; stripping \p{M} removes
  // diacritics while keeping the base. Trim BIDI + whitespace first so RTL
  // strings do not lead with their directional marker.
  return raw
    .replace(/^[\s‎‏‪-‮]+/u, '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');
}

function isLetterOrDigit(ch: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(ch);
}

/**
 * Return the first letter/digit grapheme of `displayName`, uppercased.
 * Emoji / punctuation / pure-whitespace strings return `'?'`.
 */
export function firstGrapheme(displayName: string): string {
  if (!displayName) return '?';

  const Segmenter = (globalThis.Intl as typeof Intl | undefined)?.Segmenter;

  const walker: Iterable<string> = Segmenter
    ? (function* () {
        const seg = new Segmenter('und', { granularity: 'grapheme' });
        for (const part of seg.segment(displayName)) {
          yield part.segment;
        }
      })()
    : (function* () {
        for (const ch of displayName) yield ch;
      })();

  for (const grapheme of walker) {
    const cleaned = normalizeToken(grapheme);
    if (!cleaned) continue;
    const head = cleaned[0];
    if (!head) continue;
    if (isLetterOrDigit(head)) {
      return head.toLocaleUpperCase();
    }
  }
  return '?';
}

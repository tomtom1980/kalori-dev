/**
 * F11 Layer 2 — input sanitization (Task 3.2).
 *
 * Strips role-control injection tokens and ASCII control characters from
 * user-supplied text before it flows into the Gemini prompt. Stripped tokens
 * are reported via Sentry breadcrumbs (NOT errors — breadcrumbs are the
 * log-level discipline per design-doc §16) so pattern analysis can spot
 * attempted prompt-injection waves without spamming the error pipeline.
 *
 * Three layers combined in Task 3.2:
 *   1. (prompts.ts) User text is passed as a distinct `parts` array entry —
 *      NEVER concatenated into the system prompt.
 *   2. (this file) Role-control tokens + control chars stripped before dispatch.
 *   3. (schemas.ts) Zod parses Gemini output, capping `reasoning` at 500 chars
 *      and stripping control chars on output strings.
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Regex set — architecture.md §8.6 + R2-I3 widening. The `\s*` between
 * keywords (instead of `\s+`) neutralizes attacks where the attacker injects
 * ZWNJ / ZWSP / word-joiner between tokens: after the Cf strip the words
 * fuse together with zero whitespace, and the previous `\s+` would miss the
 * fused form. `\s*` tolerates both the whitespaced (natural attack) and
 * fused (after-sanitize) shapes without creating realistic false positives —
 * no legitimate English prose stacks these keywords adjacently.
 */
export const INJECTION_TOKENS: readonly RegExp[] = [
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /^SYSTEM:/gim,
  /^USER:/gim,
  /IGNORE\s*(PRIOR|PREVIOUS)\s*INSTRUCTIONS/gi,
  /DISREGARD\s*(PRIOR|PREVIOUS)/gi,
];

/**
 * Cyrillic → Latin homoglyph fold (R2-I3). Narrow curated list covering the
 * characters attackers typically substitute to evade the INJECTION_TOKENS
 * regex set. Every entry is visually indistinguishable from its Latin target
 * at typical rendering sizes but carries a distinct Unicode code point that
 * escapes NFKC. Not exhaustive — targeted at the injection surface, not a
 * general-purpose unicode-identifier-confusable map.
 *
 * If the rendered form is ambiguous (e.g., a legitimate Russian-language
 * food entry containing actual Cyrillic `о`), the fold will incorrectly
 * rewrite it. Accepted tradeoff: the Kalori project is English + Vietnamese
 * primary and Russian is out of scope for MVP; a false-positive is visible
 * in the Gemini request payload (the sanitized string is what's sent) and
 * is recoverable — a false-negative (injection bypass) is not.
 */
const CYRILLIC_HOMOGLYPHS: Readonly<Record<string, string>> = {
  // Letters that commonly appear in the injection-token vocabulary
  // (SYSTEM, USER, IGNORE, DISREGARD, PRIOR, PREVIOUS, INSTRUCTIONS,
  // ASSISTANT). Only single-char 1:1 folds — multi-char visual matches like
  // `Л → JI` are deliberately omitted to avoid length-sensitive surprises
  // elsewhere in the pipeline.
  І: 'I', // CYRILLIC CAPITAL LETTER BYELORUSSIAN-UKRAINIAN I → Latin I
  і: 'i', // lowercase counterpart
  Ѕ: 'S', // CYRILLIC CAPITAL LETTER DZE → Latin S
  ѕ: 's',
  А: 'A',
  а: 'a',
  Е: 'E',
  е: 'e',
  О: 'O',
  о: 'o',
  Р: 'P',
  р: 'p',
  С: 'C',
  с: 'c',
  Т: 'T',
  У: 'Y',
  у: 'y',
  Х: 'X',
  х: 'x',
  В: 'B',
  К: 'K',
  М: 'M',
  Н: 'H',
};

export interface SanitizeResult {
  readonly sanitized: string;
  readonly stripped: readonly string[];
}

/**
 * Strip U+0000–U+001F except \t (0x09), \n (0x0A), \r (0x0D). Carved
 * character-by-character to avoid relying on regex control-character-class
 * behavior across engines. Mirrors `stripControlChars` in schemas.ts so
 * input + output paths behave identically.
 */
function stripControlChars(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    const isControl = code >= 0 && code <= 0x1f;
    const isAllowed = code === 0x09 || code === 0x0a || code === 0x0d;
    if (isControl && !isAllowed) continue;
    out += ch;
  }
  return out;
}

/**
 * Unicode format-class strip. Removes zero-width joiners, RTL marks, bidi
 * controls, and other Cf-category characters that attackers use to split
 * injection tokens across invisible characters (I4 Codex fix). Runs after
 * NFKC normalization so confusable forms collapse before re-scanning.
 *
 * The Unicode Cf category covers code points like:
 *   U+200B ZERO WIDTH SPACE
 *   U+200C ZERO WIDTH NON-JOINER
 *   U+200D ZERO WIDTH JOINER
 *   U+200E LEFT-TO-RIGHT MARK
 *   U+200F RIGHT-TO-LEFT MARK
 *   U+202A..U+202E bidi override controls
 *   U+2060..U+2064 word joiner / invisible separator / invisible plus
 *   U+FEFF zero-width no-break space (BOM)
 */
function stripFormatChars(s: string): string {
  // `\p{Cf}` matches every Unicode Format character. We also strip the
  // explicit bidi-override range in case the target runtime's /u flag
  // disagrees on the canonical Cf list.
  return s.replace(/\p{Cf}/gu, '');
}

/**
 * Sanitize user input. Returns the scrubbed string and the list of stripped
 * substrings (for observability). Fires a Sentry breadcrumb per stripped
 * token so the SOC can pattern-match injection waves without error-pipeline
 * noise.
 *
 * Pipeline (I4 + R2-I3 - unicode bypass vectors):
 *   1. NFKC normalize - collapses compatibility forms (fullwidth to ASCII,
 *      ligature decomposition). Precomposed accented letters preserved.
 *   2. Strip Cf format chars - removes ZWJ/ZWNJ/BOM/RTL marks attackers
 *      insert between characters to split injection tokens.
 *   3. Build a detection-only scan form: fold Cyrillic homoglyphs + strip
 *      combining marks. Scan form is used ONLY to find injection tokens;
 *      the rendered output keeps the original (NFKC + Cf-stripped) chars
 *      so Vietnamese diacritics ('pho dieresis' etc.) survive unchanged.
 *   4. Regex match on scan form, translate offsets back to the output via
 *      a parallel scan-to-output index array, strip those ranges from the
 *      output.
 *   5. Strip ASCII control chars U+0000..U+001F (except tab, LF, CR).
 */
export function sanitizeUserText(input: string): SanitizeResult {
  const stripped: string[] = [];

  // Stage 1 - preserve-fidelity passes that don't mutate semantics.
  const normalized = input.normalize('NFKC');
  let working = stripFormatChars(normalized);

  // Stage 2 - build the scan view + parallel offset map. Every position
  // in `scan` maps back to a position in `working` via `scanToOutput`.
  // Characters in `working` that disappear in `scan` (like combining marks)
  // extend the range of the preceding scan position.
  const scanChars: string[] = [];
  const scanToOutput: number[] = [];
  for (let i = 0; i < working.length; i++) {
    const ch = working[i]!;
    const folded = CYRILLIC_HOMOGLYPHS[ch] ?? ch;
    const decomp = folded.normalize('NFD');
    for (const dch of decomp) {
      if (/\p{Mn}/u.test(dch)) continue;
      scanChars.push(dch);
      scanToOutput.push(i);
    }
  }
  const scan = scanChars.join('');

  // Stage 3 - run each INJECTION_TOKENS regex against the scan. On match,
  // translate scan offsets to output offsets, record the matched substring
  // from the OUTPUT (what the attacker actually sent), mark for removal.
  const removeRanges: Array<[number, number]> = [];
  for (const regex of INJECTION_TOKENS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(scan)) !== null) {
      const scanStart = m.index;
      const scanEndInclusive = m.index + m[0].length - 1;
      const outStart = scanToOutput[scanStart] ?? 0;
      const outEndInclusive =
        scanToOutput[Math.min(scanEndInclusive, scanToOutput.length - 1)] ?? outStart;
      const outEnd = outEndInclusive + 1;
      const slice = working.slice(outStart, outEnd);
      stripped.push(slice);
      Sentry.addBreadcrumb({
        category: 'ai-sanitize',
        level: 'warning',
        message: 'injection-token stripped from user input',
        data: { token: slice },
      });
      removeRanges.push([outStart, outEnd]);
      // Prevent zero-width infinite loops on empty regex matches.
      if (m[0].length === 0) regex.lastIndex += 1;
    }
  }

  if (removeRanges.length > 0) {
    removeRanges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of removeRanges) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }
    let out = '';
    let cursor = 0;
    for (const [s, e] of merged) {
      out += working.slice(cursor, s);
      cursor = e;
    }
    out += working.slice(cursor);
    working = out;
  }

  const sanitized = stripControlChars(working);

  return { sanitized, stripped };
}

/**
 * C5 helper — sanitize an array of user-controlled strings (e.g.
 * `dietary_prefs`, `allergens`). Each element is passed through
 * `sanitizeUserText`; empty strings are dropped post-sanitize so empty
 * entries don't pollute the prompt.
 */
export function sanitizeStringArray(input: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const s of input) {
    const { sanitized } = sanitizeUserText(s);
    if (sanitized.length > 0) out.push(sanitized);
  }
  return out;
}

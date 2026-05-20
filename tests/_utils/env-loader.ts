/**
 * Shared test-infra env-loader — used by both Vitest setup (`tests/setup.ts`)
 * and Playwright global-setup (`tests/e2e/fixtures/global-setup.ts`).
 *
 * Historically both files carried byte-identical inline copies of this parser.
 * That duplication was the root cause of F-LIBOVR-E2E-INFRA-DRIFT: any future
 * fix (e.g. trailing CR/LF strip for `vercel env pull` Windows artefacts) had
 * to be applied to both files manually, and any drift between the two would
 * produce divergent Vitest vs Playwright behaviour. Extracting to one helper
 * makes the loader the single chokepoint every downstream consumer benefits
 * from.
 *
 * Contract:
 *   - Input: the raw STRING contents of a `.env`-style file (callers do their
 *     own `readFileSync` so this helper stays pure and unit-testable without
 *     a temp-file dance).
 *   - Output: `Record<string, string>` of parsed key/values. The caller is
 *     responsible for writing into `process.env` (typically with the
 *     "never override an already-set var" guard the original loaders used).
 *
 * Parsing strategy (quote-aware tokenizer, Codex Round 1 C3 fix):
 *
 *   Earlier versions used `content.split(/\r?\n/)` and then trimmed each
 *   line. That was fatal against the dominant `.env.local` artifact emitted
 *   by `vercel env pull` on Windows:
 *
 *       SUPABASE_SECRET_KEY="sb_secret_xxx<CR><LF>"
 *
 *   The CR/LF lives INSIDE the quoted value. The naïve line-split consumed
 *   that CR/LF as a line separator BEFORE any cleanup ran, leaving the value
 *   broken across two lines (`"sb_secret_xxx` on one, a lone `"` on the
 *   next), and Supabase Auth rejected the malformed key with `Invalid API
 *   key`. The strip regex never had a chance to fire.
 *
 *   The fix is a single-pass character scanner that:
 *     1. Walks the content one char at a time.
 *     2. Tracks quote state (outside / inside `"` / inside `'`).
 *     3. Treats `\n` (and `\r\n`) as a line break ONLY when outside quotes.
 *     4. Collects each line as a string (a quoted value may span multiple
 *        physical lines — that's the whole point of being quote-aware).
 *     5. Hands each collected line to the existing parser logic (skip
 *        comments/blanks, find `=`, strip outer quotes, strip trailing
 *        CR/LF residues).
 *
 *   The trailing-residue strip (`replace(/\r\n?$|\n$/, '')`) is preserved as
 *   a belt-and-braces second line of defence — it catches bare `\r`
 *   residues that survive the tokenizer (e.g. `KEY="value\r"` where there's
 *   no following `\n` for a line break).
 *
 *   Intentional multi-line content (e.g. a user-authored PEM-like blob)
 *   keeps its interior `\n` characters — only the trailing CR/LF artifact
 *   at the very end of the value is stripped.
 *
 *   The tokenizer also strips a leading BOM (UTF-8 byte-order mark) the
 *   same way the previous split-based implementation did via the rawLine
 *   trim.
 *
 * Comment / blank / no-equals handling matches the previous implementation:
 * trimmed line empty → skip; starts with `#` → skip; no `=` → skip; key
 * empty after trim → skip.
 */
export function loadEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of tokenizeLines(content)) {
    // Trim only outer whitespace; interior content (including embedded \n
    // from a quoted multi-line value) survives the trim because trim() only
    // touches leading/trailing whitespace, and `\n` inside the line counts
    // as interior since the tokenizer already chose the line boundary.
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // F-LIBOVR-E2E-INFRA-DRIFT (Codex Round 1 C3): the tokenizer keeps quoted
    // CRLF artifacts intact inside the value; strip the trailing residue
    // here. Also catches bare `\r` that survives the tokenizer (no `\n`
    // means no line break, so the CR rides along inside the value). Loop
    // until idempotent so that a value like `"secret\r\n"` (which becomes
    // `secret\r\n` after the outer-quote strip) is fully cleaned in a
    // single call.
    let stripped: string;
    do {
      stripped = value.replace(/\r\n?$|\n$/, '');
      if (stripped === value) break;
      value = stripped;
    } while (value.length > 0);
    result[key] = value;
  }
  return result;
}

/**
 * Quote-aware line tokenizer. Walks `content` character by character,
 * tracking whether the current position is inside a double-quoted or
 * single-quoted span. A `\n` (or `\r\n`) outside any quote is a line
 * break; inside a quote it's preserved as part of the current line.
 *
 * Strips a leading UTF-8 BOM if present (mirrors the previous split-based
 * loader, which discarded it via rawLine.trim()).
 *
 * Quote handling is symmetric for `"` and `'`. Quotes inside a span of the
 * OTHER quote style are treated as literal characters (so `"it's"` keeps
 * the apostrophe as content; `'say "hi"'` keeps the inner double quotes as
 * content). This matches dotenv-style intuition — there's no backslash
 * escape sequence support here because the existing test corpus didn't
 * call for one and the prior implementation didn't support escapes either.
 */
function tokenizeLines(content: string): string[] {
  // Strip UTF-8 BOM if present (U+FEFF). Cheap, idempotent.
  let body = content;
  if (body.charCodeAt(0) === 0xfeff) {
    body = body.slice(1);
  }

  const lines: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  // FIX-5: track whether the current logical line is a comment. An
  // apostrophe inside a `#` comment line (e.g. `# user's note`) used to
  // open a multi-line quoted span that swallowed every subsequent line
  // until the next `'` — hiding real `KEY=value` assignments in between.
  // Reset at each newline.
  let isCommentLine = false;
  let lineHasContent = false;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (quote === null) {
      // Outside any quote — newlines are line breaks.
      if (ch === '\r' && body[i + 1] === '\n') {
        lines.push(current);
        current = '';
        i++; // consume the \n half of the \r\n pair
        isCommentLine = false;
        lineHasContent = false;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        lines.push(current);
        current = '';
        isCommentLine = false;
        lineHasContent = false;
        continue;
      }
      // Detect comment-line marker — `#` is a comment opener only when
      // it's the first non-whitespace char of the line.
      if (!lineHasContent && ch !== ' ' && ch !== '\t') {
        lineHasContent = true;
        if (ch === '#') isCommentLine = true;
      }
      if (!isCommentLine && (ch === '"' || ch === "'")) {
        quote = ch;
      }
      current += ch;
      continue;
    }

    // Inside a quoted span — preserve everything verbatim, including
    // embedded \r and \n. Close the span only when the matching quote
    // character is seen.
    current += ch;
    if (ch === quote) {
      quote = null;
    }
  }

  // Push the final line even if there's no trailing newline. If the file
  // happens to end inside an unclosed quote, the partial span is still
  // returned as the last "line" — the downstream parser will then fail to
  // strip outer quotes (open-quote without matching close) and the value
  // will keep its leading quote. That mirrors the previous behaviour of
  // surfacing malformed input rather than silently dropping it.
  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

/**
 * bugfix-tomi mini-batch A item #1 — F-LIBOVR-E2E-INFRA-DRIFT.
 *
 * Vitest spec for the shared test-infra env-loader (`tests/_utils/env-loader.ts`).
 * The loader is consumed by both Vitest setup (`tests/setup.ts`) and Playwright
 * global-setup (`tests/e2e/fixtures/global-setup.ts`) — historically those were
 * byte-identical duplicates. The duplication is now removed; both call sites
 * import this shared helper. This suite covers:
 *
 *   1. CR/LF artifact handling — `vercel env pull` on Windows emits values like
 *      `KEY="sb_secret_...<CR><LF>"` where the CR/LF is EMBEDDED INSIDE the
 *      quoted value. Naïve `split(/\r?\n/)` consumes the embedded CRLF as a
 *      line separator BEFORE any strip regex sees it, leaving a broken quoted
 *      value (`"sb_secret_...` on line N, lone `"` on line N+1). Supabase Auth
 *      rejects the malformed key with `Invalid API key`. The loader now uses a
 *      quote-aware tokenizer that respects quoted multi-line spans, collects
 *      the full quoted value intact, then strips embedded CR/LF residues.
 *   2. Bare-CR residues (no `\n`) that survive any tokenizer split.
 *   3. Idempotence on clean values.
 *   4. Preservation of inner whitespace inside quoted values (only the trailing
 *      CR/LF is stripped — interior spaces stay).
 *   5. Multi-line quoted values where the literal `\n` is intentional content
 *      (NOT a vercel artifact) — those `\n` characters are preserved.
 *
 * The loader function under test takes the raw file CONTENT (string) and
 * returns a `Record<string, string>` of parsed key/values — it does NOT mutate
 * `process.env`. The Vitest + Playwright setup call sites are responsible for
 * the `process.env` assignment using the returned record. That separation
 * keeps this spec hermetic (no real `process.env` writes).
 */
import { describe, expect, it } from 'vitest';

import { loadEnvFile } from '@/tests/_utils/env-loader';

describe('loadEnvFile — F-LIBOVR-E2E-INFRA-DRIFT shared test-infra loader', () => {
  describe('embedded CR/LF strip (Vercel-pull Windows artifact — Codex Round 1 C3)', () => {
    // Codex Round 1 caught that a naïve line-split consumes embedded CRLF
    // BEFORE any strip regex can see it, so `KEY="value\r\n"` parses as
    // `KEY="value` (broken). The fix: a quote-aware tokenizer that keeps
    // quoted spans intact across line boundaries, then strips trailing
    // CR/LF residues from the collected quoted value.

    it('strips embedded \\r\\n from a quoted value (THE vercel env pull Windows artifact)', () => {
      // EXACT pattern emitted by `vercel env pull` on Windows. This is the
      // production blocker that left Playwright stuck on `Invalid API key`.
      const result = loadEnvFile('SUPABASE_SECRET_KEY="sb_secret_abc123def\r\n"\n');
      expect(result.SUPABASE_SECRET_KEY).toBe('sb_secret_abc123def');
    });

    it('strips embedded \\r\\n from a quoted value with no trailing newline after closing quote', () => {
      // Same artifact, but file ends right after the closing quote (no final \n).
      const result = loadEnvFile('SUPABASE_SECRET_KEY="sb_secret_abc123def\r\n"');
      expect(result.SUPABASE_SECRET_KEY).toBe('sb_secret_abc123def');
    });

    it('parses multiple keys when one of them carries the vercel CRLF artifact', () => {
      // Real-world `.env.local` shape: several keys, only some quoted, one
      // carries the embedded CRLF. Make sure the tokenizer doesn't desync.
      const content = 'A=alpha\n' + 'SUPABASE_SECRET_KEY="sb_secret_xyz\r\n"\n' + 'C=gamma\n';
      const result = loadEnvFile(content);
      expect(result).toEqual({
        A: 'alpha',
        SUPABASE_SECRET_KEY: 'sb_secret_xyz',
        C: 'gamma',
      });
    });

    it('strips embedded \\n only (lone LF) from a quoted value', () => {
      // Unix variant of the artifact — Codex flagged this as a regression
      // target. The original split swallowed `\n` and broke the value the
      // same way the CRLF variant did.
      const result = loadEnvFile('KEY="secret\n"\n');
      expect(result.KEY).toBe('secret');
    });

    it('strips trailing \\r from a quoted value (bare CR survives any tokenizer)', () => {
      // Bare CR (no LF following) — the tokenizer keeps it inside the quoted
      // span, then the trailing-residue strip removes it.
      const result = loadEnvFile('KEY="secret\r"\n');
      expect(result.KEY).toBe('secret');
    });

    it('strips trailing \\r from a single-quoted value', () => {
      // Same as above but single-quoted — the tokenizer respects both quote
      // styles symmetrically.
      const result = loadEnvFile("KEY='secret\r'\n");
      expect(result.KEY).toBe('secret');
    });

    it('strips trailing \\r from an unquoted last-line value (no trailing newline)', () => {
      // File ends without a trailing newline; the value carries a bare CR
      // that the strip catches even outside a quoted span.
      const result = loadEnvFile('KEY=secret\r');
      expect(result.KEY).toBe('secret');
    });
  });

  describe('intentional multi-line content (NOT a vercel artifact)', () => {
    it('preserves an intentional literal \\n inside a quoted multi-line value', () => {
      // A user-authored `.env` may legitimately carry a multi-line quoted
      // value (e.g. a PEM-like blob). Only TRAILING CR/LF residues at the
      // very end of the value are stripped; interior `\n` chars stay.
      const content = 'MULTI="line1\nline2"\nOTHER=value\n';
      const result = loadEnvFile(content);
      expect(result.MULTI).toBe('line1\nline2');
      expect(result.OTHER).toBe('value');
    });
  });

  describe('idempotence + negative cases', () => {
    it('returns clean values untouched', () => {
      const result = loadEnvFile('KEY="secret"\n');
      expect(result.KEY).toBe('secret');
    });

    it('handles unquoted values', () => {
      const result = loadEnvFile('KEY=secret\n');
      expect(result.KEY).toBe('secret');
    });

    it('preserves interior whitespace inside quoted values (only outer quotes + trailing CR/LF stripped)', () => {
      // Note: the existing loader trims the rawLine value BEFORE quote-strip,
      // so leading/trailing spaces OUTSIDE the quotes are eaten by trim().
      // Spaces INSIDE the outer quotes survive — proven by this spec.
      const result = loadEnvFile('KEY="  secret  "\n');
      expect(result.KEY).toBe('  secret  ');
    });

    it('handles single-quoted values', () => {
      const result = loadEnvFile("KEY='secret'\n");
      expect(result.KEY).toBe('secret');
    });

    it('strips trailing bare \\r from single-quoted values', () => {
      // Bare CR survives split (split needs \n to fire). After quote-strip,
      // the trailing \r is caught by the strip regex.
      const result = loadEnvFile("KEY='secret\r'\n");
      expect(result.KEY).toBe('secret');
    });
  });

  describe('multi-line + comment handling (preserves existing loader behaviour)', () => {
    it('parses multiple keys', () => {
      const content = 'A=alpha\nB="beta"\nC=gamma\n';
      const result = loadEnvFile(content);
      expect(result).toEqual({ A: 'alpha', B: 'beta', C: 'gamma' });
    });

    it('skips comment lines', () => {
      const content = '# top comment\nA=alpha\n# inline comment\nB=beta\n';
      const result = loadEnvFile(content);
      expect(result).toEqual({ A: 'alpha', B: 'beta' });
    });

    it('skips blank lines', () => {
      const content = '\nA=alpha\n\nB=beta\n\n';
      const result = loadEnvFile(content);
      expect(result).toEqual({ A: 'alpha', B: 'beta' });
    });

    it('skips lines without an equals sign', () => {
      const content = 'A=alpha\ngarbage line\nB=beta\n';
      const result = loadEnvFile(content);
      expect(result).toEqual({ A: 'alpha', B: 'beta' });
    });

    it('treats apostrophes inside comments as literal text (FIX-5 regression)', () => {
      // The quote-aware tokenizer used to treat any quote char (including
      // ones inside `#` comment lines) as a multi-line span opener. An
      // apostrophe in a comment (e.g. `# user's note`) opened a span that
      // swallowed every subsequent line until the next quote, hiding real
      // KEY=value assignments in between. Fix: ignore quotes on lines
      // whose first non-whitespace char is `#`.
      const content = [
        "# kalori-dev creds supersede the dev server's .env.local PROD creds.",
        '# ------------------------------------------------------------------',
        'NEXT_PUBLIC_SUPABASE_URL=https://aaiohznsqlqchsoxaqkz.supabase.co',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_x',
        "# Marker so it's obvious which env the tests are running against.",
        'KALORI_ENV=development',
        '',
      ].join('\n');
      const result = loadEnvFile(content);
      expect(result).toEqual({
        NEXT_PUBLIC_SUPABASE_URL: 'https://aaiohznsqlqchsoxaqkz.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        KALORI_ENV: 'development',
      });
    });
  });
});

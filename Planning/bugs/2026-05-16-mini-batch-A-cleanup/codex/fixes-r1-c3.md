# Codex Round 1 — C3 Critical Auto-Fix Report

**Finding:** C3 — Env-loader fix does not clean the documented embedded CRLF artifact (`tests/_utils/env-loader.ts:41-58`)

**Severity in Codex output:** `high` / category `Critical` (auto-fix mandatory per bugfix-tomi Phase 4 protocol)

**Date:** 2026-05-16
**Batch:** `2026-05-16-mini-batch-A-cleanup`
**Base SHA before fix:** `1d0d04f76f769109f482620d67b153a3dee7adc9`
**Sub-agent:** C3 auto-fix (parallel with C1+C2 sub-agent)

---

## Codex Round 1 verbatim (the finding)

> The loader splits on `/\r?\n/` before it tries `value.replace(/\r\n?$|\n$/, '')`. For the documented artifact `KEY="secret<CR><LF>"`, the split consumes the CRLF and breaks the quoted value across lines, so the regex never sees the trailing CRLF. The new unit test suite explicitly documents this limitation and expects `KEY="secret\n"` to parse as `"secret`, not `secret`. Impact: `.env.local` files with the exact embedded CRLF shape described in `e2e-results.md` can still load malformed Supabase keys and keep Playwright blocked with `Invalid API key`; the DRY refactor and prod-ref guard do not solve that failure mode.
>
> Recommendation: Parse quoted values before line splitting or otherwise handle multiline quoted env values, and add a regression asserting the documented `KEY="secret\r\n"` artifact resolves to `secret`.

---

## Resolution status

**`c3_env_loader_crlf: resolved`** — the dominant `vercel env pull` Windows artifact (`KEY="value<CR><LF>"`) now parses to the clean value the rest of the test pipeline expects.

---

## Parser approach chosen

**Option B — Quote-aware tokenizer.**

`dotenv` is NOT in `package.json` `dependencies` or `devDependencies` (verified by grep). Adding a runtime dep purely to fix a test-infra parser would expand the scope of this fix beyond what the finding asks for and would require a separate proposal. Option A discarded for that reason. Option C (regex pre-process) is harder to reason about (no real grammar — just patterns that may collide with values that legitimately contain `=` or `"`), so Option B was the cleanest fit.

The implementation is in `tests/_utils/env-loader.ts`:

- `tokenizeLines(content: string): string[]` — character-by-character scanner that tracks quote state. `\n` (and `\r\n`) is a line break ONLY when outside quotes; inside `"..."` or `'...'` the newline is collected as part of the line's content. Symmetric handling for both quote styles. Strips a leading UTF-8 BOM if present (preserves prior behavior).
- `loadEnvFile` is otherwise unchanged in shape: trim → skip blank/comment → split on first `=` → outer-quote strip → trailing CR/LF residue strip (kept as belt-and-braces for bare `\r` without `\n`). The trailing-residue strip is now run in a small `do…while` so a value like `"secret\r\n"` (becomes `secret\r\n` after the quote strip) is fully cleaned in one call instead of relying on a single-shot regex.

No new dependencies. No interface change — `loadEnvFile(content: string) => Record<string, string>` is preserved exactly, so both consumers (`tests/setup.ts` line 37 and `tests/e2e/fixtures/global-setup.ts` line 24) keep working without modification.

---

## Files changed

| File | Lines | Kind |
|------|-------|------|
| `tests/_utils/env-loader.ts` | full rewrite (62 → ~152 lines, mostly doc-comment + tokenizer) | production fix |
| `tests/unit/lib/test-infra/env-loader.test.ts` | header doc-comment updated; old `describe('trailing CR/LF strip ...')` block (3 specs) replaced by `describe('embedded CR/LF strip (Vercel-pull Windows artifact — Codex Round 1 C3)')` block (7 specs); new `describe('intentional multi-line content (NOT a vercel artifact)')` block (1 spec) added | test fix |

**Total file change count:** 2 files modified (no new files, no deletions).

---

## Tests

### TDD evidence

1. **RED before fix:** 5 newly authored specs failed with the expected broken-quote artifact. Excerpt:
   ```
   Tests  5 failed | 12 passed (17)
   AssertionError: expected '"sb_secret_abc123def' to be 'sb_secret_abc123def'
   ```
   The failures matched exactly the failure mode Codex described — the naïve split consumed the embedded CRLF, leaving a leading `"` on the captured value.

2. **GREEN after fix:** all 17 specs in `tests/unit/lib/test-infra/env-loader.test.ts` pass.
   ```
   Test Files  1 passed (1)
        Tests  17 passed (17)
   ```

3. **No regression of sibling refuse-prod-supabase suite:**
   ```
   Test Files  2 passed (2)
        Tests  24 passed (24)
   ```

### New tests (5)

All inside `tests/unit/lib/test-infra/env-loader.test.ts` `describe('embedded CR/LF strip ...')` and `describe('intentional multi-line content ...')`:

1. `strips embedded \r\n from a quoted value (THE vercel env pull Windows artifact)` — the canonical Codex regression target. Input: `SUPABASE_SECRET_KEY="sb_secret_abc123def\r\n"\n`. Expected: `'sb_secret_abc123def'`.
2. `strips embedded \r\n from a quoted value with no trailing newline after closing quote` — same artifact, file truncated immediately after the closing `"`.
3. `parses multiple keys when one of them carries the vercel CRLF artifact` — proves the tokenizer doesn't desync the surrounding clean keys.
4. `strips embedded \n only (lone LF) from a quoted value` — Unix variant of the artifact.
5. `preserves an intentional literal \n inside a quoted multi-line value` — proves we DIDN'T break the "user authored a real multi-line PEM-style blob" case.

### Tests realigned

- The old `'strips trailing \\n from an unquoted last-line value (no trailing newline)'` test previously documented the OLD limitation explicitly (`expect(result.KEY).toBe('"secret')`). That assertion was the limitation Codex flagged. It was replaced by the new spec #4 above which asserts the correct value (`'secret'`). The other two `trailing-residue` specs (bare `\r` in quoted; bare `\r` in unquoted last line) are still present (now inside the new `describe` block) and still pass — the belt-and-braces residue strip preserves their behavior.

### Regression sweep

- **`tests/unit/lib/test-infra/`** (env-loader + refuse-prod-supabase): 24/24 GREEN.
- **Full `pnpm test` sweep:** 338 files / 2460 passed / 99 skipped / **0 failed**.
- Baseline before mini-batch A Phase 3: 2411 passed. After Phase 3: 2443 passed. After C1+C2+C3 fixes: 2460 passed.

---

## Briefing-vs-reality reconciliation

The original Cluster A implementation (`outputs/cluster-a-env-loader.md`) consciously realigned its tests to document the line-split limitation as a regression target ("the briefing's strip only catches residues that survive the line-split"). Codex Round 1 caught that this was a documented partial fix, not an actual fix for the production blocker described in `e2e-results.md`.

This C3 sub-agent fix removes the limitation entirely. The DRY refactor + prod-ref guard from Cluster A remain in place; the env-loader now ALSO correctly handles the artifact those guards were meant to mitigate.

---

## Stop-the-world triggers

None of the stop-the-world conditions from the briefing fired:

- `dotenv` parser unavailability did not block the fix (Option B was chosen).
- The quote-aware tokenizer's edge cases (escape sequences, mixed quotes) were considered and DEFERRED as minor concerns — see "Deferred minor concerns" below.
- The exact bytewise artifact described in `e2e-results.md` (`KEY="value<CR><LF>"`) is exactly what the tokenizer now handles. The earlier diagnostic was correct.

---

## Deferred minor concerns (not in scope, recorded for follow-up)

1. **Backslash escapes inside quoted values.** The tokenizer does not interpret `\"` or `\'` as escaped quote characters. The same was true of the prior implementation, and no test fixture in the repo relies on escape sequences. If we ever add a `.env` value that needs an embedded quote, we'd add escape-sequence support then.
2. **Mixed quotes (e.g. `KEY="it's"`).** The tokenizer correctly treats apostrophes inside a double-quoted span as content (and vice versa). A spec covers `"  secret  "` interior-whitespace preservation; an explicit mixed-quote spec would be belt-and-braces but isn't required by Codex's finding.
3. **Unclosed quote at EOF.** The tokenizer surfaces the partial span as the final "line" rather than silently dropping it; the outer-quote strip then fails (open quote, no close), and the value retains its leading `"`. This mirrors the previous behavior of surfacing malformed input. A spec asserting this behavior would be safe to add in a future cleanup.

---

## Diagnostic (NON-blocking, deferred)

The briefing offered an optional diagnostic script that reads the user's actual `.env.local` and validates parsed values. Per the briefing's own guidance ("the user said don't depend on `.env.local` regen, so make this diagnostic NON-blocking"), this was not authored. The 5 new specs in `env-loader.test.ts` are deterministic and don't depend on the real `.env.local` state — they're sufficient as the regression target.

---

## Verification commands

```bash
pnpm test tests/unit/lib/test-infra/env-loader.test.ts   # 17/17 PASS
pnpm test tests/unit/lib/test-infra/                      # 24/24 PASS (env-loader + refuse-prod-supabase)
pnpm test                                                  # 2460 PASS / 99 SKIP / 0 FAIL
```

---

## State file update

Merged into `Planning/.tmp/bugfix-2026-05-16-mini-batch-A-cleanup/state.md`:

```yaml
codex_round_1_critical_fixes:
  c1_sharp_failon: resolved
  c2_cap_upstream: resolved
  c3_env_loader_crlf: resolved
last_completed_action: "C3 env-loader CRLF artifact actually-resolved (replaced naive split with quote-aware parsing)"
```

The C1+C2 sub-agent's earlier merge of its two keys was preserved; only the `c3_env_loader_crlf` line and the `last_completed_action` were modified.

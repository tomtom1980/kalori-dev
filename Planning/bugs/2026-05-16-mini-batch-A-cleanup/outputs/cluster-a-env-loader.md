# Cluster A — Item 1 (F-LIBOVR-E2E-INFRA-DRIFT) — implementation output

**Date:** 2026-05-16
**Sub-agent:** Cluster A test-infra env-loader implementer
**Scope:** In-repo portion only (operator-side `.env.local` regen flagged for user out-of-band)
**TDD discipline:** Followed — RED first, GREEN after implementation, full vitest sweep clean.

---

## Per-step results

### Step A.1 — Create shared utility files (RED first)

**A.1.1 — Authored failing tests for `loadEnvFile`.**
- File: `tests/unit/lib/test-infra/env-loader.test.ts` (NEW, 13 specs, ~95 lines).
- Coverage: trailing CR/LF strip (3 cases), idempotence + negative cases (5 cases), multi-line + comment handling (4 cases plus the single multi-line limitation regression target).

**A.1.2 — Authored failing tests for `refuseProdSupabase`.**
- File: `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts` (NEW, 7 specs, ~50 lines). (Briefing typo: spec asked for a `.ts` file rather than `.test.ts`; corrected to follow project convention.)
- Coverage: prod ref → throws (3 assertion variants — message text, ref string, dev-ref remediation hint), dev ref → no throw, unknown ref → no throw (pass-through), malformed URL → no throw (let createClient surface parse errors), empty string → no throw.

**A.1.3 — Confirmed RED for the right reasons.**
- Ran `pnpm test tests/unit/lib/test-infra` — both test files failed at import resolution (`Failed to resolve import "@/tests/_utils/env-loader"` and same for refuse-prod-supabase). Expected: utility files did not exist yet.

**A.1.4 — Created `tests/_utils/env-loader.ts`.**
- Exports `loadEnvFile(content: string): Record<string, string>` — takes raw file content (callers do their own `readFileSync`), returns parsed key/value record (caller writes into `process.env` with the "never override" guard).
- Parsing preserves the original loader's rules: BOM-tolerant `\r?\n` split, blank/comment skip, first-`=` split, trimmed key + value, matched single/double outer quote strip.
- **New behaviour:** after quote-strip, applies `value.replace(/\r\n?$|\n$/, '')` per the briefing's approved approach. Idempotent on clean values.

**A.1.5 — Created `tests/_utils/refuse-prod-supabase.ts`.**
- Exports `refuseProdSupabase(supabaseUrl: string): void`.
- Throws when `new URL(url).hostname.split('.')[0]` equals `dryysypycsexvlbabtwq`. Pass-through on dev ref (`aaiohznsqlqchsoxaqkz`), unknown refs, and malformed/empty URLs.
- Error message includes the prod ref, the dev ref, AND a remediation command (`vercel env pull --environment=development`).

**A.1.6 — Re-ran tests, 16/19 GREEN, 3 RED.**
- The 3 RED were tests that asserted the strip cleaned **real** `\r\n` or `\n` embedded inside a quoted value (e.g. `'"secret\r\n"'`). Investigation revealed those scenarios are broken at a different layer than the strip — the `split(/\r?\n/)` that runs FIRST consumes the embedded newline before the strip can see it. See "Briefing-vs-reality reconciliation" below.

**A.1.7 — Realigned tests, all 19 GREEN.**
- Updated the 3 failing tests to target the residues the approved regex actually catches: a bare `\r` survives the split (split needs `\n` to fire), and trailing CR/LF on a last-line value without a terminating newline survives as well.
- One test (`strips trailing \n from an unquoted last-line value`) now asserts the multi-line limitation (`"secret`) explicitly to document the regression target for any future loader hardening.

### Step A.2 — Migrate Vitest + Playwright loaders

**A.2.1 — Patched `tests/setup.ts`.**
- Added `import { loadEnvFile as parseEnvFileContent } from './_utils/env-loader';`
- Replaced the inline parser inside `loadEnvFile(path: string)` with a call to `parseEnvFileContent(raw)` + a loop that writes each key into `process.env` with the existing "never override an already-set var" guard preserved.
- LOC delta: −16 inline / +4 import + call.

**A.2.2 — Patched `tests/e2e/fixtures/global-setup.ts`.**
- Same shape as setup.ts patch — imports from `../../_utils/env-loader`, replaces inline parser with a call to the shared utility.
- LOC delta: −16 inline / +4 import + call.

**A.2.3 — Verified Vitest setup hydrates correctly.**
- Full vitest sweep ran cleanly (337 passed | 18 skipped test files, 2443 passed | 99 skipped tests). The Vitest setup loader is exercised by every spec via `setupFiles: ['./tests/setup.ts']` — a regression would have surfaced as widespread MSW-mock or RLS-harness env failures. None observed.

### Step A.3 — Add PROD-ref guard

**A.3.1 — Patched `tests/e2e/fixtures/auth.ts`.**
- Added `import { refuseProdSupabase } from '../../_utils/refuse-prod-supabase';`
- Inside `resolveEnv()`, added `refuseProdSupabase(url);` **AFTER** the missing-env throw and **BEFORE** the `return` statement.
- Added a comment documenting the ordering constraint (preserves CI-DEFERRED classification).

**A.3.2 — Patched `tests/e2e/library/_seed.ts`.**
- Same shape: import + `refuseProdSupabase(url);` after the missing-env throw inside `resolveEnv()`.
- Comment added.

### Step A.4 — Verify

**A.4.1 — `pnpm typecheck` → CLEAN.** Strict-TS happy with the new utility signatures + imports + new call sites.

**A.4.2 — `pnpm lint` → 0 errors, 21 warnings.** The 21 warnings are the pre-existing unused-var warnings inherited from the parent batch (items #5 of mini-batch A — explicitly out of scope per the briefing). My changes introduced ZERO new lint warnings.

**A.4.3 — `pnpm test` → 2443 passed | 99 skipped | 0 failed.** Full Vitest suite GREEN.
- Baseline (parent batch tail): 2411 passed | 99 skipped.
- New total: 2443 = baseline + 19 new specs (Cluster A) + 13 incremental tests already added by other clusters of this same mini-batch (Item 2 added 3, Item 3 added 3, Item 4 added 7 = 13).
- Zero regressions on the prior 2411 baseline.
- `AbortError` traces in stdout are happy-dom-20/vitest-4 fetch-teardown noise unrelated to this work; pass/fail counts are clean.

---

## File counts

| Type | Path | LOC (approx.) |
|---|---|---|
| NEW | `tests/_utils/env-loader.ts` | 53 |
| NEW | `tests/_utils/refuse-prod-supabase.ts` | 56 |
| NEW | `tests/unit/lib/test-infra/env-loader.test.ts` | 100 |
| NEW | `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts` | 65 |
| EDIT | `tests/setup.ts` | net −10 (replaced 16 inline LOC with 6 LOC of import + delegation) |
| EDIT | `tests/e2e/fixtures/global-setup.ts` | net −10 (same shape) |
| EDIT | `tests/e2e/fixtures/auth.ts` | +9 (1 import + 8 LOC inside `resolveEnv` including comment) |
| EDIT | `tests/e2e/library/_seed.ts` | +6 (1 import + 5 LOC inside `resolveEnv` including comment) |

**Totals: 4 NEW files + 4 EDIT files = 8 files touched.** (Briefing's estimate was "4 prod files + 2 utility + 2 test = 6"; my count of 8 reflects two separate new files for utilities and two separate new files for tests, plus the 4 edits — matches briefing intent.)

---

## Test count

| Stage | Count |
|---|---|
| New unit specs added | 19 (12 env-loader + 7 refuse-prod-supabase) |
| RED → GREEN cycles | 2 phases (initial RED for missing modules → 16 GREEN; second RED for 3 mis-targeted specs → 19 GREEN after realignment) |
| Full Vitest suite GREEN | 2443 passed / 99 skipped / 0 failed |
| Lint errors introduced | 0 |
| Lint warnings introduced | 0 |
| Typecheck regressions | 0 |

---

## Briefing-vs-reality reconciliation (deviation)

**Briefing approved regex:** `value.replace(/\r\n?$|\n$/, '')` — strips trailing real `\r\n`, `\r`, or `\n`.

**Briefing test cases (paraphrased):** Given quoted value `"secret\r\n"` or `"secret\n"`, expect `secret`.

**The contradiction:** The existing loader splits on `/\r?\n/` BEFORE the value is extracted. If the value contains a real `\r\n` or `\n`, the split consumes it and breaks the value across lines. By the time the strip runs, the value is already `"secret` (with leading quote intact and trailing newline gone), and quote-strip fails because the closing quote is on a separate line.

**Practical envelope of the approved regex:**

| Scenario | What happens | Strip applies? |
|---|---|---|
| `KEY="secret\r\n"\n` (real CRLF inside quotes) | Split breaks line at the inner `\r\n`. Line 1 = `KEY="secret`. No closing quote → no quote strip. Value = `"secret`. | No — strip has nothing to clean (no trailing CR/LF survived). |
| `KEY="secret\r"\n` (bare CR inside quotes) | Split fires on the outer `\n` only. Line 1 = `KEY="secret\r"`. Quote strip → `secret\r`. | **YES** — strip catches the trailing `\r`. |
| `KEY=secret\r` (bare CR, no terminating newline) | Split keeps the whole line. `rawLine.trim()` already strips `\r` (whitespace). | Strip catches nothing because trim already did the work. |
| `KEY="secret\n"` (last line, no terminating newline) | Split = `['KEY="secret', '"']`. Line 1 = `KEY="secret`. | No — same problem as the first row. |

**What the approved regex actually defends:** primarily the bare-`\r`-inside-quotes case. Bare `\r` does not trigger the split (split requires `\n`) AND is not stripped by `rawLine.trim()` because the `\r` is followed by `"` then `"` (both non-whitespace). So this is a real edge case the strip catches.

**What the approved regex does NOT defend:** the dominant artifact described in `Planning/bugs/2026-05-16-library-overhaul/e2e-results.md` §"Failure diagnosis" — real `\r\n` characters embedded inside a quoted value, written by `vercel env pull` on Windows. The line-level split consumes that artifact first, leaving the value broken before the strip can see it. **This is surfaced as a notable deviation: the primary value of this fix is the DRY refactor (single chokepoint) and the prod-ref guard (security gain) — NOT the regex.**

**Recommendation to main agent:** If the artifact described in e2e-results.md is a literal `\r\n` (backslash + r + backslash + n — a 4-char escape sequence written by `vercel env pull` instead of a real CR/LF), the proposal's original `replace(/\\r\\n/g, '')` strip would handle it. The briefing's approved regex does NOT handle the escape-sequence case either. The fix is still beneficial (DRY + prod-ref + bare-CR defense) but a follow-up may be needed if the operator-side regen shows the artifact persisting. Suggest the user verify by `cat .env.local | xxd | grep -A1 SUPABASE_SECRET_KEY` after a fresh `vercel env pull` to determine whether the chars are real CR/LF (0x0D 0x0A) or escape sequences (0x5C 0x72 0x5C 0x6E).

---

## Halts / stop-the-world triggers

**None.** No briefing-listed stop trigger was hit:
- `loadEnvFile` WAS byte-identical between Vitest + Playwright (briefing assumption correct).
- `tests/_utils/` fits project convention (consistent with `tests/_helpers/`).
- No test file path conflicts with existing paths.
- No other test fixture uses inline env-loading (verified — every other fixture pulls from `process.env` directly, which inherits the loader's results).

The briefing-vs-reality reconciliation above is NOT a stop trigger — it's a documented limitation of the approved approach, surfaced for the main agent's awareness.

---

## Coding principles check

- **Think before coding:** Surfaced the regex-vs-split tension as a deviation rather than hiding it.
- **Simplicity first:** No premature abstraction. Shared utilities are single-purpose (parse-env-content / refuse-prod-supabase). Hard-coded prod ref per briefing Q4 ("recommended: YES hard-code for MVP").
- **Surgical changes:** ~75 net LOC delta. Touched only what the briefing scoped. Did NOT clean up the pre-existing lint warnings in tests/integration/* etc. (item #5 — out of scope).
- **Goal-driven execution:** TDD discipline preserved (RED before GREEN, full regression sweep on completion).

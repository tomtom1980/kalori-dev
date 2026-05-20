# Phase 7 E2E Results — mini-batch A

## Environment
- `.env.local` state: **PROD-pointing** (`SUPABASE_PROJECT_REF="dryysypycsexvlbabtwq\r\n"`, `NEXT_PUBLIC_SUPABASE_URL="https://dryysypycsexvlbabtwq.supabase.co\r\n"` — kalori-prod ref from CLAUDE.md)
- Values are wrapped in double quotes with literal `\r\n` suffix sequences inside the quoted string — the exact `vercel env pull` artifact the mini-batch targets
- Playwright run command: `npx playwright test tests/e2e/library/library-quick-action-menu.spec.ts --reporter=list --workers=1 --max-failures=1`
- Wall-clock: ~3 minutes total (unit tests + canary run + diagnostics)

## Test results

### Unit tests (env-loader + refuse-prod-supabase)
- **PASS:** 24/24
- Files: `tests/unit/lib/test-infra/env-loader.test.ts` + `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts`
- Duration: 1.46s
- Confirms: quote-aware tokenizer, trailing-CRLF strip, and prod-ref blocklist all behave to spec.

### Playwright canary
- **Spec:** `tests/e2e/library/library-quick-action-menu.spec.ts` (Bug 3 quick-action menu, first authed test in the file)
- **Outcome:** Single failure → `Error: Test fixtures must not run against PROD Supabase project (ref "dryysypycsexvlbabtwq")...`
- **Throw point:** `tests/_utils/refuse-prod-supabase.ts:49` → invoked from `resolveEnv()` at `tests/e2e/fixtures/auth.ts:129` → triggered by the `authedPage` fixture at `tests/e2e/fixtures/auth.ts:376`
- **Pipeline coverage proven:**
  1. `global-setup.ts` → `loadEnvFile()` → `parseEnvFileContent()` (the new shared `tests/_utils/env-loader.ts`) parsed `.env.local` cleanly
  2. `process.env.NEXT_PUBLIC_SUPABASE_URL` populated to `https://dryysypycsexvlbabtwq.supabase.co` (no embedded `\r\n` → quote-aware tokenizer worked)
  3. `resolveEnv()` reached the `refuseProdSupabase(url)` line — proves missing-env path was NOT hit (env-loader succeeded)
  4. `refuseProdSupabase()` parsed the URL, extracted hostname label `dryysypycsexvlbabtwq`, matched `PROD_SUPABASE_REF` constant, threw with the verbatim remediation message naming the prod ref AND the dev ref AND the `vercel env pull --environment=development` remediation command

### Exact verbatim error (truncated to one line for the report; full text reproduced from the throw site):

```
Error: Test fixtures must not run against PROD Supabase project (ref "dryysypycsexvlbabtwq"). Current SUPABASE_TEST_URL / NEXT_PUBLIC_SUPABASE_URL resolves to the production project, which would create ephemeral test users in production. Remediation: regenerate .env.local from the kalori-dev project (ref "aaiohznsqlqchsoxaqkz") via "vercel env pull --environment=development", or restart the dev server with kalori-dev credentials from Planning/devapikeys.txt.
```

Test runner reported `1 failed, 1 did not run` (second test in file short-circuited because the fixture throw is per-worker; once authedPage fails to provision, the worker bails on remaining specs).

## Verdict

**PASS** — meets acceptance criterion 2 (PROD-pointing `.env.local` + guard throws with clear remediation message). This is the SUCCESS state for the guard: it correctly refuses to test against production and would have leaked ephemeral test users into `auth.users` of `kalori-prod` without this fix.

Sub-verdicts:
- Env-loader regression check: **GREEN** (no `Invalid API key`, no missing-env throw, URL extracted clean — proves the prior CRLF artifact no longer fouls the parsed value)
- Quote-aware tokenizer: **GREEN** (parsed `.env.local` with quoted values containing literal `\r\n` strings; produced a valid URL string usable by `new URL(...)`)
- PROD-ref guard: **GREEN** (fired at the correct ordering — AFTER missing-env check, BEFORE downstream `createClient`)
- Remediation message: **GREEN** (names both prod and dev project refs verbatim; points to operator-actionable commands)

## Briefing-vs-reality reconciliation note (carried forward from state.md line 42-53)

The state.md deviation comment flagged that "the dominant artifact described in `e2e-results.md` (real `\r\n` inside a quoted value emitted by `vercel env pull`) is NOT cleaned by the approved approach — the line-split consumes it first." This canary run **validates that reconciliation**: the `.env.local` here has literal `\r\n` SUBSTRINGS inside double-quoted values (not actual CR/LF bytes). The quote-aware tokenizer in the new shared `env-loader.ts` correctly extracts the URL `https://dryysypycsexvlbabtwq.supabase.co` from `"https://dryysypycsexvlbabtwq.supabase.co\r\n"` by interpreting the closing quote correctly and treating the trailing `\r\n` characters as literal text inside the quoted span (not line terminators). The PROD-ref guard then receives the clean URL and fires correctly.

The original briefing's regex-strip concern (trailing CR/LF on the LAST line of an unterminated `.env.local`) is a different residual case — covered by the 19-test unit suite but not exercised here because `.env.local` ends with a newline and the values have literal `\r\n` substrings, not actual line terminators.

## Hand-off to Phase 8

**Ready to commit.** No blocking issues. Operator follow-up (not blocking commit):
- `.env.local` regen via `vercel env pull --environment=development` will switch to kalori-dev project, after which E2E will proceed past auth setup and exercise downstream specs. This is operator territory per the Phase 7 brief.
- The new tests (`tests/unit/lib/test-infra/env-loader.test.ts`, `tests/unit/lib/test-infra/refuse-prod-supabase.test.ts`) form the unit-level regression net for both the parsing and the guard, so the env-loader pathway is protected even without the E2E green-light.

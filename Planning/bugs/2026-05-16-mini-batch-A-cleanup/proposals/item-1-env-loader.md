# Item 1 — F-LIBOVR-E2E-INFRA-DRIFT (in-repo portion)

**Bug ID:** F-LIBOVR-E2E-INFRA-DRIFT (mini-batch A item #1)
**Date:** 2026-05-16
**Investigator:** mini-batch A Phase 1 sub-agent (item #1)
**Scope reminder:** In-repo guards only. Operator-side `.env.local` regen is OUT OF SCOPE — flagged for user in main-agent handoff.

---

## Classification

**known_fix** — small surgical change (~10–25 lines net new, plus tests). Both root causes are diagnosed end-to-end in `Planning/bugs/2026-05-16-library-overhaul/e2e-results.md` §"Failure diagnosis". The fix shape (a) strip CRLF artefacts after the quote-strip, and (b) refuse provisioning when `SUPABASE_TEST_URL` points at the prod ref — is recommended verbatim by that file. No design ambiguity; no architecture concerns.

## Root cause (one-liner)

The Playwright `globalSetup` env-loader (`tests/e2e/fixtures/global-setup.ts:24-43`) strips outer quotes from `.env.local` values but does **NOT** strip embedded `\r\n` (literal two-char escape sequence) that `vercel env pull` emits at the end of each quoted value on Windows; that polluted value flows through to `resolveEnv()` in `tests/e2e/fixtures/auth.ts:108-122` and Supabase Auth rejects the trailing `\r\n` with `Invalid API key`. The fixture also has no guard against `SUPABASE_TEST_URL` resolving to the PROD Supabase project (`dryysypycsexvlbabtwq`), so even a clean env can silently produce test users in production.

## Proposed change

### Part A — Strip `\r\n` (and `\r`/`\n`) artefacts at the env-loader

Inside `loadEnvFile()` of `tests/e2e/fixtures/global-setup.ts`, after the existing outer-quote strip, unescape the two-char `\r\n` / `\r` / `\n` sequences that `vercel env pull` writes literally into quoted values. The fix is at the **loader level** (not at point of use) because:

1. **Single chokepoint:** the loader is the one place every value flows through. Every downstream consumer (`resolveEnv()` in `auth.ts`, `_seed.ts`'s own `resolveEnv()`, every spec that reads `process.env.SUPABASE_*` directly) benefits without touching them.
2. **Mirrors the Vitest loader (`tests/setup.ts:60-79`):** the two loaders are byte-for-byte duplicates today; both must change together. Loader-level fix preserves that parity (vs. point-of-use, which would need a per-consumer patch in `auth.ts` + `_seed.ts` + every spec doing `process.env.X`).
3. **Vercel-pulled quoted-value artefact is universal:** `vercel env pull` emits values like `KEY="sb_secret_...\r\n"` for every multi-line-safe secret on Windows; the same artefact will hit every `.env.local`-loaded variable regardless of which fixture consumes it.

**Implementation sketch** (inside `loadEnvFile`, after outer-quote strip, before `process.env[key] = value;`):

```typescript
// Vercel env pull on Windows writes quoted values with literal escape
// sequences `\r\n` (two chars) at the end. After the outer-quote strip we
// still have `sb_secret_...\\r\\n` in `value`; unescape the standard
// `\r`/`\n`/`\t`/`\\` pairs so consumers like Supabase Auth do not reject
// values for trailing whitespace. Idempotent on clean values (no escape
// sequences to substitute).
value = value
  .replace(/\\r\\n/g, '')
  .replace(/\\n/g, '')
  .replace(/\\r/g, '');
// Belt-and-braces: also strip any real CR/LF that snuck through (e.g.
// .env file with literal Windows line endings inside an unquoted value).
value = value.replace(/[\r\n]+$/, '');
```

Apply the **same patch** to `tests/setup.ts:60-79` so Vitest and Playwright loaders stay in sync. Optionally extract `loadEnvFile` to a shared module (`tests/_utils/env-loader.ts`) — see Open Question #1.

**Note on `value.trim()`:** the existing loader already calls `.trim()` on `rawLine` (line 28) and on the inner `value` (line 34). `trim()` does strip trailing real `\r`/`\n` from raw whitespace, but it does NOT touch the two-char `\\r\\n` escape sequence that lives inside the quoted string. That is the actual artefact this patch targets.

### Part B — Refuse fixture when `SUPABASE_TEST_URL` points at PROD ref

Inside `resolveEnv()` of `tests/e2e/fixtures/auth.ts:108-122`, after the existing missing-vars check, add a hard refusal when the resolved URL's project ref equals the production ref. **Throw at the resolver level (not at module-load)** because:

1. **Module-load throw is too aggressive:** `auth.ts` is imported by every e2e spec at collection time; a module-load throw would crash the entire test run even for specs that legitimately never call `provisionTestUser` (e.g. specs that only use `seedAuthSession`'s forged-cookie path). Throwing inside `resolveEnv` only blocks when an `authedPage` fixture is actually being constructed.
2. **Single resolver = single guard site:** `resolveEnv` is called from the two fixture entrypoints (`authedPage` and `authedPageWithDeletedProfile`); both inherit the guard automatically.
3. **Clear remediation message** that the operator can act on:

```typescript
const PROD_SUPABASE_REF = 'dryysypycsexvlbabtwq';

function resolveEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const url = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  // ... existing missing-vars throw ...

  // Refuse to provision test users against the PROD Supabase project.
  // The fixture's `provisionTestUser` issues `admin.auth.admin.createUser`
  // followed by RLS-bypassing profile UPDATEs — pointed at prod, every
  // E2E run would leak ephemeral users into the prod auth.users table.
  let urlRef: string | null = null;
  try {
    urlRef = new URL(url).hostname.split('.')[0];
  } catch {
    /* malformed URL → fall through and let createClient surface the error */
  }
  if (urlRef === PROD_SUPABASE_REF) {
    throw new Error(
      `Auth fixture refuses to run against PROD Supabase project (ref "${PROD_SUPABASE_REF}"). ` +
        `Current SUPABASE_TEST_URL / NEXT_PUBLIC_SUPABASE_URL resolves to the prod project, ` +
        `which would create ephemeral test users in production. ` +
        `Remediation: restart the dev server (and your test shell) with kalori-dev creds ` +
        `from Planning/devapikeys.txt — either via "cross-env NEXT_PUBLIC_SUPABASE_URL=https://aaiohznsqlqchsoxaqkz.supabase.co ... pnpm dev" ` +
        `or by regenerating .env.local from the dev project.`,
    );
  }

  return { url, anonKey, serviceRoleKey };
}
```

**Mirror the same guard in `tests/e2e/library/_seed.ts:55-65`'s `resolveEnv`** — same prod-ref leak risk; the seed helper issues service-role inserts directly. This is a one-line extraction-or-duplication call (see Open Question #2).

**Critical ordering note from lessons:** the prod-ref refuse guard MUST fire BEFORE the missing-env classification path that current CI uses for `phase_7_blocked_infra_drift` / `CI-DEFERRED`. Currently `resolveEnv` throws "Auth fixture env missing: ..." when vars are absent; the prod-ref guard runs AFTER that throw (because if `url` is undefined we cannot parse it). So the existing CI-deferred classification is preserved: missing env → "Auth fixture env missing" (CI-DEFERRED); present env + prod-pointing → "Auth fixture refuses to run against PROD" (NEW, hard fail). No regression on the CI-DEFERRED signature.

## Files affected

| File | Type | Lines (approx.) | Reason |
|------|------|----------------|--------|
| `tests/e2e/fixtures/global-setup.ts` | edit | +6 inside `loadEnvFile` | Add `\\r\\n` / `\\r` / `\\n` strip after outer-quote strip |
| `tests/setup.ts` | edit | +6 inside `loadEnvFile` | Mirror the loader change for Vitest |
| `tests/e2e/fixtures/auth.ts` | edit | +15 inside `resolveEnv` + 1 const | PROD-ref refusal guard |
| `tests/e2e/library/_seed.ts` | edit | +15 inside `resolveEnv` | Mirror PROD-ref guard for seed helper |
| `tests/unit/lib/test-infra/env-loader.test.ts` | new file | ~50 lines | Loader CRLF strip RED→GREEN tests |
| `tests/unit/lib/test-infra/auth-fixture-prod-guard.test.ts` | new file | ~60 lines | resolveEnv prod-ref refusal RED→GREEN tests |

**File count: 4 production-test files edited + 2 new test files = 6 total.**

## TDD required: YES

This is logic-touching test infrastructure. Both new behaviours are pure functions over `process.env` (well, the resolver also reads process.env) and trivially testable. Tests live under `tests/unit/lib/test-infra/` (new directory — matches the Vitest convention used elsewhere e.g. `tests/unit/lib/auth/`).

### Test approach (unit-level, RED-first)

#### Test A — `tests/unit/lib/test-infra/env-loader.test.ts`

Cannot import `loadEnvFile` because it is module-private inside both `global-setup.ts` and `setup.ts`. Two approaches; **approach (2) is recommended**:

1. **Re-extract `loadEnvFile` to `tests/_utils/env-loader.ts`** and re-import from both call sites + the test. Cleanest but touches 3 files for one extraction. Resolves Open Question #1 in the affirmative.
2. **Black-box test via a fixture `.env` file** — write a temp `.env.test-fixture` containing the artefact-laden values, run `loadEnvFile` against it from the test (export it from `global-setup.ts` either as a named export or by making the test require the module and call the export). Either way it requires SOME export surface. **Pick:** export `loadEnvFile` as a named export from both `tests/setup.ts` AND `tests/e2e/fixtures/global-setup.ts` (zero-cost since Vitest already imports `tests/setup.ts` and Playwright already invokes `global-setup.ts`'s default export — adding a named export beside the default does not change either runtime).

**Test cases (RED-first — write each, watch fail, then implement):**

```typescript
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// One of these two — whichever is exported:
import { loadEnvFile } from '@/../tests/e2e/fixtures/global-setup';
// import { loadEnvFile } from '@/../tests/_utils/env-loader';

describe('loadEnvFile — \\r\\n strip (F-LIBOVR-E2E-INFRA-DRIFT)', () => {
  let tmpDir: string;
  let envPath: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kalori-env-loader-'));
    envPath = join(tmpDir, '.env.test');
    // Wipe target keys so we never inherit from real process.env.
    delete process.env.KALORI_TEST_LOADER_PLAIN;
    delete process.env.KALORI_TEST_LOADER_CRLF_ESCAPED;
    delete process.env.KALORI_TEST_LOADER_CR_ESCAPED;
    delete process.env.KALORI_TEST_LOADER_LF_ESCAPED;
    delete process.env.KALORI_TEST_LOADER_BARE_CRLF;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  it('strips trailing literal \\\\r\\\\n escape sequence inside quoted values (Vercel-pull Windows artefact)', () => {
    writeFileSync(envPath, 'KALORI_TEST_LOADER_CRLF_ESCAPED="secret\\r\\n"\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_CRLF_ESCAPED).toBe('secret');
  });

  it('strips trailing literal \\\\r', () => {
    writeFileSync(envPath, 'KALORI_TEST_LOADER_CR_ESCAPED="secret\\r"\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_CR_ESCAPED).toBe('secret');
  });

  it('strips trailing literal \\\\n', () => {
    writeFileSync(envPath, 'KALORI_TEST_LOADER_LF_ESCAPED="secret\\n"\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_LF_ESCAPED).toBe('secret');
  });

  it('strips trailing actual CR/LF from unquoted values (belt-and-braces)', () => {
    // Simulate a file with literal Windows line ending sneaking through quoting.
    writeFileSync(envPath, 'KALORI_TEST_LOADER_BARE_CRLF=secret\r\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_BARE_CRLF).toBe('secret');
  });

  it('leaves clean values untouched (idempotent / no over-strip)', () => {
    writeFileSync(envPath, 'KALORI_TEST_LOADER_PLAIN="secret"\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_PLAIN).toBe('secret');
  });

  it('does not strip a value that legitimately ends in "n" or "r"', () => {
    // Negative case — make sure the regex is anchored to backslash-escape pairs,
    // not bare "n" or "r" tails.
    writeFileSync(envPath, 'KALORI_TEST_LOADER_PLAIN="seasonn"\n', 'utf8');
    loadEnvFile(envPath);
    expect(process.env.KALORI_TEST_LOADER_PLAIN).toBe('seasonn');
  });
});
```

#### Test B — `tests/unit/lib/test-infra/auth-fixture-prod-guard.test.ts`

Same export approach: export `resolveEnv` from `tests/e2e/fixtures/auth.ts` as a named export. It is currently module-private. Since `auth.ts` exports a Playwright `test` already, adding a named export of `resolveEnv` is zero-risk.

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveEnv } from '@/../tests/e2e/fixtures/auth';

const PROD_SUPABASE_URL = 'https://dryysypycsexvlbabtwq.supabase.co';
const DEV_SUPABASE_URL = 'https://aaiohznsqlqchsoxaqkz.supabase.co';
const DUMMY_ANON = 'dummy-anon-key';
const DUMMY_SR = 'dummy-service-role-key';

describe('resolveEnv — PROD-ref refusal (F-LIBOVR-E2E-INFRA-DRIFT)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // Clear every var resolveEnv reads.
    delete process.env.SUPABASE_TEST_URL;
    delete process.env.SUPABASE_TEST_ANON_KEY;
    delete process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws with PROD-refuse message when SUPABASE_TEST_URL points at prod ref', () => {
    process.env.SUPABASE_TEST_URL = PROD_SUPABASE_URL;
    process.env.SUPABASE_TEST_ANON_KEY = DUMMY_ANON;
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = DUMMY_SR;
    expect(() => resolveEnv()).toThrow(/refuses to run against PROD Supabase project/i);
    expect(() => resolveEnv()).toThrow(/dryysypycsexvlbabtwq/);
    expect(() => resolveEnv()).toThrow(/Planning\/devapikeys\.txt/);
  });

  it('throws with PROD-refuse message when NEXT_PUBLIC_SUPABASE_URL points at prod ref (fallback path)', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = DUMMY_ANON;
    process.env.SUPABASE_SECRET_KEY = DUMMY_SR;
    expect(() => resolveEnv()).toThrow(/refuses to run against PROD Supabase project/i);
  });

  it('passes when URL points at DEV ref', () => {
    process.env.SUPABASE_TEST_URL = DEV_SUPABASE_URL;
    process.env.SUPABASE_TEST_ANON_KEY = DUMMY_ANON;
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY = DUMMY_SR;
    expect(() => resolveEnv()).not.toThrow();
    const result = resolveEnv();
    expect(result.url).toBe(DEV_SUPABASE_URL);
  });

  it('preserves the missing-env classification when URL is unset (CI-DEFERRED path)', () => {
    // No vars set at all — must throw the ORIGINAL "Auth fixture env missing" message,
    // NOT the new prod-ref message. This protects the CI-DEFERRED classification.
    expect(() => resolveEnv()).toThrow(/Auth fixture env missing/);
    expect(() => resolveEnv()).not.toThrow(/refuses to run against PROD/);
  });

  it('still throws missing-env even when SUPABASE_TEST_URL is a prod-pointing string but anon/service-role are missing (ordering check)', () => {
    process.env.SUPABASE_TEST_URL = PROD_SUPABASE_URL;
    // anon + service role missing
    expect(() => resolveEnv()).toThrow(/Auth fixture env missing/);
  });
});
```

**RED→GREEN cycle:**

1. Write tests (RED — `loadEnvFile` doesn't strip; `resolveEnv` doesn't refuse PROD).
2. Run `pnpm test tests/unit/lib/test-infra/`. Confirm all fail with the expected error type (not typos).
3. Implement loader strip + resolveEnv guard.
4. Re-run. All GREEN.
5. Run the full unit suite (`pnpm test`) and the lint sweep (`pnpm lint`) — they're the project-wide invariant guards per the parent-batch lessons.

## Risk

**Low.** The changes are:

1. **Loader strip:** purely additive. Strips characters that should never appear in a legitimate `.env` value. Idempotent on clean inputs. The only theoretical regression is a value that legitimately contains `\\r\\n` as part of its content — but that's an env-var, not a secret, and the existing quote-strip already does that kind of normalization.
2. **PROD-ref refusal:** fail-fast new behaviour. The CI-DEFERRED path (missing env) is unaffected (resolveEnv throws missing-env first). The new throw only fires when SOMEONE has set test env vars TO PROD VALUES — which is exactly the failure mode we want to block. The remediation message hands the user the exact fix.

**Specific things to double-check during implementation:**

- The regex must not over-match. `value.replace(/\\r\\n/g, '')` strips ANYWHERE the literal sequence appears, not just at end. The Vercel-pull artefact is always trailing, so anchoring with `$` may be safer: `value.replace(/(\\r\\n|\\r|\\n)+$/, '')`. RECOMMEND THIS form — it's stricter and matches the observed failure mode.
- The PROD-ref check must use `new URL(url).hostname.split('.')[0]` (the same shape `cookieNameForUrl` uses on line 206-210 of `auth.ts`) so a malformed URL doesn't crash the guard — the `try/catch` around it preserves the existing "let createClient surface bad URLs" behaviour.

## Regression sweep

After implementation, run:

1. `pnpm test tests/unit/lib/test-infra/` — new tests pass.
2. `pnpm test` — full unit + integration sweep stays GREEN (2411-pass baseline from parent batch). The loader change touches both Vitest setup and Playwright setup; Vitest specs are the regression-sensitive surface (process.env hydration).
3. `pnpm lint` — eslint baseline preserved (the existing parent-batch unused-var warnings are item #5 — out of scope here, do not "fix" them in this commit).
4. `pnpm typecheck` — strict-TS still green.
5. **Manual smoke (operator-side, OUT OF SCOPE of this proposal but documented):** with `.env.local` regenerated cleanly, run `pnpm test:e2e tests/e2e/library/library-quick-action-menu.spec.ts` to confirm the auth fixture provisions a user without `Invalid API key`. This is the validation the parent batch's Phase 7 sub-agent was unable to perform; it stays blocked on operator regen and is flagged for the user.

## UI Touching

**NO.** This is pure test infrastructure (`tests/e2e/fixtures/*.ts`, `tests/setup.ts`, `tests/unit/lib/test-infra/*`). Zero touch on `components/`, `app/`, `lib/library/`, design tokens, ESLint design-system rules, or visual baselines.

## Component Affected

**N/A** — no UI component touched. Affected modules:

- `tests/e2e/fixtures/global-setup.ts` — Playwright global setup (env loader)
- `tests/setup.ts` — Vitest global setup (env loader — same shape as Playwright)
- `tests/e2e/fixtures/auth.ts` — `authedPage` / `authedPageWithDeletedProfile` fixtures (resolveEnv)
- `tests/e2e/library/_seed.ts` — library E2E seed helper (resolveEnv — same prod-ref drift surface)

## Library/Token Citation

**No design-system tokens consumed.** This change is test infrastructure only.

References consulted:

- `Planning/bugs/2026-05-16-library-overhaul/e2e-results.md` §"Failure diagnosis" — root cause + recommended fix verbatim.
- `Planning/followups.md` F-LIBOVR-E2E-INFRA-DRIFT entry — three-fix recommendation; this proposal covers fixes 1 + 2 (fix 3 is operator-side, out of scope).
- `tests/setup.ts:60-79` — Vitest loader (byte-identical duplicate of Playwright loader — must change in lockstep).
- `tests/e2e/fixtures/auth.ts:108-122` — `resolveEnv` (existing fallback shape, missing-env throw).
- `tests/e2e/library/_seed.ts:55-65` — same `resolveEnv` shape; mirror the prod-ref guard.
- Parent-batch lessons (`Planning/.tmp/.../lessons-relevant.md`): "Phase Testing Sweep that classifies a LOCAL E2E mass-fail with auth-fixture env signature MUST check it against the by-design CI-gated pattern before reporting RED — the prod-ref refuse guard should fire BEFORE the missing-env classification path." — confirms ordering: missing-env (existing) throws FIRST; PROD-ref only fires when env is populated. The proposal preserves this.

## Open Questions

1. **Should `loadEnvFile` be extracted to a shared module `tests/_utils/env-loader.ts`?** Both `tests/setup.ts` and `tests/e2e/fixtures/global-setup.ts` carry byte-identical copies today, and any future change has to touch both. **Recommended:** YES, extract. Cost: +1 file, -duplicate code. Risk: zero (same function body, just relocated). **Decision needed for Phase 3 implementation.** If user prefers minimal-diff, keep the duplicate but ensure both copies receive the same patch.

2. **Should `_seed.ts`'s `resolveEnv` use the same PROD-ref guard, or import a shared helper from `auth.ts`?** Both have separate `resolveEnv` shapes (one returns `{url, anonKey, serviceRoleKey}`, the other `{url, serviceRoleKey}`). **Recommended:** Duplicate the small guard block (5 lines + the `PROD_SUPABASE_REF` constant) since the resolver shapes differ. Or, factor the guard out into `tests/_utils/refuse-prod-supabase.ts`. **Decision needed for Phase 3 implementation.**

3. **Export `loadEnvFile` and `resolveEnv` as named exports** for test access? See "Test approach" — required either way (or extract per Q1/Q2). Should be a single test-only commit-clean approach.

4. **Does the PROD-ref allowlist deserve a separate "blocked refs" config?** E.g. someday a second prod env might land; hard-coding `dryysypycsexvlbabtwq` is fine for MVP. **Recommended:** YES hard-code for now (single-prod-project MVP); revisit if a second prod project ever materializes. Captured in the const comment.

5. **Should the loader's strip rules cascade to `tests/integration/*` and `tests/rls/*` shapes?** Some of those load env via `process.env` directly without going through `loadEnvFile`. Those paths are CI-only (GitHub Actions injects clean env vars) — local Windows-CRLF artefact path only reaches them via the central `loadEnvFile`, so they inherit the fix. No additional changes needed.

## Stop-the-world flags

None. The implementation is contained: 4 prod-test files edited + 2 unit-test files created. No architecture concerns, no schema drift, no design system touch. The existing global-setup is structured cleanly (single function, single chokepoint) — the patch fits naturally. The fixture file's `authedPage` flow is exactly what the e2e-results.md diagnosis describes — no surprise.

Two flag-NOT-stop items worth noting for the implementation sub-agent's briefing:

- **Vitest + Playwright loader parity:** Items must change in lockstep. The implementation sub-agent's briefing must include both `tests/setup.ts` AND `tests/e2e/fixtures/global-setup.ts`.
- **CI-DEFERRED ordering preservation:** the prod-ref refuse guard fires AFTER the missing-env throw. This preserves the parent-batch's "Phase Testing Sweep MUST check against CI-gated pattern before reporting RED" behaviour. The test "preserves the missing-env classification when URL is unset" enforces this. Do not let an over-zealous implementer flip the order.

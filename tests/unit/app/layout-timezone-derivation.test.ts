/**
 * Codex Round 1 Critical #1 — `app/(app)/layout.tsx` profile timezone lookup.
 *
 * Bug: the layout queried `profiles.user_id` (non-existent column) and
 * silently swallowed the resulting Supabase error, falling back to UTC.
 * For a non-UTC user near midnight, the nav-shell water FAB then POSTed
 * `logged_on` derived from a UTC day — durably writing water entries to
 * the wrong calendar day in `water_log.date`.
 *
 * The schema (Planning/architecture.md §2.2) declares
 *   `create table public.profiles (id uuid primary key references auth.users(id) ...)`,
 * and every other profile read in the codebase queries `.eq('id', user.id)`.
 *
 * This file pins TWO behaviors:
 *
 *   1. **Source-shape contract** — `app/(app)/layout.tsx` MUST query
 *      `.eq('id', user.id)` and MUST NOT contain the legacy
 *      `.eq('user_id', user.id)` typo. Read the source via `readFileSync`
 *      because the layout is a server component that pulls in
 *      `next/headers` + Supabase SSR cookies, so it can't be rendered in a
 *      Vitest happy-dom environment without a heavy harness. This is the
 *      same pattern `tests/unit/app/dashboard-page-responsive.test.ts`
 *      uses for an RSC contract.
 *
 *   2. **Error-fallback hardening** — the previous implementation did
 *      `const { data: profileRow } = await supabase…` (destructured `data`
 *      only, dropped `error` on the floor). Codex's recommended fix is to
 *      surface profile-lookup failures via `Sentry.captureException` so
 *      future schema drift is loud, not silent. This file asserts the
 *      source pulls in `@sentry/nextjs` and emits a capture call from the
 *      profile-lookup branch. Implementation matches the existing project
 *      convention in `app/(app)/onboarding/page.tsx:87-89` and
 *      `lib/auth/orphan-profile-fence.ts:188-205`.
 *
 * No render-time test exists because the layout's only logic is the
 * SSR-only Supabase round-trip; behavior verification is reached by the
 * E2E suite in Phase 7 (`tests/e2e/nav-responsive.spec.ts`) once the
 * non-UTC seed gate clears. This file is the unit-level firewall.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

describe('app/(app)/layout.tsx — profile timezone lookup (Codex R1 C1)', () => {
  describe('column-name contract', () => {
    it("queries the profile row by .eq('id', user.id) — matches the schema PK", () => {
      // The canonical pattern across the repo is `.eq('id', user.id)`. Other
      // call sites (lib/auth/orphan-profile-fence.ts:156,
      // app/(app)/onboarding/page.tsx:75) use exactly this form.
      expect(source).toContain(".eq('id', user.id)");
    });

    it("does NOT contain the legacy .eq('user_id', user.id) typo", () => {
      // Regression guard for Codex R1 C1. `profiles` has no `user_id` column;
      // the query returned an error, the layout swallowed it, and `loggedOn`
      // silently fell back to UTC.
      expect(source).not.toContain(".eq('user_id', user.id)");
    });

    it('selects only the timezone column (no over-fetch of profile fields)', () => {
      // Surgical-changes principle — the layout only needs `timezone` to
      // derive `loggedOn`. Don't widen the projection. This also keeps the
      // RLS-allowed columns minimal in the SQL plan.
      expect(source).toMatch(/\.from\('profiles'\)\s*\n?\s*\.select\('timezone'\)/);
    });
  });

  describe('error-fallback hardening', () => {
    it('imports Sentry from @sentry/nextjs (or equivalent) so lookup failures surface', () => {
      // Codex recommendation: stop swallowing Supabase errors. The project's
      // logging convention for profile-lookup failures is
      // `Sentry.captureException`. Asserting the import is the cheapest
      // structural guard against re-introducing a silent catch.
      expect(source).toMatch(/from\s+['"]@sentry\/nextjs['"]/);
    });

    it('captures the Supabase profile error to Sentry (non-silent fallback)', () => {
      // The canonical pattern in app/(app)/onboarding/page.tsx wraps the
      // capture with a `tags` object. Match that shape so anyone scanning
      // the source can grep for `Sentry.captureException` and find this
      // call site.
      expect(source).toMatch(/Sentry\.captureException\s*\(/);
    });

    it('destructures `error` from the Supabase response (not just `data`)', () => {
      // The original bug was `const { data: profileRow } = await …` — `error`
      // was never read, so the column-name typo masked itself. The fix MUST
      // capture `error` so the new Sentry call has something to log.
      expect(source).toMatch(/const\s*\{\s*data:\s*profileRow\s*,\s*error/);
    });

    it('still falls back to UTC after capturing the error (does not throw)', () => {
      // The layout is mounted on every (app) route. Throwing on a transient
      // profile-lookup blip would 500 the whole post-login surface. UTC
      // fallback after a Sentry capture is the right tradeoff: Sentry sees
      // the failure, the user sees a slightly wrong `loggedOn` only on the
      // FAB write path (and only near midnight). Hardening lives in error
      // visibility, not in route-level failure mode.
      expect(source).toContain("'UTC'");
      // No bare `throw` introduced by the fix.
      expect(source).not.toMatch(/throw\s+new\s+Error\s*\(\s*['"`]profile/i);
    });
  });

  describe('downstream contract preserved (regression sentinels)', () => {
    it('forwards timezone to NavShell so the FAB can compute logged_on at tap time (Codex R2 C2)', () => {
      // C2 (Codex round 2) — the layout used to derive `loggedOn` at
      // render time and drill the precomputed date string to NavShell.
      // That made `loggedOn` a stale prop in the persistent client
      // island; once a long-lived session crossed local midnight the
      // FAB durably wrote yesterday's date. The fix drills `timezone`
      // (IANA zone) and the FAB calls `userTzToday(timezone)` inside
      // its handler. Pin both: forward `timezone={timezone}` AND no
      // longer drill `loggedOn`.
      expect(source).toMatch(/timezone=\{timezone\}/);
    });

    it('mounts DeviceTimezoneSync so server profile timezone follows the browser device timezone', () => {
      expect(source).toMatch(/from\s+['"]@\/components\/time\/DeviceTimezoneSync['"]/);
      expect(source).toMatch(/<DeviceTimezoneSync\s+profileTimezone=\{timezone\}\s*\/>/);
    });

    it('does NOT drill a precomputed loggedOn prop to NavShell (Codex R2 C2 regression guard)', () => {
      // Regression guard for the stale-prop bug. `loggedOn=...` on
      // <NavShell /> is the exact shape that introduces the midnight
      // crossing failure mode — forbid its return.
      expect(source).not.toMatch(/<NavShell[^>]*loggedOn=/);
    });

    it('does NOT import userTzToday at render time (deriving loggedOn server-side is the bug)', () => {
      // The fix moves `userTzToday` from the layout (server, called
      // once per render) to the FAB handler (client, called per tap).
      // The layout no longer needs to import it; pulling it in here
      // would be dead weight at minimum and a stale-prop regression
      // at worst (it would mean someone is computing the date string
      // on the server again). Assertion looks for the import — the
      // helper name may still appear in explanatory comments about
      // why the layout no longer uses it.
      expect(source).not.toMatch(/import\s+\{[^}]*userTzToday[^}]*\}\s+from/);
    });

    it('does NOT invoke userTzToday in code (regression guard for server-side derivation)', () => {
      // The function-call shape `userTzToday(<arg>)` should not appear
      // in any non-comment code. We strip line-comments before checking
      // so the explanatory `// userTzToday(timezone)` reference in the
      // file header doesn't trip this guard.
      const codeOnly = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(codeOnly).not.toMatch(/userTzToday\s*\(/);
    });
  });
});

/**
 * Task 2.4 Phase 2 Testing Sweep — route-segment config guard.
 *
 * CI run 24688014407 (commit 38e857c) failed the `Next build (with source
 * maps)` job with:
 *   Error occurred prerendering page "/dashboard"
 *   Error: Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL and
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.
 *
 * Root cause: after Task 2.1 wired `getServerSupabase()` + `auth.getUser()`
 * into `/dashboard` and `/onboarding`, Next.js 16 started attempting static
 * prerender of those routes at build time. The `build` job does NOT inject
 * Supabase envs (by design — prerendering auth pages with test creds baked
 * in is architecturally wrong), so the Supabase client factory threw.
 *
 * Correct fix: mark the two routes as `force-dynamic` so Next never tries
 * to static-render them. That matches the App Router idiom for per-user
 * auth-gated server components that read cookies.
 *
 * These assertions lock that route-segment config in so a future edit
 * that drops or renames the `dynamic` export fails here (and fails CI)
 * before it ever reaches the `build` job again.
 *
 * Approach: text-level regex match against the source file rather than
 * importing the page module. The page modules transitively import
 * `next/headers`, which Vitest (happy-dom env) cannot resolve without
 * bespoke mocks. The filesystem assertion is pragmatic, matches the
 * existing pattern in `task-1-config-guards.test.ts`, and is just as
 * authoritative — Next reads the `dynamic` export via the same source.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

const FORCE_DYNAMIC_PATTERN = /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/;

describe('auth-gated pages must export dynamic = "force-dynamic"', () => {
  it('app/(app)/dashboard/page.tsx is force-dynamic', () => {
    const source = readSource('app/(app)/dashboard/page.tsx');
    expect(source).toMatch(FORCE_DYNAMIC_PATTERN);
  });

  it('app/(app)/onboarding/page.tsx is force-dynamic', () => {
    const source = readSource('app/(app)/onboarding/page.tsx');
    expect(source).toMatch(FORCE_DYNAMIC_PATTERN);
  });

  it('app/(auth)/login/page.tsx remains force-dynamic', () => {
    // Defensive regression lock — login was already force-dynamic pre-fix
    // (Task 2.1c) because it reads request headers + searchParams. Losing
    // this would reintroduce a prerender failure on login too.
    const source = readSource('app/(auth)/login/page.tsx');
    expect(source).toMatch(FORCE_DYNAMIC_PATTERN);
  });

  it('app/(app)/layout.tsx is force-dynamic', () => {
    // F-UI-3.6-B-2 turned this layout into an async RSC that reads
    // auth via `getServerSupabase`. Marking the layout dynamic
    // propagates to every child page (/library, /progress, /settings,
    // /log — all previously static) and is what unblocked the
    // `Next build (with source maps)` CI job on 2026-04-22.
    const source = readSource('app/(app)/layout.tsx');
    expect(source).toMatch(FORCE_DYNAMIC_PATTERN);
  });
});

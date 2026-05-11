/**
 * Unit test for `no-admin-in-app` ESLint rule (Task 1.2 AC, tightened in
 * Codex Round 1 F1 and Round 2 F1).
 *
 * Service-role Supabase client (`@/lib/supabase/admin`) bypasses RLS. It must
 * NEVER be imported from code that can ship to the browser bundle or the
 * request-scoped app surface. The ONLY legal import path is `tests/**`.
 *
 * Post-F1 contract (default-deny everywhere except tests):
 *   - `lib/supabase/admin.ts` itself may define/export the client (the source
 *     of truth lives there).
 *   - `tests/**` may import the client for RLS harness + seeding.
 *   - Everything else (app/**, components/**, lib/** excluding admin.ts,
 *     middleware.ts, app/api/**) is an error.
 *
 * Re-export leaks are covered: `export { ... } from '@/lib/supabase/admin'`
 * and `export * from '@/lib/supabase/admin'` are blocked from every
 * non-tests/ path.
 *
 * Post-F1 Round 2 contract extensions — specifier-form coverage:
 *   Every specifier that resolves to `<repo-root>/lib/supabase/admin` is
 *   admin. The rule MUST catch all of these forms from non-test importers:
 *     - Alias:               `@/lib/supabase/admin`
 *     - Alias + ext:         `@/lib/supabase/admin.ts` / `.js` / `.mjs` / `.cjs`
 *     - Absolute:            `lib/supabase/admin` / `...admin.ts`
 *     - Relative same-dir:   `./admin` / `./admin.ts` (from inside lib/supabase/)
 *     - Relative parent:     `../supabase/admin` / `../admin` / `...admin.ts`
 *     - Deeper relative:     `../../lib/supabase/admin` / `...admin.ts`
 *   Previously the pure regex missed `./admin`, `../supabase/admin`, and
 *   `.ts`-extension forms, letting a barrel `lib/supabase/index.ts` doing
 *   `export * from './admin'` bypass the rule entirely.
 *
 * If a legitimate admin-on-server path needs to exist (e.g. Task 5.2 account
 * deletion cascade in an API route), the accepted pattern is:
 *   `// eslint-disable-next-line kalori/no-admin-in-app`
 * immediately above the import, with a comment explaining why. This makes
 * every future leak site auditable and explicit rather than covered by a
 * path-based allowlist.
 */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../../eslint-rules/no-admin-in-app.js');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('eslint-rules/no-admin-in-app', () => {
  it('flags admin imports everywhere except tests/ and admin.ts itself', () => {
    tester.run('no-admin-in-app', rule, {
      valid: [
        // tests/** is the only legal importer
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'tests/rls/_harness.ts',
        },
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'tests/integration/rls-smoke.test.ts',
        },
        {
          code: `export { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'tests/rls/_reexport.ts',
        },
        {
          code: `export * from '@/lib/supabase/admin';`,
          filename: 'tests/rls/_reexport-all.ts',
        },
        // admin.ts itself may reference @supabase/supabase-js (not admin.ts)
        {
          code: `import { createClient } from '@supabase/supabase-js';`,
          filename: 'lib/supabase/admin.ts',
        },
        // Unrelated imports in app/components/lib are fine
        {
          code: `import { getBrowserSupabase } from '@/lib/supabase/client';`,
          filename: 'components/ui/button.tsx',
        },
        {
          code: `import { createServerClient } from '@supabase/ssr';`,
          filename: 'app/(app)/dashboard/page.tsx',
        },
        {
          code: `import { createServerClient } from '@supabase/ssr';`,
          filename: 'lib/auth/refresh-interceptor.ts',
        },
      ],
      invalid: [
        // app/** (pages, layouts, api routes, middleware) — all forbidden
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/(marketing)/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/(auth)/login/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: app/api/** — previously allowed, now forbidden by default
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/api/webhooks/supabase/route.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/api/health/route.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: middleware.ts — previously allowed, now forbidden by default
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'middleware.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // components/** — forbidden
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'components/nav/sidebar.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: lib/** intermediaries (not admin.ts itself) — forbidden
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'lib/somewhere.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'lib/db/admin-helpers.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // require()
        {
          code: `const admin = require('@/lib/supabase/admin');`,
          filename: 'components/require-admin.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // dynamic import()
        {
          code: `async function load() { return import('@/lib/supabase/admin'); }`,
          filename: 'app/(app)/library/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Relative path (../../)
        {
          code: `import { getAdminSupabase } from '../../lib/supabase/admin';`,
          filename: 'app/(app)/log/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: re-export leak — named export from
        {
          code: `export { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'lib/db/index.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `export { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'components/safe-admin.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `export { getAdminSupabase } from '@/lib/supabase/admin';`,
          filename: 'app/api/admin/route.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: re-export leak — star export from
        {
          code: `export * from '@/lib/supabase/admin';`,
          filename: 'lib/db/index.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `export * from '@/lib/supabase/admin';`,
          filename: 'components/safe-admin.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // F1: re-export leak via relative path
        {
          code: `export { getAdminSupabase } from '../../lib/supabase/admin';`,
          filename: 'app/(app)/log/admin-reexport.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // ---------------------------------------------------------------
        // F1 ROUND 2 — specifier-form coverage. Each of these specifiers
        // resolves to <repo-root>/lib/supabase/admin from a non-test
        // importer; all must be flagged.
        // ---------------------------------------------------------------
        // Barrel re-export (same-dir relative) inside lib/supabase/
        {
          code: `export { getAdminSupabase } from './admin';`,
          filename: 'lib/supabase/index.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        {
          code: `export * from './admin';`,
          filename: 'lib/supabase/index.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Direct same-dir import from inside lib/supabase/ (non-admin sibling)
        {
          code: `import { getAdminSupabase } from './admin';`,
          filename: 'lib/supabase/index.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Explicit .ts extension on same-dir import
        {
          code: `import { getAdminSupabase } from './admin.ts';`,
          filename: 'lib/supabase/adapter.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Relative parent — sibling lib/ dir
        {
          code: `export { getAdminSupabase } from '../supabase/admin';`,
          filename: 'lib/auth/middleware.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Relative parent with explicit .js extension
        {
          code: `import { getAdminSupabase } from '../supabase/admin.js';`,
          filename: 'lib/auth/middleware.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Alias with explicit .ts extension
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin.ts';`,
          filename: 'components/foo.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Alias with .mjs extension
        {
          code: `import { getAdminSupabase } from '@/lib/supabase/admin.mjs';`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Dynamic import with explicit .ts extension
        {
          code: `async function load() { return import('@/lib/supabase/admin.ts'); }`,
          filename: 'app/(app)/log/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // require() with same-dir relative
        {
          code: `const admin = require('./admin');`,
          filename: 'lib/supabase/legacy.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // require() with parent relative
        {
          code: `const admin = require('../supabase/admin');`,
          filename: 'lib/auth/middleware.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // require() with explicit extension
        {
          code: `const admin = require('../supabase/admin.cjs');`,
          filename: 'lib/auth/middleware.ts',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Absolute path form (no leading @/)
        {
          code: `import { getAdminSupabase } from 'lib/supabase/admin';`,
          filename: 'components/foo.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Absolute path form with .ts
        {
          code: `import { getAdminSupabase } from 'lib/supabase/admin.ts';`,
          filename: 'app/(app)/library/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
        // Deeper relative with explicit .ts extension
        {
          code: `import { getAdminSupabase } from '../../lib/supabase/admin.ts';`,
          filename: 'app/(app)/log/page.tsx',
          errors: [{ messageId: 'adminInApp' }],
        },
      ],
    });
  });
});

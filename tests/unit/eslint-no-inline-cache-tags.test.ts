/**
 * Unit test for `no-inline-cache-tags` ESLint rule (Task 1.3 AC; I12
 * load-bearing invariant).
 *
 * Invariant I12 — cache tags must come from `TAGS.*` — no string literals,
 * no template literals, no array literals of literals. Every `cacheTag(...)`
 * and `updateTag(...)` call MUST pass its argument through a typed factory
 * in `lib/cache/tags.ts`. The silent failure mode — a typo like `'entry'`
 * vs `'entries'` — is invisible to code review but renders a cache mutation
 * inert. The rule fails the build at lint time on any literal-shaped arg.
 *
 * Covered syntax (argument forms that must fire):
 *   - String Literal:                 `cacheTag('user:abc:entries:today')`
 *   - TemplateLiteral (no exprs):     `cacheTag(\`user:abc:entries\`)`
 *   - TemplateLiteral (WITH exprs):   `cacheTag(\`user:\${uid}:entries\`)`
 *     (tightened after Codex R1 C-2 — interpolated templates still permit
 *     typo-prone ad hoc tags and must go through TAGS.*(…) factories)
 *   - ArrayExpression of literals:    `cacheTag(['user:abc:entries'])`
 *   - ArrayExpression of templates:   `cacheTag([\`pure-template\`])`
 *   - ArrayExpression of interpolated templates: `cacheTag([\`user:\${uid}:x\`])`
 *   - MemberExpression callee:        `cache.updateTag('literal')`
 *
 * Allowed (must NOT fire):
 *   - TAGS factory call:              `cacheTag(TAGS.userEntries(uid, day))`
 *   - Array of TAGS calls:            `cacheTag([TAGS.userLibrary(uid)])`
 *   - Identifier argument:            `const t = TAGS.profile; cacheTag(t);`
 *   - MemberExpression argument:      `cacheTag(TAGS.profile)`
 *   - CallExpression argument:        `cacheTag(buildTag(uid))`
 *   - Non-target callees:             `trackEvent('literal')`
 */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../../eslint-rules/no-inline-cache-tags.js');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('eslint-rules/no-inline-cache-tags', () => {
  it('flags inline string-literal arguments to cacheTag / updateTag (I12)', () => {
    tester.run('no-inline-cache-tags', rule, {
      valid: [
        // 1. cacheTag with TAGS factory call — primary allowed form (CallExpression)
        {
          code: `import { TAGS } from '@/lib/cache/tags'; cacheTag(TAGS.userEntries('uid', '2026-04-20'));`,
          filename: 'app/(app)/dashboard/page.tsx',
        },
        // 2. cacheTag with ArrayExpression wrapping a TAGS factory call
        {
          code: `import { TAGS } from '@/lib/cache/tags'; cacheTag([TAGS.userLibrary('uid')]);`,
          filename: 'app/(app)/library/page.tsx',
        },
        // 3. updateTag with TAGS factory call
        {
          code: `import { TAGS } from '@/lib/cache/tags'; updateTag(TAGS.profile('uid'));`,
          filename: 'app/api/profile/route.ts',
        },
        // 4. cacheTag with a plain identifier argument (TAGS factory hoisted via const)
        {
          code: `import { TAGS } from '@/lib/cache/tags'; const tag = TAGS.userEntries('uid', '2026-04-20'); cacheTag(tag);`,
          filename: 'app/(app)/progress/page.tsx',
        },
        // 5. cacheTag with MemberExpression argument (static TAGS field — not
        // hypothetical; the rule must allow `cacheTag(TAGS.profile)` if a
        // future TAGS entry is a plain string constant rather than a factory)
        {
          code: `import { TAGS } from '@/lib/cache/tags'; cacheTag(TAGS.profile);`,
          filename: 'app/api/profile/route.ts',
        },
        // 6. Non-target callee with a string literal — rule must not fire
        {
          code: `trackEvent('user:clicked:save');`,
          filename: 'app/(app)/dashboard/page.tsx',
        },
        // 7. Non-target method callee with a string literal
        {
          code: `logger.info('cache miss');`,
          filename: 'lib/logger.ts',
        },
        // 8. cacheTag called with array of identifiers (each identifier
        // sourced from TAGS.* upstream, not a bare string constant)
        {
          code: `import { TAGS } from '@/lib/cache/tags'; const a = TAGS.profile('x'), b = TAGS.userLibrary('x'); cacheTag([a, b]);`,
          filename: 'app/(app)/settings/page.tsx',
        },
        // 9. cacheTag with empty arg list (degenerate but not a literal)
        {
          code: `cacheTag();`,
          filename: 'app/(app)/page.tsx',
        },
        // 10. cacheTag with a function call argument (not a literal) —
        // buildTag() is a user helper that returns TAGS.*(…)
        {
          code: `cacheTag(buildTag(uid));`,
          filename: 'lib/cache/adapter.ts',
        },
        // 11. updateTag with a plain identifier
        {
          code: `updateTag(myTag);`,
          filename: 'app/api/dashboard/route.ts',
        },
        // 12. Array of MemberExpression + CallExpression — all TAGS-rooted
        {
          code: `import { TAGS } from '@/lib/cache/tags'; cacheTag([TAGS.profile, TAGS.userLibrary('uid')]);`,
          filename: 'lib/cache/composer.ts',
        },
      ],
      invalid: [
        // 1. cacheTag('literal') — direct string literal
        {
          code: `cacheTag('user:abc:entries:today');`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 2. updateTag('literal') — direct string literal
        {
          code: `updateTag('user:abc:library');`,
          filename: 'app/api/library/route.ts',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 3. cacheTag(`pure-template`) — TemplateLiteral with zero expressions
        {
          code: `cacheTag(\`user:abc:entries:today\`);`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 4. updateTag(`pure-template`) — TemplateLiteral with zero expressions
        {
          code: `updateTag(\`user:abc:profile\`);`,
          filename: 'app/api/profile/route.ts',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 5. cacheTag(['literal']) — ArrayExpression containing a string literal
        {
          code: `cacheTag(['user:abc:entries']);`,
          filename: 'app/(app)/library/page.tsx',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 6. cacheTag([`pure-template`]) — array of pure templates
        {
          code: `cacheTag([\`user:abc:library\`]);`,
          filename: 'app/(app)/library/page.tsx',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 7. MemberExpression callee: cache.updateTag('literal')
        {
          code: `cache.updateTag('user:abc:progress');`,
          filename: 'app/api/progress/route.ts',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 8. MemberExpression callee with ArrayExpression of literals
        {
          code: `cache.cacheTag(['user:abc:profile', 'user:abc:library']);`,
          filename: 'app/api/profile/route.ts',
          errors: [{ messageId: 'inlineLiteral' }, { messageId: 'inlineLiteral' }],
        },
        // 9. cacheTag(`user:${uid}:x`) — TemplateLiteral WITH expressions
        // (Codex R1 C-2 tightening — interpolated templates still permit
        // typo-prone ad hoc tags like `user:${uid}:entry:${day}`)
        {
          code: `function f(uid) { cacheTag(\`user:\${uid}:entry:today\`); }`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 10. updateTag(`user:${uid}:library`) — interpolated template literal
        {
          code: `function f(uid) { updateTag(\`user:\${uid}:library\`); }`,
          filename: 'app/api/library/route.ts',
          errors: [{ messageId: 'inlineLiteral' }],
        },
        // 11. cacheTag([`user:${uid}:library`]) — array of interpolated template literals
        {
          code: `function f(uid) { cacheTag([\`user:\${uid}:library\`]); }`,
          filename: 'lib/cache/composer.ts',
          errors: [{ messageId: 'inlineLiteral' }],
        },
      ],
    });
  });
});

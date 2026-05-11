/**
 * Unit test for the `no-gemini-leak` ESLint rule.
 *
 * I3 (design invariant): GEMINI_API_KEY must only be referenced from
 * server-only code (`lib/ai/**`, `app/api/**`, `middleware.ts`, `tests/**`).
 * Any reference from client-bundled code (`app/(app|marketing|auth)/`,
 * `components/`, or the rest of `lib/`) must be flagged as an error.
 *
 * Loads the rule module directly and drives it with ESLint's RuleTester.
 */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

// The rule module under test. Written in Step 5 of Task 1.1.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../../eslint-rules/no-gemini-leak.js');

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

describe('eslint-rules/no-gemini-leak', () => {
  it('flags references from client-bundled paths and allows server-only paths', () => {
    tester.run('no-gemini-leak', rule, {
      valid: [
        // Allowed: server-only AI path
        {
          code: `const key = process.env.GEMINI_API_KEY; export default key;`,
          filename: 'lib/ai/client.ts',
        },
        // Allowed: Route Handler under app/api
        {
          code: `const key = process.env.GEMINI_API_KEY; export default key;`,
          filename: 'app/api/ai/text-parse/route.ts',
        },
        // Allowed: middleware
        {
          code: `const key = process.env.GEMINI_API_KEY; export default key;`,
          filename: 'middleware.ts',
        },
        // Allowed: test code
        {
          code: `const key = process.env.GEMINI_API_KEY; export default key;`,
          filename: 'tests/integration/ai.test.ts',
        },
        // Allowed: file with no reference at all
        {
          code: `const x = 1;`,
          filename: 'components/ui/button.tsx',
        },
        // Allowed: unrelated dynamic import
        {
          code: `const mod = await import(name); export default mod;`,
          filename: 'lib/ai/client.ts',
        },
      ],
      invalid: [
        // Forbidden: marketing page
        {
          code: `const key = process.env.GEMINI_API_KEY;`,
          filename: 'app/(marketing)/page.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: (app) route
        {
          code: `const key = process.env.GEMINI_API_KEY;`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: (auth) route
        {
          code: `const key = process.env.GEMINI_API_KEY;`,
          filename: 'app/(auth)/login/page.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: components
        {
          code: `const key = process.env.GEMINI_API_KEY;`,
          filename: 'components/ui/form.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: client-bundled lib (not under lib/ai)
        {
          code: `const key = process.env.GEMINI_API_KEY;`,
          filename: 'lib/utils.ts',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: destructured access
        {
          code: `const { GEMINI_API_KEY } = process.env;`,
          filename: 'components/foo.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: bracket access
        {
          code: `const k = process.env['GEMINI_API_KEY'];`,
          filename: 'components/bar.tsx',
          errors: [{ messageId: 'geminiKeyLeak' }],
        },
        // Forbidden: direct require of Gemini package
        {
          code: `const gemini = require('@google/generative-ai');`,
          filename: 'components/gemini.tsx',
          errors: [{ messageId: 'geminiImportLeak' }],
        },
        // Forbidden: direct dynamic import of Gemini package
        {
          code: `async function load() { return import('@google/generative-ai'); }`,
          filename: 'app/(marketing)/page.tsx',
          errors: [{ messageId: 'geminiImportLeak' }],
        },
        // Forbidden: require via computed property
        {
          code: `const gemini = globalThis['require']('@google/generative-ai');`,
          filename: 'components/require-hack.tsx',
          errors: [{ messageId: 'geminiImportLeak' }],
        },
        // Forbidden: await import(name) where name resolves to Gemini package
        {
          code: `const name = '@google/generative-ai'; async function load() { return await import(name); }`,
          filename: 'components/import-name.tsx',
          errors: [{ messageId: 'geminiImportLeak' }],
        },
      ],
    });
  });
});

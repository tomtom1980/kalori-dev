import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import noGeminiLeak from './eslint-rules/no-gemini-leak.js';
import noAdminInApp from './eslint-rules/no-admin-in-app.js';
import noInlineCacheTags from './eslint-rules/no-inline-cache-tags.js';
import noInlineUserStrings from './eslint-rules/no-inline-user-strings.js';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      kalori: {
        rules: {
          'no-gemini-leak': noGeminiLeak,
          'no-admin-in-app': noAdminInApp,
          'no-inline-cache-tags': noInlineCacheTags,
          'no-inline-user-strings': noInlineUserStrings,
        },
      },
    },
    rules: {
      'kalori/no-gemini-leak': 'error',
      'kalori/no-admin-in-app': 'error',
    },
  },
  // Scope the two new rules narrowly per architecture.md §10.3 + briefing §12.
  //   no-inline-cache-tags — production code only (app/**, lib/**, components/**)
  //   no-inline-user-strings — JSX files only (app/**, components/** .tsx/.jsx)
  // Tests are exempt so RuleTester fixtures + test literals don't self-flag.
  {
    files: [
      'app/**/*.{ts,tsx,js,jsx}',
      'lib/**/*.{ts,tsx,js,jsx}',
      'components/**/*.{ts,tsx,js,jsx}',
      'middleware.ts',
    ],
    rules: {
      'kalori/no-inline-cache-tags': 'error',
    },
  },
  {
    files: ['app/**/*.{tsx,jsx}', 'components/**/*.{tsx,jsx}'],
    rules: {
      'kalori/no-inline-user-strings': 'error',
    },
  },
  // Task 5.1.1 — R1 8th-consumer compliance. The offline outbox MUST route
  // every HTTP write through `authFetch` from `lib/auth/refresh-interceptor.ts`.
  // A raw `fetch(` call would bypass the F12 401-refresh-retry contract; this
  // rule is the live enforcement (the integration test is the double-check).
  // Architecture: `Planning/architecture.md` §11; briefing §4.
  //
  // Codex review I5 — selector coverage extended to catch window.fetch,
  // self.fetch, and globalThis.fetch reference forms; the bare `fetch(` call
  // covers `fetch(...)` invocations, and the MemberExpression selectors cover
  // `obj.fetch` access on the four global-ish objects we'd see inside an SW
  // or browser-context module.
  {
    files: ['lib/offline/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
          message:
            'lib/offline/** must route every HTTP write through authFetch from @/lib/auth/refresh-interceptor (R1 8th consumer). Raw `fetch(` bypasses the F12 refresh-retry contract — see architecture.md §11.',
        },
        {
          selector:
            "MemberExpression[object.name=/^(globalThis|window|self|global)$/][property.name='fetch']",
          message:
            'lib/offline/** must route HTTP writes through authFetch (R1 8th consumer). globalThis/window/self/global.fetch bypasses the F12 refresh-retry contract.',
        },
        {
          // Catch destructuring: `const { fetch } = globalThis;`
          selector: "VariableDeclarator > ObjectPattern Property[key.name='fetch']",
          message:
            'lib/offline/** must NOT alias `fetch` from any global. Use authFetch from @/lib/auth/refresh-interceptor (R1 8th consumer).',
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'tests/fixtures/**',
      'next-env.d.ts',
      'eslint-rules/**',
      'Design/**',
      'Planning/**',
      'planning/**',
      '.remember/**',
      '.playwright-mcp/**',
      '.claude/**',
      // Task 5.1.2 — `public/sw.js` is a third-party-bundled service worker
      // (esbuild bundles `app/sw.ts` + serwist runtime). The bundled output
      // contains `var t = this` patterns from Serwist that trip
      // `@typescript-eslint/no-this-alias`. We lint the source (`app/sw.ts`),
      // not the bundle.
      'public/**',
    ],
  },
];

export default eslintConfig;

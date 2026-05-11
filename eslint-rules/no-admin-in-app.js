/**
 * ESLint rule: no-admin-in-app (Task 1.2 AC; tightened in Codex Round 1 F1;
 * regex → resolver upgrade in Codex Round 2 F1).
 *
 * `lib/supabase/admin.ts` holds a service-role Supabase client that bypasses
 * RLS. Leaking it to ANY non-test surface compromises user data isolation.
 *
 * Post-F1 posture: DEFAULT DENY. The only legal importer is `tests/**`.
 *
 *   Legal path                    Allowed?
 *   ─────────────────────────── │ ─────────
 *   tests/**                    │ yes
 *   lib/supabase/admin.ts       │ yes (self; expected to define/export)
 *   anywhere else               │ NO (error)
 *
 * Why default-deny? The previous allowlist included `app/api/**` and
 * `middleware.ts` on the theory that server-only surfaces were safe. In
 * practice this masked risk — any transitively-imported client file pulls
 * admin into the browser bundle via barrel re-exports, and API routes that
 * legitimately need admin access should be opt-in (per-file
 * `// eslint-disable-next-line kalori/no-admin-in-app` with a justification
 * comment), NOT covered by a path pattern that also grants 200 future files
 * the same privilege silently.
 *
 * Covered syntax (import and re-export):
 *   - static imports:          import { x } from '@/lib/supabase/admin'
 *   - require():               const x = require('@/lib/supabase/admin')
 *   - dynamic import():        await import('@/lib/supabase/admin')
 *   - named re-exports:        export { x } from '@/lib/supabase/admin'
 *   - star re-exports:         export * from '@/lib/supabase/admin'
 *
 * Specifier shapes matched (Round 2 F1 closed the regex gap that let
 * `./admin`, `../supabase/admin`, and `.ts`-extension forms slip through):
 *   - Alias form:              '@/lib/supabase/admin'[.ts|.js|.mjs|.cjs]
 *   - Bare absolute form:      'lib/supabase/admin'[.ts|.js|.mjs|.cjs]
 *   - Relative same-dir:       './admin'[.ext] (from inside lib/supabase/)
 *   - Relative parent/sibling: '../supabase/admin'[.ext] (from lib/<other>/)
 *   - Deeper relative:         '../../lib/supabase/admin'[.ext]
 *
 * Implementation: Option A (specifier resolver).
 *   For non-relative specifiers we pattern-match `@/lib/supabase/admin` and
 *   `lib/supabase/admin` (with optional extension). For relative specifiers
 *   we resolve them against the importer's directory using Node's `path`
 *   module and compare the resolved absolute path to the repo-root's
 *   `lib/supabase/admin` absolute path (extension-stripped on both sides).
 *
 *   Option A is preferred over pure pattern-match because it extends
 *   naturally to future alias shapes (e.g. `~/lib/supabase/admin`) and
 *   handles arbitrarily deep relative paths without enumerating them.
 */
'use strict';

const path = require('path');

// File extensions that resolve the same specifier to the same module.
const EXT_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// Alias / bare-absolute matcher. Catches:
//   @/lib/supabase/admin
//   @/lib/supabase/admin.ts / .js / .mjs / .cjs / .tsx / .jsx
//   lib/supabase/admin
//   lib/supabase/admin.ts (and the extension variants above)
// The leading `(?:@\/|\/)?` makes the `@/` prefix optional and also tolerates
// a literal leading slash, while `(?:^|\/)` as a non-capturing boundary lets
// the matcher fire on bare `lib/supabase/admin` without eating legitimate
// paths like `some-other/lib/supabase/admin` that might appear in future
// aliases (they would still resolve to the admin module, so flagging them
// is correct anyway).
const NON_RELATIVE_ADMIN_RE =
  /^(?:@\/|\/)?(?:.*\/)?lib\/supabase\/admin(?:\.(?:ts|tsx|js|jsx|mjs|cjs))?$/;

// Paths that may legally import `lib/supabase/admin`. Default-deny posture:
// a path must be explicitly listed here. Everything else is an error.
const LEGAL_IMPORTER_PATTERNS = [
  /^tests\//, // RLS harness + seeding
  /^lib\/supabase\/admin\.ts$/, // admin module itself (not actually imported)
];

function normalizeFilename(filename) {
  if (!filename) return '';
  let f = String(filename).replace(/\\/g, '/');
  f = f.replace(/^[A-Za-z]:/, '');
  if (f.startsWith('/')) f = f.slice(1);
  return f;
}

function relPathFromRoot(filename) {
  const roots = ['app/', 'components/', 'lib/', 'middleware.ts', 'tests/', 'eslint-rules/'];
  for (const root of roots) {
    const idx = filename.indexOf('/' + root);
    if (idx >= 0) return filename.slice(idx + 1);
    if (filename.startsWith(root)) return filename;
  }
  return filename;
}

// Is the current file allowed to import `lib/supabase/admin`? Default DENY:
// only files matching a legal-importer pattern may import it.
function isLegalImporter(relPath) {
  return LEGAL_IMPORTER_PATTERNS.some((p) => p.test(relPath));
}

/**
 * Does `specifier`, when interpreted from `importerRelPath`, point at
 * `lib/supabase/admin` (ignoring extension)?
 *
 * Two-layer check (defense in depth):
 *   1. NON_RELATIVE_ADMIN_RE catches alias (`@/lib/supabase/admin`), bare
 *      absolute (`lib/supabase/admin`), and deeper-relative forms whose
 *      trailing segment literally reads `lib/supabase/admin[.ext]`
 *      (e.g. `../../lib/supabase/admin`). A relative specifier with that
 *      exact tail unambiguously targets the admin module — no importer
 *      needs that literal path for anything else.
 *   2. If (1) misses, we resolve `./` and `../` specifiers against the
 *      importer's directory via `path.posix.resolve('/' + importerDir, spec)`
 *      and compare the extension-stripped result to `lib/supabase/admin`.
 *      This picks up same-dir (`./admin`) and sibling-parent
 *      (`../supabase/admin`) forms that don't carry the full `lib/supabase/`
 *      prefix in the specifier itself.
 *
 * importerRelPath is already relative-from-repo-root (e.g.
 * `lib/supabase/index.ts`) courtesy of `relPathFromRoot()`. We use POSIX
 * path semantics throughout so Windows vs POSIX filename normalisation
 * doesn't change behaviour (ESLint on Windows reports `C:/.../lib/...`, we
 * already strip to `lib/...`).
 */
function specifierResolvesToAdmin(specifier, importerRelPath) {
  if (typeof specifier !== 'string' || specifier.length === 0) return false;

  // Layer 1: pattern-match. Catches `@/...`, `lib/...`, and any specifier
  // whose last three segments are `lib/supabase/admin[.ext]`.
  if (NON_RELATIVE_ADMIN_RE.test(specifier)) return true;

  // Layer 2: relative resolution against importer dir. Catches `./admin`,
  // `../supabase/admin`, `../admin`, etc. — forms whose resolved path IS
  // the admin module but whose literal text does not contain
  // `lib/supabase/admin`.
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const importerDir = path.posix.dirname(importerRelPath);
    // Prefix with '/' so path.posix.resolve doesn't pull in the actual CWD.
    const resolvedWithSlash = path.posix.resolve('/' + importerDir, specifier);
    const resolved = resolvedWithSlash.replace(/^\//, '').replace(EXT_RE, '');
    return resolved === 'lib/supabase/admin';
  }

  return false;
}

function getStaticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'I1: `lib/supabase/admin` (service-role client) may only be imported from tests/. All other files — including app/api/**, middleware.ts, components/**, lib/** intermediaries — must treat admin as forbidden. Use `@/lib/supabase/server` (request-scoped) or `@/lib/supabase/client` (browser) instead. Legitimate per-file exceptions require an explicit `// eslint-disable-next-line kalori/no-admin-in-app` with a justification comment.',
      recommended: true,
    },
    schema: [],
    messages: {
      adminInApp:
        'I1 violation: `@/lib/supabase/admin` (service-role, bypasses RLS) must not be imported or re-exported from {{where}}. Only `tests/**` may import it. If this file legitimately needs admin access (e.g. a one-off server-side migration helper), add `// eslint-disable-next-line kalori/no-admin-in-app` with a justification comment.',
    },
  },
  create(context) {
    const filename = normalizeFilename(context.filename || context.getFilename?.());
    const relPath = relPathFromRoot(filename);
    if (isLegalImporter(relPath)) return {};

    function matches(specifier) {
      return specifierResolvesToAdmin(specifier, relPath);
    }

    function report(node) {
      context.report({
        node,
        messageId: 'adminInApp',
        data: { where: relPath || filename },
      });
    }

    return {
      ImportDeclaration(node) {
        if (matches(node.source.value)) report(node);
      },
      // Re-export leak protection (F1): these create barrel-style escape
      // hatches that let any downstream consumer pull admin via the
      // intermediary without the rule firing on the consumer side.
      ExportNamedDeclaration(node) {
        if (node.source && matches(node.source.value)) report(node);
      },
      ExportAllDeclaration(node) {
        if (node.source && matches(node.source.value)) report(node);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          matches(getStaticString(node.arguments[0]))
        ) {
          report(node);
        }
      },
      ImportExpression(node) {
        if (matches(getStaticString(node.source))) report(node);
      },
    };
  },
};

module.exports = rule;

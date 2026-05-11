/**
 * ESLint rule: no-gemini-leak
 *
 * Invariant I3 — Task 1.1 Acceptance Criterion.
 *
 * Forbids ANY reference to the identifier `GEMINI_API_KEY` from files
 * whose path is inside client-bundled scope:
 *   - app/(app)/**
 *   - app/(marketing)/**
 *   - app/(auth)/**
 *   - components/**
 *   - lib/**  (except lib/ai/**)
 *
 * The Gemini key must only be read from server-only paths:
 *   - lib/ai/**
 *   - app/api/**
 *   - middleware.ts
 *   - tests/**
 *
 * The rule is identifier-based to catch every form:
 *   - process.env.GEMINI_API_KEY
 *   - process.env['GEMINI_API_KEY']
 *   - const { GEMINI_API_KEY } = process.env
 *   - anything else referencing that identifier literally
 */
'use strict';

/** @type {RegExp[]} Scope patterns (forward-slashed relative path) that are FORBIDDEN. */
const FORBIDDEN_PATTERNS = [
  /^app\/\(app\)\//,
  /^app\/\(marketing\)\//,
  /^app\/\(auth\)\//,
  /^components\//,
  /^lib\//,
];

/** @type {RegExp[]} Subset of forbidden that IS allowed (i.e., server-only AI path). */
const ALLOWLIST_PATTERNS = [/^lib\/ai\//, /^app\/api\//, /^middleware\.ts$/, /^tests\//];
const GEMINI_PACKAGE = '@google/generative-ai';

function findVariable(scope, name) {
  let current = scope;
  while (current) {
    const variable = current.set.get(name);
    if (variable) return variable;
    current = current.upper ?? null;
  }
  return null;
}

function getStaticString(node, scope) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  if (node.type === 'Identifier') {
    const variable = findVariable(scope, node.name);
    const definition = variable?.defs?.[0];
    if (
      definition?.type === 'Variable' &&
      definition.node.type === 'VariableDeclarator' &&
      definition.node.init
    ) {
      return getStaticString(definition.node.init, scope);
    }
  }
  return null;
}

/**
 * Normalise an absolute/native path to a forward-slashed relative path from the repo root.
 * RuleTester passes plain filenames like "components/foo.tsx"; webpack/next pass absolute paths.
 * We just strip any leading drive letter + Windows backslashes and then look for the
 * trailing segments matching our scope patterns.
 */
function normalizeFilename(filename) {
  if (!filename) return '';
  let f = String(filename).replace(/\\/g, '/');
  // Strip a drive letter prefix like "C:"
  f = f.replace(/^[A-Za-z]:/, '');
  // Strip a leading slash so patterns anchored with ^ still match
  if (f.startsWith('/')) f = f.slice(1);
  return f;
}

function isInScope(relPath) {
  if (ALLOWLIST_PATTERNS.some((p) => p.test(relPath))) return false;
  return FORBIDDEN_PATTERNS.some((p) => p.test(relPath));
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'I3: GEMINI_API_KEY must not be referenced from client-bundled code — move Gemini access behind a Route Handler.',
      recommended: true,
    },
    schema: [],
    messages: {
      geminiKeyLeak:
        'I3 violation: GEMINI_API_KEY must not be referenced from client-bundled code ({{where}}). Move the Gemini call behind a Route Handler under app/api/.',
      geminiImportLeak:
        'I3 violation: Gemini package imports must not be referenced from client-bundled code ({{where}}). Move the Gemini call behind a Route Handler under app/api/.',
    },
  },
  create(context) {
    const filename = normalizeFilename(context.filename || context.getFilename?.());
    // Look at the trailing segment the pattern expects (relative to repo root).
    // Trim any leading repo path by searching for the first match of a known root segment.
    const roots = ['app/', 'components/', 'lib/', 'middleware.ts', 'tests/', 'eslint-rules/'];
    let relPath = filename;
    for (const root of roots) {
      const idx = filename.indexOf('/' + root);
      if (idx >= 0) {
        relPath = filename.slice(idx + 1);
        break;
      }
      if (filename.startsWith(root)) {
        relPath = filename;
        break;
      }
    }

    if (!isInScope(relPath)) {
      return {};
    }

    function reportIfGemini(node, name) {
      if (name === 'GEMINI_API_KEY') {
        context.report({
          node,
          messageId: 'geminiKeyLeak',
          data: { where: relPath || filename },
        });
      }
    }

    function reportIfGeminiPackage(node, specifier) {
      if (specifier === GEMINI_PACKAGE) {
        context.report({
          node,
          messageId: 'geminiImportLeak',
          data: { where: relPath || filename },
        });
      }
    }

    return {
      // process.env.GEMINI_API_KEY  (MemberExpression, non-computed)
      MemberExpression(node) {
        if (!node.computed && node.property && node.property.type === 'Identifier') {
          reportIfGemini(node, node.property.name);
        }
        // process.env['GEMINI_API_KEY']  (computed, Literal string)
        if (
          node.computed &&
          node.property &&
          node.property.type === 'Literal' &&
          typeof node.property.value === 'string'
        ) {
          reportIfGemini(node, node.property.value);
        }
      },
      // Any identifier reference — catches destructuring `const { GEMINI_API_KEY } = process.env`.
      // Skip identifiers that are the non-computed `property` of a MemberExpression
      // (those are already reported by the MemberExpression visitor above).
      Identifier(node) {
        const parent = node.parent;
        if (
          parent &&
          parent.type === 'MemberExpression' &&
          parent.computed === false &&
          parent.property === node
        ) {
          return;
        }
        // Also skip the Property key when the ObjectPattern destructures from process.env —
        // the Identifier itself (the binding) will still be visited separately as a reference.
        // That's fine; we only want to flag once per site. Destructuring like
        //   const { GEMINI_API_KEY } = process.env
        // yields one Property with key & value both an Identifier named GEMINI_API_KEY;
        // we flag on the key (first visit) and skip the value when parent is Property.
        if (
          parent &&
          parent.type === 'Property' &&
          parent.shorthand === true &&
          parent.value === node &&
          parent.key !== node
        ) {
          return;
        }
        reportIfGemini(node, node.name);
      },
      // Template literal keys
      Literal(node) {
        if (typeof node.value === 'string' && node.value === 'GEMINI_API_KEY') {
          // Only flag when used as an object/property key context (MemberExpression handles the
          // main case). This catches miscellaneous literal references too.
          const parent = node.parent;
          if (parent && parent.type === 'MemberExpression' && parent.property === node) {
            // already reported above
            return;
          }
          reportIfGemini(node, node.value);
        }
      },
      CallExpression(node) {
        const scope = context.sourceCode.getScope(node);
        const callee = node.callee;
        const source = node.arguments[0] ? getStaticString(node.arguments[0], scope) : null;

        if (
          callee.type === 'Identifier' &&
          callee.name === 'require' &&
          node.arguments.length > 0
        ) {
          reportIfGeminiPackage(node, source);
        }

        if (
          callee.type === 'MemberExpression' &&
          callee.computed &&
          getStaticString(callee.property, scope) === 'require' &&
          node.arguments.length > 0
        ) {
          reportIfGeminiPackage(node, source);
        }
      },
      ImportExpression(node) {
        const scope = context.sourceCode.getScope(node);
        reportIfGeminiPackage(node, getStaticString(node.source, scope));
      },
    };
  },
};

module.exports = rule;

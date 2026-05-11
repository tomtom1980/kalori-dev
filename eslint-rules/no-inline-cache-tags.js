/**
 * ESLint rule: no-inline-cache-tags (Task 1.3 AC; invariant I12 load-bearing).
 *
 * Cache tags must come from `TAGS.*` — no string literals, no template
 * literals, no array literals of literals. Every cache tag in the app MUST
 * flow through `lib/cache/tags.ts` TAGS factories so typos like `'entries'`
 * vs `'entry'` are impossible.
 *
 * Forbids literal-shaped arguments to `cacheTag()` / `updateTag()` (including
 * `cache.cacheTag(...)`, `foo.updateTag(...)`, and similar MemberExpression
 * callees whose property name is one of the target names).
 *
 * Covered argument forms (all report `inlineLiteral`):
 *   - `cacheTag('user:abc:entries:today')`      — string Literal
 *   - `cacheTag(\`user:abc:entries\`)`          — TemplateLiteral, 0 expressions
 *   - `cacheTag(\`user:\${uid}:entries\`)`      — TemplateLiteral WITH expressions
 *     (interpolated templates still permit typo-prone ad hoc tags — flag them)
 *   - `cacheTag(['user:abc:entries'])`          — ArrayExpression of string Literal
 *   - `cacheTag([\`pure-template\`])`           — ArrayExpression of pure TemplateLiteral
 *   - `cacheTag([\`user:\${uid}:x\`])`          — ArrayExpression of interpolated TemplateLiteral
 *
 * NOT flagged (allowed argument shapes):
 *   - `cacheTag(TAGS.userEntries(uid, day))`    — CallExpression argument
 *   - `cacheTag([TAGS.userLibrary(uid)])`       — array of CallExpressions
 *   - `cacheTag(myVar)`                          — Identifier argument
 *   - `cacheTag(TAGS.profile)`                  — MemberExpression argument (static TAGS field)
 *   - `cacheTag()`                               — degenerate; nothing to flag
 *   - Non-target callees (`trackEvent('x')`, `logger.info('x')`)
 *
 * Callee identification — the rule fires for Identifier callees named
 * `cacheTag` or `updateTag` (e.g. `import { cacheTag } from 'next/cache'`),
 * AND for MemberExpression callees whose `.property` is an Identifier with
 * one of those names (e.g. `cache.cacheTag(...)`, `foo.updateTag(...)`).
 * This covers both the direct import pattern and any re-exported / namespaced
 * form without needing an import-tracking pass.
 */
'use strict';

const TARGET_CALLEES = new Set(['cacheTag', 'updateTag']);

function getCalleeName(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
}

function reportLiteral(context, node, literal) {
  context.report({
    node,
    messageId: 'inlineLiteral',
    data: { literal: String(literal) },
  });
}

/**
 * Describe a TemplateLiteral for the error message. For pure templates we use
 * the raw quasi text; for interpolated templates we emit a readable pattern
 * like `user:${…}:entries` so the report pinpoints the literal.
 */
function describeTemplate(tpl) {
  const quasis = tpl.quasis ?? [];
  if (quasis.length === 1) return quasis[0]?.value?.raw ?? '';
  const parts = [];
  for (let i = 0; i < quasis.length; i += 1) {
    parts.push(quasis[i]?.value?.raw ?? '');
    if (i < quasis.length - 1) parts.push('${…}');
  }
  return parts.join('');
}

/** Report the argument (or its array elements) if they are literal-shaped. */
function checkArg(context, arg) {
  if (!arg) return;
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    reportLiteral(context, arg, arg.value);
    return;
  }
  if (arg.type === 'TemplateLiteral') {
    reportLiteral(context, arg, describeTemplate(arg));
    return;
  }
  if (arg.type === 'ArrayExpression') {
    for (const element of arg.elements) {
      if (!element) continue;
      if (element.type === 'Literal' && typeof element.value === 'string') {
        reportLiteral(context, element, element.value);
        continue;
      }
      if (element.type === 'TemplateLiteral') {
        reportLiteral(context, element, describeTemplate(element));
      }
    }
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'I12: cache tags must come from TAGS.* — no string literals, no template literals, no array literals of literals. Use TAGS.*(…) factories from lib/cache/tags.ts so cache tags are typed and typo-proof.',
      recommended: true,
    },
    schema: [],
    messages: {
      inlineLiteral:
        "I12 violation: inline cache-tag literal '{{literal}}' — cache tags must come from TAGS.* (no string literals, no template literals, no array literals of literals). Use TAGS.<key>(\u2026) from lib/cache/tags.ts.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = getCalleeName(node.callee);
        if (!name || !TARGET_CALLEES.has(name)) return;
        for (const arg of node.arguments) {
          checkArg(context, arg);
        }
      },
    };
  },
};

module.exports = rule;

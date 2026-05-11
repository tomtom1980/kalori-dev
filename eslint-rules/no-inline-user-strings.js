/**
 * ESLint rule: no-inline-user-strings (Task 1.3 AC; design-doc.md §12).
 *
 * Forbids hard-coded user-visible strings in JSX — either as text children
 * or on the user-visible attribute allowlist (aria-label, aria-labelledby,
 * aria-describedby, aria-placeholder, title, alt, placeholder). Replace
 * every such literal with a typed reference into `lib/i18n/en.ts` (e.g.
 * `t.nav.dashboard`).
 *
 * Rationale — user-visible copy must route through the i18n file so:
 *   1. Future locale expansion is a find-and-replace of `lib/i18n/en.ts`
 *      rather than a sweep of every component.
 *   2. Copy review is centralised (one diff, one reviewer context).
 *   3. Accidental placeholder strings (`"TODO: copy here"`) fail CI.
 *
 * Scope — JSX ONLY. Non-JSX module constants (e.g. lookup tables, testIDs,
 * ARIA role values) are not inspected. Design-doc.md §12 prefers all
 * user-facing copy routed through `t.*.*` even in non-JSX positions; the
 * implementer fixes those proactively (Option A in briefing §4) but the
 * rule does not lint them.
 *
 * Attribute-value whitelist (NOT reported as literal violations):
 *   - `data-*` (test IDs, instrumentation hooks)
 *   - `className`, `id`, `key`, `style`
 *   - `for`, `htmlFor`, `name`, `type`, `tabIndex`
 *   - `href`, `src`, `action`, `target`, `rel`
 *   - `role` (ARIA role value is a token, not user copy)
 *   - ARIA boolean / enumerated values: `aria-modal`, `aria-haspopup`,
 *     `aria-hidden`, `aria-expanded`, `aria-current`, `aria-pressed`,
 *     `aria-selected`, `aria-disabled`, `aria-checked`, `aria-live`,
 *     `aria-atomic`, `aria-busy`, `aria-relevant`, `aria-sort`, `aria-level`
 *   - Non-user-visible props (event handlers, refs, etc.)
 *
 * Attribute-value USER-VISIBLE list (REPORTED as literal violations):
 *   - `aria-label`
 *   - `aria-placeholder`
 *   - `title`
 *   - `alt`
 *   - `placeholder`
 *   (Per briefing §4.10 with the `aria-labelledby` / `aria-describedby` ID-ref
 *   clarification from briefing §4.5. Those two attributes carry element-ID
 *   references per the ARIA spec; the referenced element's text is the
 *   user-visible copy and should be the target of the rule when IT renders.)
 *
 * Exempt text-children (never reported):
 *   - Strings that are whitespace / punctuation / symbol-only (decorative
 *     tokens like `·`, `§`, `+`, `—`, `… `). Match `/^[\s\p{P}\p{S}]*$/u` —
 *     whitespace, Unicode punctuation, or Unicode symbol categories only.
 *     Any letter / digit / CJK character makes the string substantive and
 *     thus flaggable.
 *
 * TemplateLiteral in JSX text position (children) — also flagged (Codex R1
 * I-1 tightening). `<p>{\`Hello world\`}</p>` and `<p>{\`Hello ${name}!\`}</p>`
 * are both inline user copy and must route through `t.*.*`.
 *
 * Escape hatch: `// eslint-disable-next-line kalori/no-inline-user-strings
 * -- <reason>` per architecture.md §10.3 + Task 1.2 `no-admin-in-app`
 * pattern. The justification comment is enforced by ESLint's builtin
 * `eslint-comments/require-description` rule, not this rule — we simply
 * respect the disable directive.
 */
'use strict';

const USER_VISIBLE_ATTRS = new Set([
  'aria-label',
  'aria-placeholder',
  'title',
  'alt',
  'placeholder',
]);

function normalizeFilename(filename) {
  if (!filename) return '';
  let f = String(filename).replace(/\\/g, '/');
  f = f.replace(/^[A-Za-z]:/, '');
  if (f.startsWith('/')) f = f.slice(1);
  return f;
}

function isInScope(relPath) {
  // JSX-only scope: app/** and components/** (.tsx / .jsx).
  if (!/\.(tsx|jsx)$/.test(relPath)) return false;
  if (relPath.startsWith('app/') || relPath.startsWith('components/')) return true;
  // RuleTester passes plain filenames; accept nested forms too.
  const roots = ['app/', 'components/'];
  return roots.some((root) => {
    const idx = relPath.indexOf('/' + root);
    return idx >= 0;
  });
}

/**
 * Decorative / punctuation-only exemption. Strings composed entirely of
 * whitespace, Unicode punctuation (category P), or Unicode symbols (category S)
 * are exempt from the i18n rule because they are visual tokens (e.g. `·`,
 * `§`, `+`, `—`, `… `) that compose into longer strings via t.*.* elsewhere.
 *
 * Codex R1 M-1 alignment: replaces the previous glyph-count `<= 1` check.
 * The rule contract now matches docs + tests exactly.
 */
function isDecorativePunctuationOnly(s) {
  return /^[\s\p{P}\p{S}]*$/u.test(s);
}

function getAttrName(attr) {
  if (!attr || !attr.name) return null;
  // JSXIdentifier (regular attrs) or JSXNamespacedName (data-foo, xmlns:foo).
  if (attr.name.type === 'JSXIdentifier') return attr.name.name;
  if (attr.name.type === 'JSXNamespacedName') {
    const ns = attr.name.namespace?.name ?? '';
    const local = attr.name.name?.name ?? '';
    return `${ns}:${local}`;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid hard-coded user-visible strings in JSX — use typed t.*.* keys from lib/i18n/en.ts instead (design-doc.md §12; architecture.md §10.3).',
      recommended: true,
    },
    schema: [],
    messages: {
      inlineJsxText:
        "Inline user-visible JSX text '{{literal}}' — move into lib/i18n/en.ts and reference via t.<namespace>.<key>.",
      inlineJsxAttr:
        'Inline user-visible attribute \'{{attr}}="{{literal}}"\' — move into lib/i18n/en.ts and reference via t.<namespace>.<key>.',
    },
  },
  create(context) {
    const filename = normalizeFilename(context.filename || context.getFilename?.());
    if (!isInScope(filename)) return {};

    return {
      // JSX text node: <p>Hello</p>
      JSXText(node) {
        const value = node.value;
        if (typeof value !== 'string') return;
        if (isDecorativePunctuationOnly(value)) return;
        context.report({
          node,
          messageId: 'inlineJsxText',
          data: { literal: value.trim().slice(0, 60) },
        });
      },

      // <p>{"Hello"}</p> — JSXExpressionContainer wrapping a string Literal
      // in a text-position child. (If the parent is a JSXAttribute, the
      // JSXAttribute visitor below handles it — we don't double-report.)
      'JSXExpressionContainer > Literal'(node) {
        if (typeof node.value !== 'string') return;
        const parentContainer = node.parent;
        if (!parentContainer || parentContainer.type !== 'JSXExpressionContainer') return;
        const grandparent = parentContainer.parent;
        if (!grandparent) return;
        // Only flag when the expression container is directly a child of a
        // JSX element (text position). Attribute usage is handled separately.
        if (grandparent.type !== 'JSXElement' && grandparent.type !== 'JSXFragment') return;
        const trimmed = node.value.trim();
        if (isDecorativePunctuationOnly(node.value)) return;
        context.report({
          node,
          messageId: 'inlineJsxText',
          data: { literal: trimmed.slice(0, 60) },
        });
      },

      // <p>{`Hello world`}</p> and <p>{`Hello ${name}!`}</p> —
      // TemplateLiteral wrapped in a JSXExpressionContainer in text-position.
      // Both are inline user copy: pure templates are just string literals
      // dressed up; interpolated templates carry substantive static parts
      // (see `Hello ` in the second example) that must route through t.*.*.
      // Codex R1 I-1 tightening.
      'JSXExpressionContainer > TemplateLiteral'(node) {
        const parentContainer = node.parent;
        if (!parentContainer || parentContainer.type !== 'JSXExpressionContainer') return;
        const grandparent = parentContainer.parent;
        if (!grandparent) return;
        // Attribute values handled by JSXAttribute below — skip here.
        if (grandparent.type !== 'JSXElement' && grandparent.type !== 'JSXFragment') return;

        // Describe the literal. For pure templates use the raw quasi; for
        // interpolated templates weave `${…}` placeholders between the quasis
        // so the report pinpoints the source copy.
        const quasis = node.quasis ?? [];
        let literal;
        if (quasis.length === 1) {
          literal = quasis[0]?.value?.raw ?? '';
        } else {
          const parts = [];
          for (let i = 0; i < quasis.length; i += 1) {
            parts.push(quasis[i]?.value?.raw ?? '');
            if (i < quasis.length - 1) parts.push('${…}');
          }
          literal = parts.join('');
        }

        if (isDecorativePunctuationOnly(literal)) return;

        context.report({
          node,
          messageId: 'inlineJsxText',
          data: { literal: literal.trim().slice(0, 60) },
        });
      },

      // <button aria-label="Sign out">, <img alt="A photo" />, etc.
      JSXAttribute(node) {
        const attrName = getAttrName(node);
        if (!attrName) return;
        if (!USER_VISIBLE_ATTRS.has(attrName)) return;
        const value = node.value;
        if (!value) return;
        // Direct Literal attribute value: aria-label="Sign out"
        if (value.type === 'Literal' && typeof value.value === 'string') {
          const v = value.value;
          if (isDecorativePunctuationOnly(v)) return;
          context.report({
            node,
            messageId: 'inlineJsxAttr',
            data: { attr: attrName, literal: v.slice(0, 60) },
          });
          return;
        }
        // JSXExpressionContainer wrapping a string Literal: alt={"A photo"}
        if (value.type === 'JSXExpressionContainer') {
          const expr = value.expression;
          if (!expr) return;
          if (expr.type === 'Literal' && typeof expr.value === 'string') {
            const v = expr.value;
            if (isDecorativePunctuationOnly(v)) return;
            context.report({
              node,
              messageId: 'inlineJsxAttr',
              data: { attr: attrName, literal: v.slice(0, 60) },
            });
            return;
          }
          if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
            const raw = expr.quasis[0]?.value?.raw ?? '';
            if (isDecorativePunctuationOnly(raw)) return;
            context.report({
              node,
              messageId: 'inlineJsxAttr',
              data: { attr: attrName, literal: raw.slice(0, 60) },
            });
          }
        }
      },
    };
  },
};

module.exports = rule;

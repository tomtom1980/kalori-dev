/**
 * Unit test for `no-inline-user-strings` ESLint rule (Task 1.3 AC;
 * design-doc.md §12 — "No inline string literals in components").
 *
 * Scope per architecture.md §10.3 + briefing §4.10:
 *   - `app/**` + `components/**` (tsx / jsx)
 *   - JSX text children: hard-coded string literals forbidden (use t.*.*)
 *   - JSX attribute values on the user-visible allowlist: aria-label,
 *     aria-placeholder, title, alt, placeholder — forbidden as string
 *     literals (use t.*.*). NOTE: aria-labelledby / aria-describedby carry
 *     ID references per the ARIA spec (briefing §4.5), not user copy, so
 *     they're in the allowed set below.
 *   - Punctuation exemption (Codex R1 M-1 alignment): strings composed
 *     entirely of whitespace, Unicode punctuation (category P), or Unicode
 *     symbols (category S) are exempt. Regex: `/^[\s\p{P}\p{S}]*$/u`.
 *     Decorative tokens like `·`, `§`, `+`, `—`, `… ` (including multi-char
 *     sequences) pass the rule. Any letter / digit / CJK character makes
 *     the string substantive and thus flaggable.
 *   - JSX-text TemplateLiterals (Codex R1 I-1 tightening): `<p>{\`Hello\`}</p>`
 *     and `<p>{\`Hello ${name}!\`}</p>` are both flagged; the static parts
 *     of the template carry user copy and must route through t.*.*.
 *
 * Allowed attribute-value whitelist (must NOT fire):
 *   - data-testid, data-*, className, id, for, htmlFor, name, type, tabIndex,
 *     role, key, href, style, numeric/boolean props, event handlers, ARIA
 *     boolean / enumerated values (aria-modal, aria-haspopup, aria-hidden,
 *     aria-expanded, aria-current)
 *
 * Escape hatch: `// eslint-disable-next-line kalori/no-inline-user-strings --
 * <reason>` per architecture.md §10.3 + Task 1.2's `no-admin-in-app` pattern.
 */
import { RuleTester } from 'eslint';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsParser = require('@typescript-eslint/parser');
import { describe, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rule = require('../../eslint-rules/no-inline-user-strings.js');

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

describe('eslint-rules/no-inline-user-strings', () => {
  it('flags hard-coded user-visible JSX strings, exempts the attribute allowlist', () => {
    tester.run('no-inline-user-strings', rule, {
      valid: [
        // 1. Typed i18n call in JSX text — canonical allowed form
        {
          code: `import { t } from '@/lib/i18n/en'; export default function P() { return <p>{t.nav.dashboard}</p>; }`,
          filename: 'components/foo.tsx',
        },
        // 2. Typed i18n call in aria-label attribute (placeholder body is
        // a decorative bullet — passes punctuation-only exemption per M-1)
        {
          code: `import { t } from '@/lib/i18n/en'; export default function P() { return <button aria-label={t.user.signOutA11y}>·</button>; }`,
          filename: 'components/nav/sidebar.tsx',
        },
        // 3. Typed i18n call in title attribute
        {
          code: `import { t } from '@/lib/i18n/en'; export default function P() { return <span title={t.brand.name}>·</span>; }`,
          filename: 'components/brand.tsx',
        },
        // 4. Dynamic variable in JSX text
        {
          code: `export default function P({ name }: { name: string }) { return <p>{name}</p>; }`,
          filename: 'components/greet.tsx',
        },
        // 5. className literal — allowed (styling attribute, not user-visible)
        {
          code: `export default function P() { return <div className="rounded bg-ivory">·</div>; }`,
          filename: 'components/styled.tsx',
        },
        // 6. data-testid literal — allowed (test-infrastructure attribute)
        {
          code: `export default function P() { return <div data-testid="nav-dashboard">·</div>; }`,
          filename: 'components/nav/sidebar.tsx',
        },
        // 7. id literal — allowed (DOM attribute)
        {
          code: `export default function P() { return <div id="masthead">·</div>; }`,
          filename: 'components/masthead.tsx',
        },
        // 8. role literal — allowed (ARIA role values)
        {
          code: `export default function P() { return <div role="dialog">·</div>; }`,
          filename: 'components/dialog.tsx',
        },
        // 9. href literal — allowed (URL, not user-visible string)
        {
          code: `export default function P() { return <a href="/dashboard">·</a>; }`,
          filename: 'components/link.tsx',
        },
        // 10. type, aria-modal, aria-haspopup, aria-hidden — all allowed ARIA boolean / enumerated values
        {
          code: `export default function P() { return <button type="button" aria-haspopup="dialog" aria-hidden="true" aria-modal="true">·</button>; }`,
          filename: 'components/fab.tsx',
        },
        // 11. aria-current with conditional expression — not a string literal
        {
          code: `export default function P({ active }: { active: boolean }) { return <a aria-current={active ? 'page' : undefined}>·</a>; }`,
          filename: 'components/nav/item.tsx',
        },
        // 12. Single-character decorative string in JSX text — exempt (per rule policy)
        {
          code: `export default function P() { return <span>·</span>; }`,
          filename: 'components/decorative.tsx',
        },
        // 13. Whitespace-only JSX text — exempt (formatting; not user-visible copy)
        {
          code: `export default function P() { return <div> </div>; }`,
          filename: 'components/spacer.tsx',
        },
        // 14. JSXExpressionContainer with member expression (typed translation)
        {
          code: `import { t } from '@/lib/i18n/en'; export default function P() { return <button aria-label={t.user.menuA11y}>{t.user.menuSettings}</button>; }`,
          filename: 'components/nav/profile-menu.tsx',
        },
        // 15. Dynamic prop passed through; the LITERAL value flows through a t.*.* call, not a JSX child
        {
          code: `import { t } from '@/lib/i18n/en'; function MenuItem({ label }: { label: string }) { return <span>{label}</span>; } export default function P() { return <MenuItem label={t.user.menuSettings} />; }`,
          filename: 'components/nav/profile-menu.tsx',
        },
        // 17. key attribute literal — allowed (React internal attribute)
        {
          code: `export default function P() { return <div key="row-1">·</div>; }`,
          filename: 'components/row.tsx',
        },
        // 18. File outside scope — pure .ts (no JSX) not inspected
        {
          code: `export const FOO = 'literal not flagged because no JSX';`,
          filename: 'lib/utils/constants.ts',
        },
        // 19. aria-labelledby with ID-ref literal — allowed (points to another
        // element's ID; the referenced element's text is the user copy)
        {
          code: `export default function P() { return (<div aria-labelledby="shortcuts-overlay-heading" role="dialog">·</div>); }`,
          filename: 'components/nav/shortcuts-overlay.tsx',
        },
        // 20. aria-describedby with ID-ref literal — allowed for the same reason
        {
          code: `export default function P() { return (<div aria-describedby="help-text">·</div>); }`,
          filename: 'components/help.tsx',
        },
        // 21. Decorative multi-char em-dash in JSX text — exempt (punctuation-only per M-1)
        {
          code: `export default function P() { return <span>{'—'}</span>; }`,
          filename: 'components/decorative.tsx',
        },
        // 22. Decorative ellipsis + space in JSX text — exempt (punctuation + whitespace only)
        {
          code: `export default function P() { return <span>{'… '}</span>; }`,
          filename: 'components/decorative.tsx',
        },
        // 23. `<hr aria-hidden />` — no user-visible content, aria-hidden attr
        // is in the allowed attribute set, no text, no flaggable attr
        {
          code: `export default function P() { return <hr aria-hidden />; }`,
          filename: 'components/rule.tsx',
        },
        // 24. Decorative section marker + bullet in JSX text — exempt (punctuation only)
        {
          code: `export default function P() { return <span>{'§ · +'}</span>; }`,
          filename: 'components/masthead-rule.tsx',
        },
      ],
      invalid: [
        // 1. JSX text literal in a component — forbidden
        {
          code: `export default function P() { return <p>Hello world</p>; }`,
          filename: 'components/greet.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
        // 2. Multi-line JSX text literal
        {
          code: `export default function P() { return <p>Some long user-visible copy</p>; }`,
          filename: 'components/copy.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
        // 3. aria-label string literal
        {
          code: `export default function P() { return <button aria-label="Sign out">·</button>; }`,
          filename: 'components/nav/sidebar.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 4. title string literal
        {
          code: `export default function P() { return <span title="Help text">·</span>; }`,
          filename: 'components/tooltip.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 5. alt string literal
        {
          code: `export default function P() { return <img src="/x.png" alt="A photo of pho" />; }`,
          filename: 'components/photo.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 6. placeholder string literal
        {
          code: `export default function P() { return <input placeholder="Enter your name" />; }`,
          filename: 'components/input.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 7. aria-placeholder string literal (user-visible placeholder prompt per ARIA)
        {
          code: `export default function P() { return <div aria-placeholder="Enter value">·</div>; }`,
          filename: 'components/help.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 8. JSXExpressionContainer wrapping a string literal in text position
        {
          code: `export default function P() { return <p>{"Hello world"}</p>; }`,
          filename: 'components/copy.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
        // 9. Component prop on a USER-VISIBLE allowlist attribute (alt)
        {
          code: `export default function P() { return <img src="/x.png" alt={"A photo"} />; }`,
          filename: 'components/photo.tsx',
          errors: [{ messageId: 'inlineJsxAttr' }],
        },
        // 10. In app/** scope
        {
          code: `export default function P() { return <h1>Dashboard Heading</h1>; }`,
          filename: 'app/(app)/dashboard/page.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
        // 11. Multiple literals in a single component — 2 reports
        {
          code: `export default function P() { return (<div><p>First</p><p>Second</p></div>); }`,
          filename: 'components/pair.tsx',
          errors: [{ messageId: 'inlineJsxText' }, { messageId: 'inlineJsxText' }],
        },
        // 12. Pure TemplateLiteral in JSX text — Codex R1 I-1 tightening.
        // `<p>{\`Hello world\`}</p>` is just a string literal dressed up.
        {
          code: 'export default function P() { return <p>{`Hello world`}</p>; }',
          filename: 'components/copy.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
        // 13. Interpolated TemplateLiteral in JSX text — Codex R1 I-1
        // tightening. `Hello ` is substantive user copy that must route
        // through t.*.*; only the dynamic name binding is allowed.
        {
          code: 'export default function P({ name }: { name: string }) { return <p>{`Hello ${name}!`}</p>; }',
          filename: 'components/greet.tsx',
          errors: [{ messageId: 'inlineJsxText' }],
        },
      ],
    });
  });
});

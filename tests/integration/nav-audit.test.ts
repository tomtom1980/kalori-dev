/**
 * Task B.5 (US-STAB-B5) AC1 — site-wide nav audit integration test.
 *
 * Imports the pure-function form of `scripts/nav-audit.mjs` and runs it against
 * the LIVE filesystem at HEAD. No mocks — the test asserts the actual route
 * universe + nav-link surface have zero broken links, zero invalid hrefs, and
 * zero unexpected orphan routes.
 *
 * AC1 (verbatim from design-doc §4):
 *   GIVEN the audit script `scripts/nav-audit.mjs` walks every `<a>` and
 *   `<Link>`, WHEN the script runs against HEAD, THEN it reports zero 404s,
 *   zero dead links, zero orphan-pages.
 *
 * The audit's "orphan" definition allows an explicit list of pages that are
 * intentionally NOT in nav chrome but ARE reachable through app flows
 * (briefing §B5 "Orphan candidates" + design-doc §4 scope-cap on B.5).
 *
 * Codex Round 1 (2026-05-08) added coverage for:
 *   - Primary-nav vs contextual-nav distinction (F-2)
 *   - Runtime-href reporting via `unverifiableHrefs[]` + pragma resolution (F-1)
 *   - Edge-case route patterns: optional catch-all, intercepted routes,
 *     route groups (F-3)
 */
// test: AC1 — nav audit reports zero 404s, zero dead links, zero orphans
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditNavLinks,
  discoverRoutes,
  discoverNavLinks,
  isPrimaryNavSurface,
  routeToRegExp,
  ALLOWED_ORPHANS,
} from '../../scripts/nav-audit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('Task B.5 — nav audit (AC1)', () => {
  it('reports zero broken links, zero invalid hrefs, zero unexpected orphan routes, zero unverifiable runtime hrefs against HEAD', async () => {
    // Discovery — real filesystem walk, no mocks.
    const routes = await discoverRoutes(REPO_ROOT);
    const navLinks = await discoverNavLinks(REPO_ROOT);

    // Sanity: discovery actually found something. If routes/nav-links return
    // empty arrays the audit would trivially pass with zero findings — we
    // want to surface that as a discovery bug rather than a false pass.
    expect(routes.length).toBeGreaterThan(5);
    expect(navLinks.length).toBeGreaterThan(0);

    // Run the audit. ALLOWED_ORPHANS encodes routes intentionally not in nav
    // chrome (auth, onboarding, modal stubs, log sub-routes, weight, offline,
    // dynamic /library/[id]).
    const findings = auditNavLinks({
      routes,
      navLinks,
      allowedOrphans: ALLOWED_ORPHANS,
    });

    // AC1: zero 404s.
    expect(
      findings.brokenLinks,
      `Broken nav links (href does not resolve to any route):\n${JSON.stringify(findings.brokenLinks, null, 2)}`,
    ).toEqual([]);

    // AC1: zero invalid hrefs (no #-only, no javascript:, no empty).
    expect(
      findings.invalidHrefs,
      `Invalid hrefs:\n${JSON.stringify(findings.invalidHrefs, null, 2)}`,
    ).toEqual([]);

    // AC1: zero orphan routes — every page is either in PRIMARY nav or in
    // the allowlist (reached via app flows or special-purpose route).
    expect(
      findings.orphanRoutes,
      `Orphan routes (page exists but no PRIMARY nav surface links to it AND not in allowlist):\n${JSON.stringify(findings.orphanRoutes, null, 2)}`,
    ).toEqual([]);

    // F-1: zero unverifiable runtime hrefs — every runtime href in the
    // codebase has a `// @nav-audit ...` pragma declaring intent.
    expect(
      findings.unverifiableHrefs,
      `Unverifiable runtime hrefs (missing // @nav-audit pragma):\n${JSON.stringify(findings.unverifiableHrefs, null, 2)}`,
    ).toEqual([]);
  });

  it('flags an injected broken link (negative-control sanity check on auditNavLinks)', () => {
    // Negative-control: if we feed auditNavLinks a link to a non-existent
    // route, it MUST surface as a broken link. This guards against a
    // future regression where the function silently returns "all clear"
    // because of a discovery or comparison bug.
    const findings = auditNavLinks({
      routes: ['/dashboard', '/library', '/progress', '/settings'],
      navLinks: [
        { surface: 'components/nav/sidebar.tsx', href: '/dashboard', label: 'DASH' },
        { surface: 'components/nav/sidebar.tsx', href: '/this-route-does-not-exist', label: 'BAD' },
      ],
      allowedOrphans: [],
    });
    expect(findings.brokenLinks).toHaveLength(1);
    expect(findings.brokenLinks[0]?.href).toBe('/this-route-does-not-exist');
  });

  it('flags a hash-only href as invalid (negative-control)', () => {
    const findings = auditNavLinks({
      routes: ['/dashboard'],
      navLinks: [
        { surface: 'components/nav/sidebar.tsx', href: '#', label: 'HASH' },
        { surface: 'components/nav/sidebar.tsx', href: '', label: 'EMPTY' },
        { surface: 'components/nav/sidebar.tsx', href: 'javascript:void(0)', label: 'JS' },
      ],
      allowedOrphans: [],
    });
    expect(findings.invalidHrefs.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT flag external URLs as broken (http/https/mailto/blob/data)', () => {
    const findings = auditNavLinks({
      routes: ['/dashboard'],
      navLinks: [
        { surface: 'components/nav/footer.tsx', href: 'https://example.com', label: 'EXT' },
        { surface: 'components/nav/footer.tsx', href: 'http://example.org', label: 'EXT' },
        { surface: 'components/nav/footer.tsx', href: 'mailto:hi@example.com', label: 'EMAIL' },
        {
          surface: 'components/nav/footer.tsx',
          href: 'blob:https://example.com/abc',
          label: 'BLOB',
        },
        { surface: 'components/nav/footer.tsx', href: 'data:text/plain,hello', label: 'DATA' },
      ],
      // /dashboard would be flagged as orphan if we don't allow it; mark
      // explicitly to keep this test focused on broken/invalid only.
      allowedOrphans: ['/dashboard'],
    });
    expect(findings.brokenLinks).toEqual([]);
    expect(findings.invalidHrefs).toEqual([]);
  });

  it('does NOT flag in-page anchors (#section) as broken — they are page-internal navigation', () => {
    const findings = auditNavLinks({
      routes: ['/dashboard'],
      navLinks: [
        { surface: 'components/nav/sidebar.tsx', href: '#app-main', label: 'SKIP' },
        { surface: 'components/nav/sidebar.tsx', href: '/dashboard#section', label: 'ANCHOR' },
      ],
      allowedOrphans: [],
    });
    // `#app-main` is a same-page anchor (no path); allowed.
    // `/dashboard#section` resolves to /dashboard ignoring the hash; allowed.
    expect(findings.brokenLinks).toEqual([]);
    expect(findings.invalidHrefs).toEqual([]);
  });

  it('matches dynamic routes [id] against concrete hrefs like /library/123', () => {
    const findings = auditNavLinks({
      routes: ['/library', '/library/[id]'],
      navLinks: [
        { surface: 'components/nav/sidebar.tsx', href: '/library/pho-bo', label: 'LINK' },
        { surface: 'components/nav/sidebar.tsx', href: '/library', label: 'INDEX' },
      ],
      allowedOrphans: [],
    });
    expect(findings.brokenLinks).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Codex Round 1 — F-1 / F-2 / F-3 dedicated coverage
// -----------------------------------------------------------------------------

describe('Task B.5 — nav audit (Codex R1: F-2 primary-nav vs contextual-nav)', () => {
  it('isPrimaryNavSurface recognises components/nav/* and *Nav*/Sidebar/BottomTab/TopBar/Footer', () => {
    expect(isPrimaryNavSurface('components/nav/sidebar.tsx')).toBe(true);
    expect(isPrimaryNavSurface('components/nav/bottom-tab-bar.tsx')).toBe(true);
    expect(isPrimaryNavSurface('components/nav/top-app-bar.tsx')).toBe(true);
    expect(isPrimaryNavSurface('components/nav/primary-destinations.ts')).toBe(true);
    expect(isPrimaryNavSurface('components/nav/nav-shell.tsx')).toBe(true);
    expect(isPrimaryNavSurface('components/Footer.tsx')).toBe(true);
  });

  it('isPrimaryNavSurface rejects contextual / recovery / in-content surfaces', () => {
    expect(isPrimaryNavSurface('app/not-found.tsx')).toBe(false);
    expect(isPrimaryNavSurface('app/(app)/library/[id]/not-found.tsx')).toBe(false);
    expect(isPrimaryNavSurface('app/error.tsx')).toBe(false);
    expect(isPrimaryNavSurface('app/(app)/log/_components/ConfirmationScreen.tsx')).toBe(false);
    expect(isPrimaryNavSurface('app/page.tsx')).toBe(false);
    expect(isPrimaryNavSurface('components/settings/ExportModal.tsx')).toBe(false);
  });

  it('orphan check counts only PRIMARY-NAV surfaces — a recovery-only link does NOT cover a route', () => {
    // Scenario: `/future-feature` exists as a page, and the only `<Link>`
    // pointing at it is from `app/not-found.tsx` (a contextual recovery
    // surface). The route MUST still be flagged as an orphan because no
    // primary-nav chrome exposes it.
    const findings = auditNavLinks({
      routes: ['/future-feature'],
      navLinks: [{ surface: 'app/not-found.tsx', href: '/future-feature', label: 'GO' }],
      allowedOrphans: [],
    });
    expect(findings.orphanRoutes).toEqual(['/future-feature']);
  });

  it('orphan check passes when a primary-nav surface links to the route', () => {
    const findings = auditNavLinks({
      routes: ['/future-feature'],
      navLinks: [{ surface: 'components/nav/sidebar.tsx', href: '/future-feature', label: 'NEW' }],
      allowedOrphans: [],
    });
    expect(findings.orphanRoutes).toEqual([]);
  });

  it('orphan check accepts a custom primaryNavPredicate for project-specific surfaces', () => {
    const findings = auditNavLinks({
      routes: ['/x'],
      navLinks: [{ surface: 'app/(marketing)/HeroCta.tsx', href: '/x', label: 'CTA' }],
      allowedOrphans: [],
      primaryNavPredicate: (s) => s.includes('HeroCta'),
    });
    expect(findings.orphanRoutes).toEqual([]);
  });
});

describe('Task B.5 — nav audit (Codex R1: F-1 runtime href detection)', () => {
  it('reports a runtime href without a pragma as unverifiable', () => {
    const findings = auditNavLinks({
      routes: ['/progress'],
      navLinks: [
        {
          surface: 'app/(app)/progress/_components/Toolbar.tsx',
          href: '<runtime: hrefFor(slug)>',
          label: 'runtime[hrefFor(slug)]',
          kind: 'runtime',
        },
      ],
      allowedOrphans: [],
    });
    expect(findings.unverifiableHrefs).toHaveLength(1);
    expect(findings.unverifiableHrefs[0]?.label).toContain('hrefFor');
  });

  it('treats a pragma-resolved runtime href as a static link (no unverifiable, route covered)', () => {
    // Simulates the discovery layer's pragma resolution: the runtime
    // expression is replaced by the pragma's `href:` value, and the
    // record is emitted WITHOUT `kind: 'runtime'`.
    const findings = auditNavLinks({
      routes: ['/progress'],
      navLinks: [
        {
          surface: 'components/nav/some-runtime-link.tsx',
          href: '/progress',
          label: 'runtime[hrefFor(slug)]',
        },
      ],
      allowedOrphans: [],
    });
    expect(findings.unverifiableHrefs).toEqual([]);
    expect(findings.brokenLinks).toEqual([]);
    expect(findings.orphanRoutes).toEqual([]);
  });

  it('discovers ProgressRangeToolbar runtime href via its pragma', async () => {
    // Live-codebase check: the ProgressRangeToolbar uses
    // `<a href={hrefFor(slug)}>` with a `// @nav-audit href: /progress`
    // pragma. The discovery must surface a record whose href is `/progress`
    // and whose label flags it as runtime-resolved.
    const navLinks = await discoverNavLinks(REPO_ROOT);
    const toolbarLinks = navLinks.filter((l) => l.surface.includes('ProgressRangeToolbar'));
    // Should contain at least one runtime-pragma-resolved link to /progress
    const resolved = toolbarLinks.find(
      (l) => l.href === '/progress' && (l.label ?? '').startsWith('runtime['),
    );
    expect(
      resolved,
      `Expected pragma-resolved /progress link from ProgressRangeToolbar; got:\n${JSON.stringify(toolbarLinks, null, 2)}`,
    ).toBeTruthy();
  });
});

describe('Task B.5 — nav audit (Codex R1: F-3 route discovery edge cases)', () => {
  it('matches optional catch-all routes [[...slug]] against concrete and base hrefs', () => {
    const findings = auditNavLinks({
      routes: ['/docs', '/docs/[[...slug]]'],
      navLinks: [
        { surface: 'components/nav/sidebar.tsx', href: '/docs', label: 'BASE' },
        { surface: 'components/nav/sidebar.tsx', href: '/docs/getting-started', label: 'NESTED' },
        { surface: 'components/nav/sidebar.tsx', href: '/docs/a/b/c', label: 'DEEP' },
      ],
      allowedOrphans: [],
    });
    expect(findings.brokenLinks).toEqual([]);
  });

  it('routeToRegExp: optional catch-all matches base path AND segments, with boundary safety', () => {
    // F-3-residual (Codex Round 2): /docs/[[...slug]] must match BOTH /docs
    // (base, no segments) AND /docs/foo/bar (with segments). Pre-fix the
    // transform produced ^/docs/.*$ which rejected the bare base path.
    const regex = routeToRegExp('/docs/[[...slug]]');
    expect(regex.test('/docs')).toBe(true); // base path — was failing pre-fix
    expect(regex.test('/docs/foo')).toBe(true);
    expect(regex.test('/docs/foo/bar/baz')).toBe(true);
    expect(regex.test('/docsx')).toBe(false); // boundary — must not partial-match
    expect(regex.test('/other')).toBe(false);
    expect(regex.test('/doc')).toBe(false); // boundary — prefix must be exact
  });

  it('routeToRegExp: root-level optional catch-all /[[...slug]] matches root and any path, but NOT empty', () => {
    // Edge case: when the optional catch-all IS the route (no static prefix),
    // the regex must still match `/` (root) and any sub-path. It must NOT
    // match the empty string — Next.js pathnames are slash-rooted (Codex
    // Round 3 boundary check on root optional catch-all).
    const regex = routeToRegExp('/[[...slug]]');
    expect(regex.test('/')).toBe(true);
    expect(regex.test('/foo')).toBe(true);
    expect(regex.test('/foo/bar')).toBe(true);
    expect(regex.test('')).toBe(false); // boundary: leading slash mandatory
  });

  it('routeToRegExp: required catch-all /[...slug] still REQUIRES at least one segment', () => {
    // Regression guard: the F-3-residual fix targeted ONLY the optional
    // catch-all (`[[...slug]]`); required catch-all (`[...slug]`) must
    // continue to require a non-empty segment after the prefix.
    const regex = routeToRegExp('/blog/[...slug]');
    expect(regex.test('/blog/post-1')).toBe(true);
    expect(regex.test('/blog/a/b')).toBe(true);
    expect(regex.test('/blog')).toBe(false); // base alone must NOT match
    expect(regex.test('/blog/')).toBe(false);
  });

  it('routeToRegExp: mixed dynamic + optional catch-all /[locale]/[[...slug]] handles base and segments', () => {
    const regex = routeToRegExp('/[locale]/[[...slug]]');
    expect(regex.test('/en')).toBe(true); // base under locale
    expect(regex.test('/en/foo')).toBe(true);
    expect(regex.test('/en/foo/bar')).toBe(true);
    expect(regex.test('/')).toBe(false); // missing locale segment
  });

  it('does not discover intercepted-route directory prefixes as separate routes', async () => {
    // The discovery layer strips `(.)`, `(..)`, `(...)` intercept prefixes
    // when computing the URL pathname. Routes are identified by their
    // logical URL, not by the directory structure. (The repo currently
    // has no intercepted routes; this test guards future use.)
    const routes = await discoverRoutes(REPO_ROOT);
    // No discovered route should contain a `(.)`, `(..)`, or `(...)` segment.
    const intercepted = routes.filter((r) => /\(\.{1,3}\)/.test(r));
    expect(intercepted).toEqual([]);
  });

  it('does not discover route groups as URL segments', async () => {
    const routes = await discoverRoutes(REPO_ROOT);
    // No discovered route should contain a `(group)` segment — they are
    // organisational only.
    const groupy = routes.filter((r) => /\([^)]+\)/.test(r));
    expect(groupy).toEqual([]);
  });

  it('does not discover api/ route handlers as nav routes', async () => {
    const routes = await discoverRoutes(REPO_ROOT);
    // API endpoints (e.g. /api/entries/save) should NOT be in the nav
    // route universe — they're discovered via `route.ts` files which the
    // walker filters out.
    expect(routes.filter((r) => r.startsWith('/api/'))).toEqual([]);
  });
});

#!/usr/bin/env node
/**
 * Task B.5 (US-STAB-B5) — site-wide nav audit.
 *
 * Static analysis CLI + pure-function module. Two responsibilities:
 *
 *   1. Discovery — walk the App Router routes (`app/STAR/page.tsx`) and
 *      the nav-link callsites (`<Link href="...">` and `<a href="...">`
 *      inside `app/STAR` and `components/STAR`). No runtime browser
 *      involvement.
 *
 *   2. Audit — for every discovered nav link, resolve `href` against the
 *      route universe + middleware allowlist. Report:
 *        - brokenLinks: hrefs that don't resolve to any known route
 *        - invalidHrefs: hrefs that are empty, `#`, or `javascript:`
 *        - orphanRoutes: pages on disk that NO PRIMARY-NAV surface links
 *          to AND are NOT in the explicit user-flow allowlist
 *        - unverifiableHrefs: runtime-generated hrefs (e.g.
 *          `<Link href={hrefFor(slug)}>`) that the static audit cannot
 *          resolve, AND that lack a `// @nav-audit ...` pragma declaring
 *          intent. These are flagged for human review.
 *
 * Codex Round 1 hardening (2026-05-08):
 *   F-1 — runtime-href detection: previously, runtime-generated hrefs like
 *         `<Link href={hrefFor(slug)}>` slipped through every extractor
 *         and produced a FALSE-CLEAN audit. Now detected separately and
 *         categorised via pragma OR `unverifiableHrefs[]`.
 *   F-2 — orphan check now distinguishes PRIMARY-NAV surfaces (sidebar,
 *         bottom-tab, top-bar, footer, nav-shell, primary-destinations
 *         constant) from CONTEXTUAL surfaces (e.g. a 404 page's recovery
 *         link). Only primary-nav coverage satisfies the orphan check.
 *   F-3 — route discovery now explicitly handles optional catch-all
 *         `[[...slug]]`, intercepted routes (`(.)foo` / `(..)foo`
 *         / `(...)foo`), and parallel-slot directories `@slot/`. Route
 *         handlers (`route.ts`) are skipped (they're API endpoints, not
 *         nav routes).
 *
 * Pragma syntax (F-1):
 *
 *   - `// @nav-audit href: /resolved/path`
 *       Declares the resolved target route for a runtime href. Audited
 *       like a literal href.
 *   - `// @nav-audit external`
 *       Declares the runtime href targets an external URL (blob:,
 *       http(s):, data:, mailto:, tel:). Skipped from validation.
 *   - `// @nav-audit ignore`
 *       Declares the runtime href is page-internal (e.g. `#anchor`,
 *       blob URL for download anchors) and intentionally not a nav
 *       destination.
 *
 *   Pragma must appear on the same line as the href OR on the line
 *   immediately above it.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Routes intentionally NOT linked from any PRIMARY nav surface. These are
 * reachable through other app flows (auth, modal launcher, server redirects,
 * app shell fallbacks) and must NOT be flagged as orphans. Each entry is
 * annotated with WHY it's allowed.
 *
 * @type {readonly string[]}
 */
export const ALLOWED_ORPHANS = [
  // Marketing landing — entry point. The public landing IS reached via
  // direct URL / external traffic; no internal nav surface links to `/`
  // because in-app users are inside the (app) shell and the sidebar +
  // bottom-tab use absolute routes. Server-side redirects (marketing →
  // dashboard for authed) wire flow without a literal href.
  '/',
  // Auth flow — reached from the marketing landing CTA + middleware
  // redirect_to fallback. Not a primary nav destination.
  '/login',
  // Onboarding — reached via post-sign-in redirect when the profiles row is
  // missing or onboarding_completed_at is null. Linked from the auth flow,
  // not the nav chrome.
  '/onboarding',
  // Log modal stub — `/log` is the modal-host route. The actual entry point
  // is the LogFAB which opens a modal in-place. Direct URL navigation works
  // (route exists), but it's not in PRIMARY_DESTINATIONS by design.
  '/log',
  // Log copy-yesterday — reached from the log flow's "Copy yesterday's log"
  // affordance, not the nav chrome.
  '/log/copy-yesterday',
  // Weight ledger — reached via dashboard/progress quick-add affordances.
  // Phase B.4 mounted the weight quick-add on the progress page; the
  // /weight route is a future detail surface.
  '/weight',
  // Offline — Service Worker fallback for navigation requests when the
  // network is unavailable. Reached via SW redirect, never via a nav link.
  '/offline',
];

/**
 * Surfaces (file paths, normalised to forward-slash) that COUNT as primary
 * navigation chrome for the orphan check. Patterns are matched
 * case-insensitively against the relative file path.
 *
 * Primary-nav surfaces:
 *   - The `components/nav/` folder (sidebar, bottom-tab, top-bar,
 *     primary-destinations constant, nav-shell etc.)
 *   - Files whose basename matches *Sidebar*, *BottomNav*, *BottomTab*,
 *     *TopBar*, *Header*, *Footer*, *Nav*
 *
 * NOT primary-nav (contextual / recovery surfaces):
 *   - `app/not-found.tsx`, `app/error.tsx`, `app/loading.tsx` and segment
 *     equivalents
 *   - In-page links (e.g. CTAs inside marketing landing, in-content links
 *     in `_components/`, Quick-add buttons)
 *   - Download anchors (ExportModal etc.)
 *
 * @type {readonly RegExp[]}
 */
export const PRIMARY_NAV_PATTERNS = [
  /^components\/nav\//i,
  /\b(sidebar|bottom-?tab|bottom-?nav|top-?bar|header|footer)\b/i,
  /\bnav(-|_|\.|\/)/i,
];

/**
 * Default predicate for whether a surface (relative file path) counts as
 * primary navigation chrome.
 */
export function isPrimaryNavSurface(surface) {
  if (typeof surface !== 'string') return false;
  const normalised = surface.replace(/\\/g, '/');
  return PRIMARY_NAV_PATTERNS.some((re) => re.test(normalised));
}

function isInPageAnchor(href) {
  return href.startsWith('#');
}

function isExternalUrl(href) {
  return /^(https?:\/\/|mailto:|tel:|sms:|blob:|data:)/i.test(href);
}

function isInvalidHref(href) {
  if (typeof href !== 'string') return true;
  const trimmed = href.trim();
  if (trimmed === '') return true;
  if (trimmed === '#') return true;
  if (/^javascript:/i.test(trimmed)) return true;
  return false;
}

function stripHrefSuffixes(href) {
  return href.split('?')[0].split('#')[0];
}

// F-3-residual (Round 3): optional catch-all `/[[...rest]]` MUST match BOTH
// the base path (no segments) AND any subpath, while preserving Next.js's
// slash-rooted invariant (every pathname starts with `/`, never empty).
//
//   /docs/[[...slug]]     -> ^/docs(?:/.*)?$    matches /docs AND /docs/foo
//   /[locale]/[[...slug]] -> ^/[^/]+(?:/.*)?$   matches /en AND /en/foo
//   /[[...slug]]          -> ^/.*$              matches / AND /foo (NOT empty)
//
// The root form is special-cased so the mandatory leading `/` is preserved;
// the prefixed form consumes the slash before `[[...rest]]` so the entire
// `/<segments>` block becomes optional.
//
// Required catch-all `/[...rest]` keeps requiring at least one segment.
// Single segment `[param]` matches a single non-slash run.
export function routeToRegExp(route) {
  let pattern;
  if (/^\/\[\[\.\.\.[^\]]+\]\]$/.test(route)) {
    // Root-level optional catch-all: keep leading slash mandatory, segments
    // optional. `/.*` matches `/` and `/foo/bar`, NOT empty string.
    pattern = '/.*';
  } else {
    pattern = route
      .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, '(?:/.*)?')
      .replace(/\[\.\.\.[^\]]+\]/g, '.+')
      .replace(/\[[^\]]+\]/g, '[^/]+');
  }
  return new RegExp('^' + pattern + '$');
}

function routeMatches(route, href) {
  const cleanHref = stripHrefSuffixes(href);
  if (route === cleanHref) return true;
  if (!route.includes('[')) return false;
  return routeToRegExp(route).test(cleanHref);
}

/**
 * Audit nav links against a known route universe.
 *
 * Pure function — no I/O. Tests pass discovered data directly so the audit
 * is deterministic.
 *
 * @param {Object}   args
 * @param {string[]} args.routes
 * @param {Array<{surface:string,href:string,label?:string,kind?:string}>} args.navLinks
 * @param {string[]} [args.allowedOrphans=[]]
 * @param {(surface:string)=>boolean} [args.primaryNavPredicate=isPrimaryNavSurface]
 */
export function auditNavLinks({
  routes,
  navLinks,
  allowedOrphans = [],
  primaryNavPredicate = isPrimaryNavSurface,
}) {
  const findings = {
    brokenLinks: [],
    invalidHrefs: [],
    orphanRoutes: [],
    unverifiableHrefs: [],
  };

  for (const link of navLinks) {
    // F-1: runtime-generated href without resolving pragma. Cannot be
    // statically validated; surface as `unverifiableHrefs` for human
    // review unless the link declared `external`/`ignore` upstream
    // (in which case the discovery layer already filtered it out).
    if (link.kind === 'runtime') {
      findings.unverifiableHrefs.push(link);
      continue;
    }

    if (isInvalidHref(link.href)) {
      findings.invalidHrefs.push(link);
      continue;
    }

    if (isExternalUrl(link.href)) continue;

    // Same-page anchor (`#section` or `#app-main`) — page-internal, not a
    // routing concern. Allowed.
    if (isInPageAnchor(link.href)) continue;

    const cleanHref = stripHrefSuffixes(link.href);

    // Skip hrefs that contain a leftover template-literal placeholder we
    // couldn't resolve. These get reported as invalid so the maintainer
    // can refactor.
    if (cleanHref.includes('${')) {
      findings.invalidHrefs.push(link);
      continue;
    }

    const matchesRoute = routes.some((r) => routeMatches(r, cleanHref));
    if (!matchesRoute) findings.brokenLinks.push(link);
  }

  // F-2: orphan check counts only PRIMARY-NAV surfaces. A future page
  // linked ONLY from `app/not-found.tsx` (a contextual recovery surface)
  // would still surface as an orphan, since no primary-nav chrome
  // exposes it.
  for (const route of routes) {
    if (allowedOrphans.includes(route)) continue;
    // Dynamic routes ([param], [...catchall], [[...optional]]) are
    // reached via parameterised links validated above; they are not
    // direct nav destinations.
    if (route.includes('[')) continue;
    if (['/not-found', '/404', '/error', '/loading'].includes(route)) continue;

    const hasPrimaryNavLink = navLinks.some((l) => {
      if (!primaryNavPredicate(l.surface)) return false;
      // Runtime-pragma resolved hrefs count as primary-nav coverage.
      const cleanHref = stripHrefSuffixes(l.href ?? '');
      return routeMatches(route, cleanHref);
    });
    if (!hasPrimaryNavLink) findings.orphanRoutes.push(route);
  }

  return findings;
}

async function walkDir(dir, predicate) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name.startsWith('.')) continue;
      out.push(...(await walkDir(fullPath, predicate)));
    } else if (entry.isFile() && predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

/**
 * Convert an absolute filesystem path under `<repoRoot>/app/.../page.tsx`
 * into the URL pathname.
 *
 * Strips:
 *   - `app/` prefix
 *   - `(group)` route groups          (e.g. `(app)`, `(marketing)`)
 *   - `(.)foo`, `(..)foo`, `(...)foo` intercepted-route prefixes
 *   - `/page.tsx` suffix
 *
 * Returns `null` for paths inside:
 *   - private folders (`_components`, `_lib`)
 *   - parallel-route slots (`@slot/`)
 *
 * Maps `[[...slug]]` to a dynamic-pattern marker (kept verbatim — the
 * audit's `routeToRegExp` knows how to expand it).
 *
 * Returns `'/'` for the root marketing index.
 */
function pageFileToRoute(repoRoot, filePath) {
  const rel = path.relative(path.join(repoRoot, 'app'), filePath).replace(/\\/g, '/');
  if (rel === 'page.tsx') return '/';
  if (!rel.endsWith('/page.tsx')) return null;

  const segments = rel.slice(0, -'/page.tsx'.length).split('/');
  const out = [];
  for (const seg of segments) {
    if (seg === '') continue;
    // Route group: `(group)` — e.g. `(app)`, `(marketing)`
    if (/^\([^)]+\)$/.test(seg)) continue;
    // Intercepted route prefix: a segment that BEGINS with `(.)`,
    // `(..)`, or `(...)` followed by content. Strip the prefix; keep
    // the suffix as the actual segment.
    const interceptMatch = seg.match(/^\((\.{1,3})\)(.+)$/);
    if (interceptMatch) {
      out.push(interceptMatch[2]);
      continue;
    }
    // Private folder: `_components`, `_lib`
    if (seg.startsWith('_')) return null;
    // Parallel-route slot: `@slot`
    if (seg.startsWith('@')) return null;
    out.push(seg);
  }
  if (out.length === 0) return '/';
  return '/' + out.join('/');
}

/**
 * Discover all App Router page routes by walking the app directory.
 *
 * Skips:
 *   - `route.ts`/`route.js` files (API endpoints, not nav routes)
 *   - Private folders (`_*`)
 *   - Parallel-route slot directories (`@*`)
 *   - Special files (`layout`, `loading`, `error`, `not-found`,
 *     `default`, `template`) — these aren't routes themselves.
 */
export async function discoverRoutes(repoRoot) {
  const appDir = path.join(repoRoot, 'app');
  const pageFiles = await walkDir(appDir, (filePath) => {
    const base = path.basename(filePath);
    return base === 'page.tsx' || base === 'page.ts' || base === 'page.jsx';
  });
  const routes = new Set();
  for (const filePath of pageFiles) {
    const route = pageFileToRoute(repoRoot, filePath);
    if (route !== null) routes.add(route);
  }
  return Array.from(routes).sort();
}

// ---------------------------------------------------------------------------
// Href extraction
// ---------------------------------------------------------------------------
//
// Static hrefs (resolvable):
//   1. href="/path"               — JSX string literal attribute
//   2. href={'/path'}             — JSX expression, single-quoted
//   3. href={"/path"}             — JSX expression, double-quoted
//   4. href: '/path'              — TS object-literal property (single)
//   5. href: "/path"              — TS object-literal property (double)
//
// Runtime hrefs (NOT statically resolvable — F-1 fix):
//   6. href={anything-else}       — variable, function call, ternary,
//                                    template literal, member expr
//
//   For pattern 6, the script looks for a `// @nav-audit ...` pragma on
//   the same line OR the line immediately above. Pragma options:
//     - `href: /resolved/path`  (resolves the runtime expression)
//     - `external`              (declared external; skipped)
//     - `ignore`                (declared not-a-nav-destination)
//
//   Without a pragma, the link is recorded with `kind: 'runtime'` and
//   surfaces via `findings.unverifiableHrefs[]`.
//
// Template literals at definition sites (`href={\`/foo/${id}\`}`) fall
// under pattern 6 (runtime). They will trigger the pragma-or-flag path.
const HREF_STRING_LITERAL = /href\s*=\s*"([^"]+)"/g;
const HREF_JSX_SINGLE = /href\s*=\s*\{\s*'([^']+)'\s*\}/g;
const HREF_JSX_DOUBLE = /href\s*=\s*\{\s*"([^"]+)"\s*\}/g;
const HREF_OBJECT_SINGLE = /href\s*:\s*'([^']+)'/g;
const HREF_OBJECT_DOUBLE = /href\s*:\s*"([^"]+)"/g;
// Runtime href: matches `href={EXPRESSION}` where EXPRESSION is anything
// that doesn't start with a quote (so we don't double-count patterns
// 2/3 above). Captures the offset so we can locate the surrounding
// pragma.
const HREF_JSX_EXPR = /href\s*=\s*\{\s*([^'"]([^{}]*\{[^{}]*\}[^{}]*)*[^{}]*)\}/g;

/**
 * Look for a `// @nav-audit ...` pragma associated with the href at
 * `offset` in `source`. Returns the parsed pragma directive (or null
 * if none found).
 *
 * Search rules:
 *   - SAME line as the href (trailing comment).
 *   - Up to 5 lines IMMEDIATELY ABOVE the href, walking upward and
 *     stopping at the first non-blank, non-comment line. This allows
 *     a pragma followed by explanatory `// ...` continuation comments,
 *     while preventing the pragma from "leaking" across an unrelated
 *     code line above.
 *
 * Pragma directives:
 *   - `href: /path`   → { kind: 'href', href: '/path' }
 *   - `external`      → { kind: 'external' }
 *   - `ignore`        → { kind: 'ignore' }
 */
const MAX_PRAGMA_LOOKBACK_LINES = 5;

function findPragmaNear(source, offset) {
  // Find the start of the line containing `offset`.
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf('\n') + 1;
  const lineEnd = source.indexOf('\n', offset);
  const currentLine = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);

  // Same-line pragma (e.g. `<Link href={hrefFor(slug)}> // @nav-audit href: /progress`)
  const sameLineMatch = currentLine.match(/\/\/\s*@nav-audit\s+(.+?)\s*$/);
  if (sameLineMatch) return parsePragma(sameLineMatch[1]);

  // Walk up to MAX_PRAGMA_LOOKBACK_LINES lines above, stopping at the
  // first non-blank, non-comment line. The pragma must appear in an
  // unbroken comment-block immediately above the href.
  let cursor = lineStart;
  for (let i = 0; i < MAX_PRAGMA_LOOKBACK_LINES && cursor > 0; i++) {
    const prevLineEnd = cursor - 1; // the '\n' before the current cursor line
    const prevLineStart = source.lastIndexOf('\n', prevLineEnd - 1) + 1;
    const prevLine = source.slice(prevLineStart, prevLineEnd);
    const trimmed = prevLine.trim();

    if (trimmed === '') {
      // Blank line — pragma block must be unbroken; stop.
      return null;
    }

    // Match a comment line. Acceptable forms:
    //   `// @nav-audit ...`     — the pragma itself
    //   `// continuation text`  — continuation comment (skip and keep walking)
    //   `* @nav-audit ...`      — JSDoc-style line (also accepted)
    const pragmaMatch = trimmed.match(/^(?:\/\/|\*)\s*@nav-audit\s+(.+?)\s*$/);
    if (pragmaMatch) return parsePragma(pragmaMatch[1]);

    const isComment = /^\/\//.test(trimmed) || /^\*/.test(trimmed) || /^\/\*/.test(trimmed);
    if (!isComment) {
      // Hit a non-comment line — pragma cannot leak across actual code.
      return null;
    }
    cursor = prevLineStart;
  }

  return null;
}

function parsePragma(text) {
  const trimmed = text.trim();
  if (trimmed === 'external') return { kind: 'external' };
  if (trimmed === 'ignore') return { kind: 'ignore' };
  const hrefMatch = trimmed.match(/^href\s*:\s*(\S+)$/);
  if (hrefMatch) return { kind: 'href', href: hrefMatch[1] };
  return null;
}

/**
 * Discover all `<Link href="..">`, `<a href="..">`, and runtime
 * `<Link href={expr}>` callsites in `app/` and `components/`.
 *
 * Each link record:
 *   - surface: relative file path (forward-slash normalised)
 *   - href: resolved string for static patterns; raw expression source
 *           for runtime patterns; pragma-resolved value if pragma present
 *   - kind: 'static' | 'runtime' (only present when runtime)
 */
export async function discoverNavLinks(repoRoot) {
  const links = [];
  const candidateDirs = [path.join(repoRoot, 'app'), path.join(repoRoot, 'components')];

  for (const dir of candidateDirs) {
    const sourceFiles = await walkDir(dir, (filePath) => {
      if (/\.(test|spec)\.(t|j)sx?$/.test(filePath)) return false;
      if (/\.d\.ts$/.test(filePath)) return false;
      return /\.(tsx?|jsx?)$/.test(filePath);
    });

    for (const filePath of sourceFiles) {
      let source;
      try {
        source = await fs.readFile(filePath, 'utf-8');
      } catch {
        continue;
      }
      const surface = path.relative(repoRoot, filePath).replace(/\\/g, '/');

      // Track byte offsets covered by static-href matches so we can
      // exclude them from the runtime detector (which would otherwise
      // double-match `href={'...'}` etc.).
      const staticOffsets = [];

      for (const re of [
        HREF_STRING_LITERAL,
        HREF_JSX_SINGLE,
        HREF_JSX_DOUBLE,
        HREF_OBJECT_SINGLE,
        HREF_OBJECT_DOUBLE,
      ]) {
        re.lastIndex = 0;
        let match;
        while ((match = re.exec(source)) !== null) {
          const href = match[1];
          links.push({ surface, href });
          staticOffsets.push([match.index, match.index + match[0].length]);
        }
      }

      // F-1: runtime-href detector. Look for `href={EXPR}` patterns NOT
      // already captured as static literals.
      HREF_JSX_EXPR.lastIndex = 0;
      let runtimeMatch;
      while ((runtimeMatch = HREF_JSX_EXPR.exec(source)) !== null) {
        const matchStart = runtimeMatch.index;
        const matchEnd = matchStart + runtimeMatch[0].length;

        // Skip if this match overlaps a static literal we already captured.
        const overlapsStatic = staticOffsets.some(([s, e]) => matchStart < e && matchEnd > s);
        if (overlapsStatic) continue;

        const expr = runtimeMatch[1].trim();

        // Reject expressions that start with a literal quote: those are
        // already covered by HREF_JSX_SINGLE / HREF_JSX_DOUBLE.
        if (expr.startsWith('"') || expr.startsWith("'")) continue;

        const pragma = findPragmaNear(source, matchStart);
        if (pragma) {
          if (pragma.kind === 'external' || pragma.kind === 'ignore') continue;
          if (pragma.kind === 'href') {
            links.push({ surface, href: pragma.href, label: `runtime[${expr}]` });
            continue;
          }
        }

        // No pragma — flag as unverifiable.
        links.push({
          surface,
          href: `<runtime: ${expr}>`,
          label: `runtime[${expr}]`,
          kind: 'runtime',
        });
      }
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// CLI wrapper — runs only when invoked as a script (NOT when imported).
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const isCli = (() => {
  if (!process.argv[1]) return false;
  const argv1 = path.resolve(process.argv[1]).replace(/\\/g, '/');
  const self = path.resolve(__filename).replace(/\\/g, '/');
  return argv1 === self;
})();

if (isCli) {
  const repoRoot = path.resolve(__filename, '..', '..');
  console.log(`[nav-audit] scanning ${repoRoot}`);
  const routes = await discoverRoutes(repoRoot);
  const navLinks = await discoverNavLinks(repoRoot);
  console.log(`[nav-audit] discovered ${routes.length} routes, ${navLinks.length} nav links`);

  const findings = auditNavLinks({
    routes,
    navLinks,
    allowedOrphans: ALLOWED_ORPHANS,
  });

  console.log(JSON.stringify(findings, null, 2));

  const total =
    findings.brokenLinks.length +
    findings.invalidHrefs.length +
    findings.orphanRoutes.length +
    findings.unverifiableHrefs.length;
  if (total > 0) {
    console.error(
      `[nav-audit] FAIL — ${findings.brokenLinks.length} broken, ` +
        `${findings.invalidHrefs.length} invalid, ${findings.orphanRoutes.length} orphan, ` +
        `${findings.unverifiableHrefs.length} unverifiable`,
    );
    process.exit(1);
  }
  console.log('[nav-audit] PASS — zero findings');
  process.exit(0);
}

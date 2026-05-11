/**
 * Type declarations for `scripts/nav-audit.mjs` so the Vitest integration
 * test (`tests/integration/nav-audit.test.ts`) can import the pure-function
 * exports under TypeScript strict mode.
 *
 * The runtime is the `.mjs` file; this `.d.mts` companion only describes
 * the public surface.
 */
export interface NavLink {
  surface: string;
  href: string;
  label?: string;
  /**
   * Tag set by the discovery layer when a runtime-generated href is
   * encountered without a resolving pragma. The audit treats `runtime`
   * links as `unverifiableHrefs`.
   */
  kind?: 'runtime';
}

export interface AuditFindings {
  brokenLinks: NavLink[];
  invalidHrefs: NavLink[];
  orphanRoutes: string[];
  /**
   * Runtime-generated hrefs that the static audit could not resolve and
   * that lacked a `// @nav-audit ...` pragma. Flagged for human review.
   */
  unverifiableHrefs: NavLink[];
}

export interface AuditNavLinksArgs {
  routes: string[];
  navLinks: NavLink[];
  allowedOrphans?: readonly string[];
  /**
   * Predicate that decides whether a surface (relative file path) counts
   * as primary navigation chrome for the orphan check. Defaults to
   * `isPrimaryNavSurface`.
   */
  primaryNavPredicate?: (surface: string) => boolean;
}

export const ALLOWED_ORPHANS: readonly string[];

export const PRIMARY_NAV_PATTERNS: readonly RegExp[];

export function isPrimaryNavSurface(surface: string): boolean;

/**
 * Convert a Next.js route pattern to a RegExp that tests pathname matches.
 *
 * Supports:
 *  - Optional catch-all `/[[...rest]]` — matches BOTH base path AND any subpath.
 *  - Required catch-all `/[...rest]`   — matches one or more segments.
 *  - Single segment `[param]`          — matches a single non-slash run.
 *
 * Exported for unit testing of the route-pattern grammar (see Codex
 * Round 3 / F-3-residual coverage in `tests/integration/nav-audit.test.ts`).
 */
export function routeToRegExp(route: string): RegExp;

export function auditNavLinks(args: AuditNavLinksArgs): AuditFindings;

export function discoverRoutes(repoRoot: string): Promise<string[]>;

export function discoverNavLinks(repoRoot: string): Promise<NavLink[]>;

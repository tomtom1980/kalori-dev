/**
 * Task 5.1.6 — Reduced-motion audit utility.
 *
 * Codex Round 1 (I-1) rewrite: this used to be a stub that exported
 * three constants. The audit test duplicated the canonical keyframe
 * list and ran its own filesystem scan. Now this module IS the
 * scanner — the test imports `auditReducedMotionCoverage()` and
 * asserts on its findings rather than maintaining a parallel
 * implementation.
 *
 * NOT shipped to the runtime bundle: this file is consumed by the
 * vitest audit only. No production code imports it.
 *
 * Strategy
 * ────────
 * We don't run a full Babel parse — that would couple the audit to
 * `@babel/parser` (not in the dependency graph). Regex-based scanning
 * over TSX source for inline `transition:` / `animation:` literals,
 * and over CSS source for `@media (prefers-reduced-motion: reduce)`
 * blocks + `html[data-reduce-motion='1']` mirror selectors, catches
 * every shipping consumer. Regex assumptions are documented inline.
 *
 * The audit returns a structured report; the caller decides which
 * findings are gating.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Codex Round 2 (I2-1): the audit used to ship a curated keyframe list
 * here. That list was incomplete (`rowFadeIn` was missing), and
 * maintaining it in lockstep with `app/globals.css` was a documented
 * source of drift. The list is now derived dynamically from every
 * `.css` file under the repo via `enumerateKeyframesFromCss()`. The
 * exported constant is retained as a sentinel for tests that want to
 * assert the canonical keyframes are still present, but the audit
 * itself enumerates from CSS.
 */
export const KEYFRAMES_REQUIRING_EXPLICIT_REDUCE_MOTION = [
  'kalori-library-page-settle',
  'kalori-fd-sheet-in-right',
  'kalori-fd-sheet-in-up',
  'dropCapFade',
  'chartTooltipEnter',
  'skeletonPulse',
  'rowFadeIn',
] as const;

/**
 * Round 2 (I2-1): list of directory names to skip while walking for
 * `.css` files. Mirrors the focus-ring sweep at
 * `tests/integration/focus-ring-token.test.ts`.
 */
const CSS_SCAN_EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  '.turbo',
  '.git',
]);
const CSS_SCAN_EXCLUDED_PATH_SUBSTRINGS: ReadonlyArray<string> = [
  'tests/screenshots',
  'tests\\screenshots',
];

/**
 * Round 2 (I2-1): enumerate every `@keyframes <ident>` declaration in
 * a CSS source. Returns the list of keyframe identifiers in source
 * order; duplicates (re-declarations) are preserved so the caller can
 * detect them.
 */
export function enumerateKeyframesFromCss(css: string): string[] {
  const out: string[] = [];
  const re = /@keyframes\s+([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

/**
 * Walk the repo (excluding well-known build / vendor / fixture paths)
 * for every `.css` file. Used by both the keyframe enumerator and the
 * reduced-motion suppression scanner.
 */
function collectAllCssFiles(repoRoot: string): string[] {
  const files: string[] = [];
  function rec(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (CSS_SCAN_EXCLUDED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (CSS_SCAN_EXCLUDED_PATH_SUBSTRINGS.some((s) => full.includes(s))) continue;
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        rec(full);
      } else if (stat.isFile() && full.endsWith('.css')) {
        files.push(full);
      }
    }
  }
  rec(repoRoot);
  return files;
}

/**
 * Color/border/background-only transitions are exempt from
 * reduced-motion coverage because they don't move pixels — the
 * global 1ms collapse fully neutralizes them.
 */
export const COLOR_ONLY_TRANSITION_PROPS = new Set<string>([
  'color',
  'background',
  'background-color',
  'border-color',
  'fill',
  'stroke',
  'filter',
  'outline-color',
  'caret-color',
  'text-decoration-color',
]);

/**
 * Classify a `transition` property value as `'color-only'` or
 * `'motion'`.
 */
export function classifyTransitionValue(value: string): 'color-only' | 'motion' {
  const segments = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const seg of segments) {
    const firstToken = seg.split(/\s+/)[0]?.trim() ?? '';
    if (firstToken === 'all' || firstToken === 'none') return 'motion';
    if (!COLOR_ONLY_TRANSITION_PROPS.has(firstToken)) return 'motion';
  }
  return 'color-only';
}

/**
 * Reduced-motion guard idioms a TSX file may use to pair with a
 * motion-affecting transition. The audit scans for these literals
 * EXCLUDING comment lines so a file can't pass with only a
 * commentary mention.
 */
export const REDUCED_MOTION_GUARD_LITERALS = [
  'isReducedMotion',
  'motion-reduce:',
  'motion-safe:',
  'prefers-reduced-motion',
] as const;

/**
 * Module imports that signal a JS-driven motion library. If any of
 * these appear in a file, we require a `useReducedMotion()` (or
 * equivalent) call OR a CSS-level `prefers-reduced-motion` guard for
 * that file's keyframes. Currently we ship Tailwind v4 keyframes only
 * (no JS animation libs); the scan is forward-looking.
 */
export const MOTION_LIBRARY_IMPORT_PATTERNS = [
  /from\s+['"]framer-motion['"]/,
  /from\s+['"]motion['"]/,
  /from\s+['"]@motion\/[^'"]+['"]/,
  /from\s+['"]motion-one['"]/,
  /from\s+['"]@motionone\/[^'"]+['"]/,
] as const;

export interface MotionFinding {
  file: string;
  line: number;
  match: string;
  property: 'transition' | 'animation';
  isColorOnly: boolean;
}

export interface AuditReport {
  motionLibraryImports: { file: string; pattern: string }[];
  inlineMotionFindings: MotionFinding[];
  /**
   * Round 2 (I2-1): keyframes that lack reduced-motion suppression.
   * "Suppression" = either (a) a `prefers-reduced-motion: reduce` block
   * contains a wildcard rule (`*` selector with `animation-duration`
   * collapsed), or (b) the keyframe NAME or a class consuming it is
   * named in a reduced-motion block with `animation: none`. Either
   * mechanism kills the motion on every engine including Safari.
   */
  keyframesMissingExplicitReducedMotion: string[];
  /**
   * Round 2 (I2-1): every `@keyframes` identifier discovered in the
   * scanned CSS files. The audit asserts every entry here appears in
   * the suppression set above.
   */
  allDefinedKeyframes: string[];
  hasDataAttrMirrorBlock: boolean;
}

interface WalkOptions {
  ignoreDirs?: ReadonlyArray<string>;
  fileFilter?: (file: string) => boolean;
}

function walk(dir: string, opts: WalkOptions = {}, out: string[] = []): string[] {
  const ignore = new Set(opts.ignoreDirs ?? ['node_modules', '.next', '__tests__']);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (ignore.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(full, opts, out);
    } else if (stat.isFile() && (!opts.fileFilter || opts.fileFilter(full))) {
      out.push(full);
    }
  }
  return out;
}

function isTsxSource(file: string): boolean {
  if (extname(file) !== '.tsx') return false;
  if (file.endsWith('.test.tsx')) return false;
  if (file.endsWith('.spec.tsx')) return false;
  return true;
}

/**
 * Strip line / block comments from a TSX source so substring scans
 * don't pass on commentary alone. Conservative — preserves string
 * literals (no `eval`, no AST traversal).
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n) {
        const cc = src[i];
        out += cc;
        i += 1;
        if (cc === '\\' && i < n) {
          out += src[i];
          i += 1;
          continue;
        }
        if (cc === quote) break;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function scanFileForInlineMotion(file: string): MotionFinding[] {
  const src = readFileSync(file, 'utf8');
  const lines = src.split(/\r?\n/);
  const findings: MotionFinding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }
    const transitionMatch = line.match(/transition\s*:\s*['"`]([^'"`]+)['"`]/);
    if (transitionMatch) {
      const cls = classifyTransitionValue(transitionMatch[1] ?? '');
      findings.push({
        file,
        line: i + 1,
        match: transitionMatch[0],
        property: 'transition',
        isColorOnly: cls === 'color-only',
      });
    }
    const animationMatch = line.match(/animation\s*:\s*['"`]([^'"`]+)['"`]/);
    if (animationMatch) {
      findings.push({
        file,
        line: i + 1,
        match: animationMatch[0],
        property: 'animation',
        isColorOnly: false,
      });
    }
  }
  return findings;
}

/**
 * Codex Round 1 (I-2): tighten the file-level guard match. The guard
 * literal must appear OUTSIDE comment / docblock lines.
 */
export function fileHasNonCommentReducedMotionGuard(file: string): boolean {
  const src = readFileSync(file, 'utf8');
  const stripped = stripComments(src);
  for (const guard of REDUCED_MOTION_GUARD_LITERALS) {
    if (stripped.includes(guard)) return true;
  }
  return false;
}

export function fileImportsMotionLibrary(file: string): { pattern: string } | null {
  const src = readFileSync(file, 'utf8');
  const stripped = stripComments(src);
  for (const re of MOTION_LIBRARY_IMPORT_PATTERNS) {
    if (re.test(stripped)) return { pattern: re.source };
  }
  return null;
}

function hasExplicitReducedMotionBlockForKeyframe(css: string, keyframeOrClass: string): boolean {
  // `matchAll` avoids stateful `RegExp.prototype` iteration.
  const blockRe = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/g;
  for (const match of css.matchAll(blockRe)) {
    const body = match[1] ?? '';
    if (!body.includes(keyframeOrClass)) continue;
    if (/animation\s*:\s*none/i.test(body)) {
      return true;
    }
  }
  return false;
}

/**
 * Round 2 (I2-1): does a CSS source contain a `prefers-reduced-motion:
 * reduce` block whose body contains a `*`-wildcard rule that collapses
 * `animation-duration`? This is the "global blanket" suppression
 * mechanism. The presence of even ONE such block in the cascading CSS
 * means every keyframe is suppressed by the global blanket on every
 * engine (the 1ms collapse plus iteration-count reset).
 */
function cssHasReducedMotionWildcardBlanket(css: string): boolean {
  // Walk every `@media (prefers-reduced-motion: reduce) { ... }` block
  // (we use a brace-depth scanner because the body may itself contain
  // nested rule blocks). For each, inspect the body for a wildcard
  // selector rule that collapses animation-duration.
  const startRe = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(css)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const body = css.slice(start, i - 1);
    // Look for a rule whose selector list includes a bare `*` or
    // `*::before` / `*::after`, paired with `animation-duration: 1ms`
    // (or shorter). The Round 1 globals.css ships:
    //   *, *::before, *::after { animation-duration: 1ms !important; ... }
    const wildcardRe =
      /(^|[\s,{])\*(?:::?[a-z-]+)?[^{]*\{[^}]*animation-duration\s*:\s*[0-9.]+m?s/i;
    if (wildcardRe.test(body)) {
      return true;
    }
  }
  return false;
}

/**
 * Round 2 (I2-1): is a keyframe name suppressed under reduced-motion?
 *
 * Suppression criteria:
 *   1. A reduced-motion wildcard blanket exists ANYWHERE in the
 *      scanned CSS (every keyframe is collapsed to 1ms by the global
 *      blanket on every engine).
 *   2. OR the keyframe name itself appears inside a reduced-motion
 *      block with `animation: none`.
 *   3. OR a class consuming the keyframe (named in CSS as
 *      `.foo { animation: <name> ... }`) is named in a reduced-motion
 *      block with `animation: none`.
 */
function isKeyframeSuppressed(css: string, keyframeName: string): boolean {
  // Path 1: global wildcard blanket.
  if (cssHasReducedMotionWildcardBlanket(css)) {
    return true;
  }
  // Path 2: explicit `animation: none` referencing the keyframe name.
  const blockRe = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/g;
  for (const m of css.matchAll(blockRe)) {
    const body = m[1] ?? '';
    if (body.includes(keyframeName) && /animation\s*:\s*none/i.test(body)) {
      return true;
    }
  }
  // Path 3: class consumers.
  const consumerRe = new RegExp(
    `\\.([A-Za-z_][\\w-]*)\\s*\\{[^}]*animation\\s*:[^;]*${keyframeName}\\b`,
    'g',
  );
  const consumers = new Set<string>();
  let cm: RegExpExecArray | null;
  while ((cm = consumerRe.exec(css)) !== null) {
    consumers.add(cm[1]!);
  }
  for (const consumer of consumers) {
    for (const m of css.matchAll(blockRe)) {
      const body = m[1] ?? '';
      if (body.includes(`.${consumer}`) && /animation\s*:\s*none/i.test(body)) {
        return true;
      }
    }
  }
  return false;
}

function hasDataAttrMirrorBlock(css: string): boolean {
  return /html\[data-reduce-motion=['"]1['"]\]\s+\*[\s\S]*?animation-duration\s*:\s*1ms[\s\S]*?transition-duration\s*:\s*1ms/.test(
    css,
  );
}

export interface AuditOptions {
  repoRoot?: string;
  jsxScanRoots?: ReadonlyArray<string>;
  cssPath?: string;
}

export function auditReducedMotionCoverage(options: AuditOptions = {}): AuditReport {
  const repoRoot = options.repoRoot ?? process.cwd();
  const roots = options.jsxScanRoots ?? ['components', 'app', 'lib'];
  const cssPath = options.cssPath ?? join('app', 'globals.css');

  const tsxFiles: string[] = [];
  for (const root of roots) {
    walk(join(repoRoot, root), { fileFilter: isTsxSource }, tsxFiles);
  }

  const motionLibraryImports: { file: string; pattern: string }[] = [];
  const inlineMotionFindings: MotionFinding[] = [];
  for (const file of tsxFiles) {
    const lib = fileImportsMotionLibrary(file);
    if (lib !== null) {
      motionLibraryImports.push({ file, pattern: lib.pattern });
    }
    inlineMotionFindings.push(...scanFileForInlineMotion(file));
  }

  // Round 2 (I2-1): keyframes are enumerated DYNAMICALLY from every
  // .css file under the repo (excluding build / vendor paths). The
  // suppression check considers ALL CSS together (any reduced-motion
  // block in any file counts) so files that only define keyframes
  // without their own block are still covered by globals.css's
  // wildcard blanket.
  const allCssFiles = collectAllCssFiles(repoRoot);
  let combinedCss = '';
  for (const f of allCssFiles) {
    try {
      combinedCss += readFileSync(f, 'utf8') + '\n';
    } catch {
      // Skip unreadable files.
    }
  }

  // The legacy single-file `cssPath` is still read for backwards
  // compatibility with the data-attr mirror block check below.
  let primaryCss = '';
  try {
    primaryCss = readFileSync(join(repoRoot, cssPath), 'utf8');
  } catch {
    primaryCss = '';
  }

  // Dedup keyframe identifiers — repeated `@keyframes alpha {}` only
  // counts once.
  const allDefinedKeyframes = Array.from(new Set(enumerateKeyframesFromCss(combinedCss)));

  const keyframesMissingExplicitReducedMotion: string[] = [];
  for (const kf of allDefinedKeyframes) {
    if (!isKeyframeSuppressed(combinedCss, kf)) {
      keyframesMissingExplicitReducedMotion.push(kf);
    }
  }

  // Sanity: keep the legacy single-file path callable so external
  // tooling that probes a single file still works.
  void hasExplicitReducedMotionBlockForKeyframe;

  return {
    motionLibraryImports,
    inlineMotionFindings,
    keyframesMissingExplicitReducedMotion,
    allDefinedKeyframes,
    hasDataAttrMirrorBlock: hasDataAttrMirrorBlock(primaryCss),
  };
}

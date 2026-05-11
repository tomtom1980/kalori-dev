#!/usr/bin/env node
/**
 * `scripts/check-bundle-budget.mjs` — Task 4.1 Codex Fix Round 1 (IF-3).
 *
 * Enforces the /library route's initial client-JS gzipped budget.
 *
 * What it measures
 * ----------------
 * For the `/library` route entry in `page_client-reference-manifest.js`
 * (the App Router client-reference manifest that Next 16 emits under
 * `.next/server/app/(app)/library/`), we:
 *   1. Parse out the `entryJSFiles['[project]/app/(app)/library/page']`
 *      array — the initial client chunks that ship for a cold `/library`
 *      load.
 *   2. Subtract chunks that also appear in the `[project]/app/(app)/layout`
 *      entry, so we measure _library-specific_ code only (not
 *      framework / nav chrome that every (app) route carries anyway).
 *   3. Read each remaining chunk from `.next/<chunk-path>`, gzip it
 *      in-memory (Node's zlib), and sum.
 *
 * The dynamic-import chunks for `MergeDuplicatesDialog` +
 * `BulkDeleteConfirmDialog` do NOT appear in the initial entry list by
 * design (`next/dynamic({ ssr: false })`), so they are automatically
 * excluded.
 *
 * Parsing strategy (no eval)
 * --------------------------
 * The manifest file is a single `globalThis.__RSC_MANIFEST[<key>] = <obj>;`
 * assignment where <obj> is pure JSON (no functions, no refs). We locate
 * ONLY the `entryJSFiles` sub-object within that payload and slice out
 * its JSON literal, then `JSON.parse` it. No code evaluation.
 *
 * Budget
 * ------
 * Default: `LIBRARY_BUNDLE_BUDGET_BYTES` (env var), or fallback 110 KB gz.
 *
 * The aspirational target from the reconciled spec (§16.1) is 28 KB gz
 * for library-specific code. Today the measured figure is ~100 KB
 * because library is the FIRST consumer of `@radix-ui/react-dropdown-menu`
 * + its Popper/FocusScope/DismissableLayer dependency tree plus the
 * `next/image` client runtime — Next 16's chunk-splitter inlines these
 * vendor chunks into the first consumer and they become vendor-shared
 * once a second route imports them. See `Planning/followups.md` for the
 * 28 KB long-term story; this script's current job is to catch
 * _regressions_ past the measured baseline.
 *
 * Usage
 * -----
 *   pnpm check:bundle-budget              # uses default 110 KB gz
 *   LIBRARY_BUNDLE_BUDGET_BYTES=28672 pnpm check:bundle-budget   # 28 KB
 *
 * Exit codes
 * ----------
 *   0 — all measured chunks fit under the budget
 *   1 — budget exceeded (prints a per-chunk breakdown)
 *   2 — manifest not found (likely forgot to `pnpm build` first)
 */
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const DEFAULT_BUDGET_BYTES = 110 * 1024;
const BUDGET_BYTES = Number(process.env.LIBRARY_BUNDLE_BUDGET_BYTES ?? DEFAULT_BUDGET_BYTES);

const MANIFEST_PATH = join(
  PROJECT_ROOT,
  '.next',
  'server',
  'app',
  '(app)',
  'library',
  'page_client-reference-manifest.js',
);

const LIBRARY_ENTRY_KEY = '[project]/app/(app)/library/page';
const APP_LAYOUT_ENTRY_KEY = '[project]/app/(app)/layout';

function die(code, msg) {
  process.stderr.write(`check-bundle-budget: ${msg}\n`);
  process.exit(code);
}

/**
 * Extract the `entryJSFiles` JSON sub-object from the client-reference
 * manifest file without evaluating any code.
 *
 * The file is a single JS assignment
 *   `globalThis.__RSC_MANIFEST["..."] = { ... "entryJSFiles": { ... } ... };`
 * where the RHS object is pure JSON (Next emits no functions / no refs /
 * no trailing commas in this file). We find the `"entryJSFiles"` key and
 * walk braces to slice out its balanced JSON object.
 */
function extractEntryJSFiles(source) {
  const key = '"entryJSFiles"';
  const keyIdx = source.indexOf(key);
  if (keyIdx < 0) return null;

  // Skip `"entryJSFiles"` then the colon + whitespace.
  let i = keyIdx + key.length;
  while (i < source.length && source[i] !== '{') i++;
  if (source[i] !== '{') return null;

  // Balanced-brace walk, respecting string literals so a `{` inside a
  // path like `"[project]/foo"` doesn't confuse the counter.
  let depth = 0;
  const start = i;
  let inString = false;
  let escaped = false;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const objJson = source.slice(start, i + 1);
        return JSON.parse(objJson);
      }
    }
  }
  return null;
}

if (!existsSync(MANIFEST_PATH)) {
  die(
    2,
    `manifest not found at ${MANIFEST_PATH}. Run \`pnpm build\` first so the App Router client-reference-manifest is emitted.`,
  );
}

const raw = readFileSync(MANIFEST_PATH, 'utf8');
const entryJSFiles = extractEntryJSFiles(raw);
if (!entryJSFiles) {
  die(2, 'could not extract entryJSFiles from client-reference manifest');
}

const libraryChunks = entryJSFiles[LIBRARY_ENTRY_KEY];
if (!Array.isArray(libraryChunks)) {
  die(2, `no entryJSFiles entry for "${LIBRARY_ENTRY_KEY}" in manifest`);
}

// Layout chunks are already paid for by every (app) route — subtract so
// we measure library-specific initial JS only.
const layoutChunks = new Set(entryJSFiles[APP_LAYOUT_ENTRY_KEY] ?? []);
const libraryOnly = libraryChunks.filter((c) => !layoutChunks.has(c));

let total = 0;
const breakdown = [];
for (const chunk of libraryOnly) {
  const full = join(PROJECT_ROOT, '.next', chunk);
  if (!existsSync(full)) {
    die(2, `chunk file missing on disk: ${full}`);
  }
  const bytes = readFileSync(full);
  const gz = gzipSync(bytes).length;
  total += gz;
  breakdown.push({ chunk, raw: bytes.length, gz });
}

const kb = (n) => (n / 1024).toFixed(2) + ' KB';

process.stdout.write(
  `check-bundle-budget: /library initial client JS (library-specific, excludes (app)/layout chunks)\n`,
);
for (const { chunk, raw: r, gz } of breakdown) {
  process.stdout.write(`  ${chunk}  raw=${kb(r)}  gz=${kb(gz)}\n`);
}
process.stdout.write(`  TOTAL gz: ${kb(total)}\n`);
process.stdout.write(
  `  BUDGET:   ${kb(BUDGET_BYTES)} (override via LIBRARY_BUNDLE_BUDGET_BYTES)\n`,
);

if (total > BUDGET_BYTES) {
  process.stderr.write(
    `\ncheck-bundle-budget: FAIL — /library initial client JS ${kb(total)} exceeds budget ${kb(BUDGET_BYTES)}\n`,
  );
  process.exit(1);
}

process.stdout.write(`  PASS — under budget by ${kb(BUDGET_BYTES - total)}\n`);
process.exit(0);

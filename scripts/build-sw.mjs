#!/usr/bin/env node
/**
 * Task 5.1.2 — Service worker bundler (esbuild).
 *
 * Bundles `app/sw.ts` -> `public/sw.js`. Replaces `@serwist/next`'s webpack
 * plugin because Next 16 ships with Turbopack and that plugin does not yet
 * support it (https://github.com/serwist/serwist/issues/54).
 *
 * Output target:
 *   - Format: ESM (modern SW context — Chrome 80+, Safari 15.4+, Firefox 109+).
 *   - Bundle: yes (resolves `serwist` + `lib/pwa/sw-runtime-caching.ts`).
 *   - Minify: production only.
 *   - Sourcemap: external (Sentry consumes via SENTRY_AUTH_TOKEN release upload).
 *
 * Build hash:
 *   - Embeds `process.env.VERCEL_GIT_COMMIT_SHA` (or `dev`) as `process.env.SW_BUILD_HASH`
 *     so the SW string differs per deploy and forces re-installation.
 *
 * Digest gate (F-PWA-1, F-PWA-1-followup):
 *   - Builds in-memory (`write: false`), then sha-256-compares each output
 *     against the on-disk artifact. Skips the write when the digest is
 *     unchanged so repeated `pnpm sw:build` invocations don't churn
 *     `public/sw.js` mtime / git status.
 *   - The build banner embeds both `process.env.VERCEL_GIT_COMMIT_SHA` and
 *     `new Date().toISOString()`. The digest helper (`./lib/sw-digest.mjs`)
 *     strips ONLY the ISO timestamp suffix before hashing — the build hash
 *     stays in the digest input so a deploy with unchanged SW source but a
 *     fresh commit SHA still produces a different digest, forcing a fresh
 *     `public/sw.js` and triggering SW updates on existing clients.
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { digestForCompare } from './lib/sw-digest.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Minify by default — Next 16 + chained pnpm scripts on Windows do not
// reliably propagate NODE_ENV=production from `next build` into the
// subsequent `pnpm sw:build` process. Skip minification only when the
// caller explicitly sets `SW_BUILD_DEV=1`, which keeps the local
// `pnpm sw:build` ergonomic for debugging.
const isDev = process.env.SW_BUILD_DEV === '1';
const isProd = !isDev;
const buildHash = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';

const outDir = resolve(projectRoot, 'public');
await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [resolve(projectRoot, 'app/sw.ts')],
  outfile: resolve(outDir, 'sw.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  // Web worker / SW context — no DOM, no Node built-ins.
  conditions: ['worker', 'browser', 'import', 'default'],
  minify: isProd,
  sourcemap: true,
  // Resolve `@/...` the same way Next.js does (project root).
  alias: {
    '@': projectRoot,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
    'process.env.SW_BUILD_HASH': JSON.stringify(buildHash),
  },
  // Keep external nothing — bundle everything into sw.js.
  banner: {
    js: `// Kalori service worker — build ${buildHash} — generated ${new Date().toISOString()}`,
  },
  legalComments: 'none',
  treeShaking: true,
  logLevel: 'info',
  write: false,
});

// `digestForCompare` is sourced from `./lib/sw-digest.mjs` (extracted so the
// regex is unit-testable). F-PWA-1 follow-up A1: that module narrows the
// banner regex to strip ONLY the timestamp, preserving build-hash so
// per-deploy SW updates propagate.

let wrote = 0;
let skipped = 0;
for (const out of result.outputFiles) {
  const newDigest = digestForCompare(out.path, out.contents);
  let oldDigest = null;
  try {
    const existing = await readFile(out.path);
    oldDigest = digestForCompare(out.path, existing);
  } catch {
    // File doesn't exist yet — first build, fall through to write.
  }
  if (newDigest === oldDigest) {
    skipped += 1;
    console.log(`[build-sw] skip ${out.path} (digest unchanged)`);
    continue;
  }
  await writeFile(out.path, out.contents);
  wrote += 1;
  console.log(`[build-sw] wrote ${out.path} (${out.contents.length} bytes)`);
}

console.log(
  `Service worker bundled to ${resolve(outDir, 'sw.js')} (build ${buildHash}). ` +
    `${wrote} written, ${skipped} skipped.`,
);

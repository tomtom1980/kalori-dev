/**
 * Service-worker bundle digest helpers — Task 5.1.2 build-sw.mjs digest gate.
 *
 * Extracted from `scripts/build-sw.mjs` so the digest comparison logic is
 * unit-testable without spawning esbuild.
 *
 * Design:
 *   The esbuild banner injected into `public/sw.js` looks like
 *     `// Kalori service worker — build <SHA> — generated <ISO timestamp>`
 *   The timestamp changes on every invocation; the build hash changes only on
 *   deploys. The digest gate must:
 *     1. IGNORE timestamp churn so repeated `pnpm sw:build` runs are
 *        idempotent and don't dirty `public/sw.js` mtime / git status.
 *     2. RESPECT build-hash changes so a deploy with unchanged source but a
 *        new VERCEL_GIT_COMMIT_SHA still produces a fresh `sw.js` (and the
 *        SW updates on existing clients).
 *
 * Implementation: strip ONLY the ` — generated <ISO>` suffix (and the
 * trailing newline) before hashing. The leading
 * `// Kalori service worker — build <SHA>` segment stays in the digest input.
 *
 * F-PWA-1 follow-up — round 2 fix for aggregate Codex finding A1.
 */
import { createHash } from 'node:crypto';

/**
 * sha-256 of a Uint8Array, hex-encoded.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function digestOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Returns a sha-256 digest with the timestamp portion of the SW banner
 * stripped before hashing — only applies to `.js` outputs (the banner doesn't
 * appear in `.map` files).
 *
 * The banner regex strips ONLY the ` — generated <ISO>` suffix, preserving
 * `// Kalori service worker — build <SHA>` so build-hash changes still
 * produce different digests (per-deploy SW updates propagate even when SW
 * source bytes are unchanged).
 *
 * Anchored to the start of file (`^`) and limited to the first banner line
 * so we don't accidentally strip ` — generated …` substrings appearing
 * downstream in source maps or other comments.
 *
 * @param {string} filePath - absolute path of the artifact (used to detect `.js`)
 * @param {Uint8Array} bytes - artifact bytes
 * @returns {string} hex-encoded sha-256 digest
 */
export function digestForCompare(filePath, bytes) {
  if (filePath.endsWith('.js')) {
    const text = new TextDecoder('utf-8').decode(bytes);
    // F-PWA-1 follow-up A1 — strip ONLY the ` — generated <ISO>` suffix on
    // the banner line. The leading `// Kalori service worker — build <SHA>`
    // segment stays in the digest input so a deploy with new
    // VERCEL_GIT_COMMIT_SHA produces a different digest even when SW source
    // bytes are unchanged.
    const stripped = text.replace(
      /^(\/\/ Kalori service worker[^\n]*?) — generated [0-9T:\-.Z]+([^\n]*)\n/,
      '$1$2\n',
    );
    return digestOf(new TextEncoder().encode(stripped));
  }
  return digestOf(bytes);
}

/**
 * F-PWA-1 follow-up — aggregate Codex finding A1 regression.
 *
 * The original `digestForCompare` in `scripts/build-sw.mjs` stripped the
 * ENTIRE banner line, which contains the only build-hash reference produced
 * by `scripts/build-sw.mjs`. Result: a deploy with unchanged SW source but a
 * fresh `VERCEL_GIT_COMMIT_SHA` produced an identical digest -> the
 * `public/sw.js` file was never re-written -> existing browsers never
 * detected a new SW -> install / update / offline fixes failed to propagate.
 *
 * Spec (post-fix):
 *   1. Two SW outputs that differ ONLY in build hash MUST hash to different
 *      digests (so per-deploy SW updates propagate).
 *   2. Two SW outputs that differ ONLY in the generated-timestamp suffix
 *      MUST hash to identical digests (so repeated `pnpm sw:build` calls
 *      remain idempotent).
 *   3. Source-map outputs (`.map`) hash as-is — banner stripping only
 *      applies to `.js`.
 */
import { describe, it, expect } from 'vitest';

import { digestForCompare } from '@/scripts/lib/sw-digest.mjs';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const SW_BODY = `import { CacheFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
const serwist = new Serwist({ runtimeCaching: [] });
serwist.addEventListeners();
`;

function withBanner(buildHash: string, isoTs: string): Uint8Array {
  const banner = `// Kalori service worker — build ${buildHash} — generated ${isoTs}\n`;
  return enc(banner + SW_BODY);
}

describe('digestForCompare — aggregate Codex A1 regression', () => {
  it('returns DIFFERENT digests when only buildHash differs', () => {
    // AC-A1: per-deploy SW updates must propagate even when SW source is
    // unchanged. Two outputs sharing source + timestamp but with different
    // build hashes must produce different digests so the gate WRITES.
    const ts = '2026-04-26T01:23:45.000Z';
    const a = withBanner('abc1234', ts);
    const b = withBanner('def5678', ts);

    const da = digestForCompare('/x/public/sw.js', a);
    const db = digestForCompare('/x/public/sw.js', b);

    expect(da).not.toBe(db);
  });

  it('returns SAME digests when only the generated timestamp differs', () => {
    // AC-A1: repeated `pnpm sw:build` runs with no source/build-hash change
    // must remain idempotent. Two outputs sharing source + buildHash but
    // with different timestamps must produce identical digests so the gate
    // SKIPS the write.
    const sha = 'abc1234';
    const a = withBanner(sha, '2026-04-26T01:23:45.000Z');
    const b = withBanner(sha, '2026-04-26T01:23:46.123Z');

    const da = digestForCompare('/x/public/sw.js', a);
    const db = digestForCompare('/x/public/sw.js', b);

    expect(da).toBe(db);
  });

  it('returns DIFFERENT digests when SW source differs (control)', () => {
    // Sanity: the gate must STILL detect real source changes. Two outputs
    // sharing banner but with different bodies must produce different
    // digests.
    const ts = '2026-04-26T01:23:45.000Z';
    const sha = 'abc1234';
    const banner = `// Kalori service worker — build ${sha} — generated ${ts}\n`;
    const a = enc(banner + 'console.log("v1");\n');
    const b = enc(banner + 'console.log("v2");\n');

    const da = digestForCompare('/x/public/sw.js', a);
    const db = digestForCompare('/x/public/sw.js', b);

    expect(da).not.toBe(db);
  });

  it('non-.js paths hash bytes as-is (no banner stripping)', () => {
    // Source maps don't carry the banner; verify .map paths bypass the
    // regex so we don't accidentally mutate map digests.
    const a = enc('{"version":3,"sources":["app/sw.ts"],"mappings":"AAAA"}');
    const b = enc('{"version":3,"sources":["app/sw.ts"],"mappings":"AAAA"}');
    const c = enc('{"version":3,"sources":["app/sw.ts"],"mappings":"BBBB"}');

    const da = digestForCompare('/x/public/sw.js.map', a);
    const db = digestForCompare('/x/public/sw.js.map', b);
    const dc = digestForCompare('/x/public/sw.js.map', c);

    expect(da).toBe(db);
    expect(da).not.toBe(dc);
  });
});

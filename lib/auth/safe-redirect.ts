/**
 * Shared open-redirect / smuggling guard for `?redirect_to=` / `?next=` query
 * parameters on auth surfaces (`/auth/callback`, `/auth/confirm`, …).
 *
 * Originally extracted from `app/auth/callback/route.ts` so the `/auth/confirm`
 * companion route (PKCE-free magic-link verification) can apply the same
 * vetting without copy-pasting the regex set. The two routes accept slightly
 * different param names (`redirect_to` vs `next`) but the safety contract is
 * identical: the value MUST be a plain same-origin pathname, or it gets
 * dropped and the route falls back to a profile-driven default landing page.
 *
 * Rejected inputs (each enumerated for audit traceability):
 *
 *   1. Empty / null input
 *   2. Control characters (`\n`, `\r`, `\t`, `\0`) — prevents CRLF / header
 *      injection once Location header is serialized
 *   3. Backslashes (`\`) — some browsers treat `\` as `/` and would interpret
 *      `/\evil.com` as an origin-crossing redirect
 *   4. Non-root-absolute paths (must start with a single `/`, not `//` or
 *      schemes like `https:` / `javascript:` / `data:`)
 *   5. Protocol-relative (`//`) — standard open-redirect vector
 *   6. Cross-origin after URL normalization against a dummy origin — belt-and-
 *      suspenders check in case URL parser re-interprets the path
 *   7. Path traversal (`..` or `.` segments) in either raw OR percent-decoded
 *      form — blocks `/%2e%2e/admin`, `/login/../admin`, etc.
 *   8. Any remaining `%00` (null byte) after a single decode pass
 *
 * On acceptance, returns the normalized pathname + search + hash. The
 * normalization round-trips through `URL` so callers get the parser's
 * canonical serialization (resolves stray `./` segments the parser already
 * collapses safely).
 */
export function safeRedirectTarget(raw: string | null): string | null {
  if (!raw) return null;
  // Reject control chars + backslashes before any URL parsing — these are
  // structural hazards that URL parsers do NOT uniformly reject.
  if (/[\\\n\r\t\0]/.test(raw)) return null;
  // Must be root-absolute pathname.
  if (!raw.startsWith('/')) return null;
  // Protocol-relative `//evil.com/...` — reject.
  if (raw.startsWith('//')) return null;

  // Pre-parser traversal check: the URL parser silently collapses `../` into
  // a normalized path (e.g. `/login/../admin` becomes `/admin`). We MUST
  // detect traversal on the raw input BEFORE normalization, otherwise the
  // attack surface we reject below is empty.
  //
  // We also decode once up-front so percent-encoded dots (`%2e%2e`) count as
  // traversal — catches `/%2e%2e/admin` and `/%2e/admin` variants.
  let decodedRaw: string;
  try {
    decodedRaw = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding — reject.
    return null;
  }
  if (decodedRaw.includes('\0')) return null;
  if (decodedRaw.includes('\\')) return null;
  // Reject traversal in either raw or decoded form. The regex catches `..` or
  // single-dot segments between slashes (or at path boundaries).
  if (/(^|\/)\.\.(\/|$)/.test(decodedRaw)) return null;
  if (/(^|\/)\.(\/|$)/.test(decodedRaw)) return null;
  // Also reject encoded traversal directly on the raw input — defense in
  // depth in case a future tweak to the decode logic loses fidelity.
  if (/%2e/i.test(raw)) return null;

  // Parse against a dummy origin so we can use the URL parser's normalization
  // + cross-origin detection. If parsing throws (malformed URL), reject.
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://dummy.local');
  } catch {
    return null;
  }
  if (parsed.origin !== 'http://dummy.local') return null;
  // Post-parse sanity — the parser must not have produced control-char or
  // null-byte content in the pathname portion (encoded forms like `%00`
  // survive as `%00` in `parsed.pathname` until decoded).
  if (/%00/i.test(parsed.pathname)) return null;

  return parsed.pathname + parsed.search + parsed.hash;
}

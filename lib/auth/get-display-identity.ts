/**
 * `getDisplayIdentity` — pure resolver that maps a Supabase `User | null` into
 * the display surface fields the sidebar `<IdentityRow />` renders.
 *
 * Spec source: `Planning/.tmp/task-A.2-briefing.md` §"Resolver contract" +
 * `Planning/.tmp/task-A.2-ui-frontend.md` §2 (decision tree, escape contract,
 * `deriveInitials` rules).
 *
 * Decision tree (verbatim from briefing):
 *   B0 — `user === null`                                → anonymous GUEST
 *   B1 — `user.email`           non-empty after trim()   → email branch
 *   B2 — `user.user_metadata.full_name` non-empty trim() → full_name branch
 *   B3 — both empty                                       → 'Account' literal
 *
 * HTML-escape contract:
 *   Branches B1 + B2 escape the chosen string for `& < > " '` so consumers
 *   can interpolate the value into JSX child-text OR `aria-label` OR a server
 *   log line without re-introducing an injection vector. Branches B0 + B3 are
 *   project-controlled literals (no untrusted source data) and pass through
 *   un-escaped.
 *
 * Pure-function contract: no side effects, no DB calls, no Supabase client,
 * no `fetch`, no `console.*`, no Sentry breadcrumbs. No new dependencies.
 */
import type { User } from '@supabase/supabase-js';

export interface DisplayIdentity {
  /** Primary line — Inter 500 12px ivory. Pre-HTML-escaped. Always non-empty. */
  readonly name: string;
  /**
   * Secondary line — Inter 400 10.5px dust. Pre-HTML-escaped or undefined.
   * Rendered ONLY when present. All current branches return undefined; the
   * field exists for future-extensibility (per ui-style spec §8 followup).
   */
  readonly handle: string | undefined;
  /** Avatar monogram — 1–2 chars uppercase ASCII, OR em-dash for anonymous. */
  readonly initials: string;
  /** True only on the AC3 `user === null` branch. */
  readonly isAnonymous: boolean;
}

const ANONYMOUS_LABEL = 'GUEST';
const ANONYMOUS_MONOGRAM = '—'; // em-dash (U+2014)
const ACCOUNT_FALLBACK = 'Account';

/**
 * Defense-in-depth HTML escape (private to this module).
 *
 * JSX child-text interpolation already escapes via the standard `{value}`
 * form. Encoding inside the resolver makes the contract explicit and
 * protects non-JSX consumers (aria-label, server log lines).
 *
 * Escape order matters: `&` must be escaped FIRST so subsequent `&...;`
 * sequences are not re-escaped. The remaining four characters are escaped
 * in any order.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Derive 1–2 uppercase ASCII letters from `source` for the avatar monogram.
 *
 * Rules (per design-lead spec §2):
 *   - NFKD-normalize then strip diacritic combining marks (so `Á` → `A`).
 *   - Split on whitespace; per chunk, pull the FIRST ASCII A–Z letter.
 *   - Take up to 2 chunks (i.e., first letter of first word + first letter
 *     of second word). Fewer chunks → fewer letters; ≤1 chunk → 1 letter.
 *   - Result is uppercased.
 *   - Defensive fallback: if no ASCII letter survives, return `'?'`.
 */
function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length === 0) return '?';

  // For email, only consider the local-part — domain like `@kalori.test`
  // shouldn't contribute to initials. Everything before the first `@`.
  const atIndex = trimmed.indexOf('@');
  const subject = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;

  // NFKD then strip combining marks (U+0300–U+036F).
  const normalized = subject.normalize('NFKD').replace(/[̀-ͯ]/g, '');

  // Split on whitespace + common email-name separators (`.`, `_`, `-`, `+`).
  const chunks = normalized.split(/[\s._\-+]+/).filter((c) => c.length > 0);

  let result = '';
  for (const chunk of chunks) {
    const match = chunk.match(/[A-Za-z]/);
    if (match) {
      result += match[0]!.toUpperCase();
      if (result.length >= 2) break;
    }
  }

  return result.length > 0 ? result : '?';
}

/**
 * Resolve a `User | null | undefined` into the display fields the sidebar
 * identity row renders. See module docblock for the decision-tree and escape
 * contract.
 *
 * Accepts `undefined` as well as `null` (Codex Round-1 fix): callers like
 * `nav-shell.tsx`'s `user?: User | null` prop and `data?.user` chains in the
 * server layout can propagate either falsy value, and both must collapse to
 * the AC3 anonymous identity rather than crashing on `user.email` access.
 */
export function getDisplayIdentity(user: User | null | undefined): DisplayIdentity {
  // Branch B0 — AC3 anonymous (covers both `null` and `undefined` via `==`).
  if (user == null) {
    return {
      name: ANONYMOUS_LABEL,
      handle: undefined,
      initials: ANONYMOUS_MONOGRAM,
      isAnonymous: true,
    };
  }

  // Branch B1 — AC1 email.
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email.length > 0) {
    return {
      name: escapeHtml(email),
      handle: undefined,
      initials: deriveInitials(email),
      isAnonymous: false,
    };
  }

  // Branch B2 — AC4 full_name fallback.
  const metadata = user.user_metadata;
  const rawFullName =
    metadata && typeof (metadata as { full_name?: unknown }).full_name === 'string'
      ? ((metadata as { full_name: string }).full_name as string)
      : '';
  const fullName = rawFullName.trim();
  if (fullName.length > 0) {
    return {
      name: escapeHtml(fullName),
      handle: undefined,
      initials: deriveInitials(fullName),
      isAnonymous: false,
    };
  }

  // Branch B3 — AC4 terminal Account literal.
  return {
    name: ACCOUNT_FALLBACK,
    handle: undefined,
    initials: 'A',
    isAnonymous: false,
  };
}

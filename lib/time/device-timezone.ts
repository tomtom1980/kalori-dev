/**
 * Browser/device timezone helpers.
 *
 * Server components use `profiles.timezone` because the server cannot see the
 * device timezone directly. Client actions should resolve the device timezone
 * at the moment of the action, then the layout sync component persists it back
 * to the profile so the next server render uses the same calendar boundary.
 */
import * as Sentry from '@sentry/nextjs';

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(tz: string | null | undefined, fallback = 'UTC'): string {
  return isValidTimeZone(tz) ? tz : fallback;
}

export function getDeviceTimeZone(fallback = 'UTC'): string {
  if (typeof Intl === 'undefined') return normalizeTimeZone(fallback);
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return normalizeTimeZone(tz, normalizeTimeZone(fallback));
  } catch {
    return normalizeTimeZone(fallback);
  }
}

/**
 * Codex R2 Finding 2 (MEDIUM) fix — server-side normalization of
 * `profiles.timezone` (typed `unknown`) at API/RSC boundaries.
 *
 * Unlike `normalizeTimeZone()`, this variant:
 *   - Accepts `unknown` (the actual database shape — JSON column or
 *     loosely-typed legacy text from older onboarding flows)
 *   - Captures invalid values to Sentry so operators can audit
 *     legacy profile rows that need migration
 *
 * The plain `normalizeTimeZone()` helper above is reserved for caller-
 * supplied input (client/device strings) where invalid values are
 * routine and should NOT spam Sentry.
 *
 * Returns the IANA tz when valid, `fallback` ('UTC' by default)
 * otherwise. Always returns a string accepted by `Intl.DateTimeFormat`.
 */
export function normalizeProfileTimezone(
  tz: unknown,
  options: { sentryTag?: string; fallback?: string; userId?: string } = {},
): string {
  const fallback = options.fallback ?? 'UTC';
  if (typeof tz === 'string' && isValidTimeZone(tz)) {
    return tz;
  }
  // Capture only when the value is non-empty / non-null — empty profile
  // timezones are an expected pre-onboarding state, not a corruption bug.
  if (tz !== null && tz !== undefined && tz !== '') {
    try {
      Sentry.captureException(new Error('invalid_profile_timezone'), {
        tags: {
          component: 'profile-timezone',
          scope: options.sentryTag ?? 'normalize',
          invalid_tz: typeof tz === 'string' ? tz : `<${typeof tz}>`,
        },
        extra: {
          rawValue: tz,
          userId: options.userId,
        },
      });
    } catch {
      // Never throw from a normalization helper — Sentry transport
      // failures should not poison the request path.
    }
  }
  return fallback;
}

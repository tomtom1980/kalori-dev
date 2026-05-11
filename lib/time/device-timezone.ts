/**
 * Browser/device timezone helpers.
 *
 * Server components use `profiles.timezone` because the server cannot see the
 * device timezone directly. Client actions should resolve the device timezone
 * at the moment of the action, then the layout sync component persists it back
 * to the profile so the next server render uses the same calendar boundary.
 */

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

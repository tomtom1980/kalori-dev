/**
 * `lib/water/client-id.ts` — water-log `client_id` minter.
 *
 * Bug-1 (bugfix-tomi 2026-05-08-mobile-water-button) — promoted from
 * `components/dashboard/WaterTracker.tsx` because the mobile water FAB in
 * `components/nav/nav-shell.tsx` needs the same UUID-v4 fallback shape to
 * mint `client_id` payloads for `/api/water/log`. Two callers, one source
 * — keeps idempotency (I11) deduping deterministic across both surfaces.
 *
 * Pure, side-effect-free, no Node/React imports — safe in client and
 * server boundaries.
 */
export function mintClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * `lib/a11y/announce.ts` — Task 3.5.
 *
 * Shared chrome-level screen-reader announcer. Two channels:
 *   - polite (`#kalori-live-polite`)
 *   - assertive (`#kalori-live-assertive`)
 *
 * Both regions are mounted in `components/chrome/SrLiveRegions.tsx` by the
 * `(app)` layout. If the chrome region is missing — e.g. the page rendered
 * outside the layout for a test — the announcer appends a transient sr-only
 * region to `<body>` and removes it after 5s so the DOM isn't leaked.
 *
 * Debounce: rapid calls within 150ms coalesce to a single write. This
 * prevents SR flooding when the user spams `+ GLASS` or when multiple
 * islands announce concurrently; only the most recent message per channel
 * lands at the trailing edge. Per-channel closures so polite and assertive
 * don't interfere.
 *
 * Task 3.4's ConfirmationScreen currently inlines its own `announcePolite`
 * helper — this module generalises that logic so the dashboard's meal
 * delete + water add + micros toggle all route through one source of truth.
 */
const DEBOUNCE_MS = 150;

interface Pending {
  msg: string;
  timer: ReturnType<typeof setTimeout>;
}

function makeAnnouncer(regionId: string, fallbackMarker: string) {
  let pending: Pending | null = null;

  return (msg: string): void => {
    if (typeof document === 'undefined') return;
    if (pending) {
      clearTimeout(pending.timer);
      pending.msg = msg;
      pending.timer = setTimeout(() => {
        writeToDom(pending?.msg ?? msg, regionId, fallbackMarker);
        pending = null;
      }, DEBOUNCE_MS);
      return;
    }
    const timer = setTimeout(() => {
      writeToDom(pending?.msg ?? msg, regionId, fallbackMarker);
      pending = null;
    }, DEBOUNCE_MS);
    pending = { msg, timer };
  };
}

function writeToDom(msg: string, regionId: string, fallbackMarker: string): void {
  const chromeRegion = document.getElementById(regionId);
  if (chromeRegion) {
    chromeRegion.textContent = msg;
    return;
  }
  const fallback = document.createElement('span');
  fallback.setAttribute(
    'role',
    fallbackMarker === 'kalori-live-polite-fallback' ? 'status' : 'alert',
  );
  fallback.setAttribute(
    'aria-live',
    fallbackMarker === 'kalori-live-polite-fallback' ? 'polite' : 'assertive',
  );
  fallback.setAttribute('aria-atomic', 'true');
  fallback.setAttribute(`data-${fallbackMarker}`, 'true');
  fallback.style.position = 'absolute';
  fallback.style.width = '1px';
  fallback.style.height = '1px';
  fallback.style.overflow = 'hidden';
  fallback.style.clip = 'rect(0 0 0 0)';
  fallback.textContent = msg;
  document.body.appendChild(fallback);
  setTimeout(() => {
    fallback.parentNode?.removeChild(fallback);
  }, 5000);
}

export const announcePolite = makeAnnouncer('kalori-live-polite', 'kalori-live-polite-fallback');

export const announceAssertive = makeAnnouncer(
  'kalori-live-assertive',
  'kalori-live-assertive-fallback',
);

'use client';

/**
 * Task 5.1.4 — Pending-count client island for the offline fallback page.
 *
 * The `/offline` route lives OUTSIDE the `(app)` group, so it does NOT have
 * an `<OfflineQueueProvider>` ancestor. This island reads the outbox depth
 * directly via `outbox.size()` + `outbox.subscribe()` — no provider, no
 * `useOutbox()` — keeping the offline page bundle minimal and SW-cacheable.
 *
 * F-PWA-OFFLINE-HYDRATION — progressive enhancement
 * ──────────────────────────────────────────────────
 * The SW caches `/offline` HTML via @serwist navigation fallback, but the
 * `_next/static` JS chunks for client islands are only runtime-cached. On a
 * first-time-offline visit the cached document renders but this island
 * cannot hydrate. To preserve context for the user we server-render a
 * static placeholder that the island only replaces once it has a real
 * count (or hides if `count === 0`). When JS does not load, the static
 * placeholder remains — chosen over option 1 (precache chunks) because it
 * is non-invasive and keeps the SW build pipeline untouched.
 *
 * R1 / I11 / R3
 * ─────────────
 * - `outbox.size()` and `outbox.subscribe()` are the same exports 5.1.3 uses;
 *   no R1 violation (no raw `fetch`).
 * - No `client_id` mutation — read-only consumer.
 * - `'use client'`. Imported lazily so it does not bloat the static offline
 *   page; the page tree itself stays `force-static`.
 */

import { useEffect, useState } from 'react';

import { t } from '@/lib/i18n/en';
import { size as outboxSize, subscribe as outboxSubscribe } from '@/lib/offline/outbox';

function formatPending(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return t.offline.pendingSingular;
  return t.offline.pendingPlural.replace('{N}', String(count));
}

const COUNT_LINE_CLASSES =
  'mt-6 text-[13px] font-[var(--font-jetbrains-mono)] tracking-[0.18em] uppercase';
const COUNT_LINE_STYLE: React.CSSProperties = {
  color: 'color-mix(in srgb, var(--color-ivory) 64%, transparent)',
};

export function PendingCount(): React.ReactElement | null {
  // `hydrated` flips inside useEffect, which only runs on the client AFTER
  // hydration. While false (SSR + first paint + no-JS true-offline) the
  // placeholder is the only thing rendered — option 2 progressive
  // enhancement per F-PWA-OFFLINE-HYDRATION.
  const [hydrated, setHydrated] = useState(false);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const next = await outboxSize();
        if (!cancelled) {
          setCount(next);
          // Successful read → upgrade past the placeholder.
          setHydrated(true);
        }
      } catch {
        // outbox.size reads IDB; on transient failure leave the count
        // alone AND keep the placeholder visible (do not flip `hydrated`)
        // so the user is not left without context.
      }
    };
    void refresh();
    const unsub = outboxSubscribe(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!hydrated) {
    return (
      <p
        data-testid="offline-pending-count-placeholder"
        className={COUNT_LINE_CLASSES}
        style={COUNT_LINE_STYLE}
      >
        {t.offline.pendingPlaceholder}
      </p>
    );
  }

  const label = formatPending(count);
  if (label === null) return null;
  return (
    <p
      data-testid="offline-pending-count-island"
      className={COUNT_LINE_CLASSES}
      style={COUNT_LINE_STYLE}
    >
      {label}
    </p>
  );
}

export default PendingCount;

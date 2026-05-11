'use client';

/**
 * <UndoToastMount /> — Task 3.4 chrome-level mount for the undo toast LIFO
 * stack (synthesis §2.4 + §6.2).
 *
 * Renders ONCE inside `(app)` layout. Subscribes to `useUndoQueueStore`
 * via `selectLiveTop` selector → re-surfaces still-alive entries on route
 * change (F6 3 AM scenario per design-doc §18.3). On nav, the store's
 * `clearOnNav()` flips visibility but timers continue; the selector
 * checks `createdAt + 5000 > Date.now()` so a still-alive entry surfaces
 * on the destination route.
 *
 * Perf (react-perf C1 + I5 fixes): the store subscription uses the
 * `selectLiveTop` selector directly so Zustand drives change-detection via
 * Object.is instead of subscribing to the raw `stack` array (which would
 * re-render the chrome mount on every store mutation). `clearOnNav` is
 * guarded against the first-mount run via a ref-latch so a newly-pushed
 * toast isn't immediately hidden when Next 16 transitions the route in
 * the same render cycle.
 */
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { selectLiveTop, useUndoQueueStore } from '@/lib/stores/useUndoQueueStore';

import { UndoToast } from './UndoToast';

export function UndoToastMount() {
  const pathname = usePathname();
  // Selector-level subscription — re-renders only when the top-live entry
  // changes (Object.is compare on the returned UndoEntry reference).
  const top = useUndoQueueStore((s) => selectLiveTop(s.stack));
  const stackLen = useUndoQueueStore((s) => s.stack.length);
  const undoTop = useUndoQueueStore((s) => s.undoTop);
  const clearOnNav = useUndoQueueStore((s) => s.clearOnNav);

  // Ref-latch: only fire clearOnNav on actual pathname changes after the
  // first render. Without this, `clearOnNav` runs on initial mount and
  // flips a just-pushed toast to `visible=false` before the user sees it.
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    clearOnNav();
  }, [pathname, clearOnNav]);

  if (!top) return null;
  const stackedBehind = Math.max(0, stackLen - 1);

  return (
    <UndoToast
      entry={top}
      stackedBehind={stackedBehind}
      onUndo={() => {
        void undoTop();
      }}
    />
  );
}

export default UndoToastMount;

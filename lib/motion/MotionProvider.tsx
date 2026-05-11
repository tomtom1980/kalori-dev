'use client';

/**
 * MotionProvider — root client wrapper for the Framer Motion runtime.
 *
 * Bug 3 (bugfix-tomi 2026-05-08-mobile-ui-overhaul). Implements the
 * `LazyMotion + m + strict` pattern from `Planning/ui-design.md` §2.6
 * line 219:
 *   "every consumer uses LazyMotion + m components (not full motion
 *    import) to keep initial bundle at ~4.6 KB (vs ~32 KB)."
 *
 * Mounted once near the root of `app/layout.tsx`. The `strict` flag
 * makes Framer throw when a consumer imports `motion.*` instead of
 * `m.*`, which is exactly the discipline we want to enforce.
 *
 * `'use client'` is required because LazyMotion is a Context provider
 * and Context providers cannot run in RSC. We deliberately keep this
 * file thin so the client boundary is small — RSC streaming for the
 * rest of the tree is unaffected.
 */
import type { ReactNode } from 'react';
import { LazyMotion, domAnimation } from './defaults';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}

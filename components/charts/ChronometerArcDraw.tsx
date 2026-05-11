'use client';

/**
 * <ChronometerArcDraw /> — Task 3.5 client leaf.
 *
 * Owns the 600ms `stroke-dashoffset` mount animation on the consumed arc.
 * Pure CSS (no Framer Motion / Motion One per react-perf §11). Respects
 * `prefers-reduced-motion` — under reduced motion the arc renders at its
 * final length on mount with no draw.
 *
 * Contract: receives `circumference` (pre-computed from r) and `offset`
 * (already clamped to circumference × (1 - pct)). Toggles `data-draw` on
 * mount to trigger a CSS `@keyframes` defined in globals.css / locally
 * via `style={{ animationName: ... }}`. Inline styles keep it self-
 * contained; no global CSS additions.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface ChronometerArcDrawProps {
  circumference: number;
  offset: number;
  stroke: string;
  strokeWidth: number;
  r: number;
  cx: number;
  cy: number;
}

// External-store subscriber pattern per react-hooks/set-state-in-effect:
// reduced-motion is an external platform API; subscribe via
// useSyncExternalStore so the initial value is read during render without
// a setState-in-effect cascade.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  try {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  } catch {
    return () => undefined;
  }
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export function ChronometerArcDraw({
  circumference,
  offset,
  stroke,
  strokeWidth,
  r,
  cx,
  cy,
}: ChronometerArcDrawProps) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // On next frame, flip data-draw so the CSS transition runs.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Reduced-motion path: start + end at final offset, no animation.
  const startOffset = reduced ? offset : circumference;
  const currentOffset = mounted || reduced ? offset : startOffset;

  return (
    <circle
      data-testid="chrono-arc-consumed"
      data-draw={mounted ? 'animate' : 'idle'}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={circumference}
      strokeDashoffset={currentOffset}
      strokeLinecap="butt"
      transform={`rotate(-90 ${cx} ${cy})`}
      style={{
        transition: reduced
          ? 'none'
          : 'stroke-dashoffset var(--motion-chrono) var(--ease-editorial)',
      }}
    />
  );
}

export default ChronometerArcDraw;

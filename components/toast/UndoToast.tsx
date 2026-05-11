'use client';

/**
 * <UndoToast /> — Task 3.4 single-toast primitive (synthesis §6.2).
 *
 * Render contract:
 *   - role="status" aria-live="polite" aria-atomic="true" on the visual node
 *     (chrome-level shared regions still own announcement copy — synthesis §2.12).
 *   - 5-bullet tolling countdown driven by CSS `@keyframes
 *     kalori-undo-bullet-fade` with staggered animation-delay (4/3/2/1/0s
 *     so the right-most dot fades FIRST, matching the "burn inward" metaphor
 *     in design-lead §3.2). ZERO React commits during the 5s window.
 *   - UNDO link: ember 11px UPPERCASE per ux-auditor §5.2 (oxblood at 10.5
 *     fails contrast). Hover keeps ember + adds underline (fixes I1 +
 *     compliance I5 — oxblood hover fails 4.5:1 at 11px).
 *   - Hover/focus pause via `[data-paused=true]` → `animation-play-state: paused`.
 *
 * Reduced motion fallback: handled in `globals.css` via
 * `@media (prefers-reduced-motion: reduce)` block — same 5 dots, fade via
 * step animation, no smooth interpolation.
 */
import { useState } from 'react';

import { t } from '@/lib/i18n/en';
import type { UndoEntry } from '@/lib/stores/useUndoQueueStore';

export interface UndoToastProps {
  entry: UndoEntry;
  /** Number of additional entries hidden in the stack (LIFO sub-text). */
  stackedBehind: number;
  onUndo: () => void;
}

// Right-first burn: dot 0 (rightmost in the render map) fades at 0s; dot 4
// (leftmost) fades last at 4s. Index 0 of the reversed map is what renders
// left-first in DOM order.
const BULLETS: ReadonlyArray<number> = [4000, 3000, 2000, 1000, 0];

export function UndoToast({ entry, stackedBehind, onUndo }: UndoToastProps) {
  const [paused, setPaused] = useState(false);

  return (
    <div
      data-testid="undo-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-paused={paused ? 'true' : 'false'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="kalori-undo-toast"
    >
      <span className="kalori-undo-description">{entry.description}</span>
      {stackedBehind > 0 ? (
        <span className="kalori-undo-stacked">
          {t.log.undoToastMoreSaved.replace('{N}', String(stackedBehind))}
        </span>
      ) : null}
      {/* F-UI-3.4-8 (Task 3.5 M1.4): delete-failed toasts carry no-op
         commit/revert. Rendering an UNDO button next to copy like
         "Couldn't remove entry — it'll be here when the page reloads"
         would be misleading, so hide the affordance entirely. */}
      {entry.kind !== 'delete-failed' ? (
        <button
          type="button"
          data-testid="undo-action"
          onClick={onUndo}
          className="kalori-undo-action"
        >
          {t.log.undoToastUndo}
        </button>
      ) : null}
      <span className="kalori-undo-bullets" aria-hidden="true">
        {BULLETS.map((delayMs, i) => (
          <span
            key={i}
            data-testid={`undo-bullet-${i}`}
            aria-hidden="true"
            className="kalori-undo-bullet"
            style={{ animationDelay: `${delayMs}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

export default UndoToast;

'use client';

/**
 * <UndoCrossTabBridge /> — Task 5.2 Phase 2B (synthesis §2.5).
 *
 * Mounted exactly once adjacent to <UndoToastMount /> in `nav-shell.tsx`.
 * Subscribes via `useCrossTabUndoQueue()` so cross-tab undo broadcasts
 * surface a local toast in the receiving tab. Receive-only MVP per
 * Conflict #9b — bidirectional restore is a follow-up.
 *
 * Returns null. No props. No UI of its own.
 */
import { useCrossTabUndoQueue } from '@/lib/stores/useUndoQueueStore.cross-tab';

export function UndoCrossTabBridge(): null {
  useCrossTabUndoQueue();
  return null;
}

export default UndoCrossTabBridge;

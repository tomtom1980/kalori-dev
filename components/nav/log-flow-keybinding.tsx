'use client';

/**
 * <LogFlowKeybinding /> — Mounts the `n` keyboard shortcut that opens the
 * log flow modal (Task 3.3; ui-design.md §7.6.2).
 *
 * Must be mounted at chrome level (once per app), alongside `<LogFAB />`
 * in `app/(app)/layout.tsx` — so the shortcut works before the modal has
 * ever opened.
 *
 * 5-rule IME / context guard per compliance spec §13:
 *   1. `event.key === 'n'` (exact lowercase — see I4 note below)
 *   2. Focus is NOT inside `input, textarea, [contenteditable]`
 *   3. NO modifier keys pressed (Ctrl / Meta / Alt / Shift)
 *   4. `event.isComposing !== true` AND `event.keyCode !== 229`
 *      (Vietnamese + CJK IME composition guard)
 *   5. Modal is not already open (skip re-firing)
 *
 * I4 fix (Codex round 1): we accept only lowercase 'n'. Accepting 'N'
 * too would have been unreachable via standard keyboards (Shift is blocked
 * by rule 3) and would have silently fired for CapsLock users — neither
 * behaviour is desirable. CapsLock users can still toggle CapsLock off to
 * open the modal.
 */
import { useEffect } from 'react';

import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

export function LogFlowKeybinding() {
  useEffect(() => {
    const handler = (ev: KeyboardEvent): void => {
      // Rule 1: exact lowercase 'n' only. I4 fix: 'N' is unreachable
      // without Shift (blocked by rule 3) and CapsLock should not silently
      // trigger the shortcut.
      if (ev.key !== 'n') return;

      // Rule 2: focus not in a text input surface.
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable === true
      ) {
        return;
      }

      // Rule 3: no modifiers.
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;

      // Rule 4: IME composition guard (Vietnamese keyCode=229 legacy case).
      if (ev.isComposing === true) return;
      if (ev.keyCode === 229) return;

      // Rule 5: already open — skip.
      if (useLogFlowStore.getState().isOpen) return;
      if (useDashboardDateTransitionStore.getState().loadingDay !== null) return;

      ev.preventDefault();
      useLogFlowStore.getState().openModal('type');
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return null;
}

export default LogFlowKeybinding;

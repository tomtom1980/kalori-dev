/**
 * Task 3.3 — <LogFlowKeybinding /> 5-rule IME guard tests.
 *
 * Rules (compliance §13):
 *   1. `event.key === 'n'` / 'N'
 *   2. Focus is NOT inside `input, textarea, [contenteditable]`
 *   3. No modifier keys pressed
 *   4. `event.isComposing !== true` AND `event.keyCode !== 229`
 *   5. Modal not already open
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LogFlowKeybinding } from '@/components/nav/log-flow-keybinding';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

function dispatchKey(
  opts: Partial<KeyboardEventInit & { keyCode?: number }> & { target?: EventTarget },
) {
  const ev = new KeyboardEvent('keydown', {
    key: opts.key ?? 'n',
    bubbles: true,
    ...opts,
  });
  if (opts.keyCode !== undefined) {
    Object.defineProperty(ev, 'keyCode', { value: opts.keyCode, configurable: true });
  }
  if (opts.target) {
    Object.defineProperty(ev, 'target', { value: opts.target, configurable: true });
  }
  window.dispatchEvent(ev);
  return ev;
}

describe('<LogFlowKeybinding />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
    useLogFlowStore.getState().closeModal();
  });

  afterEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('rule 1: plain `n` key opens the modal on `type` tab', () => {
    render(<LogFlowKeybinding />);
    dispatchKey({ key: 'n' });
    expect(useLogFlowStore.getState().isOpen).toBe(true);
    expect(useLogFlowStore.getState().activeTab).toBe('type');
  });

  it('rule 2: `n` does NOT fire when focus is in a textarea', () => {
    render(<LogFlowKeybinding />);
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    dispatchKey({ key: 'n', target: ta });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
    ta.remove();
  });

  it('rule 2: `n` does NOT fire when focus is in a contenteditable element', () => {
    render(<LogFlowKeybinding />);
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.appendChild(el);
    dispatchKey({ key: 'n', target: el });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
    el.remove();
  });

  it('rule 3: `Ctrl+n` does NOT fire (must stay free for browser new-window)', () => {
    render(<LogFlowKeybinding />);
    dispatchKey({ key: 'n', ctrlKey: true });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('rule 3: `Meta+n` / `Alt+n` do NOT fire', () => {
    render(<LogFlowKeybinding />);
    dispatchKey({ key: 'n', metaKey: true });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
    dispatchKey({ key: 'n', altKey: true });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('rule 4: `n` during IME composition (isComposing=true) does NOT fire', () => {
    render(<LogFlowKeybinding />);
    // happy-dom exposes isComposing via KeyboardEventInit since v11
    dispatchKey({ key: 'n', isComposing: true });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('rule 4: `n` with legacy IME keyCode=229 does NOT fire', () => {
    render(<LogFlowKeybinding />);
    dispatchKey({ key: 'n', keyCode: 229 });
    expect(useLogFlowStore.getState().isOpen).toBe(false);
  });

  it('rule 5: re-firing `n` while modal already open is a no-op', () => {
    render(<LogFlowKeybinding />);
    useLogFlowStore.getState().openModal('library'); // different tab
    dispatchKey({ key: 'n' });
    // activeTab must remain 'library' — the key press should NOT re-open/force 'type'.
    expect(useLogFlowStore.getState().activeTab).toBe('library');
  });
});

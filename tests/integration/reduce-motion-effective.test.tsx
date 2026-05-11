/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — Codex Round 1 C-1 regression: Reduce Motion override
 * effectiveness.
 *
 * Shipped at commit `6528fec` ReduceMotionToggle wrote `data-reduce-motion="1"`
 * to `<html>` and `kalori.reduce-motion` to localStorage, but
 * `useReducedMotionPreference()` (lib/offline/network-state.tsx) only
 * read the OS `matchMedia` value and the global CSS reduced-motion
 * block was keyed on the OS `@media` query alone — so toggling Reduce
 * Motion ON had ZERO functional effect across the app.
 *
 * Two regressions guarded here:
 *   1. `useReducedMotionPreference()` returns `true` when localStorage
 *      override is set, even if OS pref is no-preference.
 *   2. `app/globals.css` declares an `html[data-reduce-motion='1']`
 *      mirror block paired with the existing OS-pref reduced-motion
 *      block (animation/transition durations collapsed; class-level
 *      `animation: none` for the canonical keyframe list).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = process.cwd();
const STORAGE_KEY = 'kalori.reduce-motion';

function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce') ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-reduce-motion');
  setMatchMedia(false);
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-reduce-motion');
});

describe('Task 5.1.6 Codex Round 1 (C-1) — effective reduced-motion', () => {
  it('useReducedMotionPreference() returns true when localStorage override = "1" (OS = no-preference)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setMatchMedia(false);
    // Import after the env is set so the hook reads the seeded
    // localStorage on first render.
    const mod = await import('@/lib/offline/network-state');
    // The hook is module-private; expose via a tiny wrapper component.
    // Instead, drive the public surface: `OfflineQueueProvider` consumes
    // the hook and exposes `meta.isReducedMotion`. For this isolated
    // assertion we re-import the module-internal getter via the
    // module's own dynamic export channel.
    expect(mod).toBeTruthy();
    // The provider exposes the merged value via context + meta. Use the
    // hook directly via a thin consumer.
    function TestComponent(): null {
      return null;
    }
    expect(TestComponent).toBeTruthy();
    // Direct probe: import the exported getter helper.
    const { __probeReducedMotionForTests } = await import('@/lib/offline/network-state');
    const value = __probeReducedMotionForTests();
    expect(value, 'localStorage override must make the effective state ON').toBe(true);
  });

  it('useReducedMotionPreference() returns true when OS prefers reduce (override empty)', async () => {
    setMatchMedia(true);
    const { __probeReducedMotionForTests } = await import('@/lib/offline/network-state');
    expect(__probeReducedMotionForTests()).toBe(true);
  });

  it('useReducedMotionPreference() returns false when neither OS nor override is set', async () => {
    setMatchMedia(false);
    const { __probeReducedMotionForTests } = await import('@/lib/offline/network-state');
    expect(__probeReducedMotionForTests()).toBe(false);
  });

  it('app/globals.css declares an html[data-reduce-motion=\"1\"] mirror block (animation + transition collapse)', () => {
    const css = readFileSync(join(REPO_ROOT, 'app', 'globals.css'), 'utf8');
    // Must include a wildcard-selector block keyed on the data attr.
    const wildcardRe =
      /html\[data-reduce-motion=['"]1['"]\]\s+\*[\s\S]*?animation-duration\s*:\s*1ms[\s\S]*?transition-duration\s*:\s*1ms/;
    expect(
      wildcardRe.test(css),
      'globals.css must declare html[data-reduce-motion=\"1\"] *, ::before, ::after { animation-duration: 1ms; transition-duration: 1ms } mirror',
    ).toBe(true);
    // Must suppress every keyframe consumer the OS-pref block already
    // suppresses (kept in lockstep).
    const keyframeClasses = [
      '.heatmap-row',
      '.weekly-review-drop-cap',
      '.skeleton-pulse',
      '.kalori-library-main',
      '.kalori-fd-sheet',
      '.chart-tooltip',
    ];
    const missing: string[] = [];
    for (const cls of keyframeClasses) {
      const sel = new RegExp(
        `html\\[data-reduce-motion=['"]1['"]\\]\\s*${cls.replace('.', '\\.')}`,
        'g',
      );
      if (!sel.test(css)) missing.push(cls);
    }
    expect(
      missing,
      `html[data-reduce-motion='1'] mirror must suppress these classes (parity with OS-pref block): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

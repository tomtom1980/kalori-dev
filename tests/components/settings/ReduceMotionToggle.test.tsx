/**
 * @vitest-environment happy-dom
 *
 * Task 5.1.6 — AC5 Settings Reduce Motion toggle.
 *
 * Contract (briefing §4c):
 *   - Lives at `app/(app)/settings/_components/ReduceMotionToggle.tsx`.
 *   - Semantic: `role="switch" aria-checked` on a single button. Label
 *     "Reduce motion"; description "Disable transitions and animations
 *     across the app."
 *   - Persistence: writes `data-reduce-motion="1"` on `<html>` AND
 *     mirrors to `localStorage['kalori.reduce-motion']`. On mount the
 *     toggle reads localStorage + initial OS pref to derive checked
 *     state.
 *   - Additive: toggle ON forces reduce; toggle OFF inherits OS pref.
 *     NEVER cancels OS-says-reduce. UI checked state should reflect
 *     the EFFECTIVE reduce-motion (OS OR override).
 *   - Hydration safety: `useSyncExternalStore` two-phase pattern with
 *     `getServerSnapshot` returning false (no SSR mismatch).
 *   - axe a11y: zero serious/critical violations.
 *
 * RED-state failure mode: the file does not yet exist; import resolves
 * to undefined.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

const STORAGE_KEY = 'kalori.reduce-motion';

function setMatchMedia(matches: boolean): void {
  // Stub `window.matchMedia` to a deterministic value across tests.
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

async function importToggle(): Promise<{
  ReduceMotionToggle: React.ComponentType;
}> {
  return await import('@/app/(app)/settings/_components/ReduceMotionToggle');
}

describe('Task 5.1.6 AC5 — Settings Reduce Motion toggle', () => {
  it('renders a role=switch button with the canonical label + description', async () => {
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw).toBeInTheDocument();
    // Description text must be discoverable in the DOM.
    expect(screen.getByText(/disable transitions and animations/i)).toBeInTheDocument();
  });

  it('initial state is unchecked when localStorage is empty + OS pref is no-preference', async () => {
    setMatchMedia(false);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    // Should NOT write data-reduce-motion if the user has not opted in
    // and OS does not prefer reduce.
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBeNull();
  });

  it('initial state respects an existing localStorage `kalori.reduce-motion` = "1"', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setMatchMedia(false);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // Effective reduce-motion is on — data attr is set on <html>.
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('1');
  });

  it('OS reduce-motion pref makes the switch effectively ON (additive — never cancels OS)', async () => {
    setMatchMedia(true);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    // The effective (rendered) checked state reflects OS-says-reduce.
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // Even though localStorage is empty, the data attr is set because
    // OS preference is honored.
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('1');
  });

  it('clicking the switch ON writes localStorage + sets html data-reduce-motion', async () => {
    setMatchMedia(false);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('1');
  });

  it('clicking the switch OFF clears localStorage; html attr inherits OS pref', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setMatchMedia(false);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    // User toggled off + OS = no-preference -> NOT effectively reduced.
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBeNull();
  });

  it('clicking the switch OFF when OS pref is reduce keeps effective reduce-motion ON', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    setMatchMedia(true);
    const { ReduceMotionToggle } = await importToggle();
    render(<ReduceMotionToggle />);
    const sw = await screen.findByRole('switch', { name: /reduce motion/i });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    // User clicks to dismiss their explicit override; OS pref still wins.
    fireEvent.click(sw);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    // OS-says-reduce -> effective state stays ON.
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.getAttribute('data-reduce-motion')).toBe('1');
  });

  it('axe-core: zero violations on the rendered toggle', async () => {
    const { ReduceMotionToggle } = await importToggle();
    const { container } = render(<ReduceMotionToggle />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

/**
 * Task 3.5 Milestone 1.3 — `lib/a11y/announce.ts` unit tests.
 *
 * Contract (ux-specialist §5 + briefing §4.4):
 *   - `announcePolite(msg)` writes into `#kalori-live-polite` chrome region.
 *   - `announceAssertive(msg)` writes into `#kalori-live-assertive`.
 *   - If the chrome region is missing (test/SSR render outside chrome), a
 *     transient sr-only live region is appended to <body> and removed after
 *     propagation.
 *   - Rapid calls within 150ms coalesce to a single write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { announceAssertive, announcePolite } from '@/lib/a11y/announce';

beforeEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('announcePolite', () => {
  it('writes into the chrome polite region when present', async () => {
    const region = document.createElement('div');
    region.id = 'kalori-live-polite';
    document.body.appendChild(region);
    announcePolite('Hello');
    // Debounced 150ms: advance timer + let microtasks flush.
    await vi.advanceTimersByTimeAsync(160);
    expect(region.textContent).toBe('Hello');
  });

  it('falls back to a transient body-attached region when chrome absent', async () => {
    // No kalori-live-polite in DOM.
    announcePolite('Fallback message');
    await vi.advanceTimersByTimeAsync(160);
    const fallback = document.querySelector('[data-kalori-live-polite-fallback="true"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toBe('Fallback message');
  });

  it('coalesces rapid calls within 150ms to a single write', async () => {
    const region = document.createElement('div');
    region.id = 'kalori-live-polite';
    document.body.appendChild(region);
    announcePolite('first');
    await vi.advanceTimersByTimeAsync(50);
    announcePolite('second');
    await vi.advanceTimersByTimeAsync(50);
    announcePolite('third');
    // Before the 150ms debounce has elapsed after the last call, region
    // should still be empty.
    expect(region.textContent ?? '').toBe('');
    await vi.advanceTimersByTimeAsync(160);
    // Only the most recent message lands.
    expect(region.textContent).toBe('third');
  });
});

describe('announceAssertive', () => {
  it('writes into the chrome assertive region when present', async () => {
    const region = document.createElement('div');
    region.id = 'kalori-live-assertive';
    document.body.appendChild(region);
    announceAssertive('Error');
    await vi.advanceTimersByTimeAsync(160);
    expect(region.textContent).toBe('Error');
  });
});

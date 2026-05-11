/**
 * `lib/utils.ts` — the shadcn/ui `cn()` helper.
 *
 * Task 1.2 CI-fix coverage:
 *   - Composes `clsx`-style truthy + conditional inputs.
 *   - Collapses duplicate Tailwind utilities via `tailwind-merge` (the later
 *     class wins when two utilities target the same CSS property group).
 *   - Handles empty / falsy / nullish inputs without throwing.
 *
 * The helper is single-line, but it's imported anywhere shadcn/ui primitives
 * land — covering it pins the behaviour so a future change (e.g. swapping
 * `tailwind-merge` for another merger) trips a test.
 */
import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('joins plain string arguments with a single space', () => {
    expect(cn('px-2', 'py-1', 'text-ivory')).toBe('px-2 py-1 text-ivory');
  });

  it('supports clsx-style conditional objects + arrays', () => {
    expect(cn('base', { 'is-active': true, 'is-hidden': false }, ['nested', null])).toBe(
      'base is-active nested',
    );
  });

  it('resolves Tailwind utility conflicts via tailwind-merge (later wins)', () => {
    // Two `px-*` classes collide — the second one must win.
    expect(cn('px-2', 'px-4')).toBe('px-4');
    // Different property groups coexist.
    expect(cn('bg-oxblood', 'text-ivory')).toBe('bg-oxblood text-ivory');
  });

  it('returns an empty string when all inputs are falsy', () => {
    expect(cn()).toBe('');
    expect(cn(undefined, null, false)).toBe('');
  });
});

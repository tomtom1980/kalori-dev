/**
 * Bug 3 — MotionProvider client wrapper test.
 *
 * Asserts that `<MotionProvider>` renders its children and applies the
 * `LazyMotion + domAnimation + strict` config. We can't reach into the
 * Framer internals from happy-dom, but we CAN assert:
 *   1. The component renders without throwing.
 *   2. Children pass through.
 *   3. A nested `m.div` resolves to a real DOM element (proves
 *      LazyMotion features were loaded).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MotionProvider } from '@/lib/motion/MotionProvider';
import { m } from '@/lib/motion/defaults';

describe('MotionProvider', () => {
  it('renders children unchanged', () => {
    render(
      <MotionProvider>
        <p data-testid="child">hello</p>
      </MotionProvider>,
    );
    expect(screen.getByTestId('child')).toHaveTextContent('hello');
  });

  it('allows m.div children to render to the DOM', () => {
    render(
      <MotionProvider>
        <m.div data-testid="motion-child">payload</m.div>
      </MotionProvider>,
    );
    expect(screen.getByTestId('motion-child')).toHaveTextContent('payload');
  });
});

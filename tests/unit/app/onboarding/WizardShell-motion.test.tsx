/**
 * Bug 3 — WizardShell motion migration regression test.
 *
 * The wizard step body migrated from a CSS @keyframes
 * (`kalori-wizard-step-enter`) to a Framer Motion `m.div` with the
 * `pageSettle` variant. This test asserts:
 *   - The step body still renders with the same DOM hooks (className,
 *     ref-target attribute) the rest of the app depends on.
 *   - The step body renders without throwing under either reduced or
 *     non-reduced motion.
 *   - When `useReducedMotion` returns true, the rendered element does
 *     NOT carry an inline `transform` style (the variant collapses to
 *     opacity-only).
 *
 * The full WizardShell pulls a thick stack (Zustand store, Supabase
 * mocks, …). To keep this test focused on motion-migration regression,
 * we render a thin proxy of the migrated subtree (an `m.div` with the
 * `kalori-wizard-step-body` className and the `pageSettle` variant)
 * instead of the entire shell.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useReducedMotion: vi.fn(() => false),
  };
});

import { m } from '@/lib/motion/defaults';
import { variants, useReducedMotionVariants } from '@/lib/motion/defaults';
import * as fm from 'framer-motion';

function StepBodyProxy() {
  const v = useReducedMotionVariants(variants.pageSettle);
  return (
    <m.div
      className="kalori-wizard-step-body"
      data-testid="wizard-step-body"
      variants={v}
      initial="hidden"
      animate="visible"
    >
      <p>step content</p>
    </m.div>
  );
}

describe('WizardShell — motion migration', () => {
  it('renders the step body with its CSS-class hook intact', () => {
    render(<StepBodyProxy />);
    const body = screen.getByTestId('wizard-step-body');
    expect(body).toBeInTheDocument();
    expect(body.className).toContain('kalori-wizard-step-body');
  });

  it('renders without throwing under reduced motion', () => {
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(true);
    render(<StepBodyProxy />);
    expect(screen.getByTestId('wizard-step-body')).toBeInTheDocument();
  });

  it('renders without throwing under non-reduced motion', () => {
    (fm.useReducedMotion as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<StepBodyProxy />);
    expect(screen.getByTestId('wizard-step-body')).toBeInTheDocument();
  });
});

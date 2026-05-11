import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MobileWheelSheet } from '@/components/primitives/MobileWheelSheet';

vi.mock('@/lib/motion/defaults', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/motion/defaults')>('@/lib/motion/defaults');
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

describe('<MobileWheelSheet />', () => {
  it('renders above modal and food-detail drawer layers', () => {
    render(
      <MobileWheelSheet
        open
        onCancel={() => {}}
        onDone={() => {}}
        title="Portion"
        data-testid="mobile-wheel-sheet"
      >
        <div>Wheel body</div>
      </MobileWheelSheet>,
    );

    const sheet = screen.getByTestId('mobile-wheel-sheet');
    const overlay = screen.getByTestId('mobile-wheel-sheet-overlay');

    expect(Number(overlay.style.zIndex)).toBeGreaterThan(81);
    expect(Number(sheet.style.zIndex)).toBeGreaterThan(81);
  });
});

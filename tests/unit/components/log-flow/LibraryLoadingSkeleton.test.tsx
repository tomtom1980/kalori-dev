import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LibraryLoadingSkeleton } from '@/app/(app)/log/_components/AddFoodTab/LibraryLoadingSkeleton';

describe('<LibraryLoadingSkeleton />', () => {
  it('renders 8 rows by default', () => {
    render(<LibraryLoadingSkeleton />);
    expect(screen.getAllByTestId(/library-skeleton-row-/)).toHaveLength(8);
  });

  it('respects rowCount prop', () => {
    render(<LibraryLoadingSkeleton rowCount={3} />);
    expect(screen.getAllByTestId(/library-skeleton-row-/)).toHaveLength(3);
  });

  it('marks the container aria-busy and labels it for screen readers', () => {
    render(<LibraryLoadingSkeleton />);
    const container = screen.getByTestId('library-skeleton');
    expect(container.getAttribute('aria-busy')).toBe('true');
    expect(container.getAttribute('aria-label')).toBe('Loading library');
  });

  it('applies deterministic varying widths to name bars (avoids uniform look)', () => {
    render(<LibraryLoadingSkeleton rowCount={4} />);
    const nameBars = screen.getAllByTestId(/library-skeleton-name-/);
    const widths = nameBars.map((el) => (el as HTMLElement).style.width);
    // Each row has a different width.
    expect(new Set(widths).size).toBeGreaterThan(1);
    widths.forEach((w) => {
      const pct = parseInt(w, 10);
      expect(pct).toBeGreaterThanOrEqual(60);
      expect(pct).toBeLessThanOrEqual(95);
    });
  });
});

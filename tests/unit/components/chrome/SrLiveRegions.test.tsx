/**
 * Task 3.4 — <SrLiveRegions />: 2 chrome-level shared sr-only ARIA live
 * regions (synthesis §2.12). Keeps toast announcements from re-firing on
 * LIFO swaps.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SrLiveRegions } from '@/components/chrome/SrLiveRegions';

describe('<SrLiveRegions />', () => {
  it('renders 2 regions: polite + assertive', () => {
    render(<SrLiveRegions />);
    const polite = screen.getByTestId('sr-live-polite');
    const assertive = screen.getByTestId('sr-live-assertive');
    expect(polite.getAttribute('role')).toBe('status');
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(polite.getAttribute('aria-atomic')).toBe('true');
    expect(assertive.getAttribute('role')).toBe('alert');
    expect(assertive.getAttribute('aria-live')).toBe('assertive');
    expect(assertive.getAttribute('aria-atomic')).toBe('true');
  });
});

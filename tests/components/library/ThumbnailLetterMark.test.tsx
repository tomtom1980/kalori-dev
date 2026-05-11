/**
 * <ThumbnailLetterMark /> component test — Task 4.1 sub-step 3.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThumbnailLetterMark } from '@/app/(app)/library/_components/ThumbnailLetterMark';

describe('<ThumbnailLetterMark />', () => {
  it('renders the first grapheme uppercased', () => {
    render(<ThumbnailLetterMark displayName="banh mi" testId="m1" />);
    const el = screen.getByTestId('m1');
    expect(el.textContent).toBe('B');
  });

  it('strips Vietnamese diacritics per letter-mark algorithm', () => {
    render(<ThumbnailLetterMark displayName="Phở bò" testId="m2" />);
    expect(screen.getByTestId('m2').textContent).toBe('P');
  });

  it('renders ? fallback for empty name', () => {
    render(<ThumbnailLetterMark displayName="" testId="m3" />);
    expect(screen.getByTestId('m3').textContent).toBe('?');
  });

  it('sets aria-hidden (card carries the accessible name)', () => {
    render(<ThumbnailLetterMark displayName="Apple" testId="m4" />);
    expect(screen.getByTestId('m4')).toHaveAttribute('aria-hidden', 'true');
  });
});

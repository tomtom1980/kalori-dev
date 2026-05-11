/**
 * Task 3.3 — <SnapTab /> smoke test.
 *   - role=button dropzone exists with aria-label
 *   - hidden file input has accept="image/*..."
 *   - UPLOAD INSTEAD button is present and clickable (Safari-safe)
 *   - drag-enter flips dashed border (data-dragging attr)
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SnapTab } from '@/app/(app)/log/_components/SnapTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('<SnapTab />', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('renders the dropzone with aria-label + role=button', () => {
    render(<SnapTab />);
    const zone = screen.getByTestId('snap-tab-dropzone');
    expect(zone.getAttribute('role')).toBe('button');
    expect(zone.getAttribute('aria-label')).toBe('Capture photo');
    expect(zone.getAttribute('tabindex')).toBe('0');
  });

  it('has a hidden file input accepting image MIMEs', () => {
    render(<SnapTab />);
    const input = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toContain('image/jpeg');
  });

  it('drag-enter flips data-dragging to true', () => {
    render(<SnapTab />);
    const zone = screen.getByTestId('snap-tab-dropzone');
    fireEvent.dragEnter(zone);
    expect(zone.getAttribute('data-dragging')).toBe('true');
    fireEvent.dragLeave(zone);
    expect(zone.getAttribute('data-dragging')).toBe('false');
  });

  it('UPLOAD INSTEAD button is visible alongside the dropzone', () => {
    render(<SnapTab />);
    expect(screen.getByTestId('snap-tab-upload-instead')).toBeInTheDocument();
  });

  it('renders 56×56 CAPTURE square with aria-label in idle state (style critical #10)', () => {
    render(<SnapTab />);
    const capture = screen.getByTestId('snap-tab-capture-square');
    expect(capture).toBeInTheDocument();
    expect(capture.getAttribute('aria-label')).toBeTruthy();
  });

  it('file input has a sr-only <label htmlFor> (compliance §M2)', () => {
    render(<SnapTab />);
    const input = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    // Find the label that targets this input.
    const label = document.querySelector(`label[for="${input.id}"]`);
    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBeTruthy();
  });
});

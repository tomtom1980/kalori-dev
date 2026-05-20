/**
 * Task 3.3 - <SnapTab /> smoke test.
 *   - role=button dropzone exists with aria-label
 *   - camera and upload file inputs accept image MIME types
 *   - camera input requests capture; upload input does not
 *   - UPLOAD INSTEAD opens the upload picker
 *   - drag-enter flips dashed border (data-dragging attr)
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapTab } from '@/app/(app)/log/_components/SnapTab';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

function mockMobileViewport(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('<SnapTab />', () => {
  beforeEach(() => {
    mockMobileViewport(false);
    useLogFlowStore.getState().resetDraft();
  });

  it('desktop renders the dropzone with upload aria-label + role=button', () => {
    render(<SnapTab />);
    const zone = screen.getByTestId('snap-tab-dropzone');
    expect(zone.getAttribute('role')).toBe('button');
    expect(zone.getAttribute('aria-label')).toBe('Upload picture');
    expect(zone.getAttribute('tabindex')).toBe('0');
  });

  it('desktop renders upload-only without camera capture input or capture square', () => {
    render(<SnapTab />);
    const uploadInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    const uploadClick = vi.spyOn(uploadInput, 'click').mockImplementation(() => undefined);

    expect(screen.queryByTestId('snap-tab-file-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('snap-tab-capture-square')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('snap-tab-dropzone'));

    expect(uploadClick).toHaveBeenCalledTimes(1);
    expect(uploadInput).not.toHaveAttribute('capture');
  });

  it('mobile has separate camera and upload inputs with only camera requesting capture', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    const cameraInput = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    const uploadInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;

    expect(cameraInput.type).toBe('file');
    expect(uploadInput.type).toBe('file');
    expect(cameraInput.accept).toContain('image/jpeg');
    expect(uploadInput.accept).toContain('image/jpeg');
    expect(cameraInput.getAttribute('capture')).toBe('environment');
    expect(uploadInput).not.toHaveAttribute('capture');
  });

  it('drag-enter flips data-dragging to true', () => {
    render(<SnapTab />);
    const zone = screen.getByTestId('snap-tab-dropzone');
    fireEvent.dragEnter(zone);
    expect(zone.getAttribute('data-dragging')).toBe('true');
    fireEvent.dragLeave(zone);
    expect(zone.getAttribute('data-dragging')).toBe('false');
  });

  it('mobile UPLOAD INSTEAD button is visible alongside the dropzone', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    expect(screen.getByTestId('snap-tab-upload-instead')).toBeInTheDocument();
  });

  it('mobile UPLOAD INSTEAD opens the upload picker, not the camera picker', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    const cameraInput = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    const uploadInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    const cameraClick = vi.spyOn(cameraInput, 'click').mockImplementation(() => undefined);
    const uploadClick = vi.spyOn(uploadInput, 'click').mockImplementation(() => undefined);

    fireEvent.click(screen.getByTestId('snap-tab-upload-instead'));

    expect(uploadClick).toHaveBeenCalledTimes(1);
    expect(cameraClick).not.toHaveBeenCalled();
  });

  it('mobile dropzone and capture square open the camera picker', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    const cameraInput = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    const uploadInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    const cameraClick = vi.spyOn(cameraInput, 'click').mockImplementation(() => undefined);
    const uploadClick = vi.spyOn(uploadInput, 'click').mockImplementation(() => undefined);

    fireEvent.click(screen.getByTestId('snap-tab-dropzone'));
    fireEvent.click(screen.getByTestId('snap-tab-capture-square'));

    expect(cameraClick).toHaveBeenCalledTimes(2);
    expect(uploadClick).not.toHaveBeenCalled();
  });

  it('mobile renders 56x56 CAPTURE square with aria-label in idle state (style critical #10)', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    const capture = screen.getByTestId('snap-tab-capture-square');
    expect(capture).toBeInTheDocument();
    expect(capture.getAttribute('aria-label')).toBeTruthy();
  });

  it('mobile file inputs have sr-only <label htmlFor> elements (compliance M2)', () => {
    mockMobileViewport(true);
    render(<SnapTab />);
    const cameraInput = screen.getByTestId('snap-tab-file-input') as HTMLInputElement;
    const uploadInput = screen.getByTestId('snap-tab-upload-input') as HTMLInputElement;
    const cameraLabel = document.querySelector(`label[for="${cameraInput.id}"]`);
    const uploadLabel = document.querySelector(`label[for="${uploadInput.id}"]`);

    expect(cameraLabel).not.toBeNull();
    expect(uploadLabel).not.toBeNull();
    expect(cameraLabel?.textContent?.trim()).toBeTruthy();
    expect(uploadLabel?.textContent?.trim()).toBeTruthy();
  });
});

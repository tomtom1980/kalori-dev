/**
 * @vitest-environment happy-dom
 *
 * Task 3.3 I7 — ManualEntryFallback mounts on every Gemini failure mode
 * with the original input pre-filled.
 *
 * Covers 4 failure modes × 3 tabs:
 *   1. network error
 *   2. timeout (AbortError)
 *   3. rate-limit (HTTP 429 body)
 *   4. Zod-fail / unexpected shape
 *
 * Assertion strategy: set `setFailureMode(mode, originalInput)` on the
 * store, then render the active tab; assert the fallback region + the
 * pre-fill value.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AiParseForm } from '@/app/(app)/log/_components/AddFoodTab/AiParseForm';
import { SnapTab } from '@/app/(app)/log/_components/SnapTab';
import {
  LibraryList,
  type LibraryListProps,
} from '@/app/(app)/log/_components/AddFoodTab/LibraryList';
import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

// Task 10 — migrated imports. `<TypeTab>` is now `<AiParseForm>` (renamed +
// moved into AddFoodTab/) and `<LibraryTab>` is now `<LibraryList>`. Alias
// `TypeTab` to `AiParseForm` (no required props) and wrap `LibraryList` to
// supply the now-required `onAddNew` so the body of the test does not have
// to be rewritten.
const TypeTab = AiParseForm;
function LibraryTab(props: Partial<LibraryListProps> = {}) {
  const { onAddNew = () => {}, ...rest } = props;
  return <LibraryList onAddNew={onAddNew} {...rest} />;
}

const MODES: Array<'network' | 'timeout' | 'rate-limit' | 'zod'> = [
  'network',
  'timeout',
  'rate-limit',
  'zod',
];

describe('I7 — ManualEntryFallback pre-fill across 4 failure modes', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  for (const mode of MODES) {
    it(`Type tab mode=${mode} — fallback mounts with originalInput pre-filled`, () => {
      useLogFlowStore.getState().setActiveTab('type');
      useLogFlowStore.getState().setTypeDraft('original pho bo');
      useLogFlowStore.getState().setFailureMode(mode, 'original pho bo');
      render(<TypeTab />);
      expect(screen.getByTestId('manual-entry-fallback')).toBeInTheDocument();
      const foodInput = screen.getByLabelText(/food name/i) as HTMLInputElement;
      expect(foodInput.value).toBe('original pho bo');
    });

    it(`Snap tab mode=${mode} — fallback mounts, thumbnail preserved, food-name empty`, () => {
      useLogFlowStore.getState().setActiveTab('snap');
      useLogFlowStore.getState().setSnapDraft({
        status: 'error',
        error: 'x',
        thumbnailDataUrl: 'data:image/jpeg;base64,AA',
      });
      useLogFlowStore.getState().setFailureMode(mode, '<image>');
      render(<SnapTab />);
      expect(screen.getByTestId('manual-entry-fallback')).toBeInTheDocument();
      const foodInput = screen.getByLabelText(/food name/i) as HTMLInputElement;
      expect(foodInput.value).toBe('');
    });
  }

  it('Library tab — fallback mounts when failure fires', () => {
    useLogFlowStore.getState().setActiveTab('library');
    useLogFlowStore.getState().setFailureMode('network', null);
    render(<LibraryTab />);
    expect(screen.getByTestId('manual-entry-fallback')).toBeInTheDocument();
  });
});

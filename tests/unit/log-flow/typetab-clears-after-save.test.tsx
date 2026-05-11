/**
 * Task B.2 — US-STAB-B2 — TypeTab clears after successful save.
 *
 * Phase B Codex R1 F-PB-R1-1 (this file's PRIOR shape was a false-positive):
 * the previous test kept `<TypeTab />` mounted during a synthetic
 * confirmation snapshot — a state impossible under the real LogFlowTabs
 * parent lifecycle, which unmounts TypeTab while
 * `phase === 'confirmation'`. The reset itself was relocated from a
 * TypeTab subscription into the store's `commitSaveSuccess(tab)` action,
 * which ConfirmationScreen calls atomically after a 200 OK from the save
 * endpoint. End-to-end behavior is now covered by
 * `tests/integration/log-flow-clears-draft-after-save.test.tsx`.
 *
 * This unit test is now scoped to the store action contract:
 *   AC1 — `commitSaveSuccess('type')` clears `typeDraft` + `clientIds.type`.
 *   AC2 — A non-save store update (e.g. SAVE_ERROR locally) leaves the draft.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { useLogFlowStore } from '@/lib/stores/useLogFlowStore';

describe('useLogFlowStore.commitSaveSuccess — TYPE draft contract (US-STAB-B2)', () => {
  beforeEach(() => {
    useLogFlowStore.getState().resetDraft();
  });

  it('AC1 clears-on-success: commitSaveSuccess("type") empties typeDraft and clears clientIds.type', () => {
    useLogFlowStore.getState().setTypeDraft('pho bo');
    useLogFlowStore.getState().ensureClientId('type');
    expect(useLogFlowStore.getState().typeDraft).toBe('pho bo');
    expect(useLogFlowStore.getState().clientIds.type).toBeDefined();

    useLogFlowStore.getState().commitSaveSuccess('type');

    expect(useLogFlowStore.getState().typeDraft).toBe('');
    expect(useLogFlowStore.getState().clientIds.type).toBeUndefined();
  });

  it('AC2 preserves-on-error: a non-commitSaveSuccess store update leaves typeDraft intact', () => {
    useLogFlowStore.getState().setTypeDraft('pho bo');
    useLogFlowStore.getState().ensureClientId('type');

    // Error path equivalent: ConfirmationScreen would dispatch a local
    // SAVE_ERROR reducer action without touching the store. Simulate a
    // benign store write to confirm typeDraft survives any non-save churn.
    useLogFlowStore.setState({ restoredAt: Date.now() });

    expect(useLogFlowStore.getState().typeDraft).toBe('pho bo');
    expect(useLogFlowStore.getState().clientIds.type).toBeDefined();
  });

  it('clearClientId alone does NOT wipe typeDraft (manual-fallback path safety)', () => {
    // Regression guard: ManualEntryFallback calls clearClientId(tab) before
    // delegating its manual submit. That path must NOT also wipe the draft
    // — only commitSaveSuccess (server-confirmed save) should.
    useLogFlowStore.getState().setTypeDraft('pho bo');
    useLogFlowStore.getState().ensureClientId('type');

    useLogFlowStore.getState().clearClientId('type');

    expect(useLogFlowStore.getState().typeDraft).toBe('pho bo');
    expect(useLogFlowStore.getState().clientIds.type).toBeUndefined();
  });
});

/**
 * Unit tests for `useOnboardingStore` — Zustand + sessionStorage persistence.
 *
 * Covers briefing §10 contract:
 *   - Persisted slice (currentStep / draftProfile / unitSystem / startedAt / clientIds)
 *   - Ephemeral slice (validationErrors / stepVisitedSet / isSaving / saveError)
 *   - sessionStorage key `kalori:onboarding:v1`
 *   - `ensureClientId(step)` idempotency
 *   - `reset()` clears sessionStorage + resets state
 *   - 30-min TTL on rehydrate
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kalori:onboarding:v1';

function freshModule() {
  vi.resetModules();
  return import('./useOnboardingStore');
}

describe('useOnboardingStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('initializes on step 1 with empty draft profile', async () => {
    const { useOnboardingStore } = await freshModule();
    const s = useOnboardingStore.getState();
    expect(s.currentStep).toBe(1);
    expect(s.draftProfile).toEqual({});
    expect(s.unitSystem).toBe('metric');
    expect(s.validationErrors).toEqual({});
    expect(s.isSaving).toBe(false);
    expect(s.saveError).toBeNull();
  });

  it('setDraftField mutates one field without touching siblings', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setDraftField('age', 32);
    useOnboardingStore.getState().setDraftField('height_cm', 175);

    const after = useOnboardingStore.getState().draftProfile;
    expect(after.age).toBe(32);
    expect(after.height_cm).toBe(175);
  });

  it('setStep advances currentStep', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setStep(4);
    expect(useOnboardingStore.getState().currentStep).toBe(4);
  });

  it('setUnitSystem flips metric ↔ imperial', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setUnitSystem('imperial');
    expect(useOnboardingStore.getState().unitSystem).toBe('imperial');
    useOnboardingStore.getState().setUnitSystem('metric');
    expect(useOnboardingStore.getState().unitSystem).toBe('metric');
  });

  it('ensureClientId returns a UUID and reuses it on same step', async () => {
    const { useOnboardingStore } = await freshModule();
    const id1 = useOnboardingStore.getState().ensureClientId(3);
    const id2 = useOnboardingStore.getState().ensureClientId(3);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id2).toBe(id1);
  });

  it('ensureClientId gives a DIFFERENT id per step', async () => {
    const { useOnboardingStore } = await freshModule();
    const id1 = useOnboardingStore.getState().ensureClientId(1);
    const id2 = useOnboardingStore.getState().ensureClientId(2);
    expect(id1).not.toBe(id2);
  });

  it('writes persisted slice to sessionStorage under key kalori:onboarding:v1', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setDraftField('bio_sex', 'female');
    useOnboardingStore.getState().setStep(3);

    // Storage adapter throttles writes to 500ms (briefing §10.3 rule 5).
    // First write hits leading edge; the second queues for trailing flush.
    // Wait past the window to observe the final state.
    await new Promise((resolve) => setTimeout(resolve, 600));

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw, 'sessionStorage key present').not.toBeNull();
    const parsed = JSON.parse(raw as string) as {
      state: {
        currentStep: number;
        draftProfile: { bio_sex?: string };
        unitSystem: string;
        startedAt: number;
      };
    };
    expect(parsed.state.currentStep).toBe(3);
    expect(parsed.state.draftProfile.bio_sex).toBe('female');
    expect(parsed.state.unitSystem).toBe('metric');
    expect(typeof parsed.state.startedAt).toBe('number');
  });

  it('does NOT persist ephemeral slice (validationErrors / isSaving / saveError)', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setValidationErrors({ age: 'range' });
    useOnboardingStore.getState().markSaving(true);
    useOnboardingStore.getState().setSaveError('net failure');

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { state: Record<string, unknown> };
    expect(parsed.state).not.toHaveProperty('validationErrors');
    expect(parsed.state).not.toHaveProperty('isSaving');
    expect(parsed.state).not.toHaveProperty('saveError');
  });

  it('reset() clears sessionStorage and returns state to initial', async () => {
    const { useOnboardingStore } = await freshModule();
    useOnboardingStore.getState().setDraftField('age', 40);
    useOnboardingStore.getState().setStep(5);
    useOnboardingStore.getState().ensureClientId(5);

    useOnboardingStore.getState().reset();

    expect(useOnboardingStore.getState().currentStep).toBe(1);
    expect(useOnboardingStore.getState().draftProfile).toEqual({});
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rehydrates persisted state on fresh module load', async () => {
    // Seed sessionStorage as if a prior session wrote it.
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          currentStep: 4,
          draftProfile: { bio_sex: 'male', age: 28 },
          unitSystem: 'imperial',
          startedAt: Date.now(),
          clientIds: {},
        },
        version: 0,
      }),
    );

    const { useOnboardingStore } = await freshModule();
    const s = useOnboardingStore.getState();
    expect(s.currentStep).toBe(4);
    expect(s.draftProfile.bio_sex).toBe('male');
    expect(s.draftProfile.age).toBe(28);
    expect(s.unitSystem).toBe('imperial');
  });

  it('throttles rapid sessionStorage writes to at most one per 500ms window', async () => {
    const { useOnboardingStore } = await freshModule();
    // First write: leading-edge, lands immediately.
    useOnboardingStore.getState().setDraftField('age', 30);
    const firstRaw = sessionStorage.getItem(STORAGE_KEY);
    expect(firstRaw, 'leading-edge write lands synchronously').not.toBeNull();
    const firstParsed = JSON.parse(firstRaw as string) as {
      state: { draftProfile: { age?: number } };
    };
    expect(firstParsed.state.draftProfile.age).toBe(30);

    // Rapid follow-up writes within the 500ms window — only the last one
    // should persist after the trailing flush.
    useOnboardingStore.getState().setDraftField('age', 31);
    useOnboardingStore.getState().setDraftField('age', 32);
    useOnboardingStore.getState().setDraftField('age', 33);

    // Mid-window: disk still shows the leading-edge value (30) because
    // the trailing flush hasn't fired yet.
    const midRaw = sessionStorage.getItem(STORAGE_KEY);
    const midParsed = JSON.parse(midRaw as string) as {
      state: { draftProfile: { age?: number } };
    };
    expect(midParsed.state.draftProfile.age).toBe(30);

    // After the window: the trailing flush captures the most recent value.
    await new Promise((resolve) => setTimeout(resolve, 600));
    const finalRaw = sessionStorage.getItem(STORAGE_KEY);
    const finalParsed = JSON.parse(finalRaw as string) as {
      state: { draftProfile: { age?: number } };
    };
    expect(finalParsed.state.draftProfile.age).toBe(33);
  });

  it('reset() cancels a pending throttled write so stale state cannot be resurrected', async () => {
    // Codex Round 1 MEDIUM — the throttled storage wrapper keeps a
    // trailing timer in `pendingKey`/`pendingValue`. Raw
    // `sessionStorage.removeItem()` from `reset()` does not cancel
    // that timer, so the delayed flush rewrites the cleared key with
    // the stale JSON after reset. Regression: call reset() INSIDE the
    // throttle window and verify the key stays empty once the timer
    // would have fired.
    const { useOnboardingStore } = await freshModule();

    // 1. Leading-edge write lands immediately.
    useOnboardingStore.getState().setDraftField('age', 30);
    // 2. A follow-up write within the 500ms window queues a trailing
    //    flush — THIS is the pending write that must be cancelled.
    useOnboardingStore.getState().setDraftField('age', 31);
    // Sanity: disk still shows the leading-edge value, trailing queued.
    const midRaw = sessionStorage.getItem(STORAGE_KEY);
    expect(midRaw, 'leading-edge write present').not.toBeNull();

    // 3. Reset inside the window.
    useOnboardingStore.getState().reset();

    // Immediately after reset the key is gone.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // 4. Wait past the throttle window — the previously-queued
    //    trailing write would fire here if reset had not cancelled it.
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Post-window assertion: the cleared state MUST stay cleared.
    // Before the fix, the trailing timer flushes `{ age: 31, ... }`
    // back into sessionStorage here.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('discards persisted state older than 30 minutes', async () => {
    const THIRTY_MIN_MS = 30 * 60 * 1000;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          currentStep: 5,
          draftProfile: { bio_sex: 'male' },
          unitSystem: 'metric',
          startedAt: Date.now() - THIRTY_MIN_MS - 1000, // stale
          clientIds: {},
        },
        version: 0,
      }),
    );

    const { useOnboardingStore } = await freshModule();
    const s = useOnboardingStore.getState();
    expect(s.currentStep).toBe(1);
    expect(s.draftProfile).toEqual({});
  });
});

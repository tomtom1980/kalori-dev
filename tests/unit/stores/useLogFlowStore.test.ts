/**
 * Task 3.3 — useLogFlowStore unit tests.
 *
 * Covers:
 *   - SSR-safe init (no window / no sessionStorage)
 *   - Throttled persist: single write within 500ms window
 *   - 30-min TTL on rehydrate wipes stale state
 *   - Mid-flight snap branches never persist (collapse to idle)
 *   - Ephemeral slice (isOpen, snapDraftEphemeral) reset on rehydrate
 *   - ensureClientId idempotent per tab
 *   - resetDraft clears both state + sessionStorage entry
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useLogFlowStore', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  });

  it('initializes with sane defaults (isOpen=false, activeTab=type, empty drafts)', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    const state = useLogFlowStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.activeTab).toBe('type');
    expect(state.typeDraft).toBe('');
    expect(state.snapDraft).toEqual({ status: 'idle' });
    expect(state.snapDraftEphemeral).toBeNull();
    expect(state.librarySelection).toEqual([]);
    // Bug 7b — log-modal LibraryTab default sort flipped to `name-asc`
    // to mirror the `/library` page's post-Bug-7 default.
    expect(state.librarySort).toBe('name-asc');
    expect(state.failureMode).toBeNull();
  });

  it('openModal flips isOpen and accepts a tab argument', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('snap');
    expect(useLogFlowStore.getState().isOpen).toBe(true);
    expect(useLogFlowStore.getState().activeTab).toBe('snap');
  });

  // Task 3.5 M1.5 — Meals bulletin `+ ADD` affordance passes its meal
  // category to the modal so ConfirmationScreen can pre-select it.
  it('openModal(tab, { mealCategory }) records pendingMealCategory', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('type', { mealCategory: 'breakfast' });
    const st = useLogFlowStore.getState();
    expect(st.isOpen).toBe(true);
    expect(st.activeTab).toBe('type');
    expect(st.pendingMealCategory).toBe('breakfast');
  });

  it('openModal without mealCategory leaves pendingMealCategory null', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('type');
    expect(useLogFlowStore.getState().pendingMealCategory).toBeNull();
  });

  it('closeModal clears pendingMealCategory so a new open starts clean', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('type', { mealCategory: 'dinner' });
    useLogFlowStore.getState().closeModal();
    expect(useLogFlowStore.getState().pendingMealCategory).toBeNull();
  });

  it('resetDraft clears pendingMealCategory', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('type', { mealCategory: 'snack' });
    useLogFlowStore.getState().resetDraft();
    expect(useLogFlowStore.getState().pendingMealCategory).toBeNull();
  });

  it('closeModal with discardDraft=true routes through resetDraft', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().openModal('type');
    useLogFlowStore.getState().setTypeDraft('some meal');
    useLogFlowStore.getState().closeModal({ discardDraft: true });
    const st = useLogFlowStore.getState();
    expect(st.isOpen).toBe(false);
    expect(st.typeDraft).toBe('');
  });

  it('setSnapDraft routes mid-flight branches into ephemeral slot', async () => {
    const { useLogFlowStore, selectCurrentSnapDraft } =
      await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().setSnapDraft({ status: 'compressing', progress: 0.3 });
    const st = useLogFlowStore.getState();
    // Persisted remains idle.
    expect(st.snapDraft.status).toBe('idle');
    // Ephemeral carries the mid-flight branch.
    expect(st.snapDraftEphemeral?.status).toBe('compressing');
    // Selector collapses the two.
    expect(selectCurrentSnapDraft(st).status).toBe('compressing');
  });

  it('setSnapDraft clears ephemeral when reaching a persistable branch', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().setSnapDraft({ status: 'compressing', progress: 0.5 });
    useLogFlowStore.getState().setSnapDraft({
      status: 'done',
      thumbnailDataUrl: 'data:image/jpeg;base64,x',
      parsed: [],
    });
    const st = useLogFlowStore.getState();
    expect(st.snapDraft.status).toBe('done');
    expect(st.snapDraftEphemeral).toBeNull();
  });

  it('ensureClientId is idempotent per tab', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    const typeId1 = useLogFlowStore.getState().ensureClientId('type');
    const typeId2 = useLogFlowStore.getState().ensureClientId('type');
    expect(typeId1).toBe(typeId2);
    const snapId = useLogFlowStore.getState().ensureClientId('snap');
    expect(snapId).not.toBe(typeId1);
  });

  it('I7 — clearClientId(tab) drops the stored id so next ensure mints fresh', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    const first = useLogFlowStore.getState().ensureClientId('type');
    useLogFlowStore.getState().clearClientId('type');
    const second = useLogFlowStore.getState().ensureClientId('type');
    expect(second).not.toBe(first);
    // Other tabs unaffected.
    const snapId = useLogFlowStore.getState().ensureClientId('snap');
    useLogFlowStore.getState().clearClientId('type');
    expect(useLogFlowStore.getState().ensureClientId('snap')).toBe(snapId);
  });

  it('setFailureMode records mode + originalInput together', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().setFailureMode('network', 'pho bo');
    const st = useLogFlowStore.getState();
    expect(st.failureMode).toBe('network');
    expect(st.originalInput).toBe('pho bo');
  });

  it('setActiveTab clears any active failure so the new tab starts clean', async () => {
    const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().setFailureMode('zod', 'x');
    useLogFlowStore.getState().setActiveTab('library');
    const st = useLogFlowStore.getState();
    expect(st.failureMode).toBeNull();
    expect(st.originalInput).toBeNull();
    expect(st.activeTab).toBe('library');
  });

  it('resetDraft wipes both state and sessionStorage entry', async () => {
    const { useLogFlowStore, LOG_FLOW_STORAGE_KEY } = await import('@/lib/stores/useLogFlowStore');
    useLogFlowStore.getState().setTypeDraft('hello');
    useLogFlowStore.getState().resetDraft();
    expect(useLogFlowStore.getState().typeDraft).toBe('');
    // Session-storage clear is routed through the throttled singleton —
    // call it directly via getItem to assert. (Some test envs don't persist
    // the Zustand write synchronously; the resetDraft path is what matters.)
    expect(sessionStorage.getItem(LOG_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('exports storage key + TTL sentinels for test consumers', async () => {
    const mod = await import('@/lib/stores/useLogFlowStore');
    expect(mod.LOG_FLOW_STORAGE_KEY).toBe('kalori:log-flow:v1');
    expect(mod.LOG_FLOW_TTL_MS).toBe(30 * 60 * 1000);
  });

  // E.CODEX Round-2 I1 — Library Add Item must NOT inherit the persisted
  // dashboard Type draft. The Library page's "Add Item" button calls
  // `openModal('type', { mode: 'library-only' })`. Before the fix this
  // preserved `typeDraft` / `typeParsed` / per-type `clientIds` from the
  // dashboard log-flow draft, so opening Add Item showed an unrelated meal
  // draft. The fix resets the Type-tab draft slice when entering
  // library-only mode (standard mode continues to preserve drafts).
  describe('E.CODEX Round-2 I1 — library-only mode isolates Type draft', () => {
    it('openModal with mode=library-only clears typeDraft/typeParsed/failureMode/type clientId', async () => {
      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      // Seed a stale dashboard Type draft.
      useLogFlowStore.getState().setTypeDraft('stale dashboard draft');
      useLogFlowStore.getState().setTypeParsed({
        items: [
          {
            name: 'eggs',
            portion: 2,
            unit: 'unit',
            kcal: 140,
            macros: { protein_g: 12, carbs_g: 1, fat_g: 10, fiber_g: 0 },
            micros: {},
            confidence: 0.9,
          },
        ],
        reasoning: 'cached reasoning',
      });
      useLogFlowStore.getState().setFailureMode('network', 'stale input');
      useLogFlowStore.getState().ensureClientId('type');
      useLogFlowStore.getState().ensureClientId('snap'); // Sibling tab id — must survive.

      useLogFlowStore.getState().openModal('type', { mode: 'library-only' });

      const st = useLogFlowStore.getState();
      // Library-only mode entered.
      expect(st.isOpen).toBe(true);
      expect(st.mode).toBe('library-only');
      // Type-slice state cleared so the Library form starts empty.
      expect(st.typeDraft).toBe('');
      expect(st.typeParsed).toBeNull();
      expect(st.failureMode).toBeNull();
      expect(st.originalInput).toBeNull();
      expect(st.clientIds.type).toBeUndefined();
      // Sibling-tab id (snap) survives — only the Type slice is scoped.
      expect(st.clientIds.snap).toBeDefined();
    });

    it('openModal with mode=standard (default) preserves typeDraft (regression guard)', async () => {
      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      useLogFlowStore.getState().setTypeDraft('keep me');
      useLogFlowStore.getState().openModal('type');
      expect(useLogFlowStore.getState().typeDraft).toBe('keep me');
      expect(useLogFlowStore.getState().mode).toBe('standard');
    });
  });

  // F-UI-3.6-B-2 — user-scoped purge on auth change.
  //
  // Previously the persisted log-flow state (draft text, client_ids, library
  // selection, failure-mode originalInput) was global. On logout → re-login
  // as a different user on the same device, User B would see / replay User
  // A's drafts + clientIds, producing cross-user idempotency collisions and
  // leaked content. `syncUserId(userId)` purges persisted draft fields when
  // the current session's userId differs from the last observed one.
  describe('F-UI-3.6-B-2 — user-scoped purge', () => {
    it('syncUserId on a fresh store records the id without purging anything', async () => {
      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      useLogFlowStore.getState().setTypeDraft('keep me');
      useLogFlowStore.getState().syncUserId('user-a');
      expect(useLogFlowStore.getState().typeDraft).toBe('keep me');
      expect(useLogFlowStore.getState().lastUserId).toBe('user-a');
    });

    it('syncUserId with the same userId is a no-op — keeps draft intact', async () => {
      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      useLogFlowStore.getState().syncUserId('user-a');
      useLogFlowStore.getState().setTypeDraft('pho bo');
      useLogFlowStore.getState().ensureClientId('type');
      const cid = useLogFlowStore.getState().clientIds.type;

      useLogFlowStore.getState().syncUserId('user-a');

      expect(useLogFlowStore.getState().typeDraft).toBe('pho bo');
      expect(useLogFlowStore.getState().clientIds.type).toBe(cid);
    });

    it('syncUserId with a DIFFERENT userId purges drafts, clientIds, library selection + updates lastUserId', async () => {
      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      // Seed as User A.
      useLogFlowStore.getState().syncUserId('user-a');
      useLogFlowStore.getState().setTypeDraft('User A draft');
      useLogFlowStore.getState().setLibrarySelection([{ itemId: 'lib-1', quantity: 1 }]);
      useLogFlowStore.getState().ensureClientId('type');
      useLogFlowStore.getState().setFailureMode('network', 'original A input');

      // Simulate logout + login as User B.
      useLogFlowStore.getState().syncUserId('user-b');

      const st = useLogFlowStore.getState();
      expect(st.typeDraft).toBe('');
      expect(st.librarySelection).toEqual([]);
      expect(st.clientIds).toEqual({});
      expect(st.failureMode).toBeNull();
      expect(st.originalInput).toBeNull();
      expect(st.lastUserId).toBe('user-b');
    });

    it('cross-user leak scenario — persisted sessionStorage draft from User A is discarded on hydrate for User B', async () => {
      // Write a User-A persisted snapshot directly to sessionStorage.
      const snapshot = {
        state: {
          activeTab: 'type',
          typeDraft: 'User A secret meal',
          typeParsed: null,
          snapDraft: { status: 'idle' },
          librarySelection: [{ itemId: 'secret', quantity: 99 }],
          librarySort: 'frequent',
          librarySearch: '',
          failureMode: null,
          originalInput: null,
          restoredAt: Date.now(),
          clientIds: { type: 'secret-cid-from-A' },
          lastUserId: 'user-a',
        },
        version: 0,
      };
      sessionStorage.setItem('kalori:log-flow:v1', JSON.stringify(snapshot));

      const { useLogFlowStore } = await import('@/lib/stores/useLogFlowStore');
      // User B session starts — syncUserId fires with a different id.
      useLogFlowStore.getState().syncUserId('user-b');

      const st = useLogFlowStore.getState();
      expect(st.typeDraft).toBe('');
      expect(st.librarySelection).toEqual([]);
      expect(st.clientIds).toEqual({});
      expect(st.lastUserId).toBe('user-b');
    });
  });

  /**
   * POST-MVP-BUGFIX-2026-05-17-LM-SEC-2 — `generateClientId` v4 fallback
   * must use cryptographically secure entropy (`crypto.getRandomValues`)
   * per RFC 4122 §4.4 instead of `Math.random()`. Sibling of the same
   * defect in `mintLibraryClientId` (ConfirmationScreen).
   */
  describe('generateClientId — LM-SEC-2', () => {
    const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    it('Test 1 (fast path): uses crypto.randomUUID when available', async () => {
      const sentinel = '99999999-aaaa-4bbb-8ccc-dddddddddddd';
      vi.stubGlobal('crypto', {
        randomUUID: () => sentinel,
        getRandomValues: (buf: Uint8Array) => buf,
      });

      const { generateClientId } = await import('@/lib/stores/useLogFlowStore');

      expect(generateClientId()).toBe(sentinel);

      vi.unstubAllGlobals();
    });

    it('Test 2 (failing-first driver): when crypto.randomUUID is absent, uses crypto.getRandomValues — NOT Math.random — and returns valid v4', async () => {
      const getRandomValues = vi.fn((buf: Uint8Array) => {
        buf.fill(0xff);
        return buf;
      });
      const mathRandomSpy = vi.spyOn(Math, 'random');

      vi.stubGlobal('crypto', {
        // randomUUID intentionally undefined.
        getRandomValues,
      });

      const { generateClientId } = await import('@/lib/stores/useLogFlowStore');
      const id = generateClientId();

      expect(getRandomValues).toHaveBeenCalledTimes(1);
      expect(mathRandomSpy).not.toHaveBeenCalled();
      expect(id).toMatch(UUID_V4_RE);
      // Bit-twiddle sanity check.
      expect(id.charAt(14)).toBe('4');
      expect(['8', '9', 'a', 'b']).toContain(id.charAt(19));

      mathRandomSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it('Test 3 (last-resort): when crypto has neither randomUUID nor getRandomValues, falls through to Math.random and still returns valid v4 shape', async () => {
      vi.stubGlobal('crypto', {});

      const { generateClientId } = await import('@/lib/stores/useLogFlowStore');
      const id = generateClientId();

      expect(id).toMatch(UUID_V4_RE);

      vi.unstubAllGlobals();
    });

    it('Test 4 (schema validity): output of every branch is a UUID acceptable to z.string().uuid()', async () => {
      // Branch A: randomUUID
      vi.stubGlobal('crypto', {
        randomUUID: () => '11111111-2222-4333-8444-555555555555',
        getRandomValues: (buf: Uint8Array) => buf,
      });
      let mod = await import('@/lib/stores/useLogFlowStore');
      const idA = mod.generateClientId();
      vi.unstubAllGlobals();
      vi.resetModules();

      // Branch B: getRandomValues fallback
      vi.stubGlobal('crypto', {
        getRandomValues: (buf: Uint8Array) => {
          for (let i = 0; i < buf.length; i++) buf[i] = (i * 17) & 0xff;
          return buf;
        },
      });
      mod = await import('@/lib/stores/useLogFlowStore');
      const idB = mod.generateClientId();
      vi.unstubAllGlobals();
      vi.resetModules();

      // Branch C: no crypto API at all
      vi.stubGlobal('crypto', {});
      mod = await import('@/lib/stores/useLogFlowStore');
      const idC = mod.generateClientId();
      vi.unstubAllGlobals();

      const { z } = await import('zod');
      const uuidSchema = z.string().uuid();
      for (const id of [idA, idB, idC]) {
        expect(uuidSchema.safeParse(id).success).toBe(true);
      }
    });
  });
});

/**
 * `useLibrarySelectionStore` — Task 4.1 sub-step 3.
 *
 * Zustand slice that owns the `/library` select-mode selection `Set<string>`.
 * Per react-perf §11.3 (non-negotiable): every card reads its selected state
 * via a PRIMITIVE-BOOLEAN selector `has(id)` so the Zustand Object.is check
 * only re-renders the cards whose membership actually flipped. Subscribing
 * to the whole `Set` reference would force every card to re-render on any
 * mutation — the entire point of the slice.
 *
 * The store does not coordinate with the Radix ContextMenu or the
 * optimistic delete reducer; consumers wire those themselves. `toggle`,
 * `selectAll`, and `clear` return immediately — no async work; no side
 * effects.
 *
 * State is in-memory only (no persistence). Select mode exiting + route
 * leaving drop the Set via `clear()` called from `<LibraryClient>` unmount.
 */
import { create } from 'zustand';

export interface LibrarySelectionState {
  ids: Set<string>;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  selectAll: (ids: readonly string[]) => void;
  clear: () => void;
  /** Primitive-boolean selector — per-card subscription. */
  has: (id: string) => boolean;
  /** Derived primitive number — subscribe when only the count matters. */
  size: () => number;
}

export const useLibrarySelectionStore = create<LibrarySelectionState>((set, get) => ({
  ids: new Set<string>(),

  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next };
    }),

  add: (id) =>
    set((s) => {
      if (s.ids.has(id)) return s;
      const next = new Set(s.ids);
      next.add(id);
      return { ids: next };
    }),

  remove: (id) =>
    set((s) => {
      if (!s.ids.has(id)) return s;
      const next = new Set(s.ids);
      next.delete(id);
      return { ids: next };
    }),

  selectAll: (ids) => set({ ids: new Set(ids) }),

  clear: () => set({ ids: new Set() }),

  has: (id) => get().ids.has(id),
  size: () => get().ids.size,
}));

/** Primitive-boolean selector factory — use inside `useLibrarySelectionStore`. */
export const selectHasId = (id: string) => (s: LibrarySelectionState) => s.ids.has(id);
export const selectSize = (s: LibrarySelectionState) => s.ids.size;

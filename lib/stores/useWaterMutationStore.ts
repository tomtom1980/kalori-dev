import { create } from 'zustand';

interface WaterMutationState {
  inFlight: number;
  pendingServerTotalMl: number | null;
  begin: () => void;
  end: () => void;
  waitForServerTotal: (totalMl: number) => void;
  completeServerTotal: (totalMl: number) => void;
  reset: () => void;
}

export const useWaterMutationStore = create<WaterMutationState>((set) => ({
  inFlight: 0,
  pendingServerTotalMl: null,
  begin: () => set((state) => ({ inFlight: state.inFlight + 1 })),
  end: () => set((state) => ({ inFlight: Math.max(0, state.inFlight - 1) })),
  waitForServerTotal: (totalMl) => set({ pendingServerTotalMl: totalMl }),
  completeServerTotal: (totalMl) =>
    set((state) => {
      if (state.pendingServerTotalMl !== totalMl) return state;
      return {
        pendingServerTotalMl: null,
        inFlight: Math.max(0, state.inFlight - 1),
      };
    }),
  reset: () => set({ inFlight: 0, pendingServerTotalMl: null }),
}));

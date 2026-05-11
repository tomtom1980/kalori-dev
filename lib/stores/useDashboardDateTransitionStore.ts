'use client';

import { create } from 'zustand';

interface DashboardDateTransitionState {
  loadingDay: string | null;
  setLoadingDay: (day: string) => void;
  clearLoadingDay: () => void;
}

export const useDashboardDateTransitionStore = create<DashboardDateTransitionState>((set) => ({
  loadingDay: null,
  setLoadingDay: (day) => set({ loadingDay: day }),
  clearLoadingDay: () => set({ loadingDay: null }),
}));

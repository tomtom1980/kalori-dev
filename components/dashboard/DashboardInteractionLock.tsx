'use client';

import { useEffect, useRef } from 'react';

import { useDashboardDateTransitionStore } from '@/lib/stores/useDashboardDateTransitionStore';

export interface DashboardInteractionLockProps {
  viewedDay: string;
  children: React.ReactNode;
}

export function DashboardInteractionLock({ viewedDay, children }: DashboardInteractionLockProps) {
  const loadingDay = useDashboardDateTransitionStore((state) => state.loadingDay);
  const locked = loadingDay !== null && loadingDay !== viewedDay;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (locked) {
      node.setAttribute('inert', '');
      return;
    }
    node.removeAttribute('inert');
  }, [locked]);

  return (
    <div
      ref={ref}
      data-testid="dashboard-interaction-lock"
      data-prefers-reduced-motion="reduce-via-globals"
      aria-busy={locked}
      aria-disabled={locked}
      style={{
        opacity: locked ? 0.45 : 1,
        pointerEvents: locked ? 'none' : 'auto',
        transition: 'opacity 120ms ease-out',
      }}
    >
      {children}
    </div>
  );
}

export default DashboardInteractionLock;

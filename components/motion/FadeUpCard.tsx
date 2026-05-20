'use client';

import type { MotionStyle } from 'framer-motion';
import type { ReactNode } from 'react';

import { m, SPRING, useReducedMotion } from '@/lib/motion/defaults';

export interface FadeUpCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function FadeUpCard({ children, delay = 0, className, style }: FadeUpCardProps) {
  // Reduced-motion guard: when the OS / app data-attr signals
  // prefers-reduced-motion, skip the fade-up entirely. `useReducedMotion()`
  // returns true under the user's reduced-motion preference; we collapse
  // initial=animate so the entrance is instantaneous.
  const isReducedMotion = useReducedMotion();
  return (
    <m.div
      initial={isReducedMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={isReducedMotion ? { duration: 0 } : { ...SPRING, delay }}
      className={className}
      {...(style ? { style: style as MotionStyle } : {})}
    >
      {children}
    </m.div>
  );
}

export default FadeUpCard;

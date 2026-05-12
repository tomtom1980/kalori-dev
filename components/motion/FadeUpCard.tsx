'use client';

import type { ComponentProps, ReactNode } from 'react';

import { m, motion } from '@/lib/motion/defaults';

export interface FadeUpCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: ComponentProps<typeof m.div>['style'];
}

export function FadeUpCard({ children, delay = 0, className, style }: FadeUpCardProps) {
  return (
    <m.div
      className={className ? `kalori-motion-card ${className}` : 'kalori-motion-card'}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motion.standard, delay }}
      {...(style ? { style } : {})}
    >
      {children}
    </m.div>
  );
}

export default FadeUpCard;

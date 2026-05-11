'use client';

import { m, type MotionStyle } from 'framer-motion';
import type { ReactNode } from 'react';

import { motion } from '@/lib/motion/defaults';

export interface FadeUpCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: MotionStyle;
}

export function FadeUpCard({ children, delay = 0, className, style }: FadeUpCardProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motion.standard, delay }}
      className={className}
      style={style}
    >
      {children}
    </m.div>
  );
}

export default FadeUpCard;

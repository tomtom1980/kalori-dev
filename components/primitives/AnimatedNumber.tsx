'use client';

import { useReducedMotion } from '@/lib/motion/defaults';
import { useEffect, useState } from 'react';

export interface AnimatedNumberProps {
  value: number;
  formatValue?: (v: number) => string;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export function AnimatedNumber({
  value,
  formatValue,
  className,
  style,
  'data-testid': testId,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (reduced) {
      return;
    }

    let startTimestamp: number | null = null;
    const duration = 600; // chrono duration
    const startValue = 0;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);

      // easeOutCubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(startValue + (value - startValue) * easeProgress);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value, reduced]);

  const activeValue = reduced ? value : displayValue;
  const formatted = formatValue
    ? formatValue(Math.round(activeValue))
    : Math.round(activeValue).toLocaleString('en-US');

  return (
    <span className={className} style={style} data-testid={testId}>
      {formatted}
    </span>
  );
}

export default AnimatedNumber;

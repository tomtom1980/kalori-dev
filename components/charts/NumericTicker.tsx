'use client';

import { useEffect, useState, useRef } from 'react';

export interface NumericTickerProps {
  value: number;
  duration?: number;
}

export function NumericTicker({ value, duration = 600 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    prevValueRef.current = value;

    if (typeof window === 'undefined') return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayValue(value);
      return;
    }

    let start: number | null = null;
    let animId: number;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // easeOutQuad easing
      const easedProgress = progress * (2 - progress);
      setDisplayValue(Math.round(startValue + easedProgress * (endValue - startValue)));

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [value, duration]);

  return <>{displayValue.toLocaleString('en-US')}</>;
}

export default NumericTicker;

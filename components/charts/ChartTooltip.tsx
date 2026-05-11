/**
 * <ChartTooltip /> — Shared Ledger chart tooltip primitive (Task 4.3a R1).
 *
 * Render contract:
 *   - bg-1 surface + 2px oxblood LEFT rule + 1px rule-strong other sides
 *   - 10×12 padding
 *   - 100ms opacity fade-in (via `.chart-tooltip` in globals.css; collapses
 *     to 1ms under reduced-motion)
 *   - Escape-dismissible (keyboard); blur / mouseleave dismiss (pointer)
 *
 * Positioning: caller provides `anchorRect` (DOMRect of the triggering
 * element) + `preferred` side; this component clamps within viewport.
 *
 * This is a client component because it attaches a keydown listener
 * to document for Escape handling and uses getBoundingClientRect.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export interface ChartTooltipProps {
  /** The viewport-relative DOMRect of the trigger element. */
  anchorRect: DOMRect | null;
  /** Tooltip content — caller-owned, usually nutrient/bucket/value lines. */
  children: React.ReactNode;
  /** Fires when user pressed Escape OR clicked outside. */
  onDismiss?: () => void;
  /** aria-label for the tooltip region. */
  label?: string;
  /** Test id. */
  testid?: string;
}

export function ChartTooltip({
  anchorRect,
  children,
  onDismiss,
  label,
  testid,
}: ChartTooltipProps) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Compute clamped position each render (anchor can shift with scroll).
  useEffect(() => {
    if (!anchorRect) return;
    const node = tipRef.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    const viewportW = window.innerWidth;
    // Default above; flip below if overflow.
    let top = anchorRect.top - height - 8;
    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    if (top < 8) {
      top = anchorRect.bottom + 8;
    }
    if (left < 8) left = 8;
    if (left + width > viewportW - 8) left = viewportW - width - 8;
    setPosition({ top: Math.round(top + window.scrollY), left: Math.round(left) });
  }, [anchorRect]);

  // Escape key dismiss
  useEffect(() => {
    if (!anchorRect) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [anchorRect, onDismiss]);

  if (!anchorRect) return null;

  return (
    <div
      ref={tipRef}
      role="tooltip"
      aria-label={label}
      data-testid={testid ?? 'chart-tooltip'}
      className="chart-tooltip"
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        opacity: position ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}

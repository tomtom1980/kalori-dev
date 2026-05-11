'use client';

/**
 * Progress-page inline weight quick-add wrapper — Task 4.3b.
 *
 * Thin client wrapper around the shared `<WeightQuickAdd mode="inline" />`
 * component. Exists as its own file so the Progress RSC can import cleanly
 * without pulling the full-form /weight page chunk.
 */
import { WeightQuickAdd, type WeightQuickAddProps } from '@/components/dashboard/WeightQuickAdd';

export function ProgressWeightQuickAdd(props: Omit<WeightQuickAddProps, 'mode'>) {
  return <WeightQuickAdd {...props} mode="inline" />;
}

export default ProgressWeightQuickAdd;

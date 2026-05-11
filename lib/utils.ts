import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * shadcn/ui-compatible `cn()` — merges Tailwind class lists with clsx conditional
 * semantics and de-duplicates colliding utilities via tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

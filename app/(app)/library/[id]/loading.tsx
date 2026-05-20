/**
 * `/library/[id]/loading.tsx` — Bug 2 (library overhaul 2026-05-16).
 *
 * Next.js route-level loading boundary. Mounts the FoodDetailSkeleton
 * while the RSC fetch for `getLibraryItemById` + `getLibraryItemHistory`
 * settles (cross-region SG↔IAD RTT ~150-200ms documented in `CLAUDE.md`).
 */
import { FoodDetailSkeleton } from '../_components/FoodDetailSkeleton';

export default function Loading() {
  return <FoodDetailSkeleton />;
}

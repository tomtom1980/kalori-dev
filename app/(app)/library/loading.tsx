/**
 * `/library/loading.tsx` — Bug 2 (library overhaul 2026-05-16).
 *
 * Next.js route-level loading boundary for the close leg of the
 * `/library/[id]` → `/library` round-trip. Renders the paged grid
 * silhouette so the list-page return navigation has a stable shape
 * while the RSC `fetchLibraryPage` resolves.
 */
import { LibraryGridSkeleton } from './_components/FoodDetailSkeleton';

export default function Loading() {
  return (
    <section data-testid="page-library-loading" className="kalori-library-main">
      <LibraryGridSkeleton />
    </section>
  );
}

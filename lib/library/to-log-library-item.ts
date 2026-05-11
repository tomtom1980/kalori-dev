/**
 * Pure mapper from DB-shape `LibraryItem` (lib/library/fetch.ts) onto
 * UI-shape `LogLibraryItem` (lib/stores/useLogFlowStore.ts).
 *
 * Used by `GET /api/library/list` and the LibraryTab self-hydration path
 * so chrome-trigger entry points (FAB / `n` keybinding / meal-column +ADD)
 * can populate the log-flow modal without going through the `/log` page's
 * RSC fetch.
 *
 * Mirrors `LogPageClient.libraryItemToParsedItem`'s macro defaults: missing
 * macros / missing fiber default to 0 so the ConfirmationScreen pre-fills
 * accurately on re-log.
 */
import type { LibraryItem } from '@/lib/library/fetch';
import type { LogLibraryItem } from '@/lib/stores/useLogFlowStore';

export function toLogLibraryItem(item: LibraryItem): LogLibraryItem {
  const macros = item.nutrition.macros;
  return {
    id: item.id,
    name: item.display_name,
    kcal: item.nutrition.kcal,
    lastUsedIso: item.last_used_at,
    logCount: item.log_count,
    proteinG: macros?.protein_g ?? 0,
    carbsG: macros?.carbs_g ?? 0,
    fatG: macros?.fat_g ?? 0,
    fiberG: macros?.fiber_g ?? 0,
    unit: item.default_unit ?? 'g',
    thumbnailUrl: item.thumbnail_url,
  };
}

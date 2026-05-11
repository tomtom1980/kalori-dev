/**
 * Shared types for the `/library` route — Task 4.1 sub-step 3.
 *
 * `LibraryItem` re-exports from `lib/library/fetch.ts` so downstream modules
 * (Zustand store, filter-sort helpers, API callers) import a single canonical
 * shape. The union string-literal types (`LibraryFilter`, `LibrarySort`) are
 * the closed set persisted to sessionStorage (§8 Q5).
 *
 * `OptimisticAction` describes the deltas the `useOptimistic` reducer applies
 * to the rendered grid while a mutation is in-flight. Merge adds the loser
 * to `removedIds` (disappears) while the winner is replaced with the picked
 * fields; bulk-delete adds each id to `removedIds`; bulk-delete undo clears
 * the removed ids for that batch.
 *
 * `MergeFieldChoices` is the per-field picker state inside the Merge dialog.
 * `a`/`b`/`custom` discriminants keep the reducer transitions explicit.
 */
import type { LibraryItem } from './fetch';

export type { LibraryItem } from './fetch';

export type LibraryFilter = 'all' | 'with-photos' | 'no-photos' | 'this-week';
export const LIBRARY_FILTERS: readonly LibraryFilter[] = [
  'all',
  'with-photos',
  'no-photos',
  'this-week',
] as const;

export type LibrarySort =
  | 'most-logged'
  | 'last-used'
  | 'name-asc'
  | 'name-desc'
  | 'kcal-asc'
  | 'kcal-desc';
export const LIBRARY_SORTS: readonly LibrarySort[] = [
  'most-logged',
  'last-used',
  'name-asc',
  'name-desc',
  'kcal-asc',
  'kcal-desc',
] as const;

export type MergeChoiceTag = 'a' | 'b' | 'custom';

export interface MergeFieldChoices {
  display_name: 'a' | 'b';
  thumbnail_url: 'a' | 'b';
  kcal: MergeChoiceTag;
  protein_g: MergeChoiceTag;
  carbs_g: MergeChoiceTag;
  fat_g: MergeChoiceTag;
  default_portion: MergeChoiceTag;
  default_unit: 'a' | 'b';
  kcal_custom: number | null;
  protein_custom: number | null;
  carbs_custom: number | null;
  fat_custom: number | null;
  portion_custom: number | null;
}

export type OptimisticAction =
  | { type: 'remove'; ids: string[] }
  | { type: 'restore'; ids: string[] }
  | { type: 'merge'; winnerId: string; loserId: string; fields: Partial<LibraryItem> };

export interface OptimisticState {
  removedIds: Set<string>;
  mergeOverrides: Record<string, Partial<LibraryItem>>;
}

export const INITIAL_OPTIMISTIC_STATE: OptimisticState = {
  removedIds: new Set<string>(),
  mergeOverrides: {},
};

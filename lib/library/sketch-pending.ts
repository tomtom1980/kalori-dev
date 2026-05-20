/**
 * Isomorphic helpers for the "sketch is being generated" UI state.
 * Lives outside `lib/library/fetch.ts` because that module imports
 * `server-only` — the client cards + LibraryClient need this code to
 * run in the browser, so it has to stay free of server-side imports.
 */

/**
 * How long after `created_at` a thumbnail-less item is still considered
 * "sketch is being generated" (rather than permanently failed).
 * Generation typically takes 1–10 s; the pipeline's 3-retry budget tops
 * out around 25 s. 60 s gives a comfortable cushion before we assume
 * the sketch is gone for good.
 */
export const PENDING_SKETCH_WINDOW_MS = 60_000;

/**
 * Minimal shape needed to decide pending state — kept independent of
 * the full `LibraryItem` so consumers don't drag the whole interface
 * (and its server-only neighbors) into a client bundle.
 */
export interface PendingSketchInputs {
  readonly thumbnail_url: string | null;
  readonly thumbnail_kind?: 'photo' | 'sketch' | null;
  readonly created_at: string;
}

/**
 * True when an item has no thumbnail AND was created recently enough
 * that the background sketch pipeline could still be running. Used by
 * the library card to render a spinner instead of the letter-mark
 * fallback, and by LibraryClient to drive live polling.
 */
export function isItemPendingSketch(
  item: PendingSketchInputs,
  nowMs: number = Date.now(),
): boolean {
  if (item.thumbnail_url) return false;
  if (item.thumbnail_kind === 'sketch' || item.thumbnail_kind === 'photo') return false;
  if (!item.created_at) return false;
  const createdAt = Date.parse(item.created_at);
  if (!Number.isFinite(createdAt)) return false;
  return nowMs - createdAt < PENDING_SKETCH_WINDOW_MS;
}

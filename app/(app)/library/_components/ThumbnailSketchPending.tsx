/**
 * `<ThumbnailSketchPending />` — placeholder shown on a library card
 * while its sketch is still being generated server-side (item created
 * recently, `thumbnail_url` not yet populated). Replaces the
 * `<ThumbnailLetterMark>` fallback for the first 60 s after creation;
 * LibraryClient polls the RSC tree every 2 s so the real thumbnail
 * appears as soon as the sketch pipeline finishes.
 *
 * Renders inside the same `.kalori-library-card-thumb` slot, so the
 * card geometry stays identical to the photo / letter-mark variants.
 */
import { t } from '@/lib/i18n/en';

export interface ThumbnailSketchPendingProps {
  /** Display name used for the accessible label only. */
  displayName: string;
  /** Optional `data-testid` override so parent cards can scope their own. */
  testId?: string;
}

export function ThumbnailSketchPending({ displayName, testId }: ThumbnailSketchPendingProps) {
  return (
    <div
      className="kalori-library-card-pending"
      data-testid={testId ?? 'library-sketch-pending'}
      role="status"
      aria-live="polite"
      aria-label={t.library.thumbnailPendingAriaLabel.replace('{name}', displayName)}
    >
      <span className="kalori-library-card-pending-spinner" aria-hidden="true" />
    </div>
  );
}

export default ThumbnailSketchPending;

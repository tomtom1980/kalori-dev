/**
 * `<ThumbnailLetterMark />` — Task 4.1 sub-step 3 §7.11.
 *
 * Pure RSC that renders the Unicode-first-grapheme glyph placeholder when a
 * library item has no thumbnail. `aria-hidden` because the card's aria-label
 * already carries the item name.
 */
import { firstGrapheme } from '@/lib/library/letter-mark';

export interface ThumbnailLetterMarkProps {
  displayName: string;
  /** Optional `data-testid` override so parent cards can scope their own. */
  testId?: string;
}

export function ThumbnailLetterMark({ displayName, testId }: ThumbnailLetterMarkProps) {
  const glyph = firstGrapheme(displayName);
  return (
    <div
      className="kalori-library-card-lettermark"
      data-testid={testId ?? 'library-lettermark'}
      aria-hidden="true"
    >
      {glyph}
    </div>
  );
}

export default ThumbnailLetterMark;

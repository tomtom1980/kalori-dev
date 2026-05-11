'use client';

/**
 * <FoodDetailThumbnail /> — Task 4.2.
 *
 * Hero image slot inside the nutrition-plate frame. Renders the
 * ThumbnailLetterMark fallback when no thumbnail_url exists (reuses the
 * Task 4.1 component — imported from one level up).
 */
import { t } from '@/lib/i18n/en';
import type { LibraryItem } from '@/lib/library/fetch';

import { ThumbnailLetterMark } from '../ThumbnailLetterMark';

import { formatFiledDateTime } from './foodDetail.format';

export interface FoodDetailThumbnailProps {
  item: LibraryItem;
}

export function FoodDetailThumbnail({ item }: FoodDetailThumbnailProps) {
  const filed = formatFiledDateTime(item.created_at);
  return (
    <div className="kalori-fd-thumb-frame" data-testid="food-detail-thumbnail">
      <div className="kalori-fd-thumb-slot">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails may be signed URLs from Supabase storage; next/image adds no benefit here.
          <img src={item.thumbnail_url} alt="" role="presentation" />
        ) : (
          <div className="kalori-fd-thumb-lettermark-wrap">
            <ThumbnailLetterMark displayName={item.display_name} testId="food-detail-lettermark" />
          </div>
        )}
        <time
          dateTime={item.created_at}
          className="kalori-fd-meta-chip num"
          data-testid="food-detail-meta-chip"
        >
          {t.library.detail.metaChipFormat.replace('{date}', filed)}
        </time>
      </div>
    </div>
  );
}

export default FoodDetailThumbnail;

/**
 * App icon — Next.js 16 file-convention favicon (Task 4.7.7).
 *
 * Replaces the missing /favicon.ico that surfaced as a 404 on every route in
 * the Phase-4 audit. Renders a 32×32 oxblood "K" glyph on warm-near-black,
 * matching the project's "Ledger" design tokens:
 *   - background: --color-bg (#0E0A08, warm near-black)
 *   - foreground: --color-oxblood (#8A2A1F)
 *
 * The serif letterform is approximated with a system serif fallback ("Times
 * New Roman" → generic serif). Using a system font keeps the icon route a
 * pure ImageResponse (no font fetch, no edge runtime cost beyond default).
 *
 * Reference: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
 */
import { ImageResponse } from 'next/og';

import { t } from '@/lib/i18n/en';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0E0A08',
        color: '#8A2A1F',
        fontFamily: '"Times New Roman", serif',
        fontWeight: 400,
        fontSize: 28,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {t.brand.iconGlyph}
    </div>,
    size,
  );
}

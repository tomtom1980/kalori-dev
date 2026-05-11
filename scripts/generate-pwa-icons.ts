/**
 * Task 5.1.2 — PWA icon generator.
 *
 * One-shot script that produces the 4 PWA icons (192/512 + maskable variants)
 * into `public/icons/`. Run via `pnpm tsx scripts/generate-pwa-icons.ts`.
 *
 * Source asset:
 *   - Looks for `content/logos/kalori-mark-1024.png` first.
 *   - Falls back to a programmatically generated "K" glyph on warm-near-black
 *     when no source asset is available. The placeholder uses the project
 *     design tokens (bg-0 #0E0A08, oxblood #8A2A1F) and is clearly marked as
 *     a placeholder via a TODO log line so the user knows to swap it later.
 *
 * Maskable safe zone: 80% (per PWA maskable-icon spec). The `any` variant
 * shows the full glyph; the `maskable` variant shrinks the glyph to 60%
 * inside an opaque background so the OS can crop to circle/squircle without
 * eating the design.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const BG = '#0E0A08';
const FG = '#8A2A1F';
const SOURCE_PATH = resolve(process.cwd(), 'content/logos/kalori-mark-1024.png');
const OUT_DIR = resolve(process.cwd(), 'public/icons');

interface IconJob {
  filename: string;
  size: number;
  /** Maskable icons shrink the inner glyph to leave a safe zone. */
  maskable: boolean;
}

const JOBS: IconJob[] = [
  { filename: 'icon-192.png', size: 192, maskable: false },
  { filename: 'icon-512.png', size: 512, maskable: false },
  { filename: 'icon-maskable-192.png', size: 192, maskable: true },
  { filename: 'icon-maskable-512.png', size: 512, maskable: true },
];

function placeholderSvg(size: number, maskable: boolean): Buffer {
  // For maskable icons keep the inner glyph at 60% of canvas — gives the OS
  // 20% safe zone on every edge before it starts cropping.
  const innerScale = maskable ? 0.6 : 0.78;
  const inner = size * innerScale;
  const offset = (size - inner) / 2;
  const fontSize = inner * 0.85;
  // Letter 'K' in a serif face. The OS-installed serif fallback works in
  // sharp's text rendering — we don't ship a font with the script. The 'K'
  // is centered via dominant-baseline + text-anchor.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}" />
  <text
    x="${size / 2}"
    y="${offset + inner * 0.78}"
    font-family="Newsreader, 'Times New Roman', Georgia, serif"
    font-size="${fontSize}"
    font-weight="300"
    fill="${FG}"
    text-anchor="middle"
  >K</text>
</svg>`;
  return Buffer.from(svg);
}

async function generateIcon(job: IconJob): Promise<void> {
  const outPath = resolve(OUT_DIR, job.filename);
  let pipeline: sharp.Sharp;

  if (existsSync(SOURCE_PATH)) {
    // Use the brand asset.
    if (job.maskable) {
      // Maskable: inset the source onto a solid background.
      const inner = Math.round(job.size * 0.6);
      const offset = Math.round((job.size - inner) / 2);
      const innerBuffer = await sharp(SOURCE_PATH)
        .resize(inner, inner, { fit: 'contain' })
        .png()
        .toBuffer();
      pipeline = sharp({
        create: {
          width: job.size,
          height: job.size,
          channels: 4,
          background: BG,
        },
      }).composite([{ input: innerBuffer, top: offset, left: offset }]);
    } else {
      pipeline = sharp(SOURCE_PATH).resize(job.size, job.size, { fit: 'contain', background: BG });
    }
  } else {
    // Placeholder branch. Log clearly so the user knows.
    pipeline = sharp(placeholderSvg(job.size, job.maskable)).flatten({ background: BG });
  }

  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  console.log(
    `  wrote ${job.filename} (${job.size}×${job.size}${job.maskable ? ', maskable' : ''})`,
  );
}

async function main() {
  if (!existsSync(SOURCE_PATH)) {
    console.warn(
      [
        '⚠  No brand asset found at content/logos/kalori-mark-1024.png.',
        '   Generating PLACEHOLDER icons — replace with the real mark before launch.',
      ].join('\n'),
    );
  }
  mkdirSync(OUT_DIR, { recursive: true });
  // Ensure the parent of OUT_DIR exists too.
  mkdirSync(dirname(OUT_DIR), { recursive: true });
  for (const job of JOBS) {
    await generateIcon(job);
  }
  console.log('PWA icons generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

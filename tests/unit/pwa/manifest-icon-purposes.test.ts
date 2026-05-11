/**
 * F-PWA-2 — manifest icon purpose split (any / maskable on separate entries).
 *
 * The W3C web app manifest spec permits a single icon entry to declare
 * `purpose: "any maskable"`, but recommends separate entries so user agents
 * can pick the correct artifact without heuristics. This regression test
 * locks in the split + asserts each referenced PNG exists on disk.
 *
 * Surfaced as F-PWA-2 in Planning/followups.md (Task 5.1.2 Codex Round 2
 * Minor #1).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_PATH = resolve(process.cwd(), 'public/manifest.json');
const PUBLIC_DIR = resolve(process.cwd(), 'public');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

function loadIcons(): ManifestIcon[] {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as {
    icons: ManifestIcon[];
  };
  return manifest.icons;
}

describe('manifest.json icon purpose split (F-PWA-2)', () => {
  it('declares at least one icon with purpose "any" (single token)', () => {
    const icons = loadIcons();
    const anyIcons = icons.filter((i) => i.purpose === 'any');
    expect(anyIcons.length).toBeGreaterThan(0);
    for (const icon of anyIcons) {
      expect(icon.purpose).toBe('any');
      expect(icon.purpose).not.toMatch(/maskable/);
    }
  });

  it('declares at least one icon with purpose "maskable" (single token)', () => {
    const icons = loadIcons();
    const maskableIcons = icons.filter((i) => i.purpose === 'maskable');
    expect(maskableIcons.length).toBeGreaterThan(0);
    for (const icon of maskableIcons) {
      expect(icon.purpose).toBe('maskable');
      expect(icon.purpose).not.toMatch(/\bany\b/);
    }
  });

  it('does not combine "any" and "maskable" on a single entry', () => {
    const icons = loadIcons();
    for (const icon of icons) {
      const tokens = (icon.purpose ?? 'any').split(/\s+/).filter(Boolean);
      const hasBoth = tokens.includes('any') && tokens.includes('maskable');
      expect(hasBoth).toBe(false);
    }
  });

  it('every referenced icon file exists on disk under public/', () => {
    const icons = loadIcons();
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      // src is a root-relative URL like "/icons/icon-192.png"
      expect(icon.src.startsWith('/')).toBe(true);
      const filePath = resolve(PUBLIC_DIR, icon.src.replace(/^\//, ''));
      expect(existsSync(filePath), `missing file for icon ${icon.src}`).toBe(true);
    }
  });
});

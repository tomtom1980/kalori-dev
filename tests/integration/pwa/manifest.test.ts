/**
 * Task 5.1.2 — public/manifest.json contract tests (RED → GREEN).
 *
 * Per Planning/.tmp/task-5.1-ui-architecture.md §F (and design-doc §14):
 *   - name="Kalori", short_name="Kalori"
 *   - scope="/", start_url=/dashboard, display="standalone", orientation="portrait"
 *   - theme_color="#0E0A08" (warm near-black bg-0), background_color="#0E0A08"
 *   - icons: 192/512 + maskable variants, type=image/png
 *   - lang/dir present
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_PATH = resolve(process.cwd(), 'public/manifest.json');

describe('public/manifest.json', () => {
  it('exists at /public/manifest.json', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it('parses as valid JSON', () => {
    const raw = readFileSync(MANIFEST_PATH, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has the required PWA fields with the contracted values', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    expect(manifest.name).toBe('Kalori');
    expect(manifest.short_name).toBe('Kalori');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/dashboard');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.theme_color).toBe('#0E0A08');
    expect(manifest.background_color).toBe('#0E0A08');
    expect(manifest.lang).toBe('en');
    expect(manifest.dir).toBe('ltr');
  });

  it('declares 192 + 512 + maskable icons (type image/png)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    expect(Array.isArray(manifest.icons)).toBe(true);
    const sizes = (manifest.icons as Array<{ sizes: string }>).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const purposes = (manifest.icons as Array<{ purpose?: string }>).map((i) => i.purpose ?? 'any');
    expect(purposes).toContain('maskable');
    for (const icon of manifest.icons as Array<{ type: string; src: string }>) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.startsWith('/icons/')).toBe(true);
    }
  });

  it('does not use ALL CAPS oxblood as theme color (would clash on iOS status bar)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    expect(manifest.theme_color.toLowerCase()).not.toBe('#8a2a1f');
    expect(manifest.background_color.toLowerCase()).not.toBe('#8a2a1f');
  });
});

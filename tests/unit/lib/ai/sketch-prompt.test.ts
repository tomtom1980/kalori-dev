/**
 * Unit tests for the v1 sketch prompt factory — Bug 5 (library overhaul
 * 2026-05-16). Preamble updated in-place 2026-05-16 — realistic
 * full-color illustration override (replaced earlier hand-drawn sketch
 * direction that read as monochrome pencil output).
 */
import { describe, expect, it } from 'vitest';

import { v1_sketchPrompt } from '@/lib/ai/sketch-prompt';

describe('v1_sketchPrompt', () => {
  it('includes the display name verbatim', () => {
    const payload = v1_sketchPrompt({ displayName: 'Phở Bò' });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    expect(text).toContain('Phở Bò');
  });

  it('repeats the style preamble verbatim across calls (cross-batch consistency)', () => {
    const a = v1_sketchPrompt({ displayName: 'Apple' });
    const b = v1_sketchPrompt({ displayName: 'Banana' });
    const aText = a.contents[0]?.parts[0]?.text ?? '';
    const bText = b.contents[0]?.parts[0]?.text ?? '';
    // Both prompts contain the same preamble prefix.
    expect(aText.startsWith('A realistic, full-color illustration')).toBe(true);
    expect(bText.startsWith('A realistic, full-color illustration')).toBe(true);
  });

  it('emits a single-message contents array with role=user', () => {
    const payload = v1_sketchPrompt({ displayName: 'Tofu' });
    expect(payload.contents).toHaveLength(1);
    expect(payload.contents[0]?.role).toBe('user');
  });

  it('appends region hint when region=vn', () => {
    const payload = v1_sketchPrompt({ displayName: 'Bun Cha', region: 'vn' });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    expect(text).toContain('Vietnamese');
  });

  it('appends region hint when region=western', () => {
    const payload = v1_sketchPrompt({ displayName: 'Pasta Carbonara', region: 'western' });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    expect(text).toContain('Western');
  });

  it('omits region hint when region is unspecified or "other"', () => {
    const a = v1_sketchPrompt({ displayName: 'Toast' });
    const b = v1_sketchPrompt({ displayName: 'Toast', region: 'other' });
    expect(a.contents[0]?.parts[0]?.text ?? '').not.toContain('Regional context');
    expect(b.contents[0]?.parts[0]?.text ?? '').not.toContain('Regional context');
  });

  it('trims whitespace from displayName before composing', () => {
    const payload = v1_sketchPrompt({ displayName: '   Apple   ' });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    expect(text).toContain('"Apple"');
    expect(text).not.toContain('"   Apple   "');
  });

  it('uses realistic full-color styling (not sketchy or monochrome)', () => {
    const payload = v1_sketchPrompt({ displayName: 'Apple' });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    // Realistic full-color preamble requires these tokens.
    expect(text).toContain('realistic');
    expect(text).toContain('full-color');
    expect(text).toContain('lifelike');
    expect(text).toContain('immediately recognizable');
    expect(text).toContain('Clean light background');
    // Sketchy / monochrome / editorial tokens from prior preambles must be gone.
    expect(text).not.toContain('hand-drawn sketch');
    expect(text).not.toContain('pen/ink strokes');
    expect(text).not.toContain('No photographic');
    expect(text).not.toContain('Pen-and-ink line drawing');
    expect(text).not.toContain('single-color');
    expect(text).not.toContain('ivory');
    expect(text).not.toContain('engraving');
    expect(text).not.toContain('NO color fill');
    expect(text).not.toContain('NO photographic detail');
    expect(text).not.toContain('archival broadsheet');
  });

  it('omits the description hint when description is unset / empty / whitespace', () => {
    const a = v1_sketchPrompt({ displayName: 'Apple' });
    const b = v1_sketchPrompt({ displayName: 'Apple', description: '' });
    const c = v1_sketchPrompt({ displayName: 'Apple', description: '   ' });
    for (const payload of [a, b, c]) {
      const text = payload.contents[0]?.parts[0]?.text ?? '';
      expect(text).not.toContain('Additional context');
    }
  });

  it('appends a quoted description hint when description is non-empty', () => {
    const payload = v1_sketchPrompt({
      displayName: 'Pho Bo',
      description: 'Beef noodle soup with rare brisket, basil, lime, and bean sprouts.',
    });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    expect(text).toContain('Additional context about this dish:');
    expect(text).toContain('"Beef noodle soup with rare brisket, basil, lime, and bean sprouts."');
  });

  it('caps the description at 500 chars with an ellipsis suffix', () => {
    const longDescription = 'rice '.repeat(200); // 1000 chars
    const payload = v1_sketchPrompt({ displayName: 'Rice', description: longDescription });
    const text = payload.contents[0]?.parts[0]?.text ?? '';
    // The clipped slice should appear (≤500 chars + …); the full 1000-char
    // string must NOT (no quoted form containing all 200 repetitions).
    expect(text).toContain('Additional context about this dish:');
    expect(text).toContain('…');
    expect(text).not.toContain(longDescription);
  });
});

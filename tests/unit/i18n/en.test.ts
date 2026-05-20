/**
 * Task D.3 (US-STAB-D3) — AC3 i18n F10 conflict-copy regression guard.
 *
 * What bug this catches
 * ─────────────────────
 * Phase 5.1.5 Codex Round 1 F2 removed the lying "USE OFFLINE VALUE" CTA
 * because both buttons resolved to the same `'use-current'` action, which
 * was misleading to the user. This test locks in the post-F2 honest copy
 * so a future refactor cannot silently reintroduce the deprecated phrase
 * or other dishonest "auto-merge/automatic" wording in the F10 conflict
 * modal's user-facing strings.
 *
 * Approach (per briefing RED FLAG 2)
 * ──────────────────────────────────
 * Walks the VALUE tree of `t.pwa.conflict` (deep traversal of string
 * leaves) and asserts no forbidden substring appears. Comments are
 * excluded by construction because we never read the source file as
 * text. The `lib/i18n/en.ts` source contains a legacy comment at line
 * 1510 that references "USE OFFLINE VALUE" for historical context; that
 * comment must NOT trip this guard.
 *
 * Forbidden phrases derived from §F10 honest-copy contract:
 *  - 'USE OFFLINE VALUE'           — removed lying CTA
 *  - 'auto-merge'                  — server never auto-merges goal weight
 *  - 'automatic'                   — F10 always requires explicit user choice
 *  - 'automatically resolved'      — synonym
 *  - 'auto-resolved'               — synonym
 *  - 'merged automatically'        — synonym
 *  - 'conflict resolved automatically'
 *  - 'we resolved'                 — passive-voice dishonesty
 *  - 'we merged'                   — synonym
 *
 * Match semantics: case-insensitive substring on STRING VALUES only.
 */
import { describe, expect, it } from 'vitest';

import { t } from '@/lib/i18n/en';

const FORBIDDEN_PHRASES = [
  'USE OFFLINE VALUE',
  'auto-merge',
  'automatic',
  'automatically resolved',
  'auto-resolved',
  'merged automatically',
  'conflict resolved automatically',
  'we resolved',
  'we merged',
] as const;

/**
 * Deep-walk an arbitrary object, collecting every string leaf.
 * Returns leaves with their dotted path so a failing assertion can name
 * the offending key (e.g. `pwa.conflict.cancelButton`).
 */
function collectStringLeaves(
  obj: unknown,
  path: string,
  acc: Array<{ path: string; value: string }>,
): Array<{ path: string; value: string }> {
  if (typeof obj === 'string') {
    acc.push({ path, value: obj });
    return acc;
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      collectStringLeaves(value, path ? `${path}.${key}` : key, acc);
    }
  }
  return acc;
}

describe('i18n F10 conflict copy regression guard (Task D.3 AC3)', () => {
  it('no-deprecated-conflict-copy: t.pwa.conflict tree contains no deprecated phrases', () => {
    const leaves = collectStringLeaves(t.pwa.conflict, 'pwa.conflict', []);

    // Sanity: the value-walk found the known CTA labels — guards against a
    // walk that silently returns [] (which would make every assertion pass).
    const allValues = leaves.map((l) => l.value);
    expect(allValues).toContain('CANCEL');
    expect(allValues).toContain('USE CURRENT VALUE');

    for (const phrase of FORBIDDEN_PHRASES) {
      const phraseLower = phrase.toLowerCase();
      const offenders = leaves.filter((l) => l.value.toLowerCase().includes(phraseLower));
      expect(
        offenders,
        `Forbidden phrase "${phrase}" found in t.pwa.conflict values: ${offenders
          .map((o) => `${o.path}="${o.value}"`)
          .join(', ')}`,
      ).toEqual([]);
    }
  });
});

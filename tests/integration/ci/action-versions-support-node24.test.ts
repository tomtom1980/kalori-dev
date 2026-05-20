/**
 * @vitest-environment node
 *
 * US-STAB-D5 — GitHub Actions Node 24 runtime compatibility (AC1).
 *
 * AC1: GIVEN all GitHub Actions workflow `uses:` declarations across
 *   `.github/workflows/*.yml`, WHEN audited, THEN every action version
 *   supports the Node 24 javascript-action runtime — specifically
 *   `actions/checkout@v4+`, `actions/setup-node@v4+`, `pnpm/action-setup@v3+`,
 *   `actions/upload-artifact@v4+`; any action declaration on a major-version
 *   known to require Node 20 is flagged.
 *
 * Why now: GitHub Actions Node 20 javascript-action runtime is at forced
 * cut-over 2026-06-02 (hard-stop 2026-09-16). Node 22 alone is insufficient
 * because the action runtime itself is moving to Node 24. This test locks
 * the floor against future regressions; bump only when GitHub Actions
 * raises the Node runtime floor for these javascript-actions.
 *
 * Per design-doc.md §11 H mitigation — filesystem-only check, no network.
 * Parses each workflow line-by-line with a regex to avoid adding a YAML
 * dependency (Small task, no devDependency additions).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

// AC1 floor table — minimum major version per action that runs on the
// Node 24 javascript-action runtime. Sourced from each action's release
// notes circa 2026-05-15.
const NODE24_FLOOR: Readonly<Record<string, number>> = {
  'actions/checkout': 4,
  'actions/setup-node': 4,
  'actions/upload-artifact': 4,
  'actions/download-artifact': 4,
  'actions/cache': 4,
  'pnpm/action-setup': 3,
};

// Third-party action allowlist. Adding an entry requires auditing the
// action's Node-runtime compatibility.
//
// Current entries:
//   - `patrickedqvist/wait-for-vercel-preview` — pending separate Node 24
//     compat validation (see impact-analysis.md US-STAB-D5 Anomaly 1).
//   - `supabase/setup-cli` — composite action that downloads the supabase
//     CLI binary; no JS runtime under our control (D.CODEX Round 2,
//     F-CODEX-D-01 supabase-db-diff job).
const ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'patrickedqvist/wait-for-vercel-preview',
  'supabase/setup-cli',
]);

// Regex parser — tolerant of single-quote, double-quote, and unquoted YAML
// values. Captures owner/name and the version reference after `@`.
const USES_LINE_RE = /^\s*-?\s*uses:\s*['"]?([^'"\s@]+)@([^'"\s]+)['"]?\s*$/;

describe('GitHub Actions Node 24 runtime compatibility', () => {
  it('all uses: on Node 24-compatible majors', () => {
    const violations: string[] = [];
    const files = readdirSync(workflowsDir).filter(
      (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
    );
    expect(files.length, 'expected at least one workflow file').toBeGreaterThan(0);

    for (const file of files) {
      const text = readFileSync(path.join(workflowsDir, file), 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const match = line.match(USES_LINE_RE);
        if (!match) continue;
        const [, action, version] = match;
        // Regex requires both capture groups to match, so action+version are
        // present whenever `match` is truthy — narrow for tsc.
        if (action === undefined || version === undefined) continue;
        // Skip composite local actions (uses: ./path/to/action).
        if (action.startsWith('./')) continue;

        if (action in NODE24_FLOOR) {
          const majorMatch = /^v?(\d+)/.exec(version);
          const major = majorMatch && majorMatch[1] ? Number(majorMatch[1]) : Number.NaN;
          const floor = NODE24_FLOOR[action];
          if (floor === undefined || !Number.isFinite(major) || major < floor) {
            violations.push(`${file}:${i + 1}  ${action}@${version} below Node 24 floor v${floor}`);
          }
          continue;
        }
        if (ALLOWLIST.has(action)) continue;

        violations.push(
          `${file}:${i + 1}  ${action}@${version} unrecognized action — add to ALLOWLIST or NODE24_FLOOR`,
        );
      }
    }

    expect(violations, `Node 24 floor violations:\n${violations.join('\n')}`).toEqual([]);
  });
});

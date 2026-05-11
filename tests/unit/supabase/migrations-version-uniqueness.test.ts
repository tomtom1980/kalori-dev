/**
 * @vitest-environment node
 *
 * Task 4.5 R2 C1 structural guard. Every migration file under
 * supabase/migrations/ MUST have a unique NNNN_ version prefix.
 *
 * Supabase orders migrations lexicographically by filename. The convention
 * uses a four-digit version prefix as the primary ordering key. Two files
 * sharing the same NNNN prefix produce ambiguous apply order and, in
 * tooling that keys on version alone, a registry-vs-file mismatch.
 *
 * R2 introduced this test because a rename resolved a collision between
 * 0010_library_merge_hardening.sql and 0010_weight_recalc_columns.sql.
 */
import { readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

const MIGRATION_FILENAME = /^(\d{4,})_[\w-]+\.sql$/;

describe('supabase/migrations structural invariants', () => {
  it('Task 4.5 R2 C1 every migration file has a unique version prefix', async () => {
    const files = await readdir(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(0);

    const versionToFiles = new Map<string, string[]>();
    for (const file of sqlFiles) {
      const match = MIGRATION_FILENAME.exec(file);
      expect(match, `migration filename does not match NNNN_*.sql: ${file}`).not.toBeNull();
      const version = match?.[1];
      expect(version, `migration filename missing version prefix: ${file}`).toBeTruthy();
      if (!version) continue; // narrowing for TS; unreachable after expect above.
      const list = versionToFiles.get(version) ?? [];
      list.push(file);
      versionToFiles.set(version, list);
    }

    const collisions = Array.from(versionToFiles.entries()).filter(([, list]) => list.length > 1);
    const msg = collisions
      .map(([v, filesInList]) => `  ${v}: ${filesInList.join(', ')}`)
      .join('\n');
    expect(collisions, `migration version collision(s):\n${msg}`).toEqual([]);
  });
});

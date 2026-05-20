/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/0026_bac_alcohol_tracking.sql');

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

describe('0026 BAC alcohol tracking migration', () => {
  it('tightens profile bio_sex to male/female and updates new-user default', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));

    expect(sql).toMatch(/update\s+public\.profiles\s+set\s+bio_sex\s*=\s*'male'/i);
    expect(sql).toMatch(/where\s+bio_sex\s*=\s*'other'/i);
    expect(sql).toMatch(/drop\s+constraint\s+if\s+exists\s+profiles_bio_sex_check/i);
    expect(sql).toMatch(/check\s*\(\s*bio_sex\s+in\s*\(\s*'male'\s*,\s*'female'\s*\)\s*\)/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.handle_new_user/i);
    expect(sql).toMatch(/values\s*\(\s*new\.id\s*,\s*'male'/i);
  });

  it('creates owner-scoped alcohol_logs with one row per food entry', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.alcohol_logs/i);
    expect(sql).toMatch(
      /add\s+constraint\s+food_entries_id_user_id_unique\s+unique\s*\(\s*id\s*,\s*user_id\s*\)/i,
    );
    expect(sql).toMatch(/entry_id\s+uuid\s+not\s+null/i);
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*entry_id\s*,\s*user_id\s*\)\s+references\s+public\.food_entries\s*\(\s*id\s*,\s*user_id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toMatch(/volume_ml\s+numeric\s*\(\s*8\s*,\s*2\s*\)\s+not\s+null/i);
    expect(sql).toMatch(/abv_percent\s+numeric\s*\(\s*5\s*,\s*2\s*\)\s+not\s+null/i);
    expect(sql).toMatch(/alcohol_grams\s+numeric\s*\(\s*8\s*,\s*3\s*\)\s+not\s+null/i);
    expect(sql).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+alcohol_logs_entry_id_unique/i,
    );
    expect(sql).toMatch(/create\s+index\s+if\s+not\s+exists\s+alcohol_logs_user_consumed_at_idx/i);
    expect(sql).toMatch(/alter\s+table\s+public\.alcohol_logs\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
  });
});

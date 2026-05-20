/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/0027_library_recipes.sql');

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
}

describe('0027 library recipe migration', () => {
  it('adds owner-scoped recipe eligibility columns to food_library_items', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));

    expect(sql).toMatch(/alter\s+table\s+public\.food_library_items/i);
    expect(sql).toMatch(/recipe_eligibility\s+text\s+not\s+null\s+default\s+'unknown'/i);
    expect(sql).toMatch(/recipe_eligibility_reason\s+text\s+null/i);
    expect(sql).toMatch(/recipe_eligibility_checked_at\s+timestamptz\s+null/i);
    expect(sql).toMatch(
      /recipe_eligibility\s+in\s*\(\s*'eligible'\s*,\s*'ineligible'\s*,\s*'unknown'\s*\)/i,
    );
    expect(sql).toMatch(/char_length\s*\(\s*recipe_eligibility_reason\s*\)\s*<=\s*240/i);
  });

  it('creates food_library_recipes with unique owner-item rows and RLS owner policies', () => {
    const sql = stripSqlComments(readFileSync(MIGRATION, 'utf8'));

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.food_library_recipes/i);
    expect(sql).toMatch(/id\s+uuid\s+primary\s+key\s+default\s+uuid_generate_v4\s*\(\s*\)/i);
    expect(sql).toMatch(
      /user_id\s+uuid\s+not\s+null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toMatch(/library_item_id\s+uuid\s+not\s+null/i);
    expect(sql).toMatch(/recipe\s+jsonb\s+not\s+null/i);
    expect(sql).toMatch(/unique\s*\(\s*user_id\s*,\s*library_item_id\s*\)/i);
    expect(sql).toMatch(
      /foreign\s+key\s*\(\s*library_item_id\s*,\s*user_id\s*\)\s+references\s+public\.food_library_items\s*\(\s*id\s*,\s*user_id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(sql).toMatch(
      /alter\s+table\s+public\.food_library_recipes\s+enable\s+row\s+level\s+security/i,
    );
    expect(sql).toMatch(/auth\.uid\(\)\s*=\s*user_id/i);
  });
});

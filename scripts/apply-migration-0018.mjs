// bugfix-tomi 2026-05-09-water-custom-button — apply migration 0018
// (atomic water_log cap RPC) to dev DB via the Supabase Management API
// `database/query` endpoint. Mirrors scripts/apply-migration-0017.mjs.
//
// Run: pnpm exec node scripts/apply-migration-0018.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((acc, line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2];
    return acc;
  }, {});

const PROJECT_REF = env.SUPABASE_PROJECT_REF;
const PAT = env.SUPABASE_PAT;
if (!PROJECT_REF || !PAT) {
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in .env.local');
  process.exit(1);
}

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0018_water_log_atomic_cap.sql'),
  'utf8',
);

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${PAT}`,
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('status', res.status);
console.log('body', text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);

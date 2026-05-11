// Apply migration 0019 (negative ml water adjustments) to the configured
// Supabase project via the Management API database/query endpoint.
//
// Run: pnpm exec node scripts/apply-migration-0019.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = process.argv[2] ?? '.env.local';

const env = readFileSync(resolve(process.cwd(), envFile), 'utf8')
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
  console.error(`Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in ${envFile}`);
  process.exit(1);
}

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0019_water_log_negative_ml_adjustments.sql'),
  'utf8',
);

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

console.log(`Applying migration 0019 using ${envFile} to project ${PROJECT_REF}`);

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

// One-off helper: apply migration 0013 (delete_user_data fn) to dev DB
// via the Supabase REST 'query' endpoint. Pulled out as a script so the
// Phase 2B E2E happy-path can run end-to-end (the cascade RPC must
// exist for /api/account/delete to succeed).
//
// Reads DATABASE_URL_DIRECT from .env.local; sends the migration SQL
// to the pg-meta endpoint via the service-role key.
//
// Run: pnpm exec node scripts/apply-migration-0013.mjs
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0013_delete_user_data_fn.sql'),
  'utf8',
);

// Supabase exposes a SQL execution endpoint via /pg/query (pg-meta) with
// a service-role auth header.
const endpoint = `${SUPABASE_URL}/pg-meta/default/query`;

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('status', res.status);
console.log('body', text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);

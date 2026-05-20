// Diagnostic query: most-recently-created library items + sketch state.
// Read-only — no migrations, no writes.
// Defaults to PROD creds (Planning/apikeys.txt). Argv[2] overrides.
//
// Run: pnpm exec node Planning/.tmp/bugfix-2026-05-16-mini-batch-A-cleanup/diagnostics/diag-library-sketch-state.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = process.argv[2] ?? 'Planning/apikeys.txt';

const env = readFileSync(resolve(process.cwd(), envFile), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .reduce((acc, line) => {
    if (line.trim().startsWith('#')) return acc;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) acc[m[1]] = m[2].replace(/^["]/, '').replace(/["\r]$/, '');
    return acc;
  }, {});

const PROJECT_REF = env.SUPABASE_PROJECT_REF;
const PAT = env.SUPABASE_PAT;
if (!PROJECT_REF || !PAT) {
  console.error(`Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in ${envFile}`);
  process.exit(1);
}

const sql = `
SELECT
  id,
  display_name,
  created_from,
  created_at,
  thumbnail_url,
  thumbnail_kind,
  sketch_generated_at,
  sketch_attempt_count,
  sketch_last_error
FROM public.food_library_items
WHERE created_at >= NOW() - INTERVAL '48 hours'
ORDER BY created_at DESC
LIMIT 30;
`;

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
console.log(`Querying project ${PROJECT_REF} (creds: ${envFile})`);

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
console.log('body', text);
process.exit(res.ok ? 0 : 1);

// scripts/dedup-pre-flight.mjs — Task D.6 (US-STAB-D6) FF #C mitigation.
//
// Pre-flight scan against a target Supabase project: lists existing duplicate
// `(user_id, normalized_name)` tuples among ACTIVE rows
// (`deleted_at IS NULL AND normalized_name IS NOT NULL`) in
// `food_library_items`. Halts (exit 2) if any duplicates are found so the
// operator can inspect / soft-delete by hand before the actual migration
// applies its in-transaction cleanup CTE.
//
// Usage:
//   node scripts/dedup-pre-flight.mjs                            # defaults to dev (Planning/devapikeys.txt)
//   node scripts/dedup-pre-flight.mjs --target=dev               # explicit dev
//   node scripts/dedup-pre-flight.mjs --target=prod              # apikeys.txt (prod)
//
// Reads credentials from `Planning/apikeys.txt` (prod) or
// `Planning/devapikeys.txt` (dev). Uses the Supabase Management API
// `database/query` endpoint with the project's PAT — the same path
// `scripts/apply-prod-migrations.mjs` uses.
//
// Exit codes:
//   0  — clean (no duplicates). Safe to apply migration 0020.
//   1  — wrong arguments / missing credentials.
//   2  — duplicates found. Manual review required before migration.
//   3  — pre-flight query failed (transport / auth error).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith('--target='));
const target = targetArg ? targetArg.slice('--target='.length) : 'dev';

if (target !== 'dev' && target !== 'prod') {
  console.error(`Unknown --target=${target}. Allowed: dev | prod.`);
  process.exit(1);
}

const KEYS_FILE = resolve(
  process.cwd(),
  target === 'prod' ? 'Planning/apikeys.txt' : 'Planning/devapikeys.txt',
);

function parseEnvFile(path) {
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = parseEnvFile(KEYS_FILE);
const PROJECT_REF = env.SUPABASE_PROJECT_REF;
const PAT = env.SUPABASE_PAT;

if (!PROJECT_REF || !PAT) {
  console.error(`Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in ${KEYS_FILE}`);
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runQuery(sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAT}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — body: ${text.slice(0, 1500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

console.log(`[dedup-pre-flight] target=${target} project_ref=${PROJECT_REF}`);

const probeSql = `
  SELECT user_id::text AS user_id,
         normalized_name,
         count(*)::int AS n
    FROM public.food_library_items
   WHERE deleted_at IS NULL
     AND normalized_name IS NOT NULL
   GROUP BY user_id, normalized_name
   HAVING count(*) > 1
   ORDER BY n DESC, user_id, normalized_name
   LIMIT 200;
`;

let probe;
try {
  probe = await runQuery(probeSql);
} catch (err) {
  console.error(`[dedup-pre-flight] probe failed: ${err.message}`);
  process.exit(3);
}

if (!Array.isArray(probe) || probe.length === 0) {
  console.log('[dedup-pre-flight] OK — zero active duplicates. Safe to apply migration 0020.');
  process.exit(0);
}

console.error(
  `[dedup-pre-flight] STOP — found ${probe.length} duplicate (user_id, normalized_name) group(s):`,
);
for (const row of probe) {
  console.error(
    `  user_id=${row.user_id}  normalized_name=${JSON.stringify(row.normalized_name)}  n=${row.n}`,
  );
}
console.error(
  '\n[dedup-pre-flight] Runbook:\n' +
    '  1. Inspect the rows for each group:\n' +
    '       SELECT id, display_name, created_at, log_count\n' +
    '         FROM public.food_library_items\n' +
    "        WHERE user_id = '<user_id>' AND normalized_name = '<normalized_name>'\n" +
    '          AND deleted_at IS NULL\n' +
    '        ORDER BY created_at DESC, id DESC;\n' +
    '  2. Keep the most-recent row (highest created_at, id-DESC tie-breaker); soft-delete the rest:\n' +
    '       UPDATE public.food_library_items\n' +
    '          SET deleted_at = now()\n' +
    "        WHERE id IN ('<dupe_id_1>', '<dupe_id_2>', ...);\n" +
    '  3. Re-run this pre-flight to confirm the inventory is clean.\n' +
    '  4. Apply migration 0020 (which ALSO performs the same cleanup inside its locked transaction\n' +
    '     — this manual step is a separation-of-concerns guardrail per FF #C / migration-plan §5.1).\n',
);
process.exit(2);

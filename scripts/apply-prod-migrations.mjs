// Apply all 17 migrations (0001..0017) to the kalori-prod Supabase
// project via the Supabase Management API `database/query` endpoint.
//
// Reads credentials from Planning/apikeys.txt (gitignored).
// Run: node scripts/apply-prod-migrations.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const KEYS_FILE = resolve(process.cwd(), 'Planning/apikeys.txt');
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const EXPECTED_PROD_REF = 'dryysypycsexvlbabtwq';

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
  console.error('Missing SUPABASE_PROJECT_REF or SUPABASE_PAT in Planning/apikeys.txt');
  process.exit(1);
}

if (PROJECT_REF !== EXPECTED_PROD_REF) {
  console.error(
    `Refusing to run: SUPABASE_PROJECT_REF=${PROJECT_REF} != expected prod ref ${EXPECTED_PROD_REF}`,
  );
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runQuery(sql, label) {
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
    throw new Error(`[${label}] HTTP ${res.status} — body: ${text.slice(0, 1500)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// Step 1 — sanity check: prod must be empty (0 tables in public)
console.log(`Target prod ref: ${PROJECT_REF}`);
console.log('Sanity check — counting public tables before apply...');
const sanity = await runQuery(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public';`,
  'sanity',
);
const tableCount = sanity.json[0]?.n ?? sanity.json?.[0]?.n ?? null;
console.log(`  public table count: ${tableCount}`);
if (tableCount === null) {
  console.error('Could not parse sanity-check response:', sanity.json);
  process.exit(1);
}
if (tableCount !== 0) {
  console.error(
    `STOP — prod is not empty (found ${tableCount} tables). Aborting to avoid double-apply.`,
  );
  process.exit(2);
}
console.log('OK — prod public schema is empty. Proceeding.');

// Step 2 — gather migration files in numeric order
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort(); // 0001_..., 0002_... lexical sort = numeric sort by zero-padded prefix

if (files.length === 0) {
  console.error('No migration files found in', MIGRATIONS_DIR);
  process.exit(1);
}

console.log(`\nApplying ${files.length} migration(s):`);

// Step 3 — apply each in sequence; fail-fast
let applied = 0;
for (const file of files) {
  const idx = applied + 1;
  const label = `[${idx}/${files.length}] ${file}`;
  process.stdout.write(`${label} ... `);
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  try {
    const { status } = await runQuery(sql, file);
    console.log(`OK (status ${status})`);
    applied += 1;
  } catch (err) {
    console.log('FAIL');
    console.error('  Error:', err.message);
    console.error(`\nStopped after applying ${applied}/${files.length} migration(s).`);
    console.error(`Failure at: ${file}`);
    process.exit(3);
  }
}

console.log(`\nAll ${applied}/${files.length} migrations applied successfully.`);

// Step 4 — post-apply verification
console.log('\nPost-apply verification:');

const checks = [
  {
    name: 'tables_in_public',
    sql: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`,
  },
  {
    name: 'functions_in_public',
    sql: `SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' ORDER BY routine_name;`,
  },
  {
    name: 'cascade_rpc_grants',
    sql: `SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_name IN ('delete_user_data','set_account_deleting') ORDER BY routine_name, grantee, privilege_type;`,
  },
  {
    name: 'profiles_columns',
    sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;`,
  },
  {
    name: 'rls_policy_count_per_table',
    sql: `SELECT tablename, COUNT(*)::int AS n FROM pg_policies WHERE schemaname='public' GROUP BY tablename ORDER BY tablename;`,
  },
  {
    name: 'storage_buckets',
    sql: `SELECT id, name, public FROM storage.buckets ORDER BY id;`,
  },
  {
    name: 'public_triggers',
    sql: `SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE event_object_schema='public' ORDER BY event_object_table, trigger_name;`,
  },
  {
    name: 'auth_users_vs_profiles',
    sql: `SELECT u.id, p.id AS profile_id FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;`,
  },
];

const results = {};
for (const c of checks) {
  try {
    const { json } = await runQuery(c.sql, c.name);
    results[c.name] = json;
    console.log(`  - ${c.name}: ${Array.isArray(json) ? `${json.length} row(s)` : 'OK'}`);
  } catch (err) {
    console.error(`  - ${c.name}: FAIL — ${err.message}`);
    results[c.name] = { error: err.message };
  }
}

// Print verification details
console.log('\n--- Verification details ---');
console.log('\nTables:', JSON.stringify(results.tables_in_public));
console.log('\nFunctions:', JSON.stringify(results.functions_in_public));
console.log('\nCascade RPC grants:', JSON.stringify(results.cascade_rpc_grants, null, 2));
console.log('\nProfiles columns:', JSON.stringify(results.profiles_columns, null, 2));
console.log('\nRLS policy counts:', JSON.stringify(results.rls_policy_count_per_table, null, 2));
console.log('\nStorage buckets:', JSON.stringify(results.storage_buckets, null, 2));
console.log('\nTriggers:', JSON.stringify(results.public_triggers, null, 2));
console.log(
  '\nAuth users vs profiles (orphan check):',
  JSON.stringify(results.auth_users_vs_profiles, null, 2),
);

// Step 5 — orphan backfill if needed
const usersVsProfiles = results.auth_users_vs_profiles;
let orphanBackfilled = false;
if (Array.isArray(usersVsProfiles)) {
  const orphans = usersVsProfiles.filter((r) => !r.profile_id);
  if (orphans.length > 0) {
    console.log(`\nFound ${orphans.length} orphaned auth user(s). Attempting backfill...`);
    try {
      await runQuery(
        `INSERT INTO public.profiles (id, onboarding_completed_at)
         SELECT id, NULL FROM auth.users
         WHERE id NOT IN (SELECT id FROM public.profiles);`,
        'orphan_backfill',
      );
      const recheck = await runQuery(
        `SELECT u.id, p.id AS profile_id FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id;`,
        'orphan_recheck',
      );
      const stillOrphan = recheck.json.filter((r) => !r.profile_id).length;
      if (stillOrphan === 0) {
        console.log(`  Backfill OK — 0 orphans remaining.`);
        orphanBackfilled = true;
      } else {
        console.error(`  Backfill INCOMPLETE — ${stillOrphan} still orphaned.`);
        process.exit(4);
      }
    } catch (err) {
      console.error(`  Backfill FAILED — ${err.message}`);
      process.exit(4);
    }
  } else {
    console.log('\nNo orphan auth users — all have profiles rows.');
    orphanBackfilled = true;
  }
}

// R1 firewall hard-check
const grants = Array.isArray(results.cascade_rpc_grants) ? results.cascade_rpc_grants : [];
const badGrantees = ['authenticated', 'public', 'anon', 'PUBLIC'];
const badGrants = grants.filter(
  (g) => badGrantees.includes(g.grantee) && g.privilege_type === 'EXECUTE',
);

console.log('\n--- R1 firewall check ---');
if (badGrants.length > 0) {
  console.error('FAIL — bad grants on cascade RPCs:', badGrants);
  process.exit(5);
} else {
  console.log(
    'OK — no authenticated/public/anon EXECUTE on delete_user_data/set_account_deleting.',
  );
}

console.log('\nDone. Prod schema applied + verified.');
process.exit(0);

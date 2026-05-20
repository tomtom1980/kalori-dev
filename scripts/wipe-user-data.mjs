#!/usr/bin/env node
/**
 * Destructive script: wipe all user-generated data from a Kalori Supabase project,
 * keeping ONLY auth.users + public.profiles.
 *
 * Reason: clean-slate operations (e.g. post-feature reset for fresh re-test, dev
 * environment reseeding) on prod OR dev. Same script, target-gated.
 *
 * Safety:
 *   - Explicit --target prod|dev flag required (whitelisted in code)
 *   - SUPABASE_PROJECT_REF env var must match the target's expected ref
 *   - --confirm flag required
 *   - Pre-flight + post-flight row counts via Management API
 *   - Runs as service-role (`postgres` user) via Management API SQL endpoint;
 *     RLS is bypassed and TRUNCATE handles FK cascades.
 *
 * Required env vars:
 *   SUPABASE_PROJECT_REF  (must equal ALLOWED_TARGETS[--target])
 *   SUPABASE_PAT          (sbp_... management API token)
 *   SUPABASE_SECRET_KEY   (sb_secret_... — for Storage REST calls)
 *
 * Usage:
 *   node scripts/wipe-user-data.mjs --target prod --confirm
 *   node scripts/wipe-user-data.mjs --target dev  --confirm
 */

const ALLOWED_TARGETS = {
  prod: 'dryysypycsexvlbabtwq',
  dev: 'aaiohznsqlqchsoxaqkz',
};

const TARGET_TABLES = [
  'public.food_entries',
  'public.food_library_items',
  'public.weight_log',
  'public.water_log',
  'public.weekly_reviews',
  'public.ai_response_cache',
  'public.ai_call_log',
];

const PROTECTED_TABLES = ['auth.users', 'public.profiles'];

const STORAGE_BUCKET = 'food-thumbnails';

// ---------- argv parsing ----------

function parseFlag(name) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  // boolean flag (no value or next is another flag)
  if (next === undefined || next.startsWith('--')) return true;
  return next;
}

const target = parseFlag('target');

// ---------- guards ----------

if (typeof target !== 'string' || !ALLOWED_TARGETS[target]) {
  console.error(
    `Refusing to run: --target must be one of ${Object.keys(ALLOWED_TARGETS).join(', ')}. Got: ${target ?? '<unset>'}`,
  );
  process.exit(1);
}

const expectedRef = ALLOWED_TARGETS[target];

if (process.env.SUPABASE_PROJECT_REF !== expectedRef) {
  console.error(
    `Refusing to run: SUPABASE_PROJECT_REF (${process.env.SUPABASE_PROJECT_REF ?? '<unset>'}) does not match --target=${target} (expected ${expectedRef}).`,
  );
  process.exit(1);
}

if (!process.argv.includes('--confirm')) {
  console.error(
    'Refusing to run: pass --confirm to acknowledge this is a destructive, irreversible operation.',
  );
  process.exit(1);
}

const PAT = process.env.SUPABASE_PAT;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!PAT) {
  console.error('Missing SUPABASE_PAT env var.');
  process.exit(1);
}
if (!SECRET) {
  console.error('Missing SUPABASE_SECRET_KEY env var.');
  process.exit(1);
}

// ---------- helpers ----------

const PROJECT_REF = expectedRef;
const SQL_ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
const SUPABASE_HOST = `https://${PROJECT_REF}.supabase.co`;

async function runSQL(query) {
  const res = await fetch(SQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function countSQL(tables) {
  return tables
    .map((t) => `SELECT '${t}' AS table_name, COUNT(*) AS n FROM ${t}`)
    .join(' UNION ALL ');
}

function storageHeaders() {
  return {
    // New-format sb_secret_* keys require `apikey` header for Storage REST API
    Authorization: `Bearer ${SECRET}`,
    apikey: SECRET,
    'Content-Type': 'application/json',
  };
}

async function listStoragePrefixes(bucket, prefix) {
  const res = await fetch(`${SUPABASE_HOST}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: storageHeaders(),
    body: JSON.stringify({
      prefix,
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Storage list ${res.status}: ${t}`);
  }
  return await res.json();
}

async function deleteStorageObjects(bucket, paths) {
  if (paths.length === 0) return 0;
  // Supabase bulk delete: DELETE /storage/v1/object/<bucket> with { prefixes: [...] }
  const res = await fetch(`${SUPABASE_HOST}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: storageHeaders(),
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Storage delete ${res.status}: ${t}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json.length : paths.length;
}

// ---------- main ----------

async function main() {
  console.log(`\n=== kalori-${target} data wipe (${PROJECT_REF}) ===\n`);

  // Guard query
  const guard = await runSQL(`SELECT current_database() AS db, current_user AS usr;`);
  console.log('Guard query:', JSON.stringify(guard));
  const g = Array.isArray(guard) ? guard[0] : guard;
  if (g.db !== 'postgres') {
    throw new Error(`Unexpected database: ${g.db}`);
  }

  // Pre-flight counts
  console.log('\n-- Pre-flight counts --');
  const preTargets = await runSQL(countSQL(TARGET_TABLES));
  console.log('Target tables:');
  for (const row of preTargets) console.log(`  ${row.table_name.padEnd(30)} ${row.n}`);
  const preProtected = await runSQL(countSQL(PROTECTED_TABLES));
  console.log('Protected tables (MUST be preserved):');
  for (const row of preProtected) console.log(`  ${row.table_name.padEnd(30)} ${row.n}`);

  // Recursive enumerate folders for Storage (Supabase Storage list returns one level)
  console.log('\n-- Listing Storage objects --');
  // Walk recursively: list each user-folder under the bucket.
  async function walk(prefix) {
    const items = await listStoragePrefixes(STORAGE_BUCKET, prefix);
    const found = [];
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null || it.metadata === null) {
        // It's a folder placeholder — recurse
        const sub = await walk(full);
        found.push(...sub);
      } else {
        found.push(full);
      }
    }
    return found;
  }
  const storageObjects = await walk('');
  console.log(`Found ${storageObjects.length} storage object(s)`);

  // TRUNCATE
  console.log('\n-- TRUNCATE --');
  const truncSQL = `TRUNCATE TABLE ${TARGET_TABLES.join(', ')} CASCADE;`;
  try {
    await runSQL(truncSQL);
    console.log('TRUNCATE succeeded.');
  } catch (err) {
    console.error('TRUNCATE failed, falling back to ordered DELETEs:', err.message);
    // weekly_reviews first (FK to users), then the rest
    const ORDERED_DELETE = [
      'public.weekly_reviews',
      'public.food_entries',
      'public.food_library_items',
      'public.weight_log',
      'public.water_log',
      'public.ai_response_cache',
      'public.ai_call_log',
    ];
    for (const t of ORDERED_DELETE) {
      console.log(`  DELETE FROM ${t}`);
      await runSQL(`DELETE FROM ${t};`);
    }
    console.log('Ordered DELETEs complete.');
  }

  // Delete Storage objects
  if (storageObjects.length > 0) {
    console.log('\n-- Deleting Storage objects --');
    // Batch in 100s for safety
    let deletedTotal = 0;
    for (let i = 0; i < storageObjects.length; i += 100) {
      const batch = storageObjects.slice(i, i + 100);
      const d = await deleteStorageObjects(STORAGE_BUCKET, batch);
      deletedTotal += d;
      console.log(`  Deleted batch ${i}–${i + batch.length - 1}`);
    }
    console.log(`Deleted ${deletedTotal} storage object(s).`);
  } else {
    console.log('\n-- Storage --  No objects to delete; bucket is empty.');
  }

  // Post-flight counts
  console.log('\n-- Post-flight counts --');
  const postTargets = await runSQL(countSQL(TARGET_TABLES));
  console.log('Target tables (should all be 0):');
  let nonZero = 0;
  for (const row of postTargets) {
    console.log(`  ${row.table_name.padEnd(30)} ${row.n}`);
    if (Number(row.n) !== 0) nonZero++;
  }
  const postProtected = await runSQL(countSQL(PROTECTED_TABLES));
  console.log('Protected tables (must match pre-flight):');
  for (const row of postProtected) console.log(`  ${row.table_name.padEnd(30)} ${row.n}`);

  if (nonZero > 0) {
    throw new Error(`${nonZero} target table(s) still have rows after wipe.`);
  }

  // Post-flight storage
  const storageAfter = await walk('');
  console.log(`\nStorage objects remaining: ${storageAfter.length}`);

  // Verify protected counts unchanged
  const preMap = new Map(preProtected.map((r) => [r.table_name, Number(r.n)]));
  const postMap = new Map(postProtected.map((r) => [r.table_name, Number(r.n)]));
  for (const t of PROTECTED_TABLES) {
    if (preMap.get(t) !== postMap.get(t)) {
      throw new Error(`Protected table ${t} count changed: ${preMap.get(t)} → ${postMap.get(t)}`);
    }
  }

  console.log(`\n=== kalori-${target} wipe complete. Protected tables preserved. ===\n`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});

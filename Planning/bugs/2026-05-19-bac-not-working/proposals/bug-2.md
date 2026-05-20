# Bug 2: Alcohol persistence (API + DB)

## Classification

NO_BUG_FOUND

The alcohol persistence surface (DB schema + RLS + indexes + FK cascade + `/api/entries/save` POST handler + `calculateAlcoholGrams` math) is correct on both `kalori-prod` and `kalori-dev`. End-to-end persistence has been observed working in production TWICE today (2026-05-19 05:12 and 05:14 UTC), including via the `source: library` re-log path. Whatever the user is observing as "doesn't work" is not in the persistence layer. Two alternative explanations are consistent with the evidence; both belong to the UI/visibility surface (Bug 1 / Bug 3, not this bug).

## Root Cause

No persistence bug exists. The server route, schema, RLS, and helper are correct. Likely real causes (out of scope for this bug, hand to Bug 1 / Bug 3):

1. User logged drinks WITHOUT toggling the per-drink alcohol checkbox in `Confirmation.AlcoholControls`. The DB confirms 12 drink entries in prod but only the 2 most-recent drinks (logged Today after deploy) carry alcohol metadata; the older drinks (Whiskey, beer, Mai Tai on May 16-18) have NO alcohol_logs rows because the toggle defaulted to `isAlcoholic: false` (`defaultAlcoholState()` at `ConfirmationScreen.tsx:194-196`). This is by design — UI requires explicit opt-in per drink.
2. Even when the row WAS persisted, the BAC widget on the dashboard may not surface a value if (a) profile weight is missing, (b) `bio_sex` is not `male|female`, (c) the 72h asOf window misaligns with the user's expected viewing day, or (d) the calculation correctly returned zero because `consumed_at > asOf`. Those are dashboard concerns (Bug 3 territory).

## Proposed Change (Diff Outline)

- None to the API or DB.
- No change to `app/api/entries/save/route.ts`.
- No change to `supabase/migrations/0026_bac_alcohol_tracking.sql`.
- No change to `lib/alcohol/bac.ts`.
- No change to `lib/database.types.ts`.

If desired (separate scope; defer or do as a UX nudge):

- Optionally surface a stronger UI affordance in `Confirmation.AlcoholControls` so users do not silently skip toggling the alcohol switch (e.g. inline reminder when `state.meal === 'drink'` and `!state.alcohol.isAlcoholic` and the first item's name matches a known-alcohol vocabulary). This is a UI nudge, NOT a persistence fix, and belongs to Bug 1 if anywhere.

## Files Affected

None for this bug.

For reference (read-only verification surface):

- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\supabase\migrations\0026_bac_alcohol_tracking.sql`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\api\entries\save\route.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\alcohol\bac.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\lib\database.types.ts`
- `c:\Users\tamas\Documents\AI projects\Calorie tracker webapp\app\(app)\log\_components\ConfirmationScreen.tsx`

## TDD Required

no — no behavior change. Existing tests (`tests/integration/entries-save-alcohol*.test.ts` per the progress.md "BAC idempotency integration regression: 1 file / 2 tests passed") already cover the persistence contract. Production-row observation supplements the test evidence.

## Test Approach

No new tests. If Bug 1 or Bug 3 owns a UI nudge for the alcohol toggle, that bug's branch will add the relevant component test.

## Risk Assessment

low — no change shipped. If Bug 1/3 lands a UI nudge later, its risk is local to the Confirmation surface.

## Regression Sweep Needed

none.

## UI Touching

false

## Open Questions

- Has the user confirmed (in a screenshot / DM) that they DID toggle the alcohol checkbox for the drinks they expected to see BAC for? If yes, request the entry IDs so we can verify whether (a) the row was inserted server-side and the dashboard simply didn't surface it (→ Bug 3) or (b) the body.alcohol payload never reached the server (→ Bug 1 client-side wiring). The 5/19 05:12 and 05:14 rows prove the wiring works at least sometimes; the question is whether the user reproduces the failure with the checkbox confirmed-on.
- Does the production user have `current_weight_kg` and `bio_sex` set on `profiles`? Without those, `calculateBac` returns 0 regardless of how many alcohol_logs rows exist (`lib/alcohol/bac.ts:43-47`). This is a Bug 3 question, not a Bug 2 question, but the answer determines whether the user-visible symptom is "no BAC widget value" vs "no row in DB".

## Evidence

### Schema is correct on prod (`dryysypycsexvlbabtwq`)

Production query results (verbatim):

```
columns: id uuid NOT NULL, user_id uuid NOT NULL, entry_id uuid NOT NULL,
         volume_ml numeric NOT NULL, abv_percent numeric NOT NULL,
         alcohol_grams numeric NOT NULL, consumed_at timestamptz NOT NULL,
         created_at timestamptz NOT NULL  (8 columns, matches migration exactly)

policies: alcohol_logs_delete_own (DELETE qual: auth.uid()=user_id)
          alcohol_logs_insert_own (INSERT with_check: auth.uid()=user_id)
          alcohol_logs_select_own (SELECT qual: auth.uid()=user_id)
          alcohol_logs_update_own (UPDATE qual+check: auth.uid()=user_id)

indexes:  alcohol_logs_entry_id_unique  (UNIQUE on entry_id)
          alcohol_logs_pkey             (PK on id)
          alcohol_logs_user_consumed_at_idx (BTREE on user_id, consumed_at DESC)

constraints: alcohol_logs_volume_ml_check  CHECK (volume_ml > 0 AND <= 5000)
             alcohol_logs_abv_percent_check CHECK (abv_percent > 0 AND <= 100)
             alcohol_logs_alcohol_grams_check CHECK (alcohol_grams > 0)
             alcohol_logs_entry_owner_fk  FK (entry_id, user_id) → food_entries(id, user_id) ON DELETE CASCADE
             alcohol_logs_user_id_fkey    FK (user_id) → auth.users(id) ON DELETE CASCADE
             alcohol_logs_pkey            PK (id)

food_entries_id_user_id_unique constraint: EXISTS in prod (required for composite FK)
```

### `/api/entries/save` correctly persists alcohol metadata

`app/api/entries/save/route.ts:120-128` (Zod schema accepts top-level `alcohol`):

```ts
alcohol: z
  .object({
    volume_ml: z.number().positive().max(5000),
    abv_percent: z.number().positive().max(100),
  })
  .strict()
  .optional(),
```

`app/api/entries/save/route.ts:158-160` (category guard — rejects alcohol on non-drink saves):

```ts
if (body.alcohol && body.meal_category !== 'drink') {
  return NextResponse.json({ error: 'alcohol_requires_drink_category' }, { status: 400 });
}
```

`app/api/entries/save/route.ts:162-209` (`ensureAlcoholLogForEntry` helper):

- Short-circuits to `null` (no insert) when there is no `body.alcohol` OR when the entry's category is not 'drink' (line 166)
- Probes for an existing alcohol_logs row by `entry_id` (idempotent — the unique index also enforces this) (lines 173-188)
- Inserts when absent, using server-computed `alcohol_grams = volume_ml × (abv_percent/100) × 0.789` via `calculateAlcoholGrams` (lines 190-200)
- On insert error, Sentry-captures with `phase: 'alcohol_insert'` tag and returns 500 (`db_error`) — does NOT silently swallow (lines 201-207)

The helper is invoked at all three save paths:

- Idempotency replay (line 297): backfills alcohol_log on a replay if missing (correct — old entries don't get duplicated thanks to the unique index, but new alcohol metadata on a replay can still land)
- 23505 race-replay (line 399): same backfill behavior
- Fresh-insert (line 413-422): primary path; on alcohol failure, the entry is compensating-deleted to maintain atomic "no orphan drink entries without their alcohol log" semantics

### Math is correct (`lib/alcohol/bac.ts:27-29`)

```ts
const ETHANOL_DENSITY_G_PER_ML = 0.789;
export function calculateAlcoholGrams(volumeMl: number, abvPercent: number): number {
  return Number((volumeMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML).toFixed(3));
}
```

Cross-checked against persisted row: 355 mL × (5 / 100) × 0.789 = 14.00475 → rounded(3) = **14.005**. Matches both prod rows exactly.

### Database types are in sync (`lib/database.types.ts:20-60`)

`alcohol_logs` Row/Insert/Update types are present, with relationship to `food_entries`. File header notes regeneration ran through migration `0026_bac_alcohol_tracking.sql`.

### Production rows confirm persistence works end-to-end

Joined query (verbatim):

```
entry_id 2f08e348… food=beer    source=text     355 mL 5%  14.005 g  consumed 2026-05-19 05:12:00 UTC
entry_id 4ddc8185… food=beer    source=library  355 mL 5%  14.005 g  consumed 2026-05-19 05:13:39 UTC
```

Both rows landed Today after the BAC deploy. The second row's `source=library` proves the re-log-from-library path persists alcohol metadata when the user toggles the checkbox.

12 drink entries exist in prod, only 2 have alcohol_logs — the other 10 (older entries from May 16-18, including "Whiskey", "Mai Tai", and earlier "beer") have no rows because the user did NOT toggle the alcohol checkbox at log time (toggle defaults to OFF per `defaultAlcoholState()` at `ConfirmationScreen.tsx:194-196`). This is the expected UI contract, not a bug in the persistence layer.

### Production deployment is on the BAC-included commit

Vercel production deployment `dpl_7ftfHLT6o4C4agLW5TKU8AyJGBjo` (Ready, PROMOTED) is on commit `eb8d099`, which is a descendant of the BAC commit `9ae4e98`. Both `route.ts` (with the alcohol logic) and migration 0026 are live.

## Production schema verification

| Project | alcohol_logs exists? | Columns | RLS policies | Indexes |
|---|---|---|---|---|
| kalori-prod (`dryysypycsexvlbabtwq`) | YES | 8 (id, user_id, entry_id, volume_ml, abv_percent, alcohol_grams, consumed_at, created_at) | 4 (select/insert/update/delete own) | 3 (pkey, entry_id_unique, user_consumed_at_idx) |
| kalori-dev (`aaiohznsqlqchsoxaqkz`) | YES | 8 | 4 | 3 |

Both projects have IDENTICAL schema. Migration 0026 is fully applied to both, and the BAC deployment is the active production deployment.

**No production-schema infra escalation needed.**

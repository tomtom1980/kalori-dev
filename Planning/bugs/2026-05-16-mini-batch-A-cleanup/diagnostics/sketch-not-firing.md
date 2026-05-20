# Diagnostic — Sketch-not-firing on new library items

**Date:** 2026-05-16
**Investigator:** diagnostic sub-agent (bugfix-tomi mini-batch A cleanup)
**Question:** Are newly-created library items in PROD getting Nano Banana sketch thumbnails after Bug 5 deploy?
**Headline finding:** **PIPELINE IS WORKING.** The two newest items in PROD have successfully generated sketches. The reported "no thumbnails" issue is either (a) limited to OLDER pre-deploy items, (b) a stale client cache on the user's PWA, or (c) the user mis-identified which items they were looking at.

---

## Evidence collected

### 1. DB state — recent library items (PROD `dryysypycsexvlbabtwq`)

Queried `food_library_items` for the last 48 hours, ordered `created_at desc`:

| created_at (UTC) | display_name | created_from | thumbnail_kind | sketch_generated_at | sketch_attempt_count | sketch_last_error |
|---|---|---|---|---|---|---|
| 2026-05-16 04:29:52 | Pho Ga | text | **sketch** | 2026-05-16 04:30:02 | 1 | null |
| 2026-05-16 04:14:31 | pho bo | manual | **sketch** | 2026-05-16 04:14:39 | 1 | null |
| 2026-05-15 05:36:17 | banana | text | null | null | 0 | null |
| 2026-05-14 17:08:01 | fried fish | text | null | null | 0 | null |
| 2026-05-14 17:07:14 | fish | text | null | null | 0 | null |
| 2026-05-14 17:06:14 | oyster | text | null | null | 0 | null |
| 2026-05-14 17:05:38 | egg | text | null | null | 0 | null |
| 2026-05-14 17:04:06 | watermelon | text | null | null | 0 | null |
| 2026-05-14 17:03:01 | watermelon | text | null | null | 0 | null |
| 2026-05-14 16:56:54 | Orange | text | null | null | 0 | null |
| 2026-05-14 16:56:02 | Omelette | text | null | null | 0 | null |
| 2026-05-14 16:53:36 | watermelon | text | null | null | 0 | null |

**Key reading of the table:**
- **2026-05-16 items** (created TODAY, after deploy `1d0d04f` landed): BOTH have `thumbnail_kind='sketch'`, `sketch_generated_at` populated within ~8-10s of `created_at`, `sketch_attempt_count=1`, `sketch_last_error=null`. The pipeline ran, claimed the slot, called Gemini, uploaded the WEBP, and wrote the path back. End-to-end success.
- **2026-05-14 / 2026-05-15 items** (created BEFORE deploy): all `thumbnail_kind=null`, `sketch_attempt_count=0`, no error. Per `lib/library/sketch-pipeline.ts` semantics, that's "pipeline never tried to run" — which is correct for items created before the after() hook existed. They are eligible for backfill but were never enqueued.

This perfectly matches the per-row state model documented in `sketch-pipeline.ts:7-30`.

### 2. Vercel env state — Production scope

`vercel env ls production` returned the following relevant entries (presence-only, no values):

| Variable | Present? | Verdict |
|---|---|---|
| `GEMINI_API_KEY` | **Yes** | Pipeline can authenticate against Gemini |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | OK |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | OK |
| `SUPABASE_SECRET_KEY` | Yes | OK |
| `KALORI_ENV` | Yes | OK |
| `KALORI_SKETCH_DISABLED` | **Absent** | Kill-switch NOT engaged |
| `KALORI_SKETCH_FIXTURE_BASE64` | **Absent** | Live API path, not fixture short-circuit |

Pipeline is configured correctly for live Gemini calls in Production.

### 3. Vercel deployment state — `kalori-one.vercel.app`

```
deployment id:  dpl_4JDV4stPgPvLGaCMSjMwtw4DehfV
project:        prj_MUe9UgXliFJzK6rjNusHcZjNJvQp (kalori)
team:           tamasszalay-2846 (Hobby)
target:         production
status:         READY
git sha:        1d0d04f76f769109f482620d67b153a3dee7adc9  ← exact match for `1d0d04f`
git ref:        main
created:        2026-05-16 04:08:00 UTC  (46m before diag run)
regions:        iad1
```

Production is on the head of `main` and includes Bug 5 (commit `8cf1c86`) + docs follow-up `1d0d04f`. Build is green (`READY`).

### 4. Function logs

Not pulled — Vercel CLI `vercel inspect --logs` requires a deployment-id arg and dumps build logs only, not runtime logs (only first line was visible: `"Running build in Washington, D.C., USA (East) – iad1"`). The DB evidence is sufficient to answer the question without needing runtime logs.

### 5. Code path spot-check

Confirmed unchanged since `1d0d04f`:
- `app/api/library/create/route.ts:160-164` — `enqueueSketchGeneration({ libraryItemId: data.id, userId, displayName })` is called on every successful manual-create INSERT.
- `app/api/entries/save/route.ts:32, 583-597` — `enqueueSketchGeneration({...})` is called for both `text` and `photo` source rows when a new library item is inserted via save_to_library.
- `lib/library/sketch-enqueue.ts:50-69` — `after()` from `next/server` schedules the pipeline. Test/disabled short-circuits both check for `NODE_ENV==='test'` or `KALORI_SKETCH_DISABLED==='1'`, neither of which apply in PROD.
- `lib/library/sketch-pipeline.ts:223-360` — single-row pipeline. CAS-protected. Records `sketch_last_error` on failure. No commits modify this path after `8cf1c86`.

The trigger chain is intact.

---

## Hypothesis ranking

### Hypothesis 1 (HIGHEST CONFIDENCE) — pipeline IS firing and DID succeed. User saw stale data.

**Evidence:**
- Last 2 items created today in PROD both have `thumbnail_kind='sketch'` + `sketch_generated_at` populated within ~10s of `created_at`.
- Server-side path is intact and deployed (sha match).
- Gemini key + storage are configured.

**Likely user-visible explanation paths:**
- PWA service worker cache served the `/library` page from before the sketches finished generating. The library list rendered without the thumbnails because at `created_at + 0s` the URL is `null`; sketches finish 5-10s later but the UI didn't re-fetch.
- User refreshed the page but the thumbnail signing endpoint (`lib/storage/sign-thumbnail.ts`) returned an error / 401 / 404, leaving the letter-mark fallback visible despite `thumbnail_url` being set on the row.
- User was looking at OLDER items (2026-05-14 / 2026-05-15) that legitimately have no sketches — pipeline never ran for them. These are eligible for the manual backfill via `/api/library/sketch/generate`.

### Hypothesis 2 (LOWER CONFIDENCE) — sign-on-read endpoint is the actual failure point.

**Evidence requested but not yet checked:**
- Is `lib/storage/sign-thumbnail.ts` returning the signed URL correctly for these new sketches?
- Is the library UI calling it with the right `thumbnail_url` path?
- Is RLS on `food-thumbnails` storage bucket allowing signed-URL creation for the row owner?

This is the next-most-likely "no thumbnail visible" path if the user truly sees missing thumbnails on the two Pho Ga / pho bo rows. Worth a follow-up before declaring closed.

### Hypothesis 3 (LOWEST CONFIDENCE) — historical backfill is what the user expected.

If the user manually created the 2026-05-14 items expecting backfill to retroactively sketch them, they may have been disappointed. The pipeline by design does NOT auto-backfill on read — only via the explicit `/api/library/sketch/generate` route. The mini-batch A `sketch-pipeline.ts` touches won't change that behavior (per `state.md`, Cluster B is about something else).

---

## Recommended fix

**No code fix required server-side.** The pipeline IS working.

**For the user:**
1. Hard refresh `/library` in their browser (`Cmd+Shift+R` / `Ctrl+Shift+R`) to clear the PWA cache and re-fetch the rows. They should see Pho Ga and pho bo with sketches.
2. If thumbnails STILL don't render on those two items after hard refresh, that's a separate **sign-on-read** bug — NOT a generation bug. Open a follow-up to diagnose `lib/storage/sign-thumbnail.ts`.
3. For the 2026-05-14 / 05-15 items (`banana`, `fried fish`, `fish`, `oyster`, `egg`, `watermelon` x3, `Orange`, `Omelette`), those legitimately have no sketch and need the manual backfill flow (whatever UI affordance the design exposes for it). They are NOT regressions from Bug 5 — they predate the deploy.

---

## What I couldn't check

- **Runtime function logs.** `vercel inspect --logs` returns build logs only; runtime logs need the Vercel dashboard (Logs tab on the deployment) or `vercel logs <url>` which the user may need to run interactively.
- **Sign-on-read path.** Did not verify `lib/storage/sign-thumbnail.ts` returns a valid signed URL for the two successful rows. That's Hypothesis 2's territory and worth a follow-up if the user's report is "I see the rows in the list but thumbnails are still blank for items created today."
- **Did the user actually use `Pho Ga` / `pho bo`?** The DB shows those two items for `user_id d7b19583-798b-4350-9290-3606f2405804`. If the user's report is about a DIFFERENT account's items, we'd need their user_id to re-scope the query.
- **Which user_id reported the issue.** Diagnostic ran across all users in the last 48 hours. If the user has multiple accounts or the report mentions a specific item by name, narrow scope and re-run.

---

## Files modified by this diagnostic

- Created: `Planning/.tmp/bugfix-2026-05-16-mini-batch-A-cleanup/diagnostics/diag-library-sketch-state.mjs` — read-only diagnostic query script (DELETE-AFTER-USE or keep for future runs; lives under `.tmp` which is project-tmp).
- Created: `Planning/.tmp/bugfix-2026-05-16-mini-batch-A-cleanup/diagnostics/sketch-not-firing.md` — this file.

No production code changed. No migrations applied. No env vars modified.

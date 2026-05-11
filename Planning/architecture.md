# Kalori — Technical Architecture

> **Canonical technical architecture document.** Full Supabase DDL (8 tables), Row-Level Security policies, Storage bucket policies, Next.js 16 folder structure with route groups, API route map, `lib/cache/tags.ts` typed constants, production-ready Route Handler patterns, Gemini prompt storage conventions, ESLint invariant-enforcement rules, `client_id` idempotency contract, PWA + offline outbox architecture, and Sentry observability. Every invariant I1–I12 is cross-linked to its architecture decision via a reverse-index table.
>
> **Source authorities:**
> - `Planning/design-doc.md` §5 (Data Model), §6 (Auth + RLS), §7 (AI Integration), §11 (State), §14 (PWA), §16 (Observability), §18 (Failure modes F1–F12), §19 (Invariants I1–I12)
> - `Planning/tasks.md` — file layout aggregated from all 26 tasks
> - `Planning/PRD.md` — feature list and technical constraints
> - `Planning/kalori-project-blueprint.md` §8 (Technical Preferences)
> - `Planning/brainstorm-context/03-pre-artifacts.md` — pre-artifact reconciliation (8 tables vs 7)

---

## 1. System Overview

### 1.1 Topology

```
+-------------------------------+
|  User (PWA, dark-only, 375+)  |
|  installable iOS/Android/Web  |
+---------------+---------------+
                |
                | HTTPS (HTTP/2)
                v
+-------------------------------+
|  Vercel Edge / Node Runtime   |
|  Next.js 16 (App Router)      |
|  - Cache Components + PPR     |
|  - Middleware (auth refresh)  |
|  - Route Handlers             |
|  - @serwist/next SW scope     |
+---------------+---------------+
                |
    +-----------+-----------+-------------------------------+
    |                       |                               |
    v                       v                               v
+--------------------+  +------------------+  +---------------------------+
| Supabase Cloud     |  | Google Gemini    |  | Sentry (errors-only)      |
|  - Auth (magic +   |  |  gemini-flash-   |  |  - client + server SDK    |
|    Google OAuth)   |  |  latest (SDK:    |  |  - PII scrub before send  |
|  - Postgres + RLS  |  |  @google/genai)  |  |  - release tag from       |
|  - Storage (food-  |  |  Server-only via |  |    Vercel env             |
|    thumbnails, NOT |  |  /api/ai/** keys |  |                           |
|    public)         |  |                  |  |                           |
+--------------------+  +------------------+  +---------------------------+
```

**Deployment:** Vercel (frontend + Route Handlers) + Supabase cloud (DB + Auth + Storage). No custom infrastructure, no staging environment. Dev → PR Preview (auto) → Production (on `main` merge).

### 1.2 Request-Path Flow (read)

```
Client component
  └─> Server Component read
        └─> Supabase SDK (anon key, SSR cookie session)
              └─> Postgres (RLS gates every SELECT to auth.uid() = user_id)
                    └─> row set returned → Server Component renders HTML
  (Cache Components: `use cache` boundary with cacheLife + cacheTag wraps the fetch;
   dashboard first paint ships static shell, dynamic island streams in via PPR Suspense)
```

### 1.3 AI-Path Flow (write + AI)

```
Client: user types text OR captures photo
  └─> POST /api/ai/text-parse  (or /vision, /weekly-review)
        └─> withAuth() middleware wrapper (F12 401 interceptor is client-side)
        └─> lib/ai/sanitize.ts strips role-control tokens (F11)
        └─> lib/ai/cache.ts: SHA-256 hash of normalized input + user_id → lookup ai_response_cache
              ├─> HIT: parsed_payload returned; lib/ai/cost-log.ts records cached=true row
              └─> MISS: lib/ai/client.ts calls Gemini (parts-array, role-separated — F11)
                        └─> @google/genai SDK → gemini-flash-latest
                        └─> Zod validates ParseResult shape (I10); reasoning capped 500 chars (F11)
                        └─> INSERT into ai_response_cache (30-day TTL)
                        └─> lib/ai/cost-log.ts inserts ai_call_log row (failure-tolerant — I2)
              └─> Route returns parsed payload to client
Client: shows confirmation screen → user confirms
  └─> POST /api/entries/save { client_id: uuid, items, logged_at, ... }
        └─> Server SELECT on client_id → if exists, return 200 + existing row (I11 no-op replay)
        └─> INSERT food_entries (RLS with check (auth.uid() = user_id))
        └─> updateTag(TAGS.userEntries(uid, day)); updateTag(TAGS.userLibrary(uid)) (I12)
        └─> return 200 + new row
```

### 1.4 Auth Flow (session + F12 refresh)

```
Every request
  └─> middleware.ts (Next.js Edge)
        └─> @supabase/ssr reads session cookie; refreshes if near-expiry
        └─> Routes except /, /login, /auth/callback, /api/auth/* require session
  (Unauthenticated hit on protected route → 307 redirect to /login)

Mid-request session expiry (F12)
  └─> Server returns 401
        └─> Client-side fetch wrapper lib/auth/refresh-interceptor.ts catches 401
              └─> calls @supabase/ssr refreshSession() once
                    ├─> OK: retry the original request (same client_id preserves idempotency)
                    └─> refresh fails: sign user out + redirect to /login

Cross-tab sign-out (F12 companion)
  └─> BroadcastChannel('kalori-auth') in lib/auth/cross-tab-signout.ts
        └─> any tab's sign-out broadcasts → all tabs listen → full local sign-out
```

### 1.5 PWA + Offline Flow (I11 replay safety net)

```
Offline mutation (library-based log, weight, water)
  └─> Client generates client_id = crypto.randomUUID() BEFORE optimistic UI update
  └─> Mutation fails to reach network
        └─> lib/offline/outbox.ts appends { client_id, endpoint, payload } to IDB outbox
        └─> UI shows optimistic state + offline badge
        
Reconnect (window 'online' event OR visibilitychange → online)
  └─> outbox.flush() reads queue FIFO
        └─> for each row: POST to endpoint with ORIGINAL client_id (NEVER regenerated)
              ├─> server: SELECT client_id → if present, 200 + existing row (I11)
              └─> server: not present, INSERT and return 200
        └─> on 200, remove row from IDB outbox
        └─> on network fail, keep row; retry on next online event
```

---

## 2. Full Supabase DDL

**8 user-visible tables.** `profiles` + 5 user-write tables + 2 service-role tables + `weekly_reviews`. All user-owned tables have `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` unless noted. All timestamps `timestamptz` in UTC.

### 2.1 Extensions

```sql
-- supabase/migrations/0001_init.sql
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
```

### 2.2 Table: `profiles`

```sql
-- supabase/migrations/0002_profiles.sql
create table public.profiles (
  id                         uuid primary key references auth.users(id) on delete cascade,
  -- bio
  bio_sex                    text not null check (bio_sex in ('male','female','other')),
  age                        int  not null check (age between 13 and 120),
  height_cm                  numeric(5,1) not null check (height_cm between 100 and 250),
  current_weight_kg          numeric(5,2) not null check (current_weight_kg between 30 and 350),
  goal_weight_kg             numeric(5,2) check (goal_weight_kg between 30 and 350),
  activity_level             text not null check (activity_level in (
                                 'sedentary','light','moderate','active','very_active'
                               )),
  region                     text,                      -- free text ISO-ish region tag
  dietary_prefs              text[] not null default '{}',
  allergens                  text[] not null default '{}',
  unit_pref                  text not null default 'metric' check (unit_pref in ('metric','imperial')),
  goal_pace                  text check (goal_pace in ('slow','moderate','fast')),
  timezone                   text not null default 'UTC',
  -- derived nutrition state
  bmr                        numeric(7,2),
  tdee                       numeric(7,2),
  calorie_target             numeric(7,2),
  target_mode                text not null default 'auto' check (target_mode in ('auto','manual')),
  manual_override_value      numeric(7,2),
  -- recalc observability (Task 4.3b)
  recalc_threshold_pct       numeric not null default 2.0,
  last_target_recalc_at      timestamptz,
  last_dashboard_visit_at    timestamptz,
  -- lifecycle
  onboarding_completed_at    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- auto-insert profile row on auth.users insert
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, bio_sex, age, height_cm, current_weight_kg, activity_level)
  values (new.id, 'other', 30, 170, 70, 'moderate');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
```

**Notes:** `id` IS the `user_id` (1:1 with `auth.users`). `recalc_threshold_pct`, `last_target_recalc_at`, `last_dashboard_visit_at` are owned by Task 4.3b (weight-recalc pipeline). Defaults on the trigger are overwritten during onboarding (Step 1 → Step 8).

### 2.3 Table: `food_entries`

```sql
-- supabase/migrations/0003_food_schema.sql
create table public.food_entries (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null unique,   -- I11 idempotency key (UNIQUE is last line of defense)
  library_item_id     uuid references public.food_library_items(id) on delete set null,
  meal_category       text not null check (meal_category in ('breakfast','lunch','dinner','snack','drink')),
  source              text not null check (source in ('text','photo','library','manual')),
  items               jsonb not null,         -- array of parsed items (per design-doc §7)
  ai_reasoning        text check (char_length(ai_reasoning) <= 500),  -- F11 Codex cap
  logged_at           timestamptz not null,   -- UTC; aggregations compute user-TZ day
  created_at_server   timestamptz not null default now()
);

create index food_entries_user_logged_at_idx
  on public.food_entries (user_id, logged_at desc);  -- I5 timezone-aware day aggregation read path

alter table public.food_entries enable row level security;
```

**Notes:** `client_id` is the idempotency key per **I11** (brainstorm-state Invariants). `ai_reasoning` 500-char cap implements the **F11** Codex mitigation; Zod schema enforces the same cap server-side before insert. `logged_at` client-side validation blocks backfill > 30 days per **I8**.

### 2.4 Table: `food_library_items`

```sql
create table public.food_library_items (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null unique,
  normalized_name     text not null,   -- lowercase + strip punctuation + sort tokens
  display_name        text not null,
  default_portion     numeric(7,2),
  default_unit        text,
  nutrition           jsonb not null,  -- { kcal, macros: {...}, micros: {...} }
  thumbnail_url       text,            -- signed on demand; NULL when text-created (letter-mark UI)
  log_count           int not null default 0,
  last_used_at        timestamptz,
  user_edited_flag    boolean not null default false,
  created_from        text not null check (created_from in ('text','photo')),
  created_at          timestamptz not null default now()
);

-- Normalized-name dedup lookup (Task 3.4 entries/save → library/dedup-check)
create index food_library_user_normalized_idx
  on public.food_library_items (user_id, normalized_name);

alter table public.food_library_items enable row level security;
```

**Notes:** `normalized_name` is the exact-equality dedup key per `design-doc.md §18.3` (no fuzzy matching in MVP). When a `food_entries` row's referenced library item is deleted, the entry's FK goes to NULL (preserves log history — Task 3.1 / Task 4.2).

### 2.5 Table: `weight_log`

```sql
create table public.weight_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null unique,
  date        date not null,                          -- user-TZ calendar date
  weight_kg   numeric(5,2) not null check (weight_kg between 30 and 350),
  note        text,
  created_at  timestamptz not null default now()
);

create index weight_log_user_date_idx
  on public.weight_log (user_id, date desc);  -- Progress trajectory read path

alter table public.weight_log enable row level security;
```

### 2.6 Table: `water_log`

```sql
create table public.water_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null unique,
  date        date not null,
  count       int  not null check (count >= 0),
  unit        text not null check (unit in ('glass','bottle','ml')),
  created_at  timestamptz not null default now()
);

create index water_log_user_date_idx
  on public.water_log (user_id, date);  -- Dashboard/Progress water read

alter table public.water_log enable row level security;
```

### 2.7 Table: `ai_response_cache` (service-role-only)

```sql
create table public.ai_response_cache (
  input_hash       text primary key,    -- SHA-256 of normalized input
  call_type        text not null check (call_type in ('text-parse','vision','weekly-review')),
  user_id          uuid not null references auth.users(id) on delete cascade,
  parsed_payload   jsonb not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

create index ai_response_cache_expires_idx
  on public.ai_response_cache (expires_at);  -- Future pruning job

alter table public.ai_response_cache enable row level security;
-- NO user-facing policies. Service role is the only accessor. See §3.6.
```

**Notes:** F8 mitigation — every cache key includes `user_id` (composite uniqueness via PK `input_hash` computed as hash of call_type + user_id + normalized input). The `user_id` column is retained for forward-compatibility with per-user cache pruning and for the RLS `using` expression if we later switch this to user-scoped reads.

### 2.8 Table: `ai_call_log` (service-role-only)

```sql
create table public.ai_call_log (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  call_type          text not null check (call_type in ('text-parse','vision','weekly-review')),
  input_hash         text not null,
  tokens             int not null default 0,     -- input + output; 0 if cached
  cost_estimate      numeric(10,6) not null default 0,
  latency_ms         int not null,
  cached_flag        boolean not null,
  created_at         timestamptz not null default now()
);

create index ai_call_log_user_created_idx
  on public.ai_call_log (user_id, created_at desc);  -- Admin cost stats view

alter table public.ai_call_log enable row level security;
-- NO user-facing policies. Service role is the only accessor. See §3.6.
```

**Notes:** I2 enforces exactly one row per AI lookup (including cache hits) via a `finally`-block insert in the Route Handler. Failure-tolerant — `ai_call_log.insert` errors are caught, sent to Sentry, and DO NOT block the response.

### 2.9 Table: `weekly_reviews`

```sql
create table public.weekly_reviews (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start_on   date not null,                  -- Monday of the user-TZ week
  insights        jsonb not null,                 -- { body_markdown, summary, sparse_data }
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,           -- generated_at + 7 days
  unique (user_id, week_start_on)                 -- one review per user per week
);

create index weekly_reviews_user_week_idx
  on public.weekly_reviews (user_id, week_start_on desc);  -- Dashboard + Progress island read

alter table public.weekly_reviews enable row level security;
```

**Notes:** Lazy-generated on dashboard visit (Task 4.3a). Sparse-data fallback (< 3 logged days in past 7) stores a stub `insights` payload with `sparse_data: true` so downstream reads render the "§ THE EDITOR'S NOTE · Too little logged this week…" template without round-tripping to Gemini.

### 2.10 Index Summary (cross-invariant)

| Index | Table | Purpose | Invariant / perf source |
|---|---|---|---|
| `food_entries_user_logged_at_idx` | `food_entries (user_id, logged_at desc)` | Day aggregation read path | I5 (user-TZ day math) + dashboard perf |
| `food_library_user_normalized_idx` | `food_library_items (user_id, normalized_name)` | Dedup lookup on save | `design-doc.md §18.3` |
| `weight_log_user_date_idx` | `weight_log (user_id, date desc)` | Progress trajectory | — |
| `water_log_user_date_idx` | `water_log (user_id, date)` | Dashboard + Progress water aggregation | — |
| `ai_call_log_user_created_idx` | `ai_call_log (user_id, created_at desc)` | Admin `/api/ai/stats` view | `design-doc.md §16` |
| `weekly_reviews_user_week_idx` | `weekly_reviews (user_id, week_start_on desc)` | Dashboard + Progress island read | F4 (stale-on-rollover) |
| `ai_response_cache_expires_idx` | `ai_response_cache (expires_at)` | Future pruning job | MVP scaffolding |

---

## 3. Row-Level Security Policies

Six user-owned tables × 4 verbs (SELECT / INSERT / UPDATE / DELETE) = **24 policy statements**. `ai_response_cache` and `ai_call_log` are service-role-only; no user policies.

### 3.1 `profiles` (4 policies)

```sql
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);
```

### 3.2 `food_entries` (4 policies)

```sql
create policy "food_entries_select_own"
  on public.food_entries for select
  using (auth.uid() = user_id);

create policy "food_entries_insert_own"
  on public.food_entries for insert
  with check (auth.uid() = user_id);

create policy "food_entries_update_own"
  on public.food_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "food_entries_delete_own"
  on public.food_entries for delete
  using (auth.uid() = user_id);
```

### 3.3 `food_library_items` (4 policies)

```sql
create policy "food_library_items_select_own"
  on public.food_library_items for select
  using (auth.uid() = user_id);

create policy "food_library_items_insert_own"
  on public.food_library_items for insert
  with check (auth.uid() = user_id);

create policy "food_library_items_update_own"
  on public.food_library_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "food_library_items_delete_own"
  on public.food_library_items for delete
  using (auth.uid() = user_id);
```

### 3.4 `weight_log` (4 policies)

```sql
create policy "weight_log_select_own"
  on public.weight_log for select
  using (auth.uid() = user_id);

create policy "weight_log_insert_own"
  on public.weight_log for insert
  with check (auth.uid() = user_id);

create policy "weight_log_update_own"
  on public.weight_log for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "weight_log_delete_own"
  on public.weight_log for delete
  using (auth.uid() = user_id);
```

### 3.5 `water_log` (4 policies)

```sql
create policy "water_log_select_own"
  on public.water_log for select
  using (auth.uid() = user_id);

create policy "water_log_insert_own"
  on public.water_log for insert
  with check (auth.uid() = user_id);

create policy "water_log_update_own"
  on public.water_log for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "water_log_delete_own"
  on public.water_log for delete
  using (auth.uid() = user_id);
```

### 3.6 `weekly_reviews` (4 policies)

```sql
create policy "weekly_reviews_select_own"
  on public.weekly_reviews for select
  using (auth.uid() = user_id);

create policy "weekly_reviews_insert_own"
  on public.weekly_reviews for insert
  with check (auth.uid() = user_id);

create policy "weekly_reviews_update_own"
  on public.weekly_reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "weekly_reviews_delete_own"
  on public.weekly_reviews for delete
  using (auth.uid() = user_id);
```

### 3.7 Service-Role-Only Tables (`ai_response_cache`, `ai_call_log`)

Both tables have **RLS enabled** but **zero user-facing policies**. All access is via the service role from inside `/api/ai/**` Route Handlers:

- `lib/ai/cache.ts` reads/writes `ai_response_cache` via service-role client.
- `lib/ai/cost-log.ts` writes `ai_call_log` via service-role client.

The service role bypasses RLS; the anon/browser key never sees these tables. An ESLint rule (see §10) forbids importing `lib/supabase/admin.ts` from any non-`/api/**` file — code-path enforcement that the service-role key stays server-side-only (**I3**).

### 3.8 Verb Matrix (enforcement summary)

| Table | SELECT | INSERT | UPDATE | DELETE | Access model |
|---|---|---|---|---|---|
| `profiles` | own | own | own | own | User-scoped |
| `food_entries` | own | own | own | own | User-scoped |
| `food_library_items` | own | own | own | own | User-scoped |
| `weight_log` | own | own | own | own | User-scoped |
| `water_log` | own | own | own | own | User-scoped |
| `weekly_reviews` | own | own | own | own | User-scoped |
| `ai_response_cache` | — | — | — | — | Service-role only |
| `ai_call_log` | — | — | — | — | Service-role only |

**Total user-facing policy statements: 24.** Playwright RLS suite exercises all 24 + Storage-bucket assertions via the 2-user harness from Task 1.2.

---

## 4. Storage Bucket Policies

### 4.1 Bucket: `food-thumbnails` (private)

```sql
-- supabase/migrations/0004_storage_buckets.sql
insert into storage.buckets (id, name, public)
values ('food-thumbnails', 'food-thumbnails', false);

-- Path-based ownership: {user_id}/{entry_id}_{timestamp}.jpg
create policy "Users access own thumbnails"
  on storage.objects for all
  using (
    bucket_id = 'food-thumbnails'
      and split_part(name, '/', 1)::uuid = auth.uid()
  )
  with check (
    bucket_id = 'food-thumbnails'
      and split_part(name, '/', 1)::uuid = auth.uid()
  );
```

### 4.2 Access Pattern

- **Uploads:** `/api/storage/thumbnail/route.ts` regenerates a <50kb thumbnail server-side from the base64 image received by `/api/ai/vision`, then uploads to `food-thumbnails/{user_id}/{client_id}.webp`. The `client_id` ties the thumbnail to the resulting `food_library_items` row.
- **Reads:** Thumbnails are NEVER served via public URL. Dashboard / library components request a **signed URL with 10-minute TTL** via a Server Component that calls `supabase.storage.from('food-thumbnails').createSignedUrl(path, 600)`. Signed URLs expire client-side and are re-requested on cache revalidation.
- **Originals:** never stored. The original base64 lives in memory for exactly one Route Handler invocation and is discarded immediately post-Gemini analysis (**I3**).
- **Path convention:** `{user_id}/{client_id}.webp` for library-item thumbnails. For ad-hoc entry thumbnails (photo log without library save), path pattern is `{user_id}/{entry_id}_{timestamp}.jpg` per Task 3.3. The RLS `split_part(name, '/', 1)::uuid = auth.uid()` check covers both.

---

## 5. Folder Structure

Aggregated from every file path referenced across all 26 tasks in `tasks.md`. Route groups `(marketing)`, `(auth)`, `(app)` segment the app surfaces; route groups do NOT add URL path segments.

```
kalori/
├── .eslintrc.json                        -- I12 + I3 custom rules
├── .github/
│   └── workflows/
│       └── ci.yml                        -- TS + ESLint + Vitest + Playwright + RLS lint
├── eslint-rules/
│   ├── no-inline-cache-tags.js           -- I12 (Task 1.3)
│   ├── no-inline-user-strings.js         -- i18n typed constants (Task 1.3)
│   └── no-server-only-client-import.js   -- I3 (Task 1.1)
├── next.config.ts                        -- @serwist/next integration (Task 5.1)
├── tsconfig.json                         -- strict mode (Task 1.1)
├── tailwind.config.ts                    -- Ledger palette tokens (Task 1.2)
├── postcss.config.js
├── package.json                          -- pnpm project
├── pnpm-lock.yaml
├── middleware.ts                         -- @supabase/ssr session refresh + auth gate (Task 2.1)
├── sentry.client.config.ts               -- errors-only, PII scrubber (Task 1.1)
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── public/
│   ├── manifest.json                     -- PWA manifest (Task 5.1)
│   └── icons/                            -- 192 / 512 / maskable
├── fixtures/
│   └── seed-14-days.json                 -- 14-day dev seed (Task 1.3)
├── scripts/
│   └── seed.ts                           -- pnpm seed (Task 1.3)
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql
│       ├── 0002_profiles.sql
│       ├── 0003_food_schema.sql          -- 7 tables + indexes
│       ├── 0004_storage_buckets.sql      -- food-thumbnails + storage RLS
│       └── 00NN_weight_recalc_columns.sql (Task 4.3b additive columns)
│
├── app/
│   ├── layout.tsx                        -- root layout + theme provider
│   ├── globals.css                       -- full Ledger token set (Task 1.2)
│   ├── sw.ts                             -- service worker (Task 5.1)
│   │
│   ├── (marketing)/
│   │   └── page.tsx                      -- / (public landing, masthead placeholder)
│   │
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                  -- magic-link + Google OAuth
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts                  -- Supabase OAuth callback
│   │
│   ├── (app)/
│   │   ├── layout.tsx                    -- responsive nav shell (Task 1.2)
│   │   │
│   │   ├── onboarding/
│   │   │   ├── page.tsx                  -- 8-step wizard shell
│   │   │   └── _components/
│   │   │       ├── StepBioSex.tsx
│   │   │       ├── StepAge.tsx
│   │   │       ├── StepHeight.tsx
│   │   │       ├── StepWeight.tsx
│   │   │       ├── StepGoalWeight.tsx
│   │   │       ├── StepPace.tsx
│   │   │       ├── StepActivity.tsx
│   │   │       ├── StepResults.tsx
│   │   │       └── HowWeCalculated.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx                  -- Cache Components + PPR (Task 3.5)
│   │   │
│   │   ├── log/
│   │   │   ├── page.tsx                  -- modal/sheet host (Task 3.3)
│   │   │   └── _components/
│   │   │       ├── TypeTab.tsx
│   │   │       ├── SnapTab.tsx
│   │   │       ├── LibraryTab.tsx
│   │   │       ├── ManualEntryFallback.tsx
│   │   │       ├── ConfirmationScreen.tsx  (Task 3.4)
│   │   │       └── WhyTheseNumbers.tsx
│   │   │
│   │   ├── library/
│   │   │   ├── page.tsx                  -- PPR grid (Task 4.1)
│   │   │   └── [id]/
│   │   │       └── page.tsx              -- Food Detail (Task 4.2)
│   │   │
│   │   ├── progress/
│   │   │   ├── page.tsx                  -- PPR (Task 4.3a)
│   │   │   └── _components/
│   │   │       ├── weekly-review-island.tsx
│   │   │       └── weight-quick-add.tsx  -- (Task 4.3b)
│   │   │
│   │   ├── settings/
│   │   │   └── page.tsx                  -- profile edit + manual override (Tasks 2.1+)
│   │   │
│   │   └── weight/
│   │       └── page.tsx                  -- quick-entry form + history (Task 4.3b)
│   │
│   └── api/
│       ├── auth/
│       │   └── sign-out/
│       │       └── route.ts
│       ├── profile/
│       │   └── save/
│       │       └── route.ts              -- onboarding + edit (Task 2.2)
│       ├── ai/
│       │   ├── text-parse/
│       │   │   └── route.ts              -- (Task 3.2)
│       │   ├── vision/
│       │   │   └── route.ts
│       │   ├── weekly-review/
│       │   │   └── route.ts              -- extended by 4.3a sparse-data fallback
│       │   └── stats/
│       │       └── route.ts              -- admin cost view (design-doc §16)
│       ├── entries/
│       │   ├── save/
│       │   │   └── route.ts              -- (Task 3.4) client_id idempotent
│       │   └── copy-yesterday/
│       │       └── route.ts
│       ├── library/
│       │   ├── dedup-check/
│       │   │   └── route.ts              -- (Task 3.4)
│       │   ├── merge/
│       │   │   └── route.ts              -- (Task 4.1)
│       │   ├── bulk-delete/
│       │   │   └── route.ts
│       │   └── [id]/
│       │       ├── update/
│       │       │   └── route.ts          -- PATCH (Task 4.2)
│       │       └── delete/
│       │           └── route.ts          -- DELETE
│       ├── water/
│       │   └── log/
│       │       └── route.ts              -- (Task 3.5)
│       ├── weight/
│       │   └── log/
│       │       └── route.ts              -- (Task 4.3b)
│       ├── storage/
│       │   └── thumbnail/
│       │       └── route.ts              -- thumbnail regen + upload (Task 3.3)
│       ├── export/
│       │   ├── csv/
│       │   │   └── route.ts              -- (Task 5.2)
│       │   ├── json/
│       │   │   └── route.ts
│       │   └── zip/
│       │       └── route.ts
│       └── account/
│           └── delete/
│               └── route.ts              -- Storage → DB → auth.users (Task 5.2, I9)
│
├── components/
│   ├── ui/                               -- shadcn/ui primitives
│   │   ├── UndoToast.tsx                 -- (Task 3.4)
│   │   ├── OfflineBadge.tsx              -- (Task 5.1)
│   │   └── OfflineIndicatorToast.tsx
│   ├── ledger/                           -- visual primitives (kicker, rule, drop-cap)
│   │   ├── Kicker.tsx
│   │   ├── RuleDivider.tsx
│   │   ├── PullQuote.tsx
│   │   └── DropCap.tsx
│   ├── nav/                              -- (Task 1.2)
│   │   ├── sidebar.tsx
│   │   ├── bottom-tab-bar.tsx
│   │   ├── log-fab.tsx
│   │   ├── top-app-bar.tsx
│   │   ├── profile-menu.tsx
│   │   └── shortcuts-overlay.tsx
│   ├── charts/
│   │   ├── ChronometerRing.tsx           -- inline SVG (Task 3.5)
│   │   ├── MicronutrientHeatmap.tsx      -- signature view (Task 4.3a)
│   │   ├── CalorieAdherenceBar.tsx
│   │   ├── MacroDistributionStackedArea.tsx
│   │   ├── WeightTrajectoryLine.tsx      -- (Task 4.3b)
│   │   ├── LoggingConsistencyCalendar.tsx
│   │   └── TrendSummary.tsx
│   ├── dashboard/
│   │   ├── Masthead.tsx                  -- edition line (Task 3.5)
│   │   ├── MacroBars.tsx
│   │   ├── MealsBulletin.tsx
│   │   ├── WaterTracker.tsx
│   │   ├── MicronutrientPanel.tsx
│   │   ├── WeeklyInsightCard.tsx         -- (Task 4.3a, shared cache)
│   │   └── TargetUpdatedNudge.tsx        -- (Task 4.3b)
│   ├── library/                          -- (Task 4.1 / 4.2)
│   │   ├── LibraryGrid.tsx
│   │   ├── SearchBar.tsx
│   │   ├── FilterPills.tsx
│   │   ├── SortDropdown.tsx
│   │   ├── BulkActionsBar.tsx
│   │   ├── MergeDuplicatesDialog.tsx
│   │   ├── ThumbnailLetterMark.tsx
│   │   └── FoodDetail.tsx
│   └── layout/                           -- page chrome
│       └── PageMasthead.tsx
│
├── lib/
│   ├── auth/
│   │   ├── refresh-interceptor.ts        -- F12 401 interceptor (Task 2.1)
│   │   └── cross-tab-signout.ts          -- F12 cross-tab (Task 5.2)
│   ├── cache/
│   │   └── tags.ts                       -- I12 typed constants (Task 1.3)
│   ├── ai/
│   │   ├── client.ts                     -- @google/genai wrapper (Task 3.2)
│   │   ├── prompts.ts                    -- versioned system prompts (Task 3.2)
│   │   ├── schemas.ts                    -- Zod ParsedItem / ParseResult
│   │   ├── cache.ts                      -- ai_response_cache read-through
│   │   ├── cost-log.ts                   -- ai_call_log insert
│   │   └── sanitize.ts                   -- F11 token stripping
│   ├── supabase/
│   │   ├── client.ts                     -- browser anon (Task 1.2)
│   │   ├── server.ts                     -- SSR server component
│   │   └── admin.ts                      -- service-role (server-only, I3-enforced)
│   ├── nutrition/
│   │   ├── mifflin-st-jeor.ts            -- (Task 2.1) pure
│   │   ├── tdee.ts                       -- pure
│   │   ├── target.ts                     -- pure
│   │   ├── recalc.ts                     -- (Task 4.3b) pure
│   │   ├── display-micros.ts             -- priority constant (Task 3.5)
│   │   └── __tests__/
│   │       ├── mifflin.test.ts
│   │       ├── tdee.test.ts
│   │       └── target.test.ts
│   ├── stores/
│   │   ├── useLogFlowStore.ts            -- (Task 3.3)
│   │   ├── useUndoQueueStore.ts          -- (Task 3.4 / 5.2 cross-tab)
│   │   ├── useOnboardingStore.ts         -- (Task 2.2)
│   │   ├── useUIStore.ts
│   │   └── useWeightQuickAddStore.ts     -- (Task 4.3b)
│   ├── text/
│   │   └── normalize.ts                  -- dedup key (Task 3.4)
│   ├── dashboard/
│   │   └── aggregate.ts                  -- user-TZ day aggregation (Task 3.5)
│   ├── aggregations/
│   │   └── progress.ts                   -- D/W/M aggregation (Task 4.3a)
│   ├── image/
│   │   └── compress.ts                   -- browser-image-compression (Task 3.3)
│   ├── offline/
│   │   ├── idb.ts                        -- idb-keyval wrapper (Task 5.1)
│   │   ├── outbox.ts                     -- FIFO mutation queue (Task 5.1)
│   │   └── availability.ts               -- IDB detection
│   ├── motion/
│   │   └── reduced-motion-audit.ts       -- CI helper (Task 5.1)
│   ├── i18n/
│   │   └── en.ts                         -- typed constants (Task 1.3)
│   └── utils/
│       └── (misc shared helpers)
│
└── tests/
    ├── unit/
    │   ├── edition-number.test.ts
    │   ├── aggregate-day-tz.test.ts
    │   ├── ai-cache-key.test.ts
    │   ├── ai-sanitize.test.ts
    │   ├── sparse-data-fallback.test.ts
    │   ├── recalc-threshold.test.ts
    │   ├── auto-recalc-trigger.test.ts
    │   ├── normalize-name.test.ts
    │   └── ai/
    │       └── vn-smoke.test.ts          -- Task 3.2 critical tier
    ├── component/
    │   ├── HowWeCalculated.test.tsx
    │   ├── StepGoalWeight.test.tsx
    │   ├── StepPace.test.tsx
    │   ├── TypeTab.test.tsx
    │   ├── SnapTab.test.tsx
    │   ├── LibraryTab.test.tsx
    │   ├── ChronometerRing.test.tsx
    │   ├── MealsBulletin.test.tsx
    │   ├── WaterTracker.test.tsx
    │   ├── UndoToast.test.tsx
    │   ├── LibraryGrid.test.tsx
    │   ├── MergeDuplicatesDialog.test.tsx
    │   ├── FoodDetail.test.tsx
    │   ├── MicronutrientHeatmap.test.tsx
    │   ├── WeeklyInsightCard.test.tsx
    │   ├── WeeklyReviewIsland.test.tsx
    │   ├── WeightQuickAdd.test.tsx
    │   ├── TargetUpdatedNudge.test.tsx
    │   └── WeightTrajectoryLine.test.tsx
    ├── integration/
    │   ├── auth-refresh-retry.test.ts
    │   ├── client-id-idempotency.test.ts
    │   ├── ai-text-parse.test.ts
    │   ├── ai-vision.test.ts
    │   ├── ai-weekly-review.test.ts
    │   ├── ai-text-parse-refresh.test.ts
    │   ├── ai-vision-refresh.test.ts
    │   ├── ai-weekly-review-refresh.test.ts
    │   ├── ai-fallback.test.ts
    │   ├── log-flow-fallback.test.ts
    │   ├── log-flow-refresh.test.ts
    │   ├── log-flow-text-parse-refresh.test.ts
    │   ├── log-flow-vision-refresh.test.ts
    │   ├── entries-save-idempotency.test.ts
    │   ├── entries-save-refresh.test.ts
    │   ├── cache-tag-roundtrip.test.ts
    │   ├── dashboard-cache-tag.test.ts
    │   ├── water-log-refresh.test.ts
    │   ├── library-merge.test.ts
    │   ├── library-merge-refresh.test.ts
    │   ├── library-bulk-delete-refresh.test.ts
    │   ├── library-update-refresh.test.ts
    │   ├── library-delete-refresh.test.ts
    │   ├── weekly-review-tz-rollover.test.ts
    │   ├── weekly-review-cache-reuse.test.ts
    │   ├── weight-log-recalc.test.ts
    │   ├── weight-log-idempotency.test.ts
    │   ├── weight-log-refresh.test.ts
    │   ├── weight-quick-add-rollback.test.ts
    │   ├── outbox-conflict-resolution.test.ts
    │   ├── offline-outbox-replay-idempotency.test.ts
    │   ├── idb-unavailable-fallback.test.ts
    │   ├── reduced-motion-audit.test.ts
    │   ├── ai-accuracy-regression.test.ts
    │   ├── undo-cross-tab.test.ts
    │   ├── cross-tab-signout.test.ts
    │   ├── account-delete-cascade.test.ts
    │   └── export-zip.test.ts
    ├── rls/
    │   ├── _harness.ts                   -- 2-user fixture (Task 1.2)
    │   ├── _harness.test.ts
    │   ├── profiles.spec.ts
    │   ├── food-schema.spec.ts           -- 4 verbs × 6 user-owned tables
    │   ├── storage-bucket.spec.ts
    │   └── weight-log.spec.ts
    ├── e2e/
    │   ├── auth-magic-link.spec.ts
    │   ├── auth-google-oauth.spec.ts
    │   ├── onboarding-completion.spec.ts
    │   ├── text-log.spec.ts
    │   ├── photo-log.spec.ts
    │   ├── undo-toast.spec.ts
    │   ├── copy-yesterday.spec.ts
    │   ├── dashboard-first-paint.spec.ts
    │   ├── library-edit.spec.ts
    │   ├── library-detail-edit.spec.ts
    │   ├── progress-render.spec.ts
    │   ├── weight-log.spec.ts
    │   ├── pwa-install.spec.ts
    │   ├── offline-shell.spec.ts
    │   └── account-delete.spec.ts
    ├── axe/
    │   └── setup.ts                      -- @axe-core/playwright injection helper
    ├── mocks/
    │   ├── handlers.ts                   -- MSW Gemini handlers
    │   └── server.ts
    ├── setup.ts                          -- global Vitest setup
    └── fixtures/
        ├── ai-accuracy/
        │   ├── critical.ts               -- named registry (Task 5.1 / 5.4 gate)
        │   ├── vn-smoke/
        │   │   ├── bun-bo.json
        │   │   ├── pho.json
        │   │   ├── com-tam.json
        │   │   ├── banh-mi.json
        │   │   └── bun-thit-nuong.json
        │   ├── western-smoke/
        │   │   ├── eggs-toast.json
        │   │   ├── salad.json
        │   │   └── chicken-rice.json
        │   └── vision/
        │       └── (photo fixtures, Task 5.1)
        ├── rls/
        │   └── (2-user fixture helpers)
        └── seed/
            └── seed-14-days.json         -- symlinked / copied from fixtures/
```

**File-path count:** 160+ distinct files referenced across the layout (covers every path mentioned in `tasks.md`).

---

## 6. Route Map (API Routes)

**14 API routes.** All routes (except `/api/auth/*` for callback) enforce session via `withAuth()` wrapper. All mutation routes implement `client_id` idempotency (**I11**). All AI routes log to `ai_call_log` (**I2**). All routes Zod-validate input and output.

| # | Method | Path | Purpose | Auth | Zod Input | Zod Output | Cache-tag writes |
|---|---|---|---|---|---|---|---|
| 1 | POST | `/api/ai/text-parse` | Gemini text parse + cache lookup | Required | `{ text, user_region?, dietary_prefs?, allergens? }` | `ParseResult` (items, reasoning ≤500 chars) | — |
| 2 | POST | `/api/ai/vision` | Gemini vision + cache lookup | Required | `{ image_base64, user_region?, dietary_prefs? }` | `ParseResult` | — |
| 3 | POST | `/api/ai/weekly-review` | Weekly insights (7-day cache) | Required | `{ week_start_on }` | `{ body_markdown, sparse_data }` | `TAGS.weeklyReview(uid, weekStartOn)` |
| 4 | POST | `/api/profile/save` | Onboarding + edit | Required | `{ step_delta }` | `{ profile }` | `TAGS.profile(uid)` |
| 5 | POST | `/api/entries/save` | Log entry commit | Required | `{ client_id, items, logged_at, meal_category, source, library_item_id? }` | `{ entry }` | `TAGS.userEntries(uid, day)`, `TAGS.userLibrary(uid)` |
| 6 | POST | `/api/water/log` | Water increment | Required | `{ client_id, date, count, unit }` | `{ row }` | `TAGS.userEntries(uid, day)` |
| 7 | POST | `/api/weight/log` | Weight entry | Required | `{ client_id, date, weight_kg, note? }` | `{ row, recalc?: { newTarget } }` | `TAGS.profile(uid)`, `TAGS.userProgress(uid, range)` |
| 8 | POST | `/api/library/merge` | Merge duplicate library items | Required | `{ winnerId, loserId, fieldChoices }` | `{ winner }` | `TAGS.userLibrary(uid)`, `TAGS.userEntries(uid, day)` |
| 9 | POST | `/api/library/bulk-delete` | Bulk remove | Required | `{ ids: string[] }` | `{ deleted_count }` | `TAGS.userLibrary(uid)` |
| 10 | PATCH | `/api/library/[id]/update` | Update library item | Required | `{ client_id, fields }` | `{ item }` | `TAGS.userLibrary(uid)` |
| 11 | DELETE | `/api/library/[id]/delete` | Delete library item (entries FK → NULL) | Required | `{ }` | `{ ok }` | `TAGS.userLibrary(uid)` |
| 12 | GET | `/api/export/csv` | CSV export | Required | — | CSV stream | — |
| 13 | GET | `/api/export/json` | JSON export | Required | — | JSON stream | — |
| 14 | DELETE | `/api/account/delete` | Storage → DB → auth.users (I9) | Required | `{ confirm: 'DELETE' }` | `{ ok }` | invalidates all user tags |

**Plus internal/companion routes (not part of the 14 canonical count):**

- `GET /auth/callback/route.ts` — Supabase OAuth callback (no user-data writes)
- `POST /api/auth/sign-out/route.ts` — session invalidation
- `POST /api/storage/thumbnail/route.ts` — thumbnail regen + upload (called from `/api/ai/vision` flow)
- `POST /api/entries/copy-yesterday/route.ts` — multi-select copy with new `client_id`s
- `POST /api/library/dedup-check/route.ts` — normalized-name exact match
- `POST /api/export/zip/route.ts` — packages CSV + JSON zip
- `GET /api/ai/stats/route.ts` — admin cost view (owner-only, design-doc §16)

---

## 7. Cache-Tag Constants

Single source of truth for all `cacheTag` / `updateTag` arguments. Defined in `lib/cache/tags.ts` (Task 1.3; extended in Task 4.3a). An ESLint rule forbids inline string literals passed to `cacheTag` / `updateTag` — typo-safety per **I12**.

### 7.1 `lib/cache/tags.ts`

```ts
// lib/cache/tags.ts
export const TAGS = {
  userEntries: (uid: string, day: string) =>
    `user:${uid}:entries:${day}` as const,
  userLibrary: (uid: string) =>
    `user:${uid}:library` as const,
  profile: (uid: string) =>
    `user:${uid}:profile` as const,
  weeklyReview: (uid: string, weekStartOn: string) =>
    `user:${uid}:weekly-review:${weekStartOn}` as const,
  userProgress: (uid: string, range: '7d' | '30d' | '90d' | '1y') =>
    `user:${uid}:progress:${range}` as const,
} as const;

export type CacheTagKey = keyof typeof TAGS;
```

**Shape rules:**

- Every tag begins `user:${uid}:` — ensures user-scoped invalidation.
- `day` is `YYYY-MM-DD` in the user's timezone (resolved server-side before tagging).
- `weekStartOn` is `YYYY-MM-DD` of the Monday of the user's timezone week.
- `range` is strictly one of `'7d' | '30d' | '90d' | '1y'` — compile-time safety against typos.

### 7.2 ESLint Rule: `no-inline-cache-tags`

Custom rule at `eslint-rules/no-inline-cache-tags.js`:

```js
// eslint-rules/no-inline-cache-tags.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow string-literal arguments to cacheTag() / updateTag(); use lib/cache/tags.ts TAGS.* constants (I12)",
    },
    schema: [],
    messages: {
      inlineLiteral:
        "Inline cache-tag literal '{{literal}}' — use TAGS.<key>(…) from lib/cache/tags.ts instead (I12).",
    },
  },
  create(context) {
    const TARGET_CALLEES = new Set(['cacheTag', 'updateTag']);
    return {
      CallExpression(node) {
        const callee = node.callee;
        const calleeName =
          callee.type === 'Identifier' ? callee.name :
          callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ?
            callee.property.name : null;
        if (!calleeName || !TARGET_CALLEES.has(calleeName)) return;
        for (const arg of node.arguments) {
          // Direct string literal
          if (arg.type === 'Literal' && typeof arg.value === 'string') {
            context.report({ node: arg, messageId: 'inlineLiteral', data: { literal: arg.value } });
          }
          // Template literal with zero expressions (pure string)
          if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) {
            context.report({ node: arg, messageId: 'inlineLiteral', data: { literal: arg.quasis[0].value.raw } });
          }
          // Array containing literals
          if (arg.type === 'ArrayExpression') {
            for (const el of arg.elements) {
              if (el && el.type === 'Literal' && typeof el.value === 'string') {
                context.report({ node: el, messageId: 'inlineLiteral', data: { literal: el.value } });
              }
              if (el && el.type === 'TemplateLiteral' && el.expressions.length === 0) {
                context.report({ node: el, messageId: 'inlineLiteral', data: { literal: el.quasis[0].value.raw } });
              }
            }
          }
        }
      },
    };
  },
};
```

**Rationale (I12 load-bearing):** Cache Components `updateTag` is silent on typo — `'user:${uid}:entry:${day}'` (singular) vs `'user:${uid}:entries:${day}'` (plural) won't fail but will fail to invalidate. The user logs a meal → dashboard stays stale → user re-logs → duplicate entry. Constant enforcement eliminates the entire class of bug at lint time.

---

## 8. Route Handler Patterns

Production-ready patterns that every Route Handler must implement. Shared helpers live in `lib/auth/`, `lib/ai/`, and `lib/supabase/`.

### 8.1 Auth Wrapper: `withAuth`

```ts
// lib/auth/with-auth.ts
import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

type Handler = (
  req: NextRequest,
  ctx: { user: User; supabase: ReturnType<typeof createServerClient> }
) => Promise<NextResponse> | NextResponse;

export function withAuth(handler: Handler) {
  return async (req: NextRequest) => {
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req, { user, supabase });
  };
}
```

### 8.2 F12 401 Interceptor (Task 2.1 Ownership)

This is the **single** place in the codebase that handles 401 → refresh → retry. Phase 3/4 mutation routes are explicitly forbidden from duplicating this logic (see `tasks.md` R1 residual).

```ts
// lib/auth/refresh-interceptor.ts
import { createBrowserClient } from '@/lib/supabase/client';

type FetchArgs = Parameters<typeof fetch>;

export async function authFetch(...args: FetchArgs): Promise<Response> {
  const firstResponse = await fetch(...args);
  if (firstResponse.status !== 401) {
    return firstResponse;
  }

  const supabase = createBrowserClient();
  const { error } = await supabase.auth.refreshSession();

  if (error) {
    // Refresh failed → sign the user out and redirect
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      window.location.href = '/login?reason=session_expired';
    }
    return firstResponse; // return original 401; caller will see sign-out
  }

  // Retry exactly once. The Request body is single-use, so callers must pass
  // fresh init objects on retry. The helper below normalizes that.
  return fetchRetry(args);
}

async function fetchRetry([input, init]: FetchArgs): Promise<Response> {
  // Retry path: if body was ReadableStream we can't retry; require caller
  // to pass string/FormData/URLSearchParams/Blob/ArrayBuffer bodies.
  return fetch(input, init);
}

// Convenience wrapper that preserves `client_id` on retry (I11 idempotency
// guarantee: the server returns 200 + existing row if the retry lands after
// the original succeeded but its response was lost).
export async function authPost<T>(
  url: string,
  body: unknown,
  init?: Omit<RequestInit, 'method' | 'body'>
): Promise<T> {
  const res = await authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) throw new Error(`authPost ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Contract (F12 + I11 interoperability):**

1. Every client mutation uses `authPost` (or `authFetch`).
2. `authPost` body is JSON-serialized each time — so retries send the **same bytes**, including `client_id`.
3. Server's `client_id` idempotency (§8.4) handles the case where the original request succeeded but the 401-forcing failure prevented the response.

### 8.3 Zod Validation + Response Shape (I10)

```ts
// app/api/entries/save/route.ts (excerpt)
import { z } from 'zod';
import { withAuth } from '@/lib/auth/with-auth';
import { TAGS } from '@/lib/cache/tags';
import { updateTag } from 'next/cache';
import { NextResponse } from 'next/server';

const Body = z.object({
  client_id: z.string().uuid(),
  logged_at: z.string().datetime(),
  meal_category: z.enum(['breakfast','lunch','dinner','snack','drink']),
  source: z.enum(['text','photo','library']),
  library_item_id: z.string().uuid().nullable().optional(),
  items: z.array(z.unknown()).min(1),   // shape validated elsewhere
  ai_reasoning: z.string().max(500).optional(),    // F11 cap reinforced
});
type Body = z.infer<typeof Body>;

export const POST = withAuth(async (req, { user, supabase }) => {
  const json = await req.json();
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ValidationError', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // I11: client_id idempotency — lookup before insert
  const { data: existing } = await supabase
    .from('food_entries')
    .select('*')
    .eq('client_id', body.client_id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ entry: existing, replayed: true }, { status: 200 });
  }

  const { data: inserted, error } = await supabase
    .from('food_entries')
    .insert({
      user_id: user.id,
      client_id: body.client_id,
      logged_at: body.logged_at,
      meal_category: body.meal_category,
      source: body.source,
      library_item_id: body.library_item_id ?? null,
      items: body.items,
      ai_reasoning: body.ai_reasoning ?? null,
    })
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cache invalidation (I12 — constants only)
  const day = new Date(body.logged_at).toISOString().slice(0, 10); // normalized upstream to user TZ
  updateTag(TAGS.userEntries(user.id, day));
  updateTag(TAGS.userLibrary(user.id));

  return NextResponse.json({ entry: inserted }, { status: 200 });
});
```

### 8.4 `client_id` Idempotency (I11 Server Contract)

Enforced at every mutation route that writes to a user-owned table:

1. **Client generates** `client_id = crypto.randomUUID()` BEFORE optimistic UI update.
2. **Client sends** `client_id` in request body (JSON).
3. **Server SELECTs** by `client_id` (unique index) before INSERT.
4. **If exists:** return `{ ...existingRow, replayed: true }` with 200. No INSERT.
5. **If absent:** INSERT normally. DB `UNIQUE` constraint acts as last line of defense against race-condition replays.
6. **Offline outbox replay (Task 5.1):** the ORIGINAL `client_id` is preserved — NEVER regenerated on flush/retry/tab-refresh.

### 8.5 AI Cost-Log Insertion (I2 Failure-Tolerant)

```ts
// lib/ai/cost-log.ts (excerpt)
import { createAdminClient } from '@/lib/supabase/admin';
import * as Sentry from '@sentry/nextjs';

export async function logAICall(opts: {
  userId: string;
  callType: 'text-parse' | 'vision' | 'weekly-review';
  inputHash: string;
  tokens: number;
  costEstimate: number;
  latencyMs: number;
  cachedFlag: boolean;
}) {
  try {
    const admin = createAdminClient();
    await admin.from('ai_call_log').insert({
      user_id: opts.userId,
      call_type: opts.callType,
      input_hash: opts.inputHash,
      tokens: opts.tokens,
      cost_estimate: opts.costEstimate,
      latency_ms: opts.latencyMs,
      cached_flag: opts.cachedFlag,
    });
  } catch (e) {
    // I2: logging must NEVER block the response.
    Sentry.captureException(e, { tags: { component: 'ai-cost-log' } });
  }
}
```

Integration pattern in each `/api/ai/*` route:

```ts
const start = Date.now();
try {
  const cached = await cache.lookup({ userId, callType, inputHash });
  if (cached) {
    await logAICall({ userId, callType, inputHash, tokens: 0, costEstimate: 0, latencyMs: Date.now() - start, cachedFlag: true });
    return NextResponse.json({ result: cached });
  }
  const raw = await geminiClient.call(...);           // throws on Gemini error
  const validated = ParseResultSchema.parse(raw);     // I10
  await cache.write({ ..., parsedPayload: validated, ttlDays: 30 });
  await logAICall({ userId, callType, inputHash, tokens: rawTokens, costEstimate, latencyMs: Date.now() - start, cachedFlag: false });
  return NextResponse.json({ result: validated });
} catch (e) {
  await logAICall({ userId, callType, inputHash, tokens: 0, costEstimate: 0, latencyMs: Date.now() - start, cachedFlag: false });
  Sentry.captureException(e);
  return NextResponse.json({ fallback: true, originalInput }, { status: 200 });  // I7 never blocks logging
}
```

### 8.6 F11 Prompt Injection Mitigation (Dedicated Sub-Section)

Three layers, all mandatory:

**Layer 1 — Role-separated input (parts array).** User text is NEVER concatenated into the system message. In `lib/ai/client.ts`:

```ts
const result = await ai.models.generateContent({
  model: 'gemini-flash-latest',
  contents: [
    { role: 'user', parts: [{ text: userText }] },  // User input as its own part
  ],
  systemInstruction: { parts: [{ text: systemPrompt }] }, // Prompt is a distinct role
  generationConfig: { responseMimeType: 'application/json' },
});
```

**Layer 2 — Input sanitization** (`lib/ai/sanitize.ts`):

```ts
const INJECTION_TOKENS = [
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /^SYSTEM:/gim,
  /^USER:/gim,
  /IGNORE\s+(PRIOR|PREVIOUS)\s+INSTRUCTIONS/gi,
  /DISREGARD\s+(PRIOR|PREVIOUS)/gi,
];

export function sanitizeUserInput(text: string): { sanitized: string; stripped: string[] } {
  const stripped: string[] = [];
  let sanitized = text;
  for (const pattern of INJECTION_TOKENS) {
    const matches = sanitized.match(pattern);
    if (matches) stripped.push(...matches);
    sanitized = sanitized.replace(pattern, '');
  }
  // Strip control characters (U+0000–U+001F except \n \r \t)
  sanitized = sanitized.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return { sanitized, stripped };
}
```

Sanitizer is called BEFORE the Gemini dispatch. Every stripped token is logged as a **Sentry breadcrumb** (not an error) for pattern analysis.

**Layer 3 — Output length cap + Zod strict parse** (`lib/ai/schemas.ts`):

```ts
export const ParsedItem = z.object({
  name: z.string().max(200),
  portion: z.number().positive(),
  unit: z.string().max(32),
  kcal: z.number().nonnegative(),
  macros: z.object({
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
    fiber_g: z.number().nonnegative(),
  }),
  micros: z.record(z.string(), z.number()),
  confidence: z.number().min(0).max(1),
});

export const ParseResult = z.object({
  items: z.array(ParsedItem).min(0).max(20),
  reasoning: z.string()
    .max(500)                                           // F11 hard cap
    .transform((s) => s.replace(/[\u0000-\u001F]/g, '')), // control-char strip on output
});
```

Any parse failure → caught → logged → response returned with `{ fallback: true, originalInput }` (I7: AI failure never blocks logging).

---

## 9. Gemini Prompt Storage

### 9.1 `lib/ai/prompts.ts` Contract

- **Single source of truth** for all three prompts: `v1_foodParse`, `v1_visionFoodParse`, `v1_weeklyReview`.
- **Versioned** — each export is named `v{N}_{purpose}`. Bump `N` when the system instruction changes.
- **Pure data (no concatenation).** Each export returns a `SystemInstruction` object or a factory that returns one. User input is NEVER interpolated into a system string.
- **Model pinned:** `gemini-flash-latest` per `kalori-project-blueprint.md §8` (via `@google/genai` SDK).

### 9.2 Shape

```ts
// lib/ai/prompts.ts
import type { Content } from '@google/genai';

type PromptInputs = {
  region?: string;
  dietaryPrefs?: string[];
  allergens?: string[];
};

export const v1_foodParse = (inputs: PromptInputs): Content => ({
  role: 'system',
  parts: [
    {
      text:
`You are Kalori, a literary editor cataloguing a user's meal. Do not act as a coach.
Return strict JSON matching the schema provided. If portion is ambiguous, use a
conservative median estimate. Reasoning field must be ≤ 500 characters and explain
your portion / kcal assumptions plainly.`,
    },
    // Context signals are each their own part — user text is injected elsewhere
    ...(inputs.region ? [{ text: `User region: ${inputs.region}` }] : []),
    ...(inputs.dietaryPrefs?.length ? [{ text: `Dietary preferences: ${inputs.dietaryPrefs.join(', ')}` }] : []),
    ...(inputs.allergens?.length ? [{ text: `Allergens to flag: ${inputs.allergens.join(', ')}` }] : []),
  ],
});

export const v1_visionFoodParse = (inputs: PromptInputs): Content => ({
  role: 'system',
  parts: [
    { text: `You are Kalori's vision editor. Identify visible foods in the image and estimate portions. Return strict JSON.` },
    ...(inputs.region ? [{ text: `User region: ${inputs.region}` }] : []),
    ...(inputs.dietaryPrefs?.length ? [{ text: `Dietary preferences: ${inputs.dietaryPrefs.join(', ')}` }] : []),
  ],
});

export const v1_weeklyReview = (inputs: { userName?: string }): Content => ({
  role: 'system',
  parts: [
    { text:
`You are Kalori's weekly editor writing a literary, understated review of the
user's past 7 days of eating. Tone: editorial, quiet, no emoji, no coaching.
Write in Markdown. 3 paragraphs maximum. Lead with what changed this week
compared to recent weeks, note one thing worth celebrating, close with a
single pragmatic observation. Never invent data. If a day has no entries, say so.` },
  ],
});
```

### 9.3 Usage

```ts
// app/api/ai/text-parse/route.ts
import { v1_foodParse } from '@/lib/ai/prompts';

const contents = [
  { role: 'user' as const, parts: [{ text: sanitizedUserInput }] },
];
const systemInstruction = v1_foodParse({ region, dietaryPrefs, allergens });

const result = await ai.models.generateContent({
  model: 'gemini-flash-latest',
  contents,
  systemInstruction,
  generationConfig: { responseMimeType: 'application/json' },
});
```

---

## 10. ESLint Rules

Three custom rules. All loaded via `.eslintrc.json` → `plugins` → local ruleset directory.

### 10.1 `no-inline-cache-tags` (I12)

Defined in full in §7.2. **Match pattern:** any call expression where callee name is `cacheTag` or `updateTag` and any argument is a string literal, a pure-string template literal, or an array element that is either. **Error message:** `"Inline cache-tag literal '<literal>' — use TAGS.<key>(…) from lib/cache/tags.ts instead (I12)."`

### 10.2 `no-server-only-client-import` (I3)

Forbids any import from `@/lib/ai/client`, `@/lib/ai/prompts`, `@/lib/ai/cache`, `@/lib/ai/cost-log`, or `@/lib/supabase/admin` unless the importing file's path matches the server-only allowlist (`app/api/**`, `middleware.ts`, `lib/supabase/admin.ts` itself, or any `tests/**`).

```js
// eslint-rules/no-server-only-client-import.js (sketch)
const SERVER_ONLY_IMPORTS = [
  '@/lib/ai/client',
  '@/lib/ai/prompts',
  '@/lib/ai/cache',
  '@/lib/ai/cost-log',
  '@/lib/supabase/admin',
];
const ALLOWED_PATH_PATTERNS = [
  /^app\/api\//,
  /^middleware\.ts$/,
  /^lib\/ai\//,              // internal use
  /^lib\/supabase\/admin\.ts$/,
  /^tests\//,
];
module.exports = {
  meta: { type: 'problem', docs: { description: 'I3: Gemini/service-role imports are server-only' }, schema: [] },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (!SERVER_ONLY_IMPORTS.includes(node.source.value)) return;
        const filename = context.getFilename().replace(/\\/g, '/');
        const relative = filename.split('/kalori/')[1] ?? filename;
        if (!ALLOWED_PATH_PATTERNS.some((p) => p.test(relative))) {
          context.report({
            node,
            message: `I3 violation: '${node.source.value}' cannot be imported from client/marketing/(app) code (${relative}). Use a Route Handler.`,
          });
        }
      },
    };
  },
};
```

**Also enforced at CI:** a grep-level lint check that scans for `process.env.GEMINI_API_KEY` references anywhere under `app/(app)/`, `app/(marketing)/`, `app/(auth)/`, `components/` and fails the build (Task 1.1 AC).

### 10.3 `no-inline-user-strings`

Forbids JSX string literals in rendered positions where `t.*.*` (from `lib/i18n/en.ts`) should be used. Enforces a typed-constants i18n pattern (Task 1.3). Scope: `app/**/*.{tsx,jsx}` + `components/**/*.{tsx,jsx}`. Exceptions: `aria-label` / `aria-describedby` string props, `data-testid`, `className`, `id`.

---

## 11. `client_id` Enforcement Pattern (I11 Detailed)

### 11.1 End-to-End Flow

```
1. Client (React component / Zustand store)
   const client_id = crypto.randomUUID();
   optimisticStore.add({ client_id, ...optimisticRow });       // UI updates IMMEDIATELY
2. Client dispatch
   authPost('/api/entries/save', { client_id, ...body });      // F12 wrapper
3. Server (Route Handler)
   const existing = await supabase.from('food_entries')
     .select('*').eq('client_id', client_id).maybeSingle();
   if (existing) return 200 + existing;                         // I11 no-op replay
   const { data: row } = await supabase.from('food_entries')
     .insert({ ...body, client_id, user_id })
     .select().single();                                        // RLS with check
   return 200 + row;
4. DB UNIQUE(client_id)
   If by race another insert sneaks in, constraint fires 23505;
   handler treats 23505 as equivalent to "replay" → re-SELECT + return 200.
5. Offline outbox replay
   outbox row { client_id, endpoint, body } is re-dispatched verbatim;
   client_id NEVER regenerated across retries.
```

### 11.2 Tables with `client_id`

- `food_entries` — from Phase 3 schema (Task 3.1)
- `food_library_items` — created alongside food_entries on library save
- `weight_log` — Task 4.3b
- `water_log` — Task 3.5

### 11.3 Response Shape on Replay

```jsonc
// 200 response for duplicate client_id
{
  "entry": { "id": "...", "client_id": "<same>", ...existingRow },
  "replayed": true
}
```

Client code treats `replayed: true` identically to a fresh success — the optimistic row is reconciled to the server row and the pending outbox entry is removed.

---

## 12. PWA + Offline Architecture

### 12.1 `@serwist/next` Setup

- **Integration:** `@serwist/next` wraps `next.config.ts`. Build-hash cache busting included so deploys flush stale precache.
- **Service worker scope:** `/` (entire origin).
- **Precache:** shell HTML for `/`, `/login`, `/dashboard`, `/log`, `/library`, `/progress`; app icons; CSS + JS bundles referenced by the shell.
- **Runtime cache strategies:**
  - `/api/*` → **network-first**, 3s timeout, falls back to cache for GETs only; mutations NEVER cached at SW level (they go to outbox instead).
  - Static assets (`/_next/static/**`) → **stale-while-revalidate**.
  - Thumbnails (`food-thumbnails/**` signed URLs) → **cache-first** with 7-day max-age; re-sign on expiry.

### 12.2 Offline Outbox (IDB)

Lives in `lib/offline/outbox.ts`. Storage: IndexedDB via `idb-keyval`. Schema:

```ts
type OutboxRow = {
  id: string;              // auto-increment local ID
  client_id: string;       // the immutable idempotency key (I11)
  endpoint: string;        // e.g. '/api/entries/save'
  method: 'POST' | 'PATCH' | 'DELETE';
  body: unknown;           // serialized payload
  createdAt: number;       // Date.now()
  attempts: number;        // increments on failed flush
};
```

**Operations:**

- `append(row)` — add to queue; called by every mutation path when `navigator.onLine === false`.
- `flush()` — FIFO dequeue; for each row, call `authPost(row.endpoint, row.body)`. On 200, delete the outbox row. On network error, leave in place and abort the flush (resume on next trigger).
- `getQueue()` — read queue for debugging / offline-badge count.

### 12.3 Replay Triggers

- `window.addEventListener('online', outbox.flush)`
- `document.addEventListener('visibilitychange', () => { if (!document.hidden) outbox.flush(); })`
- On app-boot when `navigator.onLine === true` — flush any orphans.

### 12.4 FIFO Ordering + Per-Endpoint Grouping

- **Default:** strict FIFO — preserves cause-effect (user logs meal A, then edits A's portion; order must be A-insert → A-update).
- **Per-endpoint grouping:** deferred. MVP uses single FIFO queue.
- On conflict (row dispatched but server returns 409 for a non-idempotent reason): surface a Sentry error + a user-visible toast; do not auto-retry indefinitely.

### 12.5 I11 as the Safety Net

The outbox is the **delivery** mechanism. `client_id` uniqueness is the **safety net**:

- If an outbox flush POST succeeds but the response is lost (network drop at reply time), the retry will POST the same `client_id` — server returns 200 + existing row. No duplicate.
- If the client tab refreshes mid-flush, the outbox row is still present; retry still uses the original `client_id`. No duplicate.
- If two tabs race on the same outbox row (pathological), the DB UNIQUE constraint catches the second insert and the handler returns 200 + existing. No duplicate.

### 12.6 IDB Unavailability Fallback

`lib/offline/availability.ts` detects IDB (Safari private mode, storage-wiped, incognito). On unavailable:

- Skip the IDB caching layer entirely.
- Disable library-based log, weight, water when `navigator.onLine === false`.
- Surface a single informational toast: "Offline support unavailable in this browser."
- App continues to function fully when online.

---

## 13. Observability (Sentry)

### 13.1 Setup

- **SDK:** `@sentry/nextjs` (client + server + edge).
- **Config files:** `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` (Task 1.1).
- **Errors only.** No performance monitoring, no session replay, no profiling. Rationale: MVP scale + cost + signal-to-noise.
- **Release tagging:** injected via Vercel env `NEXT_PUBLIC_SENTRY_RELEASE = VERCEL_GIT_COMMIT_SHA`.
- **Environment:** `KALORI_ENV = production | preview | development` propagated via Vercel env.

### 13.2 PII Scrubbing

`beforeSend` hook strips known-sensitive fields before upload:

```ts
// sentry.client.config.ts (excerpt)
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  environment: process.env.KALORI_ENV,
  enableTracing: false,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    // Strip user email + PII
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
      event.user.id = event.user.id ? 'uid:' + hash(event.user.id).slice(0, 8) : undefined;
    }
    // Strip request body content (may contain food entries, weight)
    if (event.request?.data) {
      event.request.data = '[redacted]';
    }
    // Strip breadcrumbs with sensitive data keys
    event.breadcrumbs = (event.breadcrumbs ?? []).map((b) => {
      if (b.data && ('text' in b.data || 'weight_kg' in b.data || 'items' in b.data)) {
        return { ...b, data: { ...b.data, text: '[redacted]', weight_kg: '[redacted]', items: '[redacted]' } };
      }
      return b;
    });
    return event;
  },
});
```

### 13.3 Breadcrumb Conventions

- F11 sanitizer records stripped tokens as a breadcrumb (category `ai-sanitize`, data is the regex-matched token — no user content beyond that).
- I2 cost-log failures recorded as a breadcrumb + capture.
- F12 refresh attempts recorded as a breadcrumb (`auth-refresh` category).
- Outbox flush failures recorded as a breadcrumb (`offline-outbox` category).

### 13.4 Alerts

Sentry project configured with email alert to owner on ANY new issue in production. No Slack, no PagerDuty for MVP.

---

## 14. Invariant → Architecture Decision (Reverse Index)

| # | Invariant | Architecture decision(s) |
|---|---|---|
| **I1** | RLS on every user-owned table; 4-verb policies | §2.x (all 6 user-owned tables `enable row level security`) + §3 (24 policy statements) + §4 (Storage bucket policy using `split_part(name, '/', 1)::uuid = auth.uid()`) |
| **I2** | Every AI lookup writes `ai_call_log` (failure-tolerant) | §8.5 `lib/ai/cost-log.ts` try/catch + Sentry on failure; §2.8 `ai_call_log` table; `finally`-style semantics in every `/api/ai/*` route |
| **I3** | Gemini key + service-role key server-only | §10.2 `no-server-only-client-import` ESLint rule + CI grep for `process.env.GEMINI_API_KEY` under client paths; §2.7 + §2.8 service-role-only tables |
| **I4** | Photo originals never persisted | §1.3 AI-path flow (base64 in memory for one request only); §4.2 Storage access pattern (thumbnails only) |
| **I5** | MSJ math is pure + unit-tested | §5 `lib/nutrition/mifflin-st-jeor.ts`, `tdee.ts`, `target.ts`, `recalc.ts` pure modules; test coverage at `lib/nutrition/__tests__/*` |
| **I6** | Auth required except `/`, `/login`, `/auth/callback` | §1.4 middleware gate; §5 `middleware.ts`; §8.1 `withAuth` |
| **I7** | AI failure never blocks logging | §8.5 runtime fallback chain in `lib/ai/fallback.ts` (`callGeminiWithFallback`): primary `gemini-flash-latest` throw → secondary `gemini-2.5-flash-lite` call with VN-tuned prompt (`v1_foodParseVnFallback` / `v1_visionFoodParseVnFallback`) under remaining time budget (1s floor) → if BOTH throw, route catch-block returns `{ fallback: true, originalInput }`; one `ai_call_log` row per logical call shares the request's `client_id` (preserves I2 + I11); §5 `ManualEntryFallback.tsx` is the UI sink for the dual-failure envelope |
| **I8** | Undo toast 5s + LIFO + cleared-on-nav | §5 `lib/stores/useUndoQueueStore.ts`; §5 `components/ui/UndoToast.tsx`; extended cross-tab in `lib/auth/cross-tab-signout.ts` companion `BroadcastChannel('kalori-undo')` (Task 5.2) |
| **I9** | Account deletion: Storage → DB → auth.users | §6 Route #14 `/api/account/delete`; §1.1 deployment notes; design-doc §6 ordering enforced in the Route Handler |
| **I10** | AI response Zod-validated before client touch | §8.6 Layer 3 Zod `ParseResult`; §5 `lib/ai/schemas.ts`; §8.3 Zod input validation pattern |
| **I11** | Every write carries `client_id` UUID; 200 no-op on replay | §2 (all 4 write tables have `client_id uuid not null unique`); §8.4 pre-insert SELECT; §11 full flow; §12.2 outbox preserves original ID |
| **I12** | All cache tags via `lib/cache/tags.ts` constants | §7.1 `TAGS` module; §7.2 `no-inline-cache-tags` ESLint rule |

---

## 15. Deployment Environments

| Env | Frontend | Supabase | Secrets | Purpose |
|---|---|---|---|---|
| **Dev** | `pnpm dev` (localhost) | Dev Supabase project | `.env.local` | Owner local work |
| **Preview** | Vercel per-PR auto-deploy | Dev Supabase project | Vercel env (preview scope) | PR smoke test |
| **Production** | Vercel (main branch) | Production Supabase project | Vercel env (production scope) | Live app |

**No staging.** PR preview is the pre-prod smoke surface.

**Env vars (minimum, non-exhaustive):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed to browser (I3)
- `GEMINI_API_KEY` — server-only (I3)
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_RELEASE` — set by Vercel to commit SHA
- `KALORI_ENV` — `production | preview | development`

---

## 16. Stack Summary (pinned versions per `kalori-project-blueprint.md §7–8`)

| Layer | Tool | Version / Model |
|---|---|---|
| Framework | Next.js + React + TypeScript strict | Next.js **16**, React **19** |
| Styling | Tailwind | **v4** |
| Components | shadcn/ui | latest |
| Motion | Framer Motion + Lottie | latest |
| Charts | Recharts | latest |
| State | Zustand + TanStack Query (provisional) + Supabase SSR | Zustand ^4, TanStack Query ^5 (Phase 3 decision), `@supabase/ssr` latest |
| Database | Supabase Postgres | managed (Supabase cloud) |
| Auth | Supabase Auth | `@supabase/ssr` |
| Storage | Supabase Storage | Private bucket `food-thumbnails` |
| AI | Gemini | **`gemini-flash-latest`** via `@google/genai` SDK |
| Hosting | Vercel | Edge + Node Runtime |
| Image compression | `browser-image-compression` | client-side |
| PWA | `@serwist/next` | latest |
| Testing | Vitest + Playwright + @axe-core/playwright + MSW | latest |
| Observability | Sentry | `@sentry/nextjs`, errors-only |
| Cache layer (AI) | `ai_response_cache` DB table | MVP single-tier, 30-day TTL |

---

**End of `architecture.md`.**

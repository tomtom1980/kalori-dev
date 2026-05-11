-- supabase/migrations/0003_food_schema.sql — Task 3.1.
-- Lands the 7 user-domain tables that Phase 3 (Dashboard + Log Flow) and
-- Phase 4 (Library + Progress) build on:
--   1. food_library_items     (no FK deps; referenced by food_entries)
--   2. food_entries           (FK to food_library_items; SET NULL on delete)
--   3. weight_log
--   4. water_log
--   5. ai_response_cache      (service-role-only; RLS enabled, no user policies)
--   6. ai_call_log            (service-role-only; RLS enabled, no user policies)
--   7. weekly_reviews
--
-- DDL + RLS transcribed verbatim from architecture.md §2.3–§2.9 + §3.2–§3.7
-- (per Task 3.1 briefing §6.A canonical schema spec).
--
-- Invariants enforced here:
--   I1  — every row has user_id = auth.uid() at insert (RLS with-check on the
--         5 user-owned tables; default-deny on the 2 service-role-only tables).
--   I11 — client_id uuid NOT NULL UNIQUE per-table on the 4 user-write tables
--         (food_entries, food_library_items, weight_log, water_log). Single-
--         column UNIQUE — NOT composite (user_id, client_id). Different users
--         using the same UUIDv4 means a client got bad RNG and we want it to
--         fail loudly. The Route Handler 200-noop replay logic (Task 3.4)
--         depends on this exact shape.
--   F1 mitigation — RLS test suite (food-schema.test.ts) covers all 7 tables.
--   F8 mitigation — ai_response_cache.user_id present so cache key in
--                   lib/ai/cache.ts (Task 3.2) can include user_id.
--
-- FK direction (design-doc.md §6 Account Deletion bullet 2):
--   - All user-owned tables: user_id ... ON DELETE CASCADE
--   - food_entries.library_item_id ... ON DELETE SET NULL (entry history
--     survives library pruning)
--
-- Service-role-only posture (architecture.md §3.7):
--   ai_response_cache + ai_call_log have RLS enabled but ZERO user-facing
--   policies. Service-role bypasses RLS; authenticated users hit Postgres
--   default-deny. lib/ai/cache.ts and lib/ai/cost-log.ts (Task 3.2) are the
--   only accessors via the service-role admin client.

-- =========================================================================
-- 1. food_library_items (architecture.md §2.4)
-- =========================================================================

create table public.food_library_items (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null unique,
  normalized_name     text not null,                                        -- lowercase + strip punctuation + sort tokens
  display_name        text not null,
  default_portion     numeric(7,2),
  default_unit        text,
  nutrition           jsonb not null,                                       -- { kcal, macros: {...}, micros: {...} }
  thumbnail_url       text,                                                 -- signed on demand; NULL when text-created (letter-mark UI)
  log_count           int not null default 0,
  last_used_at        timestamptz,
  user_edited_flag    boolean not null default false,
  created_from        text not null check (created_from in ('text','photo')),
  created_at          timestamptz not null default now()
);

create index food_library_user_normalized_idx
  on public.food_library_items (user_id, normalized_name);

alter table public.food_library_items enable row level security;

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

-- =========================================================================
-- 2. food_entries (architecture.md §2.3)
-- =========================================================================

create table public.food_entries (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  client_id           uuid not null unique,                                 -- I11 idempotency key
  library_item_id     uuid references public.food_library_items(id) on delete set null,
  meal_category       text not null check (meal_category in ('breakfast','lunch','dinner','snack','drink')),
  source              text not null check (source in ('text','photo','library')),
  items               jsonb not null,                                       -- array of parsed items (per design-doc §7)
  ai_reasoning        text check (char_length(ai_reasoning) <= 500),        -- F11 Codex cap
  logged_at           timestamptz not null,                                 -- UTC; aggregations compute user-TZ day
  created_at_server   timestamptz not null default now()
);

create index food_entries_user_logged_at_idx
  on public.food_entries (user_id, logged_at desc);                         -- I5 timezone-aware day aggregation read path

alter table public.food_entries enable row level security;

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

-- =========================================================================
-- 3. weight_log (architecture.md §2.5)
-- =========================================================================

create table public.weight_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null unique,
  date        date not null,                                                 -- user-TZ calendar date
  weight_kg   numeric(5,2) not null check (weight_kg between 30 and 350),
  note        text,
  created_at  timestamptz not null default now()
);

create index weight_log_user_date_idx
  on public.weight_log (user_id, date desc);                                -- Progress trajectory read path

alter table public.weight_log enable row level security;

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

-- =========================================================================
-- 4. water_log (architecture.md §2.6)
-- =========================================================================

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
  on public.water_log (user_id, date);                                      -- Dashboard/Progress water read

alter table public.water_log enable row level security;

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

-- =========================================================================
-- 5. ai_response_cache (architecture.md §2.7) — service-role-only
-- =========================================================================
-- RLS enabled, NO user policies. Service-role bypasses; authenticated users
-- hit Postgres default-deny. lib/ai/cache.ts (Task 3.2) is the only writer.
-- user_id retained for forward-compatibility (per-user pruning + future
-- user-scoped reads).

create table public.ai_response_cache (
  input_hash       text primary key,                                        -- SHA-256 of normalized input (includes user_id)
  call_type        text not null check (call_type in ('text-parse','vision','weekly-review')),
  user_id          uuid not null references auth.users(id) on delete cascade,
  parsed_payload   jsonb not null,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);

create index ai_response_cache_expires_idx
  on public.ai_response_cache (expires_at);                                 -- Future pruning job
create index ai_response_cache_user_created_idx
  on public.ai_response_cache (user_id, created_at desc);                   -- Codex R1 A2: per-user RLS read path + future per-user pruning

alter table public.ai_response_cache enable row level security;
-- NO user-facing policies. Service role is the only accessor.

-- =========================================================================
-- 6. ai_call_log (architecture.md §2.8) — service-role-only
-- =========================================================================

create table public.ai_call_log (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  call_type          text not null check (call_type in ('text-parse','vision','weekly-review')),
  input_hash         text not null,
  tokens             int not null default 0,                                -- input + output; 0 if cached
  cost_estimate      numeric(10,6) not null default 0,
  latency_ms         int not null,
  cached_flag        boolean not null,
  created_at         timestamptz not null default now()
);

create index ai_call_log_user_created_idx
  on public.ai_call_log (user_id, created_at desc);                         -- Admin cost stats view

alter table public.ai_call_log enable row level security;
-- NO user-facing policies. Service role is the only accessor.

-- =========================================================================
-- 7. weekly_reviews (architecture.md §2.9)
-- =========================================================================

create table public.weekly_reviews (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  week_start_on   date not null,                                            -- Monday of the user-TZ week
  insights        jsonb not null,                                           -- { body_markdown, summary, sparse_data }
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,                                     -- generated_at + 7 days
  unique (user_id, week_start_on)                                           -- one review per user per week
);

create index weekly_reviews_user_week_idx
  on public.weekly_reviews (user_id, week_start_on desc);                   -- Dashboard + Progress island read

alter table public.weekly_reviews enable row level security;

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

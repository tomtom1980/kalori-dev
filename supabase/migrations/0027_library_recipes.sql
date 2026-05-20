-- Library recipe generation support.

begin;

alter table public.food_library_items
  add column if not exists recipe_eligibility text not null default 'unknown',
  add column if not exists recipe_eligibility_reason text null,
  add column if not exists recipe_eligibility_checked_at timestamptz null;

alter table public.food_library_items
  drop constraint if exists food_library_items_recipe_eligibility_check;

alter table public.food_library_items
  add constraint food_library_items_recipe_eligibility_check
  check (recipe_eligibility in ('eligible', 'ineligible', 'unknown'));

alter table public.food_library_items
  drop constraint if exists food_library_items_recipe_eligibility_reason_check;

alter table public.food_library_items
  add constraint food_library_items_recipe_eligibility_reason_check
  check (recipe_eligibility_reason is null or char_length(recipe_eligibility_reason) <= 240);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_library_items_id_user_id_unique'
      and conrelid = 'public.food_library_items'::regclass
  ) then
    alter table public.food_library_items
      add constraint food_library_items_id_user_id_unique unique (id, user_id);
  end if;
end $$;

comment on column public.food_library_items.recipe_eligibility is
  'Recipe generation eligibility for this library item: eligible, ineligible, or unknown.';
comment on column public.food_library_items.recipe_eligibility_reason is
  'Short reason for recipe eligibility/ineligibility, capped at 240 characters.';
comment on column public.food_library_items.recipe_eligibility_checked_at is
  'When recipe eligibility was last inferred or manually supplied.';

create table if not exists public.food_library_recipes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  library_item_id uuid not null,
  recipe jsonb not null,
  prompt_version text not null,
  model text not null,
  input_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, library_item_id),
  constraint food_library_recipes_library_item_owner_fk
    foreign key (library_item_id, user_id)
    references public.food_library_items (id, user_id)
    on delete cascade
);

create index if not exists food_library_recipes_user_created_idx
  on public.food_library_recipes (user_id, created_at desc);

alter table public.food_library_recipes enable row level security;

drop policy if exists "food_library_recipes_select_own" on public.food_library_recipes;
create policy "food_library_recipes_select_own"
  on public.food_library_recipes for select
  using (auth.uid() = user_id);

drop policy if exists "food_library_recipes_insert_own" on public.food_library_recipes;
create policy "food_library_recipes_insert_own"
  on public.food_library_recipes for insert
  with check (auth.uid() = user_id);

drop policy if exists "food_library_recipes_update_own" on public.food_library_recipes;
create policy "food_library_recipes_update_own"
  on public.food_library_recipes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "food_library_recipes_delete_own" on public.food_library_recipes;
create policy "food_library_recipes_delete_own"
  on public.food_library_recipes for delete
  using (auth.uid() = user_id);

alter table public.ai_response_cache
  drop constraint if exists ai_response_cache_call_type_check;

alter table public.ai_response_cache
  add constraint ai_response_cache_call_type_check
  check (call_type in ('text-parse', 'vision', 'weekly-review', 'nutrition-summary', 'library-recipe'));

alter table public.ai_call_log
  drop constraint if exists ai_call_log_call_type_check;

alter table public.ai_call_log
  add constraint ai_call_log_call_type_check
  check (
    call_type in (
      'text-parse',
      'vision',
      'weekly-review',
      'image-analysis-sketch',
      'nutrition-summary',
      'library-recipe'
    )
  );

commit;

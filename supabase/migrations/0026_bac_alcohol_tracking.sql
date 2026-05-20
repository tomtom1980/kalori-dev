-- BAC alcohol tracking: profile sex tightening + alcohol ledger.

begin;

update public.profiles
set bio_sex = 'male'
where bio_sex = 'other';

alter table public.profiles
  drop constraint if exists profiles_bio_sex_check;

alter table public.profiles
  add constraint profiles_bio_sex_check
  check (bio_sex in ('male', 'female'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, bio_sex, age, height_cm, current_weight_kg, activity_level)
  values (new.id, 'male', 30, 170, 70, 'moderate');
  return new;
end;
$$;

alter table public.food_entries
  add constraint food_entries_id_user_id_unique
  unique (id, user_id);

create table if not exists public.alcohol_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  volume_ml numeric(8,2) not null check (volume_ml > 0 and volume_ml <= 5000),
  abv_percent numeric(5,2) not null check (abv_percent > 0 and abv_percent <= 100),
  alcohol_grams numeric(8,3) not null check (alcohol_grams > 0),
  consumed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint alcohol_logs_entry_owner_fk
    foreign key (entry_id, user_id)
    references public.food_entries(id, user_id)
    on delete cascade
);

create unique index if not exists alcohol_logs_entry_id_unique
  on public.alcohol_logs (entry_id);

create index if not exists alcohol_logs_user_consumed_at_idx
  on public.alcohol_logs (user_id, consumed_at desc);

alter table public.alcohol_logs enable row level security;

create policy "alcohol_logs_select_own"
  on public.alcohol_logs for select
  using (auth.uid() = user_id);

create policy "alcohol_logs_insert_own"
  on public.alcohol_logs for insert
  with check (auth.uid() = user_id);

create policy "alcohol_logs_update_own"
  on public.alcohol_logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "alcohol_logs_delete_own"
  on public.alcohol_logs for delete
  using (auth.uid() = user_id);

commit;

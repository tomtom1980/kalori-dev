-- supabase/migrations/0004_storage_buckets.sql — Task 3.1.
-- Lands the `food-thumbnails` Storage bucket + path-based RLS on
-- `storage.objects` so Task 3.3 (`/api/storage/thumbnail`) and downstream
-- dashboard / library thumbnail UI can persist + serve user thumbnails.
--
-- Bucket: NOT public. All access via authenticated REST + signed URLs
-- (10-min TTL, generated server-side via the user's Supabase client).
--
-- Path convention (architecture.md §4.1):
--   food-thumbnails/{user_id}/{entry_id_or_client_id}_{timestamp}.{jpg|webp}
--
-- The `{user_id}` segment IS the ownership marker — RLS extracts it via
-- `split_part(name, '/', 1)::uuid` and compares to `auth.uid()`. Any other
-- user attempting to read/write under a path with someone else's id prefix
-- is denied.
--
-- Policy shape note (briefing §6.B):
--   Architecture.md §4.1 ships ONE blanket `for all` policy. We expand into
--   4 verb-specific policies (select/insert/update/delete) for diff-
--   readability + verb-matrix alignment with `tests/rls/storage-bucket.test.ts`.
--   Equivalent semantics. Both shapes implement the same access rule.
--
-- DO NOT run `alter table storage.objects enable row level security` —
-- Supabase platform owns that already.

-- Bucket: idempotent insert.
insert into storage.buckets (id, name, public)
values ('food-thumbnails', 'food-thumbnails', false)
on conflict (id) do nothing;

-- Codex R1 A3: short-circuit malformed first-segment paths BEFORE the ::uuid
-- cast. Without the regex guard, paths like `..//foo`, `//foo`, `not-a-uuid/foo`
-- (or any non-UUID-shaped first segment) raise a hard Postgres error inside
-- the RLS predicate. Postgres's behavior on cast failures inside a policy
-- predicate can be unsafe — short-circuiting to predictable deny is the
-- intended posture. The strict 8-4-4-4-12 hex pattern rejects loose
-- look-alikes (e.g. `aaaaaaaa----------------------------`) that the bare
-- `[0-9a-f-]{36}$` form would let through to the cast.
create policy "food_thumbnails_select_own"
  on storage.objects for select
  using (
    bucket_id = 'food-thumbnails'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

create policy "food_thumbnails_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'food-thumbnails'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

create policy "food_thumbnails_update_own"
  on storage.objects for update
  using (
    bucket_id = 'food-thumbnails'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 1)::uuid = auth.uid()
  )
  with check (
    bucket_id = 'food-thumbnails'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

create policy "food_thumbnails_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'food-thumbnails'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(name, '/', 1)::uuid = auth.uid()
  );

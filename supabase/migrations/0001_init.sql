-- supabase/migrations/0001_init.sql — Task 1.2 baseline.
-- Idempotent: safe to re-run. Only ships the two Postgres extensions the
-- rest of the DDL (Task 2.1 profiles + Task 3.1 food schema) depends on.
--
-- - uuid-ossp  — random UUIDs for primary keys (auth.users.id is already UUID;
--                user-owned tables add uuid_generate_v4() defaults in 0002+).
-- - pgcrypto   — gen_random_uuid()/digest(); used by client_id idempotency
--                (Task 3.3 food_entries) and any hash-based keys.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

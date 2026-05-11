-- Migration 0005 — `ai_call_log.client_id` + partial unique index.
--
-- Codex Split A round 1 finding F-UI-3.6-A-2: the three AI routes accept a
-- `client_id` on the request body and validate it as a string, but they
-- never consume it. A retry of the same logical request therefore re-fires
-- Gemini, double-charges cost, and writes two `ai_call_log` rows — which
-- violates the stated I2 (exact-once ai_call_log) + I11 (`client_id`
-- idempotency) invariants.
--
-- This migration adds a nullable `client_id uuid` column and a PARTIAL
-- unique index `(user_id, client_id) where client_id is not null`. The
-- `where client_id is not null` clause keeps the migration safe for any
-- existing rows that landed before this feature — those rows stay with
-- `client_id = null` and are NOT subject to the uniqueness check.
--
-- Routes (app/api/ai/{text-parse,vision,weekly-review}/route.ts) are
-- updated in the same PR to: (a) validate `client_id` as `z.uuid()`,
-- (b) look up `ai_call_log` by `(user_id, client_id)` before firing
-- Gemini, returning the cached payload when a prior row exists, and
-- (c) record `client_id` on insert.

alter table public.ai_call_log
  add column if not exists client_id uuid;

-- Partial unique index — only rows with a non-null client_id are covered.
-- Pre-existing rows (client_id null) are exempt from the constraint.
create unique index if not exists ai_call_log_user_client_unique_idx
  on public.ai_call_log (user_id, client_id)
  where client_id is not null;

-- Index for the (user_id, client_id) lookup used in replay short-circuit.
-- The partial unique index above covers the exact same predicate, so it
-- doubles as the lookup index — no separate btree needed.

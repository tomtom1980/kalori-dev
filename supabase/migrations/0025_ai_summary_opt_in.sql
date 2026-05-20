-- Migration 0025 - explicit opt-in for passive AI nutrition summaries.
--
-- Dashboard/progress AI summaries send food, water, weight, and goal context
-- to Gemini without a direct per-request user action, so they must be gated
-- behind a profile-owned consent flag. Default false fails closed for all
-- existing accounts until the user enables summaries in Settings.

alter table public.profiles
  add column if not exists ai_summary_opt_in boolean not null default false;

-- Migration 0028 - default passive AI summaries to enabled.
--
-- The Settings control still lets a user turn dashboard/progress Gemini
-- summaries off. New profiles should start enabled, and existing rows from
-- the prior fail-closed default are promoted so the current production
-- experience matches the new default.

alter table public.profiles
  alter column ai_summary_opt_in set default true;

update public.profiles
set ai_summary_opt_in = true
where ai_summary_opt_in = false;

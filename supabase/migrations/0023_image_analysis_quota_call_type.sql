-- Add sketch-generation model calls to the service-role-only AI call log so
-- the shared AI image analysis quota can count real vision + sketch calls.

alter table public.ai_call_log
  drop constraint if exists ai_call_log_call_type_check;

alter table public.ai_call_log
  add constraint ai_call_log_call_type_check
  check (call_type in ('text-parse', 'vision', 'weekly-review', 'image-analysis-sketch'));

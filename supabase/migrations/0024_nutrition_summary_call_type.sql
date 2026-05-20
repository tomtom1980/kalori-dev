-- Add the shared nutrition-summary AI call type used by dashboard daily
-- summaries and progress range summaries.

alter table public.ai_response_cache
  drop constraint if exists ai_response_cache_call_type_check;

alter table public.ai_response_cache
  add constraint ai_response_cache_call_type_check
  check (call_type in ('text-parse', 'vision', 'weekly-review', 'nutrition-summary'));

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
      'nutrition-summary'
    )
  );

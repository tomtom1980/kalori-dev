-- Store the user's actual birthday while preserving the existing age column
-- for derived nutrition calculations and backwards-compatible queries.

alter table public.profiles
  add column if not exists birthday date;

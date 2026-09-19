-- Let several consecutive trip days share one lodging record.
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.trip_days
  add column if not exists lodging_source_day_id bigint
  references public.trip_days(id) on delete set null;

create index if not exists trip_days_lodging_source_day_id_idx
  on public.trip_days(lodging_source_day_id);

alter table public.trip_days
  drop constraint if exists trip_days_lodging_source_not_self;
alter table public.trip_days
  add constraint trip_days_lodging_source_not_self
  check (lodging_source_day_id is null or lodging_source_day_id <> id);

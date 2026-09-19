-- Add the day-first trip overview to an existing WazaWaza trip planner.
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.trips add column if not exists home_city text not null default 'Токио';
alter table public.trip_days add column if not exists city_destination_id bigint references public.trip_destinations(id) on delete set null;
alter table public.trip_days add column if not exists transport_mode text not null default 'train'
  check (transport_mode in ('train', 'bus', 'car', 'flight', 'ferry', 'walk', 'other'));
alter table public.trip_days add column if not exists transport_details text;
alter table public.trip_days add column if not exists transport_booking_url text;
alter table public.trip_days add column if not exists transport_departure_time time;
alter table public.trip_days add column if not exists transport_arrival_time time;
alter table public.trip_days add column if not exists transport_booked boolean not null default false;
alter table public.trip_days add column if not exists transport_paid boolean not null default false;

update public.trip_days as day
set destination_id = destination.id
from public.trip_destinations as destination
where day.destination_id is null
  and day.trip_id = destination.trip_id
  and nullif(trim(day.overnight_city), '') is not null
  and lower(trim(day.overnight_city)) = lower(trim(destination.name));

-- The activity city of every day after the first is normally the previous
-- night's city. The first day uses its arrival/overnight destination.
with ordered_days as (
  select id, trip_id, day_number, destination_id,
    lag(destination_id) over (partition by trip_id order by day_number) as previous_destination_id
  from public.trip_days
)
update public.trip_days as day
set city_destination_id = coalesce(ordered.previous_destination_id, ordered.destination_id)
from ordered_days as ordered
where day.id = ordered.id and day.city_destination_id is null;

grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_days to authenticated;

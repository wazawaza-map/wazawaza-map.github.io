-- Add optional there-and-back transport to individual trip stops.
-- Safe to run more than once in the Supabase SQL Editor.

alter table public.trip_stops add column if not exists to_transport_mode text
  check (to_transport_mode is null or to_transport_mode in ('train', 'bus', 'car', 'flight', 'ferry', 'walk', 'other'));
alter table public.trip_stops add column if not exists to_transport_details text;
alter table public.trip_stops add column if not exists to_departure_time time;
alter table public.trip_stops add column if not exists to_arrival_time time;
alter table public.trip_stops add column if not exists back_transport_mode text
  check (back_transport_mode is null or back_transport_mode in ('train', 'bus', 'car', 'flight', 'ferry', 'walk', 'other'));
alter table public.trip_stops add column if not exists back_transport_details text;
alter table public.trip_stops add column if not exists back_departure_time time;
alter table public.trip_stops add column if not exists back_arrival_time time;

grant select, insert, update, delete on public.trip_stops to authenticated;

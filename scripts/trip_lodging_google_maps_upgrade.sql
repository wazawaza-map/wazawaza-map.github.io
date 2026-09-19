-- Keep the public map link separate from the private booking link.
alter table public.trip_days
  add column if not exists lodging_google_maps_url text;

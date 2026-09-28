alter table public.place_translations
  add column if not exists comment text;

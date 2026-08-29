-- Run once in Supabase SQL Editor after creating the admin Auth user.
-- Assign the user role with the service role or SQL Editor, never from the browser:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';

alter table public.places
add column if not exists visited_at date;

alter table public.places enable row level security;
alter table public.place_translations enable row level security;

grant select, update on table public.places to authenticated;
grant select, update on table public.place_translations to authenticated;
grant insert on table public.place_translations to authenticated;

drop policy if exists "wazadmins can read all places" on public.places;
create policy "wazadmins can read all places"
on public.places for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "wazadmins can read all place translations" on public.place_translations;
create policy "wazadmins can read all place translations"
on public.place_translations for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "wazadmins can update places" on public.places;
create policy "wazadmins can update places"
on public.places for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "wazadmins can update place translations" on public.place_translations;
create policy "wazadmins can update place translations"
on public.place_translations for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "wazadmins can insert place translations" on public.place_translations;
create policy "wazadmins can insert place translations"
on public.place_translations for insert to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

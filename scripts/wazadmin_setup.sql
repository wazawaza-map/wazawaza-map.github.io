-- Run once in Supabase SQL Editor after creating the admin Auth user.
-- Assign the user role with the service role or SQL Editor, never from the browser:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'YOUR_ADMIN_EMAIL';

alter table public.places
add column if not exists visited_at date;

alter table public.places
add column if not exists visited boolean not null default false;

update public.places
set visited = true
where visited_at is not null and visited = false;

alter table public.places enable row level security;
alter table public.place_translations enable row level security;

grant select, insert, update on table public.places to authenticated;
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

drop policy if exists "wazadmins can insert places" on public.places;
create policy "wazadmins can insert places"
on public.places for insert to authenticated
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

-- Atomic permanent deletion for the admin UI. Related rows are removed first,
-- so this works even when the original foreign keys were created without cascade.
create or replace function public.delete_admin_place(target_place_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'admin role required' using errcode = '42501';
  end if;

  delete from public.route_places where place_id = target_place_id;
  delete from public.place_relations
  where place_id = target_place_id or related_place_id = target_place_id;
  delete from public.place_translations where place_id = target_place_id;
  delete from public.places where id = target_place_id;
end;
$$;

revoke all on function public.delete_admin_place(bigint) from public;
grant execute on function public.delete_admin_place(bigint) to authenticated;

-- Self-only private profile reader for the profile editor. SECURITY DEFINER is
-- deliberate: callers do not receive direct SELECT rights to private columns.
-- The body has no caller-controlled inputs and always filters by auth.uid().
create or replace function public.get_my_private_profile()
returns table (
  full_name text,
  phone text,
  address_line text,
  city text,
  country text,
  ice_name text,
  ice_phone text,
  avatar_path text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select p.full_name, p.phone, p.address_line, p.city, p.country,
         p.ice_name, p.ice_phone, p.avatar_path
  from public.profiles as p
  where p.id = (select auth.uid())
$$;

revoke all on function public.get_my_private_profile() from public, anon;
grant execute on function public.get_my_private_profile() to authenticated;

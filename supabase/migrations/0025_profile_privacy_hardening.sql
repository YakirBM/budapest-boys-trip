-- 0025_profile_privacy_hardening.sql — close direct reads of private profile
-- columns introduced in 0023. Kept separate because 0023 may already be live.

create or replace view public.v_profile_private with (security_barrier = true) as
select id, full_name, heb_name, phone, avatar_url, avatar_path, birth_date,
       citizenships, address_line, city, country, ice_name, ice_phone,
       created_at, updated_at
from public.profiles
where id = auth.uid();

-- Shared surfaces need identity, phone and avatar only. Exact address, ICE,
-- birth date and citizenship remain accessible through the self-only view.
revoke select on public.profiles from authenticated;
grant select (id, full_name, heb_name, phone, avatar_url, avatar_path, created_at, updated_at)
  on public.profiles to authenticated;
revoke all on public.v_profile_private from anon;
grant select on public.v_profile_private to authenticated;

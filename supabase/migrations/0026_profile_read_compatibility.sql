-- 0026_profile_read_compatibility.sql — temporary compatibility for the
-- currently deployed client, which still reads its private form fields from
-- public.profiles. Remove this broad grant in a coordinated deployment after
-- ProfileMenu (v_profile_private) is live; 0025 documents the target grants.
grant select on public.profiles to authenticated;

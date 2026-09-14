-- The RPC-backed ProfileMenu is now live. Remove the temporary table-wide
-- SELECT granted by 0026 and retain only fields used in shared trip surfaces.
revoke select on public.profiles from authenticated;
grant select (id, full_name, heb_name, phone, avatar_url, avatar_path, created_at, updated_at)
  on public.profiles to authenticated;

-- No client reads this compatibility view after the RPC rollout.
revoke all on public.v_profile_private from anon, authenticated;

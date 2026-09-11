-- Prevent trigger-only SECURITY DEFINER functions from being exposed as public
-- PostgREST RPC endpoints. RLS helper/RPC functions retain only the minimum
-- authenticated grant their policies or app calls require.

revoke all on function public.enforce_allowed_email() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.enforce_allowed_email() to supabase_auth_admin;
grant execute on function public.handle_new_user() to supabase_auth_admin;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

revoke all on function public.is_trip_member(uuid) from public, anon, authenticated;
revoke all on function public.is_active_trip_member(uuid) from public, anon, authenticated;
revoke all on function public.is_trip_owner(uuid) from public, anon, authenticated;
revoke all on function public.current_member_id(uuid) from public, anon, authenticated;
revoke all on function public.storage_trip_id(text) from public, anon, authenticated;
revoke all on function public.suggest_settlements(uuid) from public, anon, authenticated;
revoke all on function public.close_expired_polls() from public, anon, authenticated;

grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_active_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;
grant execute on function public.current_member_id(uuid) to authenticated;
grant execute on function public.storage_trip_id(text) to authenticated;
grant execute on function public.suggest_settlements(uuid) to authenticated;
grant execute on function public.close_expired_polls() to authenticated;

-- Both functions use only built-ins/fully qualified objects. Pinning the path
-- removes search-path injection warnings without changing trigger behaviour.
alter function public.set_updated_at() set search_path = '';
alter function public.storage_trip_id(text) set search_path = '';

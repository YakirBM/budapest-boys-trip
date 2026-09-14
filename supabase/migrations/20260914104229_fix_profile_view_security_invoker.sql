-- Make the self-only profile view evaluate permissions/RLS as the caller.
-- Keep security_barrier so predicates are not pushed through the privacy view.
alter view public.v_profile_private set (
  security_invoker = true,
  security_barrier = true
);

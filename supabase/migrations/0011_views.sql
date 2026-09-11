-- 0011_views.sql — balance views, settlement suggestion, poll auto-close
-- (docs/03 §8 + doc 06-features/09 rule 5).
--
-- Views are created WITH security_invoker so underlying RLS applies to the
-- calling user (Postgres 15; without it, any authenticated user could read every
-- trip's balances through the view owner's privileges).

-- Net balance per member (HUF): paid minus owed, over confirmed shared expenses.
create or replace view public.v_member_balances with (security_invoker = on) as
select tm.trip_id, tm.user_id,
       coalesce(paid.total, 0) - coalesce(owed.total, 0) as net_base_huf
from public.trip_members tm
left join (select trip_id, paid_by, sum(amount_base_huf) total
           from public.expenses
           where not is_personal and status in ('confirmed','settled') group by 1,2) paid
       on paid.trip_id = tm.trip_id and paid.paid_by = tm.user_id
left join (select e.trip_id, s.member_id, sum(s.computed_amount) total
           from public.expense_splits s join public.expenses e on e.id = s.expense_id
           where e.status in ('confirmed','settled') group by 1,2) owed
       on owed.trip_id = tm.trip_id and owed.member_id = tm.user_id;

-- Cost per day (shared, non-refunded expenses).
create or replace view public.v_day_cost with (security_invoker = on) as
select trip_id, day_number, sum(amount_base_huf) total_base_huf, count(*) expense_count
from public.expenses
where not is_personal and status <> 'refunded' and day_number is not null
group by 1, 2;

-- Greedy min-transfers settlement (≤ n−1 transfers). SECURITY DEFINER with an
-- explicit member check; the client calls it via RPC / Edge Function wrapper.
create or replace function public.suggest_settlements(p_trip uuid)
returns table (from_user uuid, to_user uuid, amount_base_huf numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  debtors jsonb; creditors jsonb; d_key text; c_key text; pay numeric;
begin
  if not is_trip_member(p_trip) then raise exception 'not a trip member'; end if;
  select coalesce(jsonb_object_agg(user_id, -net) filter (where net < 0), '{}'::jsonb),
         coalesce(jsonb_object_agg(user_id,  net) filter (where net > 0), '{}'::jsonb)
    into debtors, creditors
  from public.v_member_balances where trip_id = p_trip;
  while debtors <> '{}'::jsonb and creditors <> '{}'::jsonb loop
    select e.key, e.value::numeric into d_key, pay
      from jsonb_each_text(debtors) e order by e.value::numeric desc limit 1;  -- biggest debtor
    select e.key into c_key
      from jsonb_each_text(creditors) e order by e.value::numeric desc limit 1; -- biggest creditor
    pay := least(pay, (creditors ->> c_key)::numeric);
    from_user := d_key::uuid; to_user := c_key::uuid; amount_base_huf := pay;
    return next;
    debtors   := jsonb_set(debtors,   array[d_key], to_jsonb((debtors   ->> d_key)::numeric - pay));
    creditors := jsonb_set(creditors, array[c_key], to_jsonb((creditors ->> c_key)::numeric - pay));
    if (debtors   ->> d_key)::numeric = 0 then debtors   := debtors   - d_key; end if;
    if (creditors ->> c_key)::numeric = 0 then creditors := creditors - c_key; end if;
  end loop;
end $$;

-- close_expired_polls(): lazy reconcile + cron sweep (doc 06-features/09 rule 5).
--   * non-votes at the deadline count as abstain (they never block a result);
--   * majority: strict majority of cast votes wins; otherwise the top option wins
--     as plurality (label "רוב יחסי" is rendered by the UI);
--   * unanimous: all cast votes on one option wins; a split falls back to the
--     majority of cast votes;
--   * tie or zero votes → decided_option_id stays NULL (owner decides + logs).
-- Callable by any trip member (lazy reconcile on first read/write) and by the
-- service role / cron with no JWT (sweep). Anonymous callers are rejected.
create or replace function public.close_expired_polls()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_cast int;
  v_top_option uuid;
  v_top_count int;
  v_options_at_top int;
begin
  for r in
    select id from public.polls
    where status = 'open' and deadline <= now()
      and ( (auth.uid() is not null and is_trip_member(trip_id))
         or (auth.uid() is null and current_setting('request.jwt.claims', true) is null) )
  loop
    select count(*) into v_cast from public.votes where poll_id = r.id;

    if v_cast = 0 then
      update public.polls
         set status = 'closed', closed_at = now(), closed_reason = 'deadline',
             decided_option_id = null
       where id = r.id;
      continue;
    end if;

    select o_id, cnt into v_top_option, v_top_count
      from (select option_id o_id, count(*) cnt
              from public.votes where poll_id = r.id
             group by option_id order by cnt desc, option_id asc limit 1) top;

    select count(*) into v_options_at_top
      from (select option_id
              from public.votes where poll_id = r.id
             group by option_id having count(*) = v_top_count) ties;

    update public.polls
       set status = 'closed', closed_at = now(), closed_reason = 'deadline',
           decided_option_id = case when v_options_at_top = 1 then v_top_option end
     where id = r.id;
  end loop;
end $$;

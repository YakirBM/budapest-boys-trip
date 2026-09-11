-- 0017_fix_settlements.sql — bug fix: doc 03 §8's suggest_settlements referenced
-- a column `net` that does not exist (the view v_member_balances exposes
-- `net_base_huf`). plpgsql validates contained SQL at first execution, so the
-- bug surfaced only on the first real /money render. Doc 03 §8 updated to match.

create or replace function public.suggest_settlements(p_trip uuid)
returns table (from_user uuid, to_user uuid, amount_base_huf numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  debtors jsonb; creditors jsonb; d_key text; c_key text; pay numeric;
begin
  if not is_trip_member(p_trip) then raise exception 'not a trip member'; end if;
  select coalesce(jsonb_object_agg(user_id, -net_base_huf) filter (where net_base_huf < 0), '{}'::jsonb),
         coalesce(jsonb_object_agg(user_id,  net_base_huf) filter (where net_base_huf > 0), '{}'::jsonb)
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

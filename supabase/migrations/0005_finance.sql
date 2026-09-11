-- 0005_finance.sql — expenses, expense_splits, exchange_rates, budget_caps (docs/03 §4.4)
-- Audit extensions: expenses settled_amount/settled_currency/payment_method,
-- exchange_rates.is_override (C9), budget_caps (doc 06-features/05 tight-budget mode).
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  category expense_category not null default 'other',
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'HUF',
  amount_base_huf numeric(12,2),                     -- required when currency <> 'HUF'
  fx_rate_used numeric,
  spent_at timestamptz not null default now(),
  paid_by uuid not null references auth.users(id) on delete restrict,
  is_personal boolean not null default false,        -- personal: no splits, owner-only visibility
  tip numeric(12,2),
  fee numeric(12,2),
  receipt_media_id uuid,                             -- FK added in 0007 (media_items created later)
  note text,
  status expense_status not null default 'draft',
  day_number int check (day_number between 1 and 5),
  settled_amount numeric(12,2),                      -- amount actually settled back to the payer
  settled_currency char(3),
  payment_method text,                               -- cash / card / transfer — free text
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete restrict,
  method split_method not null,
  share_value numeric,                               -- exact amount | percent | share units
  computed_amount numeric(12,2) not null,            -- HUF share owed to the payer
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (expense_id, member_id)
);
-- percent splits must sum to 100 per expense: enforce in app + verify in tests.

create table public.exchange_rates (
  base char(3) not null,
  quote char(3) not null,
  rate numeric not null check (rate > 0),
  rate_type fx_rate_type not null default 'market',
  is_override boolean not null default false,        -- C9: manual override used by doc 08 finance UI
  fetched_at timestamptz not null default now(),
  source text not null,                              -- rule 5: no invented data
  created_at timestamptz not null default now(),
  check (base <> quote)
);
-- Written only by Edge Functions (service role); read-only for members.

-- Tight-budget caps (doc 06-features/05). scope 'day' = per-day total cap;
-- scope 'category' = cap for one expense category.
create table public.budget_caps (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  scope text not null check (scope in ('day','category')),
  category expense_category,
  cap_amount numeric(12,2) not null check (cap_amount > 0),
  currency char(3) not null default 'HUF',
  source text not null,                              -- rule 5: who/what defined the cap
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (scope <> 'category' or category is not null)
);

-- Place-library enrichment used by the confirmed add/edit workflow.
-- Nullable and additive so existing places and RLS policies remain compatible.
alter table public.places
  add column if not exists address_text text,
  add column if not exists phone text;

alter table public.places
  drop constraint if exists places_address_text_length,
  add constraint places_address_text_length
    check (address_text is null or char_length(address_text) between 1 and 300),
  drop constraint if exists places_phone_length,
  add constraint places_phone_length
    check (phone is null or char_length(phone) between 3 and 40);

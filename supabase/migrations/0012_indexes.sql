-- 0012_indexes.sql — every index from docs/03 §11
-- (PKs and UNIQUE constraints are already declared inline in 0002–0008.)
create index idx_trip_members_user_id        on public.trip_members (user_id);
create index idx_places_trip_status          on public.places (trip_id, status);
create index idx_accommodations_trip         on public.accommodations (trip_id);
create index idx_reservations_trip           on public.reservations (trip_id);

create index idx_itinerary_items_day_sort    on public.itinerary_items (day_plan_id, sort_order);
create index idx_itinerary_items_start_time  on public.itinerary_items (start_time);
create index idx_itinerary_items_place       on public.itinerary_items (place_id);

create index idx_expenses_trip_spent         on public.expenses (trip_id, spent_at desc);
create index idx_expenses_paid_by            on public.expenses (paid_by);
create index idx_expense_splits_expense      on public.expense_splits (expense_id);
create index idx_expense_splits_member       on public.expense_splits (member_id);

create index idx_exchange_rates_pair         on public.exchange_rates (base, quote, fetched_at desc);

create index idx_checklist_items_list_sort   on public.checklist_items (checklist_id, sort_order);
create index idx_checklist_items_assignee    on public.checklist_items (assignee_id);

create index idx_polls_trip_status           on public.polls (trip_id, status);
create index idx_poll_options_poll_sort      on public.poll_options (poll_id, sort_order);

create index idx_flight_passengers_flight    on public.flight_passengers (flight_id);
create index idx_flight_passengers_member    on public.flight_passengers (member_id);

create index idx_media_items_trip_uploaded   on public.media_items (trip_id, uploaded_at desc);
create index idx_media_items_uploader        on public.media_items (uploader_id);
create index idx_media_reactions_media       on public.media_reactions (media_id);

create index idx_documents_trip_owner        on public.documents (trip_id, owner_id);
create index idx_insurance_user              on public.insurance_policies (user_id);
create index idx_app_events_trip_created     on public.app_events (trip_id, created_at desc);
create index idx_app_events_entity           on public.app_events (entity_id);

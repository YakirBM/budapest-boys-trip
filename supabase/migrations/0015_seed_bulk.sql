-- ============================================================================
-- seed.sql — full idempotent seed (docs/09-import-and-seed.md; column names per
-- docs/03-data-model-and-rls.md — the schema wins).
--
-- Run AFTER all migrations:
--   psql "$DATABASE_URL" -f supabase/seed.sql      (or `supabase db reset` locally)
--
-- Idempotency: every statement uses fixed UUIDs + ON CONFLICT DO NOTHING, so
-- re-running never duplicates rows and never overwrites user edits.
-- Seeding inserts reference/anchor data only — user-owned data (expenses,
-- checklist completions, media) and flight_passengers are NEVER seeded
-- (passengers are created by the signup trigger, audit C2).
--
-- Hard rule: full reservation numbers / full e-ticket serials are NEVER stored —
-- masked forms only ('1385•••93', '4210•••••06').
--
-- Fixed UUID scheme: trip …0001 · day_plans …0101–0105 · flights …0201/0202 ·
-- places …0301–0317 · checklists …0401–0407 · checklist_items …05xx ·
-- transit_tickets …0601–0606 · transit_anchor_stations …0611–0614 ·
-- emergency_contacts …0621–0623.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Structural seed (identical to migration 0013_seed_structural.sql — kept
--    in sync; both are idempotent)
-- ---------------------------------------------------------------------------
insert into public.trips (
  id, name, city, country, start_date, end_date,
  tz_primary, tz_secondary, base_currency, created_by
) values (
  '00000000-0000-4000-8000-000000000001',
  'Budapest 2026',
  'Budapest',
  'HU',
  '2026-10-04',
  '2026-10-08',
  'Europe/Budapest',   -- UTC+2 on trip dates (CEST until late Oct)
  'Asia/Jerusalem',    -- UTC+3 on trip dates (IDT until late Oct)
  'HUF',
  null                 -- C1: first signed-up allowlisted owner claims the trip
)
on conflict (id) do nothing;

insert into public.allowed_emails (email, display_name, role, member_status, ticket_serial_masked, invited_by) values
  ('yakir.b.m.ite@gmail.com', 'Yakir Elazar Ben Menashe', 'owner',  'active',  '4210•••••06', null),
  ('aharonml123@gmail.com',   'Aharon Meyer Lawrence',    'member', 'active',  '4210•••••95', null),
  ('jonatannheh@gmail.com',   'Yehonatan Winestate',      'member', 'active',  '4210•••••73', null),
  ('barjohan25.11@gmail.com', 'Bar Mevorach Johan',       'member', 'active',  '4210•••••84', null),
  ('roeiduv@gmail.com',       'Roei',                     'member', 'pending', null,          null)
on conflict (email) do nothing;

insert into public.day_plans (id, trip_id, day_number, date, title) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 1, '2026-10-04', 'Arrival'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 2, '2026-10-05', 'Full day'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 3, '2026-10-06', 'Full day'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 4, '2026-10-07', 'Full day'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 5, '2026-10-08', 'Departure')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Flights — verified from the Arkia e-ticket (source: res 1385•••93, issued
--    2026-09-10). Arrival times are NOT printed on the ticket: arr_time stays
--    NULL with arr_time_verified = false until verified against Arkia —
--    never invent times (project hard rule 5).
-- ---------------------------------------------------------------------------
insert into public.flights (
  id, trip_id, direction, airline, flight_no,
  dep_airport, dep_terminal, arr_airport,
  dep_time, arr_time, arr_time_verified,
  booking_ref_masked, status, notes, source, last_verified_at
) values
  ('00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000001',
   'outbound', 'Arkia', 'IZ291', 'TLV', '3', 'BUD',
   '2026-10-04T16:35:00+03:00',   -- Asia/Jerusalem (IDT, UTC+3)
   null, false,
   '1385•••93', 'scheduled',
   'שעת הגעה אינה מודפסת על הכרטיס — לאמת מול ארקיע (arkia.co.il / *5758) ואז לעדכן arr_time + arr_time_verified. תיק יד 40×30×20 כלול; תיק יד משולב ≤8 ק״ג; מזוודה מוטאת/בבג׳ בתשלום.',
   'Arkia e-ticket res 1385•••93', '2026-09-10T12:00:00+03:00'),
  ('00000000-0000-4000-8000-000000000202',
   '00000000-0000-4000-8000-000000000001',
   'return', 'Arkia', 'IZ292', 'BUD', null, 'TLV',
   '2026-10-08T10:25:00+02:00',   -- Europe/Budapest (CEST, UTC+2)
   null, false,
   '1385•••93', 'scheduled',
   'שעת הגעה אינה מודפסת על הכרטיס — לאמת מול ארקיע ואז לעדכן arr_time + arr_time_verified. יום 5: יוצאים מהדירה 06:10 (Europe/Budapest) — לא לתכנן דבר אחרי ~07:30.',
   'Arkia e-ticket res 1385•••93', '2026-09-10T12:00:00+03:00')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Places — 5 operational anchors (approximate coordinates, each carrying a
--    verify task; rule 5) + the 12-place idea bank (docs/06-features/01,
--    status='idea', hours/prices deliberately NULL).
-- ---------------------------------------------------------------------------
insert into public.places (
  id, trip_id, name, type, lat, lng, google_maps_url, district,
  note, source, status, last_verified_at
) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001',
   'Budapest Airport (BUD)', 'airport', 47.4369, 19.2616,
   'https://maps.google.com/?q=Budapest+Airport+(BUD)', 'XVIII.',
   'approx anchor — verify before navigation', 'OpenStreetMap-level approx (unverified)',
   'approved', null),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001',
   'Deák Ferenc tér', 'transit_hub', 47.4979, 19.0547,
   'https://maps.google.com/?q=Deák+Ferenc+tér,+Budapest', 'V.',
   'approx anchor — verify; עוגן התחבורה — כל ההכוונה נכתבת ביחס אליו', 'OpenStreetMap-level approx (unverified)',
   'approved', null),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001',
   '100E Airport stop (BUD)', 'bus_stop', null, null, null, null,
   'verify exact stop location + fill lat/lng', 'bkk.hu (to verify)',
   'under_review', null),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001',
   '100E Deák Ferenc tér stop', 'bus_stop', null, null, null, null,
   'verify exact stop location + fill lat/lng', 'bkk.hu (to verify)',
   'under_review', null),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001',
   'Emergency numbers (HU)', 'emergency', null, null, null, null,
   'seeded — see medical/safety doc; EU-wide: tel:112', 'EU standard',
   'approved', '2026-09-11T12:00:00+03:00')
on conflict (id) do nothing;

insert into public.places (
  id, trip_id, name, type, district, tags, google_maps_url,
  note, source, status, est_price, opening_hours, needs_reservation, price_source, last_verified_at
) values
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001',
   'הפרלמנט ההונגרי (Országház)', 'attraction', 'V. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Hungarian+Parliament+Building+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות סיורים ומחיר כרטיסים לפני שיבוץ (חוק 5)',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000001',
   'מרפסת הדייגים (Halászbástya)', 'viewpoint', 'I. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Fishermans+Bastion+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות ותשלום על המרפסת העליונה',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000001',
   'מרחצאות סצ׳ני (Széchenyi)', 'bath', 'XIV. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Szechenyi+Baths+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות ומדיניות כרטיסים מקוונים',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000309', '00000000-0000-4000-8000-000000000001',
   'סימפלה קרט (Szimpla Kert)', 'bar', 'VII. kerület', array['verify-hours'],
   'https://maps.google.com/?q=Szimpla+Kert+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות פתיחה',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000001',
   'היכל השוק הגדול (Great Market Hall)', 'shopping', 'IX. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Great+Market+Hall+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות ויום סגירה מוקדמת',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000001',
   'בזיליקת אישטוון הקדוש (St. Stephen''s)', 'attraction', 'V. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=St+Stephens+Basilica+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות וכרטיס לכיפה',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000001',
   'גשר השרשראות (Chain Bridge)', 'attraction', 'V. kerület', array[]::text[],
   'https://maps.google.com/?q=Szechenyi+Chain+Bridge+Budapest',
   'רעיון מבנק הרעיונות — חצייה רגלית, אין שעות פתיחה',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000001',
   'טירת בודהה והפוניקולר (Buda Castle)', 'attraction', 'I. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Buda+Castle+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות ומחיר פוניקולר',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000001',
   'גבעת גלרט והמצודה (Gellért Hill)', 'viewpoint', 'XI. kerület', array['verify-hours'],
   'https://maps.google.com/?q=Gellert+Hill+Budapest',
   'רעיון מבנק הרעיונות — לתכנן מול השקיעה (~18:05–18:15 באוקטובר — לאמת)',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000315', '00000000-0000-4000-8000-000000000001',
   'בית הכנסת ברחוב דוהאני (Dohány Synagogue)', 'attraction', 'VII. kerület', array['verify-hours','verify-price'],
   'https://maps.google.com/?q=Dohany+Street+Synagogue+Budapest',
   'רעיון מבנק הרעיונות — לאמת שעות, מחיר, וסגירה בשבת',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000316', '00000000-0000-4000-8000-000000000001',
   'הפארק העירוני וטירת ואידה הוניאד (City Park)', 'attraction', 'XIV. kerület', array['verify-hours'],
   'https://maps.google.com/?q=City+Park+Vajdahunyad+Castle+Budapest',
   'רעיון מבנק הרעיונות — שטח פתוח; לאמת שעות ואידה הוניאד',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null),
  ('00000000-0000-4000-8000-000000000317', '00000000-0000-4000-8000-000000000001',
   'שייט בדנובה (Danube cruise)', 'attraction', null, array['verify-price'],
   'https://maps.google.com/?q=Danube+River+Cruise+Budapest',
   'רעיון מבנק הרעיונות — לאמת מפעילים, לוחות ומחירים משוערים',
   'idea bank: docs/06-features/01-route-and-places.md', 'idea',
   null, null, false, 'manual', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Checklists — the 7 seeded lists from docs/06-features/06-checklists.md
--    (audit C7: doc 06 wins over doc 09's 4 templates).
--    Scope per the doc 06 permission table; assignees are NULL pre-signup —
--    per-member expansion ("each member") is deferred (auth users do not exist
--    yet; see report + docs/03 §13).
-- ---------------------------------------------------------------------------
insert into public.checklists (id, trip_id, title, scope, owner_id, sort_order) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'לפני הטיסה',   'assigned', null, 10),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 'יום הטיסה',    'assigned', null, 20),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 'כניסה לדירה',  'group',    null, 30),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', 'כל בוקר',      'group',    null, 40),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', 'יציאה ללילה',  'group',    null, 50),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000001', 'יום החזרה',    'group',    null, 60),
  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-000000000001', 'אחרי הטיול',   'assigned', null, 70)
on conflict (id) do nothing;

-- (a) לפני הטיסה — items …0501–0509
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000401',
   'בדיקת תוקף דרכון (≥ 6 ח׳ אחרי 2026-10-08)',
   '⚠ כלל שנגן: תוקף ≥ 6 חודשים אחרי 2026-10-08 — לאמת ולתעד תוקף של כל דרכון',
   'doc', null, '2026-09-18T23:59:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 10),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000401',
   'רכישת ביטוח נסיעה + העלאת פוליסה',
   'מספר הפוליסה רגיש — העלאה לאזור הפרטי בלבד (docs/04-security-and-privacy.md)',
   'doc', null, '2026-09-25T23:59:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 20),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000401',
   'צ׳ק-אין אונליין Arkia',
   '⚠ חלון צ׳ק-אין T−24h לפי ארקיע — לאמת; קישור עמוק לעמוד הטיסות',
   'doc', null, '2026-10-03T16:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 30),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000401',
   'eSIM או חבילת רואמינג',
   'התקנה + בדיקת הפעלה לפני יום הטיסה',
   'purchase', null, '2026-10-01T23:59:00+03:00', 'important',
   'not_started', null, null, null, 120, null, 40),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000401',
   'החלפת מט"ח ראשונית / כרטיסים בין-לאומיים',
   'סכום = החלטת קבוצה (סקר); HUF בסיס (docs/06-features/05-finance.md)',
   'purchase', null, '2026-10-02T23:59:00+03:00', 'important',
   'not_started', null, null, null, 120, null, 50),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000401',
   'מטענים + מתאם EU (Type C/F)', null,
   'pack', null, '2026-10-03T23:59:00+03:00', 'normal',
   'not_started', null, null, null, 60, null, 60),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000401',
   'תרופות אישיות',
   'מותר לצרף פתק אישי פרטי',
   'safety', null, '2026-10-03T23:59:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 70),
  ('00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-000000000401',
   'הורדת BudapestGO + מפות אופליין',
   'מפות אופליין לאזור בודפשט',
   'pack', null, '2026-10-03T23:59:00+03:00', 'important',
   'not_started', null, null, null, 120, null, 80),
  ('00000000-0000-4000-8000-000000000509', '00000000-0000-4000-8000-000000000401',
   'הצטרפות לאפליקציה + בדיקת מג׳יק לינק',
   'מייל מותר-כניסה; לוודא שהתחברות במג׳יק-לינק עובדת',
   'admin', null, '2026-09-20T23:59:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 90)
on conflict (id) do nothing;

-- (b) יום הטיסה — items …0511–0517
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000402',
   'דרכון בתיק', null,
   'doc', null, '2026-10-04T13:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 10),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000402',
   'ארנק', null,
   'pack', null, '2026-10-04T13:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 20),
  ('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000402',
   'eSIM פעיל', null,
   'pack', null, '2026-10-04T13:35:00+03:00', 'important',
   'not_started', null, null, null, 120, null, 30),
  ('00000000-0000-4000-8000-000000000514', '00000000-0000-4000-8000-000000000402',
   'משקל מזוודה בתקנה',
   '⚠ תיק יד משולב ≤ 8 ק״ג לפי ארקיע — לאמת מול ההזמנה (docs/06-features/02-flights.md)',
   'pack', null, '2026-10-04T13:35:00+03:00', 'important',
   'not_started', null, null, null, 120, null, 40),
  ('00000000-0000-4000-8000-000000000515', '00000000-0000-4000-8000-000000000402',
   'הגעה לטרמינל 3 עד 13:35',
   'המראה 16:35 Asia/Jerusalem − 3 שעות כלל בדיקת נמל התעופה',
   'other', null, '2026-10-04T13:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 50),
  ('00000000-0000-4000-8000-000000000516', '00000000-0000-4000-8000-000000000402',
   'כרטיסי עלייה למטוס שמורים אופליין',
   'חסום ע״י צ׳ק-אין אונליין (רשימת לפני הטיסה)',
   'doc', null, '2026-10-04T16:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 60),
  ('00000000-0000-4000-8000-000000000517', '00000000-0000-4000-8000-000000000402',
   'עלינו למטוס (ספירה בשער)',
   'התלות הקנונית: ננעל עד להשלמת צ׳ק-אין אונליין של כל החברים (הרחבה פר-חבר תיווצר בהרשמה)',
   'other', null, '2026-10-04T16:35:00+03:00', 'critical',
   'not_started', null, null, null, 1440, null, 70)
on conflict (id) do nothing;

-- (c) כניסה לדירה — items …0521–0526 (activates after booking; doc 06-features/03)
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000403',
   'Wi-Fi עובד', 'סיסמה → פתק משותף (לא רגיש)',
   'other', null, null, 'important',
   'not_started', null, null, null, null, null, 10),
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000403',
   'קוד לדלת עובד', null,
   'other', null, null, 'critical',
   'not_started', null, null, null, null, null, 20),
  ('00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000403',
   'ספירת מיטות ×4', '+1 אם רואי מאושר',
   'other', null, null, 'critical',
   'not_started', null, null, null, null, null, 30),
  ('00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000403',
   'תיעוד ניקיון/נזקים בתמונות', 'תמונות ל-trip-media (signed URLs) — הגנה על הפיקדון',
   'doc', null, null, 'important',
   'not_started', null, null, null, null, null, 40),
  ('00000000-0000-4000-8000-000000000525', '00000000-0000-4000-8000-000000000403',
   'מפתחות/קודים אצל כולם', null,
   'other', null, null, 'critical',
   'not_started', null, null, null, null, null, 50),
  ('00000000-0000-4000-8000-000000000526', '00000000-0000-4000-8000-000000000403',
   'מיקום מרכול קרוב', 'פין במפה המשותפת',
   'other', null, null, 'normal',
   'not_started', null, null, null, null, null, 60)
on conflict (id) do nothing;

-- (d) כל בוקר — items …0531–0536 (template; duplicated daily from the app)
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000404',
   'מטענים', null, 'pack', null, null, 'normal', 'not_started', null, null, null, null, null, 10),
  ('00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000404',
   'מים', null, 'pack', null, null, 'normal', 'not_started', null, null, null, null, null, 20),
  ('00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000404',
   'פאוור בנק טעון', null, 'pack', null, null, 'important', 'not_started', null, null, null, null, null, 30),
  ('00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000404',
   'ארנק', null, 'pack', null, null, 'critical', 'not_started', null, null, null, null, null, 40),
  ('00000000-0000-4000-8000-000000000535', '00000000-0000-4000-8000-000000000404',
   'שכבה ל־7–18°C', '⚠ הערכה קלימטולוגית לאוקטובר — לאמת מול תחזית אמיתית',
   'pack', null, null, 'normal', 'not_started', null, null, null, null, null, 50),
  ('00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000404',
   'מטרייה לפי התחזית', 'מוצג רק כשסבירות הגשם גבוהה',
   'pack', null, null, 'normal', 'not_started', null, null, null, null, null, 60)
on conflict (id) do nothing;

-- (e) יציאה ללילה — items …0541–0545 (template; duplicated per night)
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000541', '00000000-0000-4000-8000-000000000405',
   'תוכנית חזרה ידועה (קו אחרון)', '⚠ לאמת לוח תחבורת הלילה באותו יום (BudapestGO)',
   'safety', null, null, 'critical', 'not_started', null, null, null, null, null, 10),
  ('00000000-0000-4000-8000-000000000542', '00000000-0000-4000-8000-000000000405',
   'סוללה', null, 'pack', null, null, 'normal', 'not_started', null, null, null, null, null, 20),
  ('00000000-0000-4000-8000-000000000543', '00000000-0000-4000-8000-000000000405',
   'אמצעי תשלום (כרטיס + מעט מזומן)', null, 'other', null, null, 'important', 'not_started', null, null, null, null, null, 30),
  ('00000000-0000-4000-8000-000000000544', '00000000-0000-4000-8000-000000000405',
   'נקודת מפגש אם נפרדים', 'נקבע לפני המשקה הראשון',
   'safety', null, null, 'important', 'not_started', null, null, null, null, null, 40),
  ('00000000-0000-4000-8000-000000000545', '00000000-0000-4000-8000-000000000405',
   'לא להשאיר משקה ללא השגחה', 'כלל בטיחות — הסימון = אישור',
   'safety', null, null, 'critical', 'not_started', null, null, null, null, null, 50)
on conflict (id) do nothing;

-- (f) יום החזרה — items …0551–0556 (IZ292 departs 10:25 Europe/Budapest)
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000551', '00000000-0000-4000-8000-000000000406',
   'אריזה מלאה', 'ערב שלפני (2026-10-07 22:00)',
   'pack', null, '2026-10-07T22:00:00+03:00', 'critical', 'not_started', null, null, null, 1440, null, 10),
  ('00000000-0000-4000-8000-000000000552', '00000000-0000-4000-8000-000000000406',
   'סוויפ של החדר (מטענים, מתאם, דרכון!)', null,
   'pack', null, '2026-10-08T05:30:00+02:00', 'critical', 'not_started', null, null, null, 1440, null, 20),
  ('00000000-0000-4000-8000-000000000553', '00000000-0000-4000-8000-000000000406',
   'צ׳ק-אאוט', null,
   'other', null, '2026-10-08T06:10:00+02:00', 'critical', 'not_started', null, null, null, 1440, null, 30),
  ('00000000-0000-4000-8000-000000000554', '00000000-0000-4000-8000-000000000406',
   'החזרת מפתחות/קודים', null,
   'other', null, '2026-10-08T06:10:00+02:00', 'critical', 'not_started', null, null, null, 1440, null, 40),
  ('00000000-0000-4000-8000-000000000555', '00000000-0000-4000-8000-000000000406',
   'יציאה בזמן — 06:10', '⚠ לאמת לוח 100E ב-BudapestGO קרוב לתאריך. 06:10 יציאה → 06:30 קו 100E → ~07:25 BUD → 10:25 המראה (כל השעות Europe/Budapest)',
   'other', null, '2026-10-08T06:10:00+02:00', 'critical', 'not_started', null, null, null, 1440, null, 50),
  ('00000000-0000-4000-8000-000000000556', '00000000-0000-4000-8000-000000000406',
   'תוכנית לשארית HUF', '⚠ שערי ההמרה בנתב״א גרועים — לאמת; עדיף לבזבז או לשמור',
   'other', null, '2026-10-08T06:10:00+02:00', 'normal', 'not_started', null, null, null, 60, null, 60)
on conflict (id) do nothing;

-- (g) אחרי הטיול — items …0561–0565 (due 2026-10-15)
insert into public.checklist_items
  (id, checklist_id, title, description, type, assignee_id, due_at, priority,
   status, blocked_by_id, link, attachment_path, reminder_offset_minutes, created_by, sort_order)
values
  ('00000000-0000-4000-8000-000000000561', '00000000-0000-4000-8000-000000000407',
   'סגירת חובות (עד 7 ימים)', 'קישור לתוכנית ההסדרה בכסף (docs/06-features/05-finance.md)',
   'other', null, '2026-10-15T23:59:00+03:00', 'critical', 'not_started', null, null, null, 1440, null, 10),
  ('00000000-0000-4000-8000-000000000562', '00000000-0000-4000-8000-000000000407',
   'הורדת תמונות משותפות', 'מקיר המדיה',
   'other', null, '2026-10-15T23:59:00+03:00', 'important', 'not_started', null, null, null, 120, null, 20),
  ('00000000-0000-4000-8000-000000000563', '00000000-0000-4000-8000-000000000407',
   'גיבוי קבצים (קבלות, מסמכים)', null,
   'doc', null, '2026-10-15T23:59:00+03:00', 'important', 'not_started', null, null, null, 120, null, 30),
  ('00000000-0000-4000-8000-000000000564', '00000000-0000-4000-8000-000000000407',
   'דירוג מקומות', 'מזין תבניות לטיול הבא',
   'other', null, '2026-10-15T23:59:00+03:00', 'normal', 'not_started', null, null, null, 60, null, 40),
  ('00000000-0000-4000-8000-000000000565', '00000000-0000-4000-8000-000000000407',
   'ייצוא CSV מהכסף', null,
   'doc', null, '2026-10-15T23:59:00+03:00', 'normal', 'not_started', null, null, null, 60, null, 50)
on conflict (id) do nothing;

-- check-in → boarding passes / boarded chain (checklist_item_blocks, audit C5;
-- per-member expansion of the chain happens at signup)
insert into public.checklist_item_blocks (item_id, blocked_by_item_id) values
  ('00000000-0000-4000-8000-000000000516', '00000000-0000-4000-8000-000000000503'),
  ('00000000-0000-4000-8000-000000000517', '00000000-0000-4000-8000-000000000503')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5) Transport — tickets (prices NOT invented: NULL unless flagged estimate),
--    anchor stations (Deák central; accommodation + night meeting TBD).
-- ---------------------------------------------------------------------------
insert into public.transit_tickets
  (id, trip_id, code, name_he, name_en, price_huf, validity_text, notes, verified, source, last_verified_at)
values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001',
   'single', 'כרטיס נסיעה בודד', 'Single ticket', null, null, 'לאמת מחיר ותוקף ב-bkk.hu', false, 'bkk.hu', null),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001',
   'block10', 'מחסנית 10 נסיעות', 'Block of 10 tickets', null, null, 'לאמת מחיר ב-bkk.hu', false, 'bkk.hu', null),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000001',
   '24h', 'כרטיס 24 שעות', '24-hour ticket', null, null, 'לאמת מחיר ב-bkk.hu', false, 'bkk.hu', null),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000001',
   '72h', 'כרטיס 72 שעות', '72-hour ticket', null, null, 'לאמת מחיר ב-bkk.hu', false, 'bkk.hu', null),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000001',
   'group_24h', 'כרטיס קבוצתי 24 שעות', 'Group 24-hour ticket', null, null, 'לאמת מחיר ותנאים ב-bkk.hu', false, 'bkk.hu', null),
  ('00000000-0000-4000-8000-000000000606', '00000000-0000-4000-8000-000000000001',
   '100e', 'קו 100E — אקספרס נתב״א', '100E airport express', 2500, null,
   'מחיר משוער (~2,500 HUF) — לא אומת; לאמת ב-bkk.hu', false, 'bkk.hu', null)
on conflict (id) do nothing;

insert into public.transit_anchor_stations
  (id, trip_id, role, name_he, name_en, lines, place_id, lat, lng, notes, verified)
values
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000001',
   'central', 'דיאק פרנץ טר', 'Deák Ferenc tér', array['M1','M2','M3'],
   '00000000-0000-4000-8000-000000000302', 47.4979, 19.0547,
   'עוגן התחבורה של הטיול — כל ההכוונה נכתבת ביחס אליו (קואורדינטות משוערות — לאמת)', false),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000001',
   'accommodation', 'התחנה הקרובה לדירה (TBD)', 'Nearest stop to accommodation (TBD)', array[]::text[],
   null, null, null,
   'TBD עד הזמנת הדירה (דדליין 2026-09-20)', false),
  ('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000001',
   'airport_100e', 'תחנת 100E בנתב״א', '100E airport stop', array['100E'],
   '00000000-0000-4000-8000-000000000303', null, null,
   'מיקום התחנה המדויק לאמת (bkk.hu)', false),
  ('00000000-0000-4000-8000-000000000614', '00000000-0000-4000-8000-000000000001',
   'night_meeting', 'נקודת מפגש לילית (TBD)', 'Night meeting point (TBD)', array[]::text[],
   null, null, null,
   'נקבע ע״י מנהל הטיול לפני יציאת הלילה הראשונה', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6) Emergency contacts (docs/09; consular contact deliberately NOT seeded —
--    verify against the Israeli MFA site first — never invent).
-- ---------------------------------------------------------------------------
insert into public.emergency_contacts
  (id, trip_id, label, phone, kind, source, last_verified_at, sort_order)
values
  ('00000000-0000-4000-8000-000000000621', '00000000-0000-4000-8000-000000000001',
   'מוקד חירום אירופי (112)', '112', 'emergency', 'EU standard', '2026-09-11T12:00:00+03:00', 10),
  ('00000000-0000-4000-8000-000000000622', '00000000-0000-4000-8000-000000000001',
   'ארקיע — תמיכה (חו״ל)', '+972-3-6903712', 'airline', 'Arkia e-ticket', '2026-09-10T12:00:00+03:00', 20),
  ('00000000-0000-4000-8000-000000000623', '00000000-0000-4000-8000-000000000001',
   'ארקיע — תמיכה (ישראל, *5758)', '*5758', 'airline', 'Arkia e-ticket', '2026-09-10T12:00:00+03:00', 30)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Deliberately NOT seeded:
--   * flight_passengers — created per member by the signup trigger (audit C2)
--   * exchange_rates / weather_cache — cron/Edge-Function only
--   * expenses, budget caps, polls, media, documents — user-owned data
--   * Israeli consular contact — verify vs MFA first (never invent)
-- ---------------------------------------------------------------------------

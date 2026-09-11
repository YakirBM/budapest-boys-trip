-- Cover foreign keys used by album ownership checks and member reaction lookup.
-- Existing media item album/place foreign keys are indexed in the metadata migration.
create index media_albums_created_by on public.media_albums (created_by);
create index if not exists media_reactions_member_id on public.media_reactions (member_id);

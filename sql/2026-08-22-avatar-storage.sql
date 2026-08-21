-- Public Storage bucket for user-uploaded profile pictures (custom avatar uploads only — the
-- 10 built-in preset avatars are plain static SVG files served from /avatars/, not this bucket).
-- Public so uploaded photos can be served directly via their public URL; all writes go through
-- lib/authHandlers.js's handleUpdateAvatar using the service_role key, which bypasses Storage's
-- RLS entirely, so no policies are required for our own upload path.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

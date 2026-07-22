-- Phase 5 migration — private Storage bucket for whiteboard photos + staff RLS.
-- Run in the Supabase SQL editor. Idempotent.
--
-- The app reads/writes these objects through the service-role client (which
-- bypasses RLS), so the policy below is defense-in-depth: it ensures that even a
-- direct anon/authenticated call can only touch this bucket if the caller is staff.

insert into storage.buckets (id, name, public)
values ('whiteboards', 'whiteboards', false)
on conflict (id) do nothing;

drop policy if exists whiteboards_staff_all on storage.objects;
create policy whiteboards_staff_all on storage.objects for all to authenticated
  using (bucket_id = 'whiteboards' and public.is_staff(auth.uid()))
  with check (bucket_id = 'whiteboards' and public.is_staff(auth.uid()));

-- Idempotent RLS setup for an already-deployed database.
-- Safe to run multiple times. Mirrors the RLS section of schema.sql.
-- Run this in the Supabase SQL editor if authenticated reads return no rows.

-- Confirm current state (before) --------------------------------------------
-- select relrowsecurity as rls_on from pg_class where relname = 'profiles';
-- select policyname, cmd from pg_policies where tablename = 'profiles';

-- Helper functions (SECURITY DEFINER avoids RLS recursion) -------------------
create or replace function public.is_active(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = uid and status = 'active');
$$;

create or replace function public.is_staff(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = uid and status = 'active' and role in ('coach', 'admin')
  );
$$;

-- profiles -------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_active(auth.uid()) or is_staff(auth.uid()));

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke update on profiles from authenticated;
grant update (name, photo_url) on profiles to authenticated;

-- personal_bests -------------------------------------------------------------
alter table personal_bests enable row level security;
drop policy if exists pb_owner_all on personal_bests;
create policy pb_owner_all on personal_bests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists pb_read_club on personal_bests;
create policy pb_read_club on personal_bests for select to authenticated
  using (visibility = 'club' and is_active(auth.uid()));

-- movements / benchmarks -----------------------------------------------------
alter table movements enable row level security;
alter table benchmarks enable row level security;
drop policy if exists movements_read on movements;
create policy movements_read on movements for select to authenticated using (true);
drop policy if exists benchmarks_read on benchmarks;
create policy benchmarks_read on benchmarks for select to authenticated using (true);

-- sessions / templates -------------------------------------------------------
alter table sessions enable row level security;
alter table session_templates enable row level security;
drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select to authenticated
  using (is_active(auth.uid()));
drop policy if exists sessions_staff_write on sessions;
create policy sessions_staff_write on sessions for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));
drop policy if exists templates_read on session_templates;
create policy templates_read on session_templates for select to authenticated
  using (is_active(auth.uid()));
drop policy if exists templates_staff_write on session_templates;
create policy templates_staff_write on session_templates for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

-- signups --------------------------------------------------------------------
alter table signups enable row level security;
drop policy if exists signups_read on signups;
create policy signups_read on signups for select to authenticated
  using (is_active(auth.uid()));
drop policy if exists signups_own_write on signups;
create policy signups_own_write on signups for all to authenticated
  using (profile_id = auth.uid() and is_active(auth.uid()))
  with check (profile_id = auth.uid() and is_active(auth.uid()));

-- results --------------------------------------------------------------------
alter table results enable row level security;
drop policy if exists results_read on results;
create policy results_read on results for select to authenticated
  using (is_active(auth.uid()));
drop policy if exists results_own_write on results;
create policy results_own_write on results for all to authenticated
  using (profile_id = auth.uid() and source = 'self')
  with check (profile_id = auth.uid() and source = 'self');

-- whiteboard_uploads ---------------------------------------------------------
alter table whiteboard_uploads enable row level security;
drop policy if exists whiteboard_staff on whiteboard_uploads;
create policy whiteboard_staff on whiteboard_uploads for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

-- Confirm (after): profiles_select should now be listed ----------------------
-- select policyname, cmd from pg_policies where tablename = 'profiles';

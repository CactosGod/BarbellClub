-- Phase 6 migration — allow "unclaimed" historical results and auto-claim them.
-- Idempotent. Run in the Supabase SQL editor. Mirrors schema.sql.

-- A result may now be unclaimed: no member profile, identified by the board name.
alter table results alter column profile_id drop not null;
alter table results add column if not exists board_name text;

alter table results drop constraint if exists results_identity_ck;
alter table results add constraint results_identity_ck
  check (num_nonnulls(profile_id, board_name) >= 1);

-- Dedup unclaimed rows within a session (the (session_id, profile_id) unique
-- treats nulls as distinct, so it doesn't cover these).
create unique index if not exists results_unclaimed_uk
  on results (session_id, lower(board_name))
  where profile_id is null;

-- Attach unclaimed results to a member whose name (or first name) matches the
-- board name, skipping sessions where they already have a result.
create or replace function public.claim_results(uid uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  pname text;
  fname text;
  n integer;
begin
  select name, lower(split_part(name, ' ', 1)) into pname, fname
  from profiles where id = uid;
  if pname is null then return 0; end if;

  update results r set profile_id = uid
  where r.profile_id is null
    and lower(r.board_name) in (lower(pname), fname)
    and not exists (
      select 1 from results r2
      where r2.session_id = r.session_id and r2.profile_id = uid
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

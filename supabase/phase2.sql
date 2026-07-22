-- Phase 2 migration — session capacity enforcement.
-- Idempotent. Run in the Supabase SQL editor against the deployed database.
-- Mirrors the capacity trigger added to schema.sql.

-- Enforce session capacity atomically. Locking the session row serializes
-- concurrent sign-ups for the same session, so the count can't be raced past
-- the limit. capacity IS NULL means unlimited.
create or replace function public.enforce_session_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cap int;
  taken int;
begin
  select capacity into cap from sessions where id = new.session_id for update;
  if cap is null then
    return new;
  end if;
  select count(*) into taken from signups where session_id = new.session_id;
  if taken >= cap then
    raise exception 'Session is full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_capacity on signups;
create trigger trg_enforce_capacity before insert on signups
  for each row execute function public.enforce_session_capacity();

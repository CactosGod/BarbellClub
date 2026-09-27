-- Phase 7 migration — signup RSVP status (in | out).
-- Idempotent. Run in the Supabase SQL editor against the deployed database.
-- "out" is the Nilkkatulehdus RSVP: it does not take a spot or count as attendance.

alter table signups add column if not exists status text not null default 'in';

alter table signups drop constraint if exists signups_status_check;
alter table signups
  add constraint signups_status_check check (status in ('in', 'out'));

-- Capacity counts only "in" rows, including an update from out → in.
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
  if new.status is distinct from 'in' then
    return new;
  end if;
  select count(*) into taken from signups
    where session_id = new.session_id
      and status = 'in'
      and profile_id is distinct from new.profile_id;
  if taken >= cap then
    raise exception 'Session is full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_capacity on signups;
create trigger trg_enforce_capacity before insert or update on signups
  for each row execute function public.enforce_session_capacity();

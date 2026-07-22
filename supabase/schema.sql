-- KMBC portal schema (Supabase / Postgres)

create type user_role as enum ('member', 'coach', 'admin');
create type user_status as enum ('pending', 'active', 'inactive');
create type score_type as enum ('time', 'rounds_reps', 'load', 'text');
create type result_source as enum ('self', 'whiteboard', 'import');
create type visibility as enum ('private', 'club');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  photo_url text,
  role user_role not null default 'member',
  status user_status not null default 'pending',
  joined_at date default current_date,
  created_at timestamptz default now()
);

create table movements (
  id serial primary key,
  name text unique not null,
  unit text not null default 'kg'
);

create table benchmarks (
  id serial primary key,
  name text unique not null,
  score_type score_type not null,
  description text
);

create table personal_bests (
  id bigserial primary key,
  profile_id uuid references profiles not null,
  movement_id int references movements,
  benchmark_id int references benchmarks,
  value numeric,          -- kg for movements; seconds or reps for benchmarks
  value_text text,        -- fallback display, e.g. "4:32"
  achieved_on date,
  visibility visibility not null default 'private',
  check (num_nonnulls(movement_id, benchmark_id) = 1),
  unique (profile_id, movement_id),
  unique (profile_id, benchmark_id)
);

create table session_templates (
  id serial primary key,
  weekday int not null,           -- 0=Mon
  start_time time not null,
  title text not null,
  active boolean default true
);

create table sessions (
  id bigserial primary key,
  date date not null,
  start_time time,
  title text not null default 'Barbell Club',
  wod_description text,
  reveal_at timestamptz,          -- null = visible immediately
  capacity int,
  coach_id uuid references profiles,
  template_id int references session_templates,
  movement_id int references movements,    -- optional: tags this session as a named
  benchmark_id int references benchmarks,   -- lift or benchmark, for PB comparison
  created_at timestamptz default now(),
  check (num_nonnulls(movement_id, benchmark_id) <= 1),
  unique (date, start_time)
);

create table signups (
  session_id bigint references sessions on delete cascade,
  profile_id uuid references profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (session_id, profile_id)
);

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

create trigger trg_enforce_capacity before insert on signups
  for each row execute function public.enforce_session_capacity();

create table results (
  id bigserial primary key,
  session_id bigint references sessions on delete cascade not null,
  -- Null profile_id = an "unclaimed" historical row identified by board_name; it
  -- claims to a member (via claim_results) when they sign up. Otherwise set.
  profile_id uuid references profiles,
  board_name text,                -- name as written on the whiteboard (import)
  score_type score_type not null,
  value numeric,
  value_text text not null,       -- canonical display string
  rx boolean default true,
  source result_source not null default 'self',
  verified boolean default false, -- true once coach-reviewed or self-logged
  created_at timestamptz default now(),
  check (num_nonnulls(profile_id, board_name) >= 1),
  unique (session_id, profile_id)
);

-- Dedup unclaimed rows within a session (nulls are distinct, so the unique above
-- doesn't cover them). Case-insensitive on the board name.
create unique index results_unclaimed_uk
  on results (session_id, lower(board_name))
  where profile_id is null;

-- Attach any unclaimed historical results to a member whose name (or first name)
-- matches the board name, skipping sessions where they already have a result.
-- SECURITY DEFINER so it can run from the signup path.
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

create table whiteboard_uploads (
  id bigserial primary key,
  session_id bigint references sessions on delete cascade not null,
  photo_path text not null,       -- supabase storage path
  raw_parse jsonb,
  review_status text not null default 'pending', -- pending | reviewed | discarded
  uploaded_by uuid references profiles,
  created_at timestamptz default now()
);

-- Seed catalogs
insert into movements (name) values
  ('Snatch'), ('Clean & Jerk'), ('Clean'), ('Jerk'), ('Front Squat'),
  ('Back Squat'), ('Overhead Squat'), ('Deadlift'), ('Strict Press'),
  ('Push Press'), ('Bench Press');

insert into benchmarks (name, score_type) values
  ('Fran', 'time'), ('Murph', 'time'), ('Grace', 'time'), ('Isabel', 'time'),
  ('Helen', 'time'), ('Diane', 'time'), ('DT', 'time'), ('Karen', 'time'),
  ('Cindy', 'rounds_reps');

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Helpers run SECURITY DEFINER so they can read profiles without tripping the
-- table's own RLS (which would recurse). search_path pinned for safety.

create or replace function public.is_active(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles where id = uid and status = 'active'
  );
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

-- Any active member (or staff) may read the roster; everyone may read own row.
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_active(auth.uid()) or is_staff(auth.uid()));

-- A member may edit only their own row. Column-level grants below prevent them
-- from changing role/status; staff mutate those via the service-role client.
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke update on profiles from authenticated;
grant update (name, photo_url) on profiles to authenticated;

-- personal_bests -------------------------------------------------------------
alter table personal_bests enable row level security;

create policy pb_owner_all on personal_bests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy pb_read_club on personal_bests for select to authenticated
  using (visibility = 'club' and is_active(auth.uid()));

-- movements / benchmarks: public read-only catalogs ---------------------------
alter table movements enable row level security;
alter table benchmarks enable row level security;
create policy movements_read on movements for select to authenticated using (true);
create policy benchmarks_read on benchmarks for select to authenticated using (true);

-- sessions / templates -------------------------------------------------------
alter table sessions enable row level security;
alter table session_templates enable row level security;

create policy sessions_read on sessions for select to authenticated
  using (is_active(auth.uid()));
create policy sessions_staff_write on sessions for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

create policy templates_read on session_templates for select to authenticated
  using (is_active(auth.uid()));
create policy templates_staff_write on session_templates for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

-- signups --------------------------------------------------------------------
alter table signups enable row level security;

create policy signups_read on signups for select to authenticated
  using (is_active(auth.uid()));
create policy signups_own_write on signups for all to authenticated
  using (profile_id = auth.uid() and is_active(auth.uid()))
  with check (profile_id = auth.uid() and is_active(auth.uid()));

-- results --------------------------------------------------------------------
alter table results enable row level security;

create policy results_read on results for select to authenticated
  using (is_active(auth.uid()));
-- Members log their own self-sourced results; staff (whiteboard/import) go
-- through the service-role client, which bypasses RLS.
create policy results_own_write on results for all to authenticated
  using (profile_id = auth.uid() and source = 'self')
  with check (profile_id = auth.uid() and source = 'self');

-- whiteboard_uploads: staff only ---------------------------------------------
alter table whiteboard_uploads enable row level security;
create policy whiteboard_staff on whiteboard_uploads for all to authenticated
  using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

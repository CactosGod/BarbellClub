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
  created_at timestamptz default now(),
  unique (date, start_time)
);

create table signups (
  session_id bigint references sessions on delete cascade,
  profile_id uuid references profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (session_id, profile_id)
);

create table results (
  id bigserial primary key,
  session_id bigint references sessions on delete cascade not null,
  profile_id uuid references profiles not null,
  score_type score_type not null,
  value numeric,
  value_text text not null,       -- canonical display string
  rx boolean default true,
  source result_source not null default 'self',
  verified boolean default false, -- true once coach-reviewed or self-logged
  created_at timestamptz default now(),
  unique (session_id, profile_id)
);

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

-- RLS sketch (enable + policies; Claude Code: flesh out per table)
-- profiles: user reads all active; updates own row (except role/status);
--           coach/admin update role/status.
-- personal_bests: owner full access; others read only where visibility='club'.
-- sessions/signups: active members read; signups insert/delete own; coach CRUD sessions.
-- results: active members read; insert/update own (source='self');
--          coach upsert any (source='whiteboard').
-- whiteboard_uploads: coach/admin only.

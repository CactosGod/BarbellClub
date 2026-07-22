-- Phase 4 migration — tag a session with a movement or benchmark so a logged
-- result can be compared against the member's PB. Idempotent.
-- Run in the Supabase SQL editor against the deployed database.

alter table sessions add column if not exists movement_id int references movements;
alter table sessions add column if not exists benchmark_id int references benchmarks;

alter table sessions drop constraint if exists sessions_single_tag;
alter table sessions add constraint sessions_single_tag
  check (num_nonnulls(movement_id, benchmark_id) <= 1);

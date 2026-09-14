-- TITANIA ATTENDANCE FOUNDATION
-- Run this in Supabase Dashboard > SQL Editor AFTER supabase_setup.sql.
-- Safe to rerun. Attendance is stored separately from planner_state.

begin;

create extension if not exists pgcrypto;

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  event_date date not null,
  title text not null default '',
  status text not null default 'upcoming' check (status in ('upcoming','open','closed')),
  lineup_snapshot jsonb,
  closed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, event_date)
);

-- Upgrade older attendance_events tables without deleting records.
alter table public.attendance_events
  add column if not exists lineup_snapshot jsonb;
alter table public.attendance_events
  add column if not exists closed_at timestamptz;

-- Replace the old event_type CHECK constraint so existing rows can be migrated.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format('alter table public.attendance_events drop constraint %I', r.conname);
  end loop;
end $$;

-- Migrate old database values to the new explicit event types.
-- Old `tuesday` means Tuesday Guild League.
update public.attendance_events
set event_type = 'guild_league_tuesday',
    title = 'Guild League (Tuesday)'
where event_type = 'tuesday';

-- Old `guild_league` means Thursday Guild League.
update public.attendance_events
set event_type = 'guild_league_thursday',
    title = 'Guild League (Thursday)'
where event_type = 'guild_league';

-- Keep Siege title consistent too.
update public.attendance_events
set title = 'Siege'
where event_type = 'siege' and title <> 'Siege';

alter table public.attendance_events
  add constraint attendance_events_event_type_check
  check (event_type in ('guild_league_tuesday','guild_league_thursday','siege'));

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.attendance_events(id) on delete cascade,
  member_id text not null,
  member_name text not null default '',
  pre_status text not null default 'no_response'
    check (pre_status in ('no_response','going','not_going')),
  actual_status text not null default 'not_checked'
    check (actual_status in ('not_checked','present','absent','excused')),
  note text not null default '',
  pre_updated_by uuid references auth.users(id) on delete set null,
  pre_updated_at timestamptz,
  actual_updated_by uuid references auth.users(id) on delete set null,
  actual_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id)
);

create index if not exists attendance_events_date_idx
  on public.attendance_events(event_date desc, event_type);
create index if not exists attendance_records_event_idx
  on public.attendance_records(event_id);
create index if not exists attendance_records_member_idx
  on public.attendance_records(member_id);

drop trigger if exists attendance_events_touch_updated_at on public.attendance_events;
create trigger attendance_events_touch_updated_at
before update on public.attendance_events
for each row execute function public.touch_updated_at();

drop trigger if exists attendance_records_touch_updated_at on public.attendance_records;
create trigger attendance_records_touch_updated_at
before update on public.attendance_records
for each row execute function public.touch_updated_at();

create or replace function public.stamp_attendance_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.pre_status is distinct from 'no_response' then
      new.pre_updated_by = auth.uid();
      new.pre_updated_at = now();
    end if;
    if new.actual_status is distinct from 'not_checked' then
      new.actual_updated_by = auth.uid();
      new.actual_updated_at = now();
    end if;
    return new;
  end if;

  if new.pre_status is distinct from old.pre_status then
    new.pre_updated_by = auth.uid();
    new.pre_updated_at = now();
  end if;

  if new.actual_status is distinct from old.actual_status then
    new.actual_updated_by = auth.uid();
    new.actual_updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_records_stamp_changes on public.attendance_records;
create trigger attendance_records_stamp_changes
before insert or update on public.attendance_records
for each row execute function public.stamp_attendance_record();

alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists attendance_events_select_approved on public.attendance_events;
create policy attendance_events_select_approved
on public.attendance_events
for select
to authenticated
using (public.current_user_approved());

drop policy if exists attendance_records_select_approved on public.attendance_records;
create policy attendance_records_select_approved
on public.attendance_records
for select
to authenticated
using (public.current_user_approved());

drop policy if exists attendance_events_insert_leaders on public.attendance_events;
create policy attendance_events_insert_leaders
on public.attendance_events
for insert
to authenticated
with check (public.current_user_role() in ('leader','admin'));

drop policy if exists attendance_events_update_leaders on public.attendance_events;
create policy attendance_events_update_leaders
on public.attendance_events
for update
to authenticated
using (public.current_user_role() in ('leader','admin'))
with check (public.current_user_role() in ('leader','admin'));

drop policy if exists attendance_events_delete_leaders on public.attendance_events;
create policy attendance_events_delete_leaders
on public.attendance_events
for delete
to authenticated
using (public.current_user_role() in ('leader','admin'));

drop policy if exists attendance_records_insert_leaders on public.attendance_records;
create policy attendance_records_insert_leaders
on public.attendance_records
for insert
to authenticated
with check (public.current_user_role() in ('leader','admin'));

drop policy if exists attendance_records_update_leaders on public.attendance_records;
create policy attendance_records_update_leaders
on public.attendance_records
for update
to authenticated
using (public.current_user_role() in ('leader','admin'))
with check (public.current_user_role() in ('leader','admin'));

drop policy if exists attendance_records_delete_leaders on public.attendance_records;
create policy attendance_records_delete_leaders
on public.attendance_records
for delete
to authenticated
using (public.current_user_role() in ('leader','admin'));

revoke all on public.attendance_events from anon;
revoke all on public.attendance_records from anon;

grant select, insert, update, delete on public.attendance_events to authenticated;
grant select, insert, update, delete on public.attendance_records to authenticated;

commit;

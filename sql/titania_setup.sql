-- TITANIA GUILD MANAGEMENT - COMPLETE SUPABASE SETUP
-- Canonical one-file database setup for Titania Guild Management.
-- Synced to the live Titania Supabase schema on 2026-09-05.
-- Safe to rerun. Existing planner and attendance data are preserved.
--
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- After setup, register your account through the website and promote it to admin
-- using the commented FIRST ADMIN BOOTSTRAP statement at the bottom.

begin;

-- ================================================================
-- 1. CORE AUTH / PROFILES / PLANNER
-- ================================================================

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'pending' check (role in ('pending','viewer','leader','admin')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planner_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.planner_state (id, state, revision)
values (1, '{}'::jsonb, 0)
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, approved)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''), '@', 1)), 120),
    'pending',
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for users that existed before this setup was run.
insert into public.profiles (id, email, display_name, role, approved)
select
  u.id,
  coalesce(u.email,''),
  left(coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email,''), '@', 1)),120),
  'pending',
  false
from auth.users u
on conflict (id) do nothing;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid() and p.approved), 'pending');
$$;

create or replace function public.current_user_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.approved from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_approved() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_approved() to authenticated;

alter table public.profiles enable row level security;
alter table public.planner_state enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists planner_select_approved on public.planner_state;
create policy planner_select_approved
on public.planner_state
for select
to authenticated
using (public.current_user_approved());

drop policy if exists planner_update_leaders on public.planner_state;
create policy planner_update_leaders
on public.planner_state
for update
to authenticated
using (public.current_user_role() in ('leader','admin'))
with check (public.current_user_role() in ('leader','admin'));

revoke insert, delete on public.planner_state from anon, authenticated;
revoke all on public.planner_state from anon;
grant select, update on public.planner_state to authenticated;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (display_name, role, approved) on public.profiles to authenticated;

create or replace function public.save_planner_state(p_state jsonb, p_base_revision bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  select revision into v_revision
  from public.planner_state
  where id = 1
  for update;

  if v_revision is null then
    raise exception 'PLANNER_STATE_MISSING';
  end if;

  if v_revision <> p_base_revision then
    raise exception 'REVISION_CONFLICT: expected %, current %', p_base_revision, v_revision;
  end if;

  update public.planner_state
  set state = coalesce(p_state, '{}'::jsonb),
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1
  returning revision, updated_at into v_revision, v_updated_at;

  return jsonb_build_object(
    'revision', v_revision,
    'updatedAt', v_updated_at
  );
end;
$$;

grant execute on function public.save_planner_state(jsonb,bigint) to authenticated;

create or replace function public.save_raid_leader_setting(p_raid_id text, p_member_name text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state jsonb;
  v_leaders jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if nullif(btrim(coalesce(p_raid_id,'')), '') is null then
    raise exception 'INVALID_RAID_ID';
  end if;

  select state into v_state
  from public.planner_state
  where id = 1
  for update;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_leaders := coalesce(v_state -> 'raidLeaders', '{}'::jsonb);
  v_leaders := jsonb_set(v_leaders, array[p_raid_id], to_jsonb(coalesce(p_member_name,'')), true);
  v_state := jsonb_set(v_state, '{raidLeaders}', v_leaders, true);

  update public.planner_state
  set state = v_state,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1
  returning revision, updated_at into v_revision, v_updated_at;

  return jsonb_build_object(
    'revision', v_revision,
    'updatedAt', v_updated_at,
    'raidId', p_raid_id,
    'memberName', coalesce(p_member_name,'')
  );
end;
$$;

grant execute on function public.save_raid_leader_setting(text,text) to authenticated;

create or replace function public.save_raid_mode_setting(p_raid_id text, p_mode text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state jsonb;
  v_modes jsonb;
  v_mode text;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if nullif(btrim(coalesce(p_raid_id,'')), '') is null then
    raise exception 'INVALID_RAID_ID';
  end if;

  v_mode := case when upper(coalesce(p_mode,'')) = 'DEF' then 'DEF' else 'ATK' end;

  select state into v_state
  from public.planner_state
  where id = 1
  for update;

  v_state := coalesce(v_state, '{}'::jsonb);
  v_modes := coalesce(v_state -> 'raidModes', '{}'::jsonb);
  v_modes := jsonb_set(v_modes, array[p_raid_id], to_jsonb(v_mode), true);
  v_state := jsonb_set(v_state, '{raidModes}', v_modes, true);

  update public.planner_state
  set state = v_state,
      revision = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 1
  returning revision, updated_at into v_revision, v_updated_at;

  return jsonb_build_object(
    'revision', v_revision,
    'updatedAt', v_updated_at,
    'raidId', p_raid_id,
    'mode', v_mode
  );
end;
$$;

grant execute on function public.save_raid_mode_setting(text,text) to authenticated;

-- ================================================================
-- 2. ATTENDANCE
-- ================================================================

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

alter table public.attendance_events
  add column if not exists lineup_snapshot jsonb;
alter table public.attendance_events
  add column if not exists closed_at timestamptz;

-- Replace older event_type CHECK constraints safely.
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

update public.attendance_events
set event_type = 'guild_league_tuesday',
    title = 'Guild League (Tuesday)'
where event_type = 'tuesday';

update public.attendance_events
set event_type = 'guild_league_thursday',
    title = 'Guild League (Thursday)'
where event_type = 'guild_league';

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

-- ================================================================
-- 3. SECURE PUBLIC LINEUPS
-- ================================================================

-- Remove the obsolete parameterless RPC if it exists.
drop function if exists public.get_public_lineup();

create or replace function public.get_public_lineup(p_view text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_view text := lower(trim(coalesce(p_view, ''));
  v_state jsonb := '{}'::jsonb;
  v_revision bigint := 0;
  v_row_updated_at timestamptz;
  v_visibility_key text;
  v_update_key text;
  v_assignment_pattern text;
  v_raid_pattern text;
  v_published boolean := false;
  v_assignments jsonb := '{}'::jsonb;
  v_raid_leaders jsonb := '{}'::jsonb;
  v_raid_modes jsonb := '{}'::jsonb;
  v_roster jsonb := '[]'::jsonb;
  v_used_names text[] := array[]::text[];
  v_event_updated_at text := '';
  v_event_updated_by text := '';
  v_finished_dungeons jsonb := '[]'::jsonb;
  v_siege_raid_groups jsonb := '{}'::jsonb;
  v_pre_attendance jsonb := '{}'::jsonb;
  v_attendance_event_id uuid;
  v_today date := current_date;
  v_next_tuesday date;
  v_next_thursday date;
  v_next_sunday date;
  v_attendance_type text;
  v_attendance_date date;
begin
  if v_view not in ('guild', 'siege', 'polarity') then
    return jsonb_build_object(
      'published', false,
      'roster', '[]'::jsonb,
      'assignments', '{}'::jsonb,
      'raidLeaders', '{}'::jsonb,
      'raidModes', '{}'::jsonb,
      'siegeRaidGroups', '{}'::jsonb,
      'finishedDungeons', '[]'::jsonb,
      'preAttendance', '{}'::jsonb,
      'revision', 0,
      'updatedAt', ''
    );
  end if;

  select coalesce(ps.state, '{}'::jsonb), coalesce(ps.revision, 0), ps.updated_at
    into v_state, v_revision, v_row_updated_at
  from public.planner_state ps
  where ps.id = 1;

  if not found then
    return jsonb_build_object(
      'published', false,
      'roster', '[]'::jsonb,
      'assignments', '{}'::jsonb,
      'raidLeaders', '{}'::jsonb,
      'raidModes', '{}'::jsonb,
      'siegeRaidGroups', '{}'::jsonb,
      'finishedDungeons', '[]'::jsonb,
      'preAttendance', '{}'::jsonb,
      'revision', 0,
      'updatedAt', ''
    );
  end if;

  case v_view
    when 'guild' then
      v_visibility_key := 'guildLeague';
      v_update_key := 'guildLeague';
      v_assignment_pattern := '^(main_|sub_)';
      v_raid_pattern := '^(raid_[0-9]+|sub_raid_[0-9]+)$';
    when 'siege' then
      v_visibility_key := 'siege';
      v_update_key := 'siege';
      v_assignment_pattern := '^siege_(main_|sub_)';
      v_raid_pattern := '^siege_(raid_[0-9]+|sub_raid_[0-9]+)$';
      v_siege_raid_groups := coalesce(v_state->'siegeRaidGroups', '{}'::jsonb);
    when 'polarity' then
      v_visibility_key := 'polarityZone';
      v_update_key := 'polarityZone';
      v_assignment_pattern := '^(elite_|dungeon[0-9]+_)';
      v_raid_pattern := '^pz_';
  end case;

  v_published := coalesce((v_state #>> array['publicVisibility', v_visibility_key])::boolean, false);
  v_event_updated_at := coalesce(nullif(v_state #>> array['eventUpdates', v_update_key, 'updatedAt'], ''), v_row_updated_at::text, '');
  v_event_updated_by := coalesce(v_state #>> array['eventUpdates', v_update_key, 'updatedBy'], '');

  if not v_published then
    return jsonb_build_object(
      'published', false,
      'roster', '[]'::jsonb,
      'assignments', '{}'::jsonb,
      'raidLeaders', '{}'::jsonb,
      'raidModes', '{}'::jsonb,
      'siegeRaidGroups', '{}'::jsonb,
      'finishedDungeons', '[]'::jsonb,
      'preAttendance', '{}'::jsonb,
      'revision', v_revision,
      'updatedAt', v_event_updated_at,
      'updatedBy', v_event_updated_by
    );
  end if;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_assignments
  from jsonb_each(coalesce(v_state->'assignments', '{}'::jsonb)) e
  where e.key ~ v_assignment_pattern;

  select coalesce(array_agg(distinct x.member_name) filter (where x.member_name is not null and x.member_name <> ''), array[]::text[])
    into v_used_names
  from (
    select jsonb_array_elements_text(e.value) as member_name
    from jsonb_each(v_assignments) e
    where jsonb_typeof(e.value) = 'array'
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name', m.item->>'name',
      'cls', coalesce(nullif(m.item->>'cls', ''), 'Unknown')
    ) order by m.ord), '[]'::jsonb)
    into v_roster
  from jsonb_array_elements(coalesce(v_state->'roster', '[]'::jsonb)) with ordinality as m(item, ord)
  where (m.item->>'name') = any(v_used_names);

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_raid_leaders
  from jsonb_each(coalesce(v_state->'raidLeaders', '{}'::jsonb)) e
  where e.key ~ v_raid_pattern;

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    into v_raid_modes
  from jsonb_each(coalesce(v_state->'raidModes', '{}'::jsonb)) e
  where e.key ~ v_raid_pattern;

  if v_view = 'polarity' then
    v_finished_dungeons := coalesce(v_state->'finishedDungeons', '[]'::jsonb);
  end if;

  if v_view = 'guild' then
    v_next_tuesday := v_today + ((2 - extract(dow from v_today)::int + 7) % 7);
    v_next_thursday := v_today + ((4 - extract(dow from v_today)::int + 7) % 7);
    if v_next_tuesday <= v_next_thursday then
      v_attendance_type := 'guild_league_tuesday';
      v_attendance_date := v_next_tuesday;
    else
      v_attendance_type := 'guild_league_thursday';
      v_attendance_date := v_next_thursday;
    end if;
  elsif v_view = 'siege' then
    v_next_sunday := v_today + ((0 - extract(dow from v_today)::int + 7) % 7);
    v_attendance_type := 'siege';
    v_attendance_date := v_next_sunday;
  end if;

  if v_attendance_type is not null then
    select ae.id
      into v_attendance_event_id
    from public.attendance_events ae
    where ae.event_type = v_attendance_type
      and ae.event_date = v_attendance_date
    limit 1;

    if v_attendance_event_id is not null then
      select coalesce(jsonb_object_agg(ar.member_name, ar.pre_status), '{}'::jsonb)
        into v_pre_attendance
      from public.attendance_records ar
      where ar.event_id = v_attendance_event_id
        and ar.member_name = any(v_used_names)
        and ar.pre_status in ('no_response','going','not_going');
    end if;
  end if;

  return jsonb_build_object(
    'published', true,
    'roster', v_roster,
    'assignments', v_assignments,
    'raidLeaders', v_raid_leaders,
    'raidModes', v_raid_modes,
    'siegeRaidGroups', v_siege_raid_groups,
    'finishedDungeons', v_finished_dungeons,
    'preAttendance', v_pre_attendance,
    'attendanceEventType', coalesce(v_attendance_type, ''),
    'attendanceEventDate', coalesce(v_attendance_date::text, ''),
    'revision', v_revision,
    'updatedAt', v_event_updated_at,
    'updatedBy', v_event_updated_by
  );
end;
$$;

revoke all on function public.get_public_lineup(text) from public;
grant execute on function public.get_public_lineup(text) to anon, authenticated;

commit;

-- ================================================================
-- FIRST ADMIN BOOTSTRAP
-- ================================================================
-- 1) Deploy/open the website and register your own email.
-- 2) Confirm the email if Supabase asks you to.
-- 3) Run ONLY the statement below after replacing the email.
--
-- update public.profiles
-- set role = 'admin', approved = true
-- where email = 'YOUR_EMAIL_HERE';

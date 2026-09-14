-- TITANIA GUILD MANAGEMENT - SUPABASE SETUP
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- Then register your own account through the website and promote it to admin
-- using the final UPDATE statement at the bottom.

begin;

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

-- Backfill profiles for any users that existed before this script.
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

-- Re-create policies idempotently.
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

-- Users never insert/delete planner rows from the browser. The singleton row is created above.
revoke insert, delete on public.planner_state from anon, authenticated;
revoke all on public.planner_state from anon;
grant select, update on public.planner_state to authenticated;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (display_name, role, approved) on public.profiles to authenticated;

-- Whole-planner transactional save with optimistic revision protection.
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

-- Lightweight Raid Leader save. Any non-empty raid ID is supported so future
-- Guild League / Polarity layouts do not require a database migration.
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

commit;

-- ================================================================
-- FIRST ADMIN BOOTSTRAP
-- 1) Deploy/open the website and register your own email.
-- 2) Confirm the email if Supabase asks you to.
-- 3) Return here and run ONLY the statement below after replacing the email.
-- ================================================================
-- update public.profiles
-- set role = 'admin', approved = true
-- where email = 'YOUR_EMAIL_HERE';

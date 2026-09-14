-- Titania Guild Management - secure public lineup support for Guild League / Siege / Polarity.
-- Run this in Supabase SQL Editor after attendance_setup.sql.
-- Public pages receive only published lineup fields plus PRE-attendance status for members in that published lineup.

begin;

drop function if exists public.get_public_lineup(text);

create function public.get_public_lineup(p_view text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_view text := lower(trim(coalesce(p_view, '')));
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

  -- Resolve the same upcoming attendance event used by the management planner.
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

  if v_attendance_type is not null and to_regclass('public.attendance_events') is not null and to_regclass('public.attendance_records') is not null then
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

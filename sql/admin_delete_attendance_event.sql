-- Admin-only attendance event deletion.
-- Deleting an attendance event also deletes its attendance_records via ON DELETE CASCADE.
-- Frontend confirmation is handled with SweetAlert2; authorization is enforced here.

create or replace function public.admin_delete_attendance_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_caller
      and approved = true
      and role = 'admin'
  ) then
    raise exception 'Admin access is required.';
  end if;

  if not exists (select 1 from public.attendance_events where id = p_event_id) then
    raise exception 'Attendance event not found.';
  end if;

  delete from public.attendance_events where id = p_event_id;
end;
$$;

revoke all on function public.admin_delete_attendance_event(uuid) from public;
revoke all on function public.admin_delete_attendance_event(uuid) from anon;
revoke all on function public.admin_delete_attendance_event(uuid) from authenticated;
grant execute on function public.admin_delete_attendance_event(uuid) to authenticated;

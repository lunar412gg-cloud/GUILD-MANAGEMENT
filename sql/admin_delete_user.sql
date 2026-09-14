-- Admin-only Titania account deletion.
-- Removes the Supabase Auth user; profiles.id is ON DELETE CASCADE.
-- Existing audit references use ON DELETE SET NULL, so historical records remain.

create or replace function public.admin_delete_titania_user(p_user_id uuid)
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

  if v_caller = p_user_id then
    raise exception 'You cannot delete your own account.';
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

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User account not found.';
  end if;

  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_titania_user(uuid) from public;
revoke all on function public.admin_delete_titania_user(uuid) from anon;
revoke all on function public.admin_delete_titania_user(uuid) from authenticated;
grant execute on function public.admin_delete_titania_user(uuid) to authenticated;

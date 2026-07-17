
-- GROUP D APP SECURITY PATCH
-- Run once in Supabase SQL Editor.

begin;

-- Students may read their own profile; admins may read all.
drop policy if exists "profiles_update" on public.profiles;

-- Remove direct profile UPDATE access for normal authenticated users.
-- Profile fields should be changed through controlled functions/admin only.
create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Controlled self-profile update that cannot change role/security fields.
create or replace function public.update_my_basic_profile(
  p_full_name text,
  p_phone text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name),''),
      phone = nullif(trim(p_phone),''),
      updated_at = now()
  where id = auth.uid()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_my_basic_profile(text,text) to authenticated;

commit;

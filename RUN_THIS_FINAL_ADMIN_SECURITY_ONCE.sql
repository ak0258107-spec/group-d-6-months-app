-- FINAL ADMIN ROLE LOCK (run once in Supabase SQL Editor)
-- This keeps the specified account as the only owner admin in profiles.
update public.profiles
set role = 'admin'
where lower(email) = 'ak0258107@gmail.com';

update public.profiles
set role = 'student'
where lower(coalesce(email,'')) <> 'ak0258107@gmail.com'
  and role = 'admin';

-- Verify result
select id, email, role from public.profiles where role='admin';


-- Enforce both Admin role AND MFA assurance level (AAL2) for every existing admin policy/RPC that uses public.is_admin().
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.email, '')) = 'ak0258107@gmail.com'
        and lower(coalesce(p.role, '')) = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

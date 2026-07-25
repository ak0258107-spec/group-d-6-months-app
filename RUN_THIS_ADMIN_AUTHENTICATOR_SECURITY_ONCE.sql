-- GK BY PURUSHOTAM SIR
-- Run this ONCE in Supabase SQL Editor after deploying the new ZIP.
-- This upgrades public.is_admin() so admin-only database functions/policies
-- can require BOTH admin role and an Authenticator-verified aal2 session.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and lower(coalesce(role, '')) = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Verification result
select public.is_admin() as editor_test_note;
-- SQL Editor में false आना सामान्य है क्योंकि वहाँ user JWT session नहीं होता।
-- App में Admin + Authenticator verification के बाद यह true होगा।

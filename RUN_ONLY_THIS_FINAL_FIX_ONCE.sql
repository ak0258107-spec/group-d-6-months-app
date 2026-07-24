begin;

-- ============================================================
-- GK BY PURUSHOTAM SIR
-- FINAL ADMIN + VERIFICATION + BROADCAST DELETE RPC FIX
-- इसे केवल एक बार Run करें।
-- ============================================================

create or replace function public.admin_delete_target_verifications(p_target_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  deleted_count integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role::text,''))='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.verification_questions
  where target_id=p_target_id;

  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$$;

create or replace function public.admin_delete_verification_question(p_question_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  deleted_count integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role::text,''))='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.verification_questions
  where id=p_question_id;

  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$$;

create or replace function public.admin_delete_all_verification_questions()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  deleted_count integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role::text,''))='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.verification_questions;

  get diagnostics deleted_count=row_count;
  return deleted_count;
end;
$$;

create or replace function public.admin_delete_broadcast(p_broadcast_id bigint)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role::text,''))='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.app_notifications
  where related_type='broadcast'
    and related_id=p_broadcast_id::text;

  delete from public.broadcast_messages
  where id=p_broadcast_id;

  return true;
end;
$$;

create or replace function public.admin_delete_all_broadcasts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  deleted_count integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and lower(coalesce(p.role::text,''))='admin'
  ) then
    raise exception 'Admin access required';
  end if;

  delete from public.app_notifications
  where related_type='broadcast';

  delete from public.broadcast_messages;
  get diagnostics deleted_count=row_count;

  return deleted_count;
end;
$$;

revoke all on function public.admin_delete_target_verifications(uuid) from public;
revoke all on function public.admin_delete_verification_question(uuid) from public;
revoke all on function public.admin_delete_all_verification_questions() from public;
revoke all on function public.admin_delete_broadcast(bigint) from public;
revoke all on function public.admin_delete_all_broadcasts() from public;

grant execute on function public.admin_delete_target_verifications(uuid) to authenticated;
grant execute on function public.admin_delete_verification_question(uuid) to authenticated;
grant execute on function public.admin_delete_all_verification_questions() to authenticated;
grant execute on function public.admin_delete_broadcast(bigint) to authenticated;
grant execute on function public.admin_delete_all_broadcasts() to authenticated;

commit;

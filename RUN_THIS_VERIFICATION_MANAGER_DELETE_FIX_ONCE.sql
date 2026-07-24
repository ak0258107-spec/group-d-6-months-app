begin;

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

revoke all on function public.admin_delete_verification_question(uuid) from public;
revoke all on function public.admin_delete_all_verification_questions() from public;

grant execute on function public.admin_delete_verification_question(uuid) to authenticated;
grant execute on function public.admin_delete_all_verification_questions() to authenticated;

commit;
begin;

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

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.admin_delete_target_verifications(uuid) from public;
grant execute on function public.admin_delete_target_verifications(uuid) to authenticated;

commit;

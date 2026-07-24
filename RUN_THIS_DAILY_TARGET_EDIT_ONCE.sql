begin;

create or replace function public.admin_update_daily_target(
  p_target_id uuid,
  p_subject text,
  p_topic text,
  p_target_order integer
)
returns public.daily_targets
language plpgsql
security definer
set search_path=public
as $$
declare
  updated_target public.daily_targets;
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

  if nullif(btrim(p_subject),'') is null then
    raise exception 'Subject cannot be empty';
  end if;

  if nullif(btrim(p_topic),'') is null then
    raise exception 'Topic cannot be empty';
  end if;

  if p_target_order is null or p_target_order < 1 then
    raise exception 'Target order must be 1 or greater';
  end if;

  update public.daily_targets
  set
    subject=btrim(p_subject),
    topic=btrim(p_topic),
    target_order=p_target_order
  where id=p_target_id
  returning * into updated_target;

  if updated_target.id is null then
    raise exception 'Target not found';
  end if;

  return updated_target;
end;
$$;

revoke all on function public.admin_update_daily_target(uuid,text,text,integer) from public;
grant execute on function public.admin_update_daily_target(uuid,text,text,integer) to authenticated;

commit;

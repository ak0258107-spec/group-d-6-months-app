begin;
create or replace function public.admin_delete_broadcast(p_broadcast_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  delete from public.app_notifications where related_type='broadcast' and related_id=p_broadcast_id::text;
  delete from public.broadcast_messages where id=p_broadcast_id;
  return true;
end;$$;
create or replace function public.admin_delete_all_broadcasts()
returns integer language plpgsql security definer set search_path=public as $$
declare c integer;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required'; end if;
  delete from public.app_notifications where related_type='broadcast';
  delete from public.broadcast_messages;
  get diagnostics c=row_count;
  return c;
end;$$;
revoke all on function public.admin_delete_broadcast(bigint) from public;
revoke all on function public.admin_delete_all_broadcasts() from public;
grant execute on function public.admin_delete_broadcast(bigint) to authenticated;
grant execute on function public.admin_delete_all_broadcasts() to authenticated;
commit;
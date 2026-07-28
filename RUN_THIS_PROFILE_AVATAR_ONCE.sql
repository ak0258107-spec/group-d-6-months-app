begin;

alter table public.profiles
  add column if not exists avatar_type text not null default 'boy';

update public.profiles
set avatar_type='boy'
where avatar_type is null or avatar_type not in ('boy','girl');

do $$
begin
  if not exists(select 1 from pg_constraint where conname='profiles_avatar_type_check') then
    alter table public.profiles
      add constraint profiles_avatar_type_check check(avatar_type in ('boy','girl'));
  end if;
end $$;

create or replace function public.set_my_avatar_type(p_avatar_type text)
returns text
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if p_avatar_type not in ('boy','girl') then raise exception 'Invalid avatar type'; end if;
  update public.profiles set avatar_type=p_avatar_type where id=auth.uid();
  return p_avatar_type;
end;
$$;

revoke all on function public.set_my_avatar_type(text) from public;
grant execute on function public.set_my_avatar_type(text) to authenticated;

commit;

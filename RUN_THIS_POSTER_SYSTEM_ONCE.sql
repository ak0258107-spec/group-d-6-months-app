begin;
create table if not exists public.app_posters (
 id uuid primary key default gen_random_uuid(),
 title text not null default '',
 image_key text not null,
 click_url text,
 start_at timestamptz,
 end_at timestamptz,
 is_active boolean not null default true,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.app_posters enable row level security;
drop policy if exists app_posters_read on public.app_posters;
create policy app_posters_read on public.app_posters for select to authenticated
using (is_active=true and (start_at is null or start_at<=now()) and (end_at is null or end_at>=now()));
drop policy if exists app_posters_admin_all on public.app_posters;
create policy app_posters_admin_all on public.app_posters for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and lower(coalesce(p.role::text,''))='admin'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and lower(coalesce(p.role::text,''))='admin'));
create or replace function public.touch_app_posters_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists trg_app_posters_updated_at on public.app_posters;
create trigger trg_app_posters_updated_at before update on public.app_posters
for each row execute function public.touch_app_posters_updated_at();
commit;
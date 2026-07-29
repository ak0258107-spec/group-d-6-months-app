begin;

-- =====================================================================
-- V12.13 — STUDENT VISIBILITY / ADVANCE UPLOAD CONTROL
-- PDF and Mock Test upload as Draft/Hidden by default.
-- Daily Targets: first five batch days visible immediately; later days auto.
-- Admin can Show, Hide or return a Target to Automatic Date Mode.
-- =====================================================================

do $$
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_targets' and column_name='visibility_mode'
  ) then
    alter table public.daily_targets add column visibility_mode text not null default 'auto';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='study_materials' and column_name='student_visible'
  ) then
    alter table public.study_materials add column student_visible boolean not null default false;
    update public.study_materials set student_visible=true where status='published';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tests' and column_name='student_visible'
  ) then
    alter table public.tests add column student_visible boolean not null default false;
    update public.tests set student_visible=true where status='published';
  end if;
end $$;

alter table public.daily_targets drop constraint if exists daily_targets_visibility_mode_check;
alter table public.daily_targets add constraint daily_targets_visibility_mode_check
check(visibility_mode in ('auto','show','hide'));

create index if not exists daily_targets_visibility_idx
on public.daily_targets(schedule_day_id,visibility_mode,status);
create index if not exists study_materials_student_visible_idx
on public.study_materials(student_visible,status,schedule_day_id);
create index if not exists tests_student_visible_idx
on public.tests(student_visible,status,schedule_day_id);

create or replace function public.v1213_default_target_visibility()
returns trigger language plpgsql set search_path=public as $$
declare n integer;
begin
  if new.visibility_mode is null or new.visibility_mode='auto' then
    select day_number into n from public.schedule_days where id=new.schedule_day_id;
    if n between 1 and 5 then new.visibility_mode:='show'; else new.visibility_mode:='auto'; end if;
  end if;
  return new;
end;$$;
drop trigger if exists trg_v1213_default_target_visibility on public.daily_targets;
create trigger trg_v1213_default_target_visibility
before insert on public.daily_targets
for each row execute function public.v1213_default_target_visibility();

-- First five batch days are visible as a preview immediately.
update public.daily_targets t
set visibility_mode=case when d.day_number between 1 and 5 then 'show' else 'auto' end
from public.schedule_days d
where t.schedule_day_id=d.id
  and d.batch_id='00000000-0000-0000-0000-000000000001'
  and coalesce(t.visibility_mode,'auto')<>'hide';

create or replace function public.v1213_day_available(p_schedule_day_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.schedule_days d
    where d.id=p_schedule_day_id
      and coalesce(d.manual_lock,false)=false
      and (coalesce(d.manual_unlock,false)=true or d.day_date<=current_date)
  );
$$;

create or replace function public.v1213_target_visible(p_target_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1
    from public.daily_targets t
    join public.schedule_days d on d.id=t.schedule_day_id
    where t.id=p_target_id
      and t.status='published'
      and coalesce(t.class_status,'scheduled')<>'cancelled'
      and coalesce(d.manual_lock,false)=false
      and (
        coalesce(t.visibility_mode,'auto')='show'
        or (
          coalesce(t.visibility_mode,'auto')='auto'
          and (coalesce(d.manual_unlock,false)=true or d.day_date<=current_date)
        )
      )
  );
$$;

create or replace function public.v1213_require_admin()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and lower(coalesce(p.role::text,''))='admin' and coalesce(p.is_active,true)=true) then
    raise exception 'Admin access required';
  end if;
end;$$;

create or replace function public.admin_set_target_visibility(p_target_id uuid,p_mode text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.v1213_require_admin();
  if p_mode not in ('auto','show','hide') then raise exception 'Invalid visibility mode'; end if;
  update public.daily_targets set visibility_mode=p_mode where id=p_target_id;
  return found;
end;$$;

create or replace function public.admin_set_day_targets_visibility(p_schedule_day_id uuid,p_mode text)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  perform public.v1213_require_admin();
  if p_mode not in ('auto','show','hide') then raise exception 'Invalid visibility mode'; end if;
  update public.daily_targets set visibility_mode=p_mode
  where schedule_day_id=p_schedule_day_id and status='published';
  get diagnostics n=row_count;
  return n;
end;$$;

create or replace function public.admin_set_material_visibility(p_material_id uuid,p_visible boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.v1213_require_admin();
  update public.study_materials
  set student_visible=coalesce(p_visible,false),
      published_at=case when coalesce(p_visible,false) then coalesce(published_at,now()) else published_at end
  where id=p_material_id;
  return found;
end;$$;

create or replace function public.admin_set_all_material_visibility(p_visible boolean)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  perform public.v1213_require_admin();
  update public.study_materials
  set student_visible=coalesce(p_visible,false),
      published_at=case when coalesce(p_visible,false) then coalesce(published_at,now()) else published_at end;
  get diagnostics n=row_count;
  return n;
end;$$;

create or replace function public.admin_set_test_visibility(p_test_id uuid,p_visible boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.v1213_require_admin();
  update public.tests set student_visible=coalesce(p_visible,false) where id=p_test_id;
  return found;
end;$$;

create or replace function public.admin_set_all_test_visibility(p_visible boolean)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  perform public.v1213_require_admin();
  update public.tests set student_visible=coalesce(p_visible,false);
  get diagnostics n=row_count;
  return n;
end;$$;

-- Hidden PDFs cannot be read/downloaded, even with a direct material id.
create or replace function public.user_can_read_material(p_user_id uuid,p_material_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_day uuid; v_target uuid; v_required boolean:=true; v_pass numeric(5,2):=30;
  v_visible boolean:=false; v_total integer:=0; v_correct integer:=0;
begin
  select schedule_day_id,target_id,requires_pdf_verification,pdf_verification_pass_percent,student_visible
  into v_day,v_target,v_required,v_pass,v_visible
  from public.study_materials where id=p_material_id and status='published';

  if v_day is null or coalesce(v_visible,false)=false then return false; end if;
  if not public.v1213_day_available(v_day) then return false; end if;
  if v_target is not null and not public.v1213_target_visible(v_target) then return false; end if;
  if coalesce(v_required,true)=false then return true; end if;

  if v_target is not null then
    select count(*) into v_total from public.verification_questions where target_id=v_target and is_active=true;
  else
    select count(*) into v_total from public.verification_questions where schedule_day_id=v_day and is_active=true;
  end if;
  if v_total=0 then return true; end if;

  select count(*) into v_correct
  from public.pdf_verification_attempts a
  join public.verification_questions q on q.id=a.verification_question_id
  where a.user_id=p_user_id and a.material_id=p_material_id and a.is_correct=true and q.is_active=true
    and ((v_target is not null and q.target_id=v_target) or (v_target is null and q.schedule_day_id=v_day));

  return (v_correct::numeric*100/nullif(v_total,0))>=coalesce(v_pass,30);
end;$$;

create or replace function public.can_download_material(p_material_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare m public.study_materials; best_score numeric(5,2);
begin
  if auth.uid() is null then return false; end if;
  select * into m from public.study_materials where id=p_material_id and status='published' and student_visible=true;
  if m.id is null or not public.user_can_read_material(auth.uid(),p_material_id) then return false; end if;
  if m.access_mode='direct_download' then return true; end if;
  if m.access_mode='read_only' then return false; end if;
  if m.access_mode='test_required' and m.download_test_id is not null then
    if not exists(select 1 from public.tests where id=m.download_test_id and status='published' and student_visible=true) then return false; end if;
    select max(percentage) into best_score from public.test_attempts
    where user_id=auth.uid() and test_id=m.download_test_id and status='submitted';
    return coalesce(best_score,0)>=coalesce(m.download_pass_percent,80);
  end if;
  return false;
end;$$;

-- Progress counts only content that is actually visible to students.
create or replace function public.refresh_daily_progress(p_user_id uuid,p_schedule_day_id uuid)
returns public.daily_progress language plpgsql security definer set search_path=public as $$
declare tt integer:=0;ct integer:=0;pdf_total integer:=0;pdf_ready integer:=0;pdf_ok boolean:=false;final_test_id uuid;final_pass numeric(5,2):=0;best_final numeric(5,2):=null;started boolean:=false;st public.progress_status;fb public.feedback_code;rowout public.daily_progress;
begin
  if not(p_user_id=auth.uid() or public.is_admin()) then raise exception 'Access denied'; end if;
  select count(*) into tt from public.daily_targets t where t.schedule_day_id=p_schedule_day_id and t.is_required=true and t.status='published' and coalesce(t.class_status,'scheduled')<>'cancelled' and public.v1213_target_visible(t.id);
  select count(*) into pdf_total from public.study_materials m join public.daily_targets t on t.id=m.target_id where m.schedule_day_id=p_schedule_day_id and m.status='published' and m.student_visible=true and coalesce(t.class_status,'scheduled')<>'cancelled' and public.v1213_target_visible(t.id);
  select count(*) into pdf_ready from public.study_materials m join public.daily_targets t on t.id=m.target_id where m.schedule_day_id=p_schedule_day_id and m.status='published' and m.student_visible=true and coalesce(t.class_status,'scheduled')<>'cancelled' and public.v1213_target_visible(t.id) and public.user_can_read_material(p_user_id,m.id);
  pdf_ok:=(pdf_total>=tt and pdf_ready>=pdf_total and tt>0);ct:=case when pdf_ok then tt else 0 end;
  select id,passing_percent into final_test_id,final_pass from public.tests where schedule_day_id=p_schedule_day_id and status='published' and student_visible=true and is_final_daily=true order by created_at desc limit 1;
  if final_test_id is not null then select max(percentage) into best_final from public.test_attempts where user_id=p_user_id and test_id=final_test_id and status='submitted'; end if;
  select exists(select 1 from public.pdf_verification_attempts a join public.study_materials m on m.id=a.material_id where a.user_id=p_user_id and m.schedule_day_id=p_schedule_day_id and m.student_visible=true) or best_final is not null into started;
  if not started then st:='not_started';fb:='work_not_started';elsif not pdf_ok then st:='partial';fb:='target_pending';elsif final_test_id is not null and (best_final is null or best_final<coalesce(final_pass,0)) then st:='partial';fb:='test_pending';else st:='completed';if coalesce(best_final,100)>=80 then fb:='excellent';else fb:='very_good';end if;end if;
  insert into public.daily_progress(user_id,schedule_day_id,total_targets,completed_targets,class_verified,pdf_verified,test_submitted,test_score_percent,status,feedback,updated_at)
  values(p_user_id,p_schedule_day_id,tt,ct,false,pdf_ok,best_final is not null,best_final,st,fb,now())
  on conflict(user_id,schedule_day_id) do update set total_targets=excluded.total_targets,completed_targets=excluded.completed_targets,class_verified=false,pdf_verified=excluded.pdf_verified,test_submitted=excluded.test_submitted,test_score_percent=excluded.test_score_percent,status=excluded.status,feedback=excluded.feedback,updated_at=now()
  returning * into rowout;return rowout;
end;$$;

grant execute on function public.v1213_day_available(uuid) to authenticated;
grant execute on function public.v1213_target_visible(uuid) to authenticated;
grant execute on function public.admin_set_target_visibility(uuid,text) to authenticated;
grant execute on function public.admin_set_day_targets_visibility(uuid,text) to authenticated;
grant execute on function public.admin_set_material_visibility(uuid,boolean) to authenticated;
grant execute on function public.admin_set_all_material_visibility(boolean) to authenticated;
grant execute on function public.admin_set_test_visibility(uuid,boolean) to authenticated;
grant execute on function public.admin_set_all_test_visibility(boolean) to authenticated;
grant execute on function public.user_can_read_material(uuid,uuid) to authenticated;
grant execute on function public.can_download_material(uuid) to authenticated;
grant execute on function public.refresh_daily_progress(uuid,uuid) to authenticated;

commit;

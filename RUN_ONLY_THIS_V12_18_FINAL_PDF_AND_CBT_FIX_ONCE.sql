-- ============================================================================
-- GK BY PURUSHOTAM SIR — V12.18 FINAL PDF FLOW MIGRATION
-- Run ONCE in Supabase SQL Editor before deploying the V12.18 GitHub files.
-- Safe to run again: all schema changes/functions are idempotent.
-- ============================================================================

begin;

create table if not exists public.gk_app_schema_migrations(
  version text primary key,
  applied_at timestamptz not null default now()
);

-- 1) Class-level PDF verification setup.
alter table public.daily_targets
  add column if not exists pdf_verification_required boolean not null default false;
alter table public.daily_targets
  add column if not exists pdf_verification_question_count integer not null default 0;
alter table public.daily_targets
  add column if not exists pdf_verification_pass_percent numeric(5,2) not null default 30;

alter table public.daily_targets drop constraint if exists daily_targets_pdf_verification_count_check;
alter table public.daily_targets add constraint daily_targets_pdf_verification_count_check
  check (pdf_verification_question_count between 0 and 100);
alter table public.daily_targets drop constraint if exists daily_targets_pdf_verification_pass_check;
alter table public.daily_targets add constraint daily_targets_pdf_verification_pass_check
  check (pdf_verification_pass_percent between 0 and 100);

-- Existing data initialization is performed once after both new tables/columns are ready.

-- 2) Separate Class PDFs and Direct PDFs.
alter table public.study_materials
  add column if not exists pdf_type text not null default 'class';
alter table public.study_materials
  add column if not exists verification_question_count integer not null default 0;

-- Direct PDFs are global resources, so schedule_day_id may be NULL.
alter table public.study_materials alter column schedule_day_id drop not null;

update public.study_materials
set pdf_type='class'
where pdf_type is null or pdf_type not in ('class','direct');

do $$
begin
  if not exists(select 1 from public.gk_app_schema_migrations where version='12.18.0-data-init') then
    update public.daily_targets t
    set pdf_verification_required = exists(
          select 1 from public.verification_questions q
          where q.target_id=t.id and q.is_active=true
        ),
        pdf_verification_question_count = (
          select count(*)::integer from public.verification_questions q
          where q.target_id=t.id and q.is_active=true
        );

    -- Existing Class PDFs are synchronized with their Class setup. This also
    -- fixes old PDFs that had questions saved but were opening directly.
    update public.study_materials m
    set requires_pdf_verification = t.pdf_verification_required,
        verification_question_count = case
          when t.pdf_verification_required then greatest(1,t.pdf_verification_question_count)
          else 0
        end,
        pdf_verification_pass_percent = case
          when t.pdf_verification_required then t.pdf_verification_pass_percent
          else 0
        end,
        requires_class_verification = false
    from public.daily_targets t
    where m.pdf_type='class' and m.target_id=t.id;

    insert into public.gk_app_schema_migrations(version) values('12.18.0-data-init');
  end if;
end $$;

alter table public.study_materials drop constraint if exists study_materials_pdf_type_check;
alter table public.study_materials add constraint study_materials_pdf_type_check
  check (pdf_type in ('class','direct'));
alter table public.study_materials drop constraint if exists study_materials_verification_question_count_check;
alter table public.study_materials add constraint study_materials_verification_question_count_check
  check (verification_question_count between 0 and 100);

create index if not exists study_materials_pdf_type_visibility_idx
  on public.study_materials(pdf_type,student_visible,status,created_at);
create index if not exists daily_targets_pdf_verification_idx
  on public.daily_targets(id,pdf_verification_required,pdf_verification_question_count);

-- 3) Admin saves one clear verification setup for each Class.
create or replace function public.admin_set_class_pdf_verification(
  p_target_id uuid,
  p_required boolean,
  p_question_count integer,
  p_pass_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_required boolean:=coalesce(p_required,false);
  v_count integer:=case when coalesce(p_required,false) then greatest(1,least(100,coalesce(p_question_count,1))) else 0 end;
  v_pass numeric(5,2):=greatest(0,least(100,coalesce(p_pass_percent,30)));
  v_available integer:=0;
  v_updated integer:=0;
begin
  perform public.v1213_require_admin();
  if not exists(select 1 from public.daily_targets where id=p_target_id) then
    raise exception 'Class / Target नहीं मिला';
  end if;

  select count(*)::integer into v_available
  from public.verification_questions
  where target_id=p_target_id and is_active=true;

  update public.daily_targets
  set pdf_verification_required=v_required,
      pdf_verification_question_count=v_count,
      pdf_verification_pass_percent=v_pass
  where id=p_target_id;

  update public.study_materials
  set requires_pdf_verification=v_required,
      verification_question_count=v_count,
      pdf_verification_pass_percent=v_pass
  where target_id=p_target_id and pdf_type='class';
  get diagnostics v_updated=row_count;

  return jsonb_build_object(
    'required',v_required,
    'question_count',v_count,
    'pass_percent',v_pass,
    'available_questions',v_available,
    'ready',(not v_required or v_available>=v_count),
    'updated_pdfs',v_updated
  );
end;
$$;

grant execute on function public.admin_set_class_pdf_verification(uuid,boolean,integer,numeric) to authenticated;

-- 4) Publishing a Class PDF is fail-closed when verification is incomplete.
create or replace function public.admin_set_material_visibility(p_material_id uuid,p_visible boolean)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.study_materials;
  v_available integer:=0;
begin
  perform public.v1213_require_admin();
  select * into m from public.study_materials where id=p_material_id;
  if m.id is null then return false; end if;

  if coalesce(p_visible,false) and coalesce(m.pdf_type,'class')='class' then
    if m.target_id is null then
      raise exception 'यह Class PDF किसी Class / Topic से linked नहीं है';
    end if;
    if coalesce(m.requires_pdf_verification,true) then
      if coalesce(m.verification_question_count,0)<1 then
        raise exception 'Verification Question Count सेट नहीं है';
      end if;
      select count(*)::integer into v_available
      from public.verification_questions
      where target_id=m.target_id and is_active=true;
      if v_available < m.verification_question_count then
        raise exception 'Verification चालू है, लेकिन % में से केवल % Questions तैयार हैं',m.verification_question_count,v_available;
      end if;
    end if;
  end if;

  update public.study_materials
  set student_visible=coalesce(p_visible,false),
      published_at=case when coalesce(p_visible,false) then coalesce(published_at,now()) else published_at end
  where id=p_material_id;
  return found;
end;
$$;

grant execute on function public.admin_set_material_visibility(uuid,boolean) to authenticated;

create or replace function public.admin_set_all_material_visibility(p_visible boolean)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer:=0;
begin
  perform public.v1213_require_admin();
  if coalesce(p_visible,false)=false then
    update public.study_materials set student_visible=false;
  else
    update public.study_materials m
    set student_visible=true,
        published_at=coalesce(m.published_at,now())
    where m.pdf_type='direct'
       or (
         m.pdf_type='class'
         and m.target_id is not null
         and (
           coalesce(m.requires_pdf_verification,true)=false
           or (
             coalesce(m.verification_question_count,0)>0
             and (select count(*) from public.verification_questions q where q.target_id=m.target_id and q.is_active=true)>=m.verification_question_count
           )
         )
       );
  end if;
  get diagnostics n=row_count;
  return n;
end;
$$;

grant execute on function public.admin_set_all_material_visibility(boolean) to authenticated;

-- 5) Secure PDF read rule.
--    Direct PDF: visible => readable, no Class/Verification/Mock dependency.
--    Class PDF: linked Class must be visible; required verification must be fully configured and passed.
create or replace function public.user_can_read_material(p_user_id uuid,p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_day uuid;
  v_target uuid;
  v_type text:='class';
  v_required boolean:=true;
  v_pass numeric(5,2):=30;
  v_limit integer:=0;
  v_visible boolean:=false;
  v_total integer:=0;
  v_correct integer:=0;
begin
  if p_user_id is null then return false; end if;

  select schedule_day_id,target_id,coalesce(pdf_type,'class'),requires_pdf_verification,
         pdf_verification_pass_percent,verification_question_count,student_visible
  into v_day,v_target,v_type,v_required,v_pass,v_limit,v_visible
  from public.study_materials
  where id=p_material_id and status='published';

  if not found or coalesce(v_visible,false)=false then return false; end if;

  if v_type='direct' then
    return true;
  end if;

  if v_day is null or v_target is null then return false; end if;
  if not public.v1213_day_available(v_day) then return false; end if;
  if not public.v1213_target_visible(v_target) then return false; end if;
  if coalesce(v_required,true)=false then return true; end if;
  if coalesce(v_limit,0)<1 then return false; end if;

  with required_questions as (
    select q.id
    from public.verification_questions q
    where q.target_id=v_target and q.is_active=true
    order by q.sort_order nulls last,q.created_at,q.id
    limit v_limit
  )
  select count(*)::integer into v_total from required_questions;

  if v_total < v_limit then return false; end if;

  with required_questions as (
    select q.id
    from public.verification_questions q
    where q.target_id=v_target and q.is_active=true
    order by q.sort_order nulls last,q.created_at,q.id
    limit v_limit
  )
  select count(*)::integer into v_correct
  from public.pdf_verification_attempts a
  join required_questions rq on rq.id=a.verification_question_id
  where a.user_id=p_user_id and a.material_id=p_material_id and a.is_correct=true;

  return (v_correct::numeric*100/nullif(v_total,0))>=coalesce(v_pass,30);
end;
$$;

revoke all on function public.user_can_read_material(uuid,uuid) from public;
grant execute on function public.user_can_read_material(uuid,uuid) to authenticated;

create or replace function public.can_read_material(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then return false; end if;
  return public.user_can_read_material(auth.uid(),p_material_id);
end;
$$;
grant execute on function public.can_read_material(uuid) to authenticated;

-- 6) Batch verification RPC also follows the exact selected question count.
create or replace function public.submit_pdf_verification(p_material_id uuid,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_target uuid;
  v_type text:='class';
  v_required boolean:=true;
  v_pass numeric(5,2):=30;
  v_limit integer:=0;
  v_ids uuid[]:=array[]::uuid[];
  v_total integer:=0;
  v_correct_count integer:=0;
  v_unique_answers integer:=0;
  item jsonb;
  v_qid uuid;
  v_selected integer;
  v_correct_text text;
  v_is_correct boolean;
  v_score numeric(7,2):=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'Invalid answers'; end if;

  select target_id,coalesce(pdf_type,'class'),requires_pdf_verification,
         pdf_verification_pass_percent,verification_question_count
  into v_target,v_type,v_required,v_pass,v_limit
  from public.study_materials
  where id=p_material_id and status='published' and student_visible=true;
  if not found then raise exception 'PDF not found'; end if;

  if v_type='direct' or coalesce(v_required,true)=false then
    return jsonb_build_object('passed',true,'score_percent',100,'required_percent',0,'correct_count',0,'total_count',0);
  end if;
  if v_target is null or coalesce(v_limit,0)<1 then raise exception 'PDF Verification setup अधूरा है'; end if;

  select coalesce(array_agg(s.id order by s.sort_order nulls last,s.created_at,s.id),array[]::uuid[])
  into v_ids
  from (
    select q.id,q.sort_order,q.created_at
    from public.verification_questions q
    where q.target_id=v_target and q.is_active=true
    order by q.sort_order nulls last,q.created_at,q.id
    limit v_limit
  ) s;

  v_total:=coalesce(cardinality(v_ids),0);
  if v_total < v_limit then raise exception 'PDF Verification Questions पूरे नहीं हैं'; end if;
  if jsonb_array_length(p_answers)<>v_total then raise exception 'इस PDF के हर verification question को attempt करना जरूरी है'; end if;
  select count(distinct (ans.value->>'question_id'))::integer into v_unique_answers
  from jsonb_array_elements(p_answers) as ans(value);
  if v_unique_answers<>v_total then raise exception 'हर verification question का केवल एक answer भेजना जरूरी है'; end if;

  delete from public.pdf_verification_attempts where user_id=v_user and material_id=p_material_id;

  for item in select * from jsonb_array_elements(p_answers)
  loop
    v_qid:=(item->>'question_id')::uuid;
    v_selected:=(item->>'selected_option')::integer;
    if v_selected not between 0 and 3 then raise exception 'Invalid selected option'; end if;
    if not (v_qid=any(v_ids)) then raise exception 'Invalid PDF verification question'; end if;

    select trim(both '"' from k.correct_answer::text)
    into v_correct_text
    from public.verification_answer_keys k
    where k.verification_question_id=v_qid;
    if v_correct_text is null then raise exception 'PDF verification question is not configured'; end if;
    v_is_correct:=(v_selected::text=v_correct_text);

    insert into public.pdf_verification_attempts(user_id,material_id,verification_question_id,selected_option,is_correct,submitted_at)
    values(v_user,p_material_id,v_qid,v_selected,v_is_correct,now())
    on conflict(user_id,material_id,verification_question_id)
    do update set selected_option=excluded.selected_option,is_correct=excluded.is_correct,submitted_at=now();
  end loop;

  select count(*)::integer into v_correct_count
  from public.pdf_verification_attempts
  where user_id=v_user and material_id=p_material_id and is_correct=true
    and verification_question_id=any(v_ids);

  v_score:=round(v_correct_count::numeric*100/nullif(v_total,0),2);
  return jsonb_build_object('passed',v_score>=coalesce(v_pass,30),'score_percent',v_score,
    'required_percent',coalesce(v_pass,30),'correct_count',v_correct_count,'total_count',v_total);
end;
$$;

grant execute on function public.submit_pdf_verification(uuid,jsonb) to authenticated;

-- 7) Download rule: Direct PDF may download only when access_mode allows it.
--    Class PDF still requires successful read verification first.
create or replace function public.can_download_material(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare m public.study_materials; best_score numeric(5,2);
begin
  if auth.uid() is null then return false; end if;
  select * into m from public.study_materials
  where id=p_material_id and status='published' and student_visible=true;
  if m.id is null then return false; end if;
  if not public.user_can_read_material(auth.uid(),p_material_id) then return false; end if;
  if m.access_mode='direct_download' then return true; end if;
  if m.access_mode='read_only' then return false; end if;
  if m.access_mode='test_required' and m.download_test_id is not null then
    if not exists(select 1 from public.tests where id=m.download_test_id and status='published' and student_visible=true) then return false; end if;
    select max(percentage) into best_score from public.test_attempts
    where user_id=auth.uid() and test_id=m.download_test_id and status='submitted';
    return coalesce(best_score,0)>=coalesce(m.download_pass_percent,80);
  end if;
  return false;
end;
$$;

grant execute on function public.can_download_material(uuid) to authenticated;

commit;

select 'V12.18 FINAL PDF FLOW READY' as result;

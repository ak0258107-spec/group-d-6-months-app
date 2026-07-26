begin;

-- ================================================================
-- GK BY PURUSHOTAM SIR — FINAL PDF-FIRST FLOW
-- Run ONCE in Supabase SQL Editor before deploying the new web files.
-- Class links have NO verification.
-- Verification is linked to PDF view. PDF download remains test-gated.
-- ================================================================

alter table public.study_materials
  add column if not exists requires_pdf_verification boolean not null default true;

alter table public.study_materials
  add column if not exists pdf_verification_pass_percent numeric(5,2) not null default 30;

update public.study_materials
set requires_pdf_verification=coalesce(requires_class_verification,true),
    requires_class_verification=false
where true;

update public.study_materials
set pdf_verification_pass_percent=30
where pdf_verification_pass_percent is null
   or pdf_verification_pass_percent<0
   or pdf_verification_pass_percent>100;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='study_materials_pdf_verification_pass_check') then
    alter table public.study_materials
      add constraint study_materials_pdf_verification_pass_check
      check(pdf_verification_pass_percent between 0 and 100);
  end if;
end $$;

create table if not exists public.pdf_verification_attempts(
  user_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.study_materials(id) on delete cascade,
  verification_question_id uuid not null references public.verification_questions(id) on delete cascade,
  selected_option integer not null,
  is_correct boolean not null default false,
  submitted_at timestamptz not null default now(),
  primary key(user_id,material_id,verification_question_id)
);

create index if not exists pdf_verification_attempts_material_user_idx
on public.pdf_verification_attempts(material_id,user_id,is_correct);

alter table public.pdf_verification_attempts enable row level security;
drop policy if exists "pdf_verification_attempts_own_select" on public.pdf_verification_attempts;
create policy "pdf_verification_attempts_own_select" on public.pdf_verification_attempts
for select to authenticated using(user_id=auth.uid() or public.is_admin());
drop policy if exists "pdf_verification_attempts_admin_all" on public.pdf_verification_attempts;
create policy "pdf_verification_attempts_admin_all" on public.pdf_verification_attempts
for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Existing database uses verification_kind='class'. It is kept internally
-- only for backward compatibility; the app now uses these questions solely
-- as PDF verification questions.
create or replace function public.admin_replace_pdf_verifications(
  p_target_id uuid,
  p_schedule_day_id uuid,
  p_show_question boolean,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  item jsonb;
  qid uuid;
  n integer:=0;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid PDF verification data'; end if;

  delete from public.verification_questions where target_id=p_target_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.verification_questions(
      schedule_day_id,target_id,verification_kind,question_text,answer_type,options,
      show_question,is_active,explanation
    ) values(
      p_schedule_day_id,p_target_id,'class',
      coalesce(nullif(item->>'question_text',''),'PDF Verification'),
      'mcq',coalesce(item->'options','[]'::jsonb),coalesce(p_show_question,false),true,
      nullif(item->>'explanation','')
    ) returning id into qid;

    insert into public.verification_answer_keys(verification_question_id,correct_answer,updated_at)
    values(qid,item->>'correct_answer',now())
    on conflict(verification_question_id)
    do update set correct_answer=excluded.correct_answer,updated_at=now();
    n:=n+1;
  end loop;
  return n;
end;
$$;

grant execute on function public.admin_replace_pdf_verifications(uuid,uuid,boolean,jsonb) to authenticated;

create or replace function public.user_can_read_material(p_user_id uuid,p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_day uuid;
  v_required boolean:=true;
  v_pass numeric(5,2):=30;
  v_total integer:=0;
  v_correct integer:=0;
begin
  select schedule_day_id,requires_pdf_verification,pdf_verification_pass_percent
  into v_day,v_required,v_pass
  from public.study_materials
  where id=p_material_id and status='published';

  if v_day is null then return false; end if;
  if coalesce(v_required,true)=false then return true; end if;

  select count(*) into v_total
  from public.verification_questions
  where schedule_day_id=v_day and is_active=true;

  if v_total=0 then return true; end if;

  select count(*) into v_correct
  from public.pdf_verification_attempts a
  join public.verification_questions q on q.id=a.verification_question_id
  where a.user_id=p_user_id
    and a.material_id=p_material_id
    and a.is_correct=true
    and q.schedule_day_id=v_day
    and q.is_active=true;

  return (v_correct::numeric*100/nullif(v_total,0))>=coalesce(v_pass,30);
end;
$$;

revoke all on function public.user_can_read_material(uuid,uuid) from public;

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

create or replace function public.submit_pdf_verification(p_material_id uuid,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_day uuid;
  v_required numeric(5,2):=30;
  v_total integer:=0;
  v_correct_count integer:=0;
  v_answer_count integer:=0;
  item jsonb;
  v_qid uuid;
  v_selected integer;
  v_correct_text text;
  v_is_correct boolean;
  v_score numeric(7,2):=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'Invalid answers'; end if;

  select schedule_day_id,pdf_verification_pass_percent
  into v_day,v_required
  from public.study_materials
  where id=p_material_id and status='published';
  if v_day is null then raise exception 'PDF not found'; end if;

  select count(*) into v_total
  from public.verification_questions
  where schedule_day_id=v_day and is_active=true;

  if v_total=0 then
    return jsonb_build_object('passed',true,'score_percent',100,'required_percent',coalesce(v_required,30),'correct_count',0,'total_count',0);
  end if;

  v_answer_count:=jsonb_array_length(p_answers);
  if v_answer_count<>v_total then raise exception 'हर PDF verification question attempt करना जरूरी है'; end if;

  delete from public.pdf_verification_attempts
  where user_id=v_user and material_id=p_material_id;

  for item in select * from jsonb_array_elements(p_answers)
  loop
    v_qid:=(item->>'question_id')::uuid;
    v_selected:=(item->>'selected_option')::integer;

    select trim(both '"' from k.correct_answer::text)
    into v_correct_text
    from public.verification_questions q
    join public.verification_answer_keys k on k.verification_question_id=q.id
    where q.id=v_qid and q.schedule_day_id=v_day and q.is_active=true;

    if v_correct_text is null then raise exception 'PDF verification question is not configured'; end if;
    v_is_correct:=(v_selected::text=v_correct_text);

    insert into public.pdf_verification_attempts(
      user_id,material_id,verification_question_id,selected_option,is_correct,submitted_at
    ) values(v_user,p_material_id,v_qid,v_selected,v_is_correct,now())
    on conflict(user_id,material_id,verification_question_id)
    do update set selected_option=excluded.selected_option,is_correct=excluded.is_correct,submitted_at=now();
  end loop;

  select count(*) into v_correct_count
  from public.pdf_verification_attempts
  where user_id=v_user and material_id=p_material_id and is_correct=true;

  v_score:=round(v_correct_count::numeric*100/nullif(v_total,0),2);

  return jsonb_build_object(
    'passed',v_score>=coalesce(v_required,30),
    'score_percent',v_score,
    'required_percent',coalesce(v_required,30),
    'correct_count',v_correct_count,
    'total_count',v_total
  );
end;
$$;

grant execute on function public.submit_pdf_verification(uuid,jsonb) to authenticated;

create or replace function public.can_download_material(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.study_materials;
  best_score numeric(5,2);
begin
  if auth.uid() is null then return false; end if;
  select * into m from public.study_materials where id=p_material_id and status='published';
  if m.id is null then return false; end if;
  if not public.user_can_read_material(auth.uid(),p_material_id) then return false; end if;
  if m.access_mode='direct_download' then return true; end if;
  if m.access_mode='read_only' then return false; end if;
  if m.access_mode='test_required' and m.download_test_id is not null then
    select max(percentage) into best_score
    from public.test_attempts
    where user_id=auth.uid() and test_id=m.download_test_id and status='submitted';
    return coalesce(best_score,0)>=coalesce(m.download_pass_percent,80);
  end if;
  return false;
end;
$$;

grant execute on function public.can_download_material(uuid) to authenticated;

create or replace function public.refresh_daily_progress(p_user_id uuid,p_schedule_day_id uuid)
returns public.daily_progress
language plpgsql
security definer
set search_path=public
as $$
declare
  tt integer:=0;
  ct integer:=0;
  pdf_total integer:=0;
  pdf_ready integer:=0;
  pdf_ok boolean:=false;
  final_test_id uuid;
  final_pass numeric(5,2):=0;
  best_final numeric(5,2):=null;
  started boolean:=false;
  st public.progress_status;
  fb public.feedback_code;
  rowout public.daily_progress;
begin
  if not(p_user_id=auth.uid() or public.is_admin()) then raise exception 'Access denied'; end if;

  select count(*) into tt from public.daily_targets
  where schedule_day_id=p_schedule_day_id and is_required=true and status='published';

  select count(*) into pdf_total from public.study_materials
  where schedule_day_id=p_schedule_day_id and status='published';

  select count(*) into pdf_ready from public.study_materials m
  where m.schedule_day_id=p_schedule_day_id and m.status='published'
    and public.user_can_read_material(p_user_id,m.id);

  pdf_ok:=(pdf_total=0 or pdf_ready>=pdf_total);
  ct:=case when pdf_ok then tt else 0 end;

  select id,passing_percent into final_test_id,final_pass
  from public.tests
  where schedule_day_id=p_schedule_day_id and status='published' and is_final_daily=true
  order by created_at desc limit 1;

  if final_test_id is not null then
    select max(percentage) into best_final from public.test_attempts
    where user_id=p_user_id and test_id=final_test_id and status='submitted';
  end if;

  select exists(
    select 1 from public.pdf_verification_attempts a
    join public.study_materials m on m.id=a.material_id
    where a.user_id=p_user_id and m.schedule_day_id=p_schedule_day_id
  ) or best_final is not null into started;

  if not started then
    st:='not_started';fb:='work_not_started';
  elsif not pdf_ok then
    st:='partial';fb:='target_pending';
  elsif final_test_id is not null and (best_final is null or best_final<coalesce(final_pass,0)) then
    st:='partial';fb:='test_pending';
  else
    st:='completed';
    if coalesce(best_final,100)>=80 then fb:='excellent';else fb:='very_good';end if;
  end if;

  insert into public.daily_progress(
    user_id,schedule_day_id,total_targets,completed_targets,class_verified,pdf_verified,
    test_submitted,test_score_percent,status,feedback,updated_at
  ) values(
    p_user_id,p_schedule_day_id,tt,ct,false,pdf_ok,
    best_final is not null,best_final,st,fb,now()
  )
  on conflict(user_id,schedule_day_id) do update set
    total_targets=excluded.total_targets,
    completed_targets=excluded.completed_targets,
    class_verified=false,
    pdf_verified=excluded.pdf_verified,
    test_submitted=excluded.test_submitted,
    test_score_percent=excluded.test_score_percent,
    status=excluded.status,
    feedback=excluded.feedback,
    updated_at=now()
  returning * into rowout;

  return rowout;
end;
$$;

grant execute on function public.refresh_daily_progress(uuid,uuid) to authenticated;

commit;

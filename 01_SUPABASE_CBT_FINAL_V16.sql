-- GK BY PURUSHOTAM SIR — CBT + CLASSES + POSTER FINAL V14.2 — LEGACY DATABASE COMPATIBILITY FIX
-- Safe rerunnable upgrade for the existing/older Supabase database.
-- Adds missing columns instead of assuming CREATE TABLE IF NOT EXISTS changes old tables.
-- Existing CBT question API/tables are not changed.

create extension if not exists pgcrypto;

create table if not exists public.cbt_subject_visibility (
  subject_key text primary key,
  subject_name text not null,
  student_visible boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- LEGACY COMPATIBILITY: this table may already exist from an older app version.
-- CREATE TABLE IF NOT EXISTS does not add missing columns, so add them explicitly.
alter table public.cbt_subject_visibility add column if not exists subject_name text;
alter table public.cbt_subject_visibility add column if not exists student_visible boolean;
alter table public.cbt_subject_visibility add column if not exists updated_at timestamptz;
alter table public.cbt_subject_visibility add column if not exists updated_by uuid;

update public.cbt_subject_visibility
set subject_name=coalesce(nullif(subject_name,''),subject_key),
    student_visible=coalesce(student_visible,case when subject_key='haryana_gk' then true else false end),
    updated_at=coalesce(updated_at,now());

alter table public.cbt_subject_visibility alter column subject_name set default '';
alter table public.cbt_subject_visibility alter column student_visible set default false;
alter table public.cbt_subject_visibility alter column updated_at set default now();
alter table public.cbt_subject_visibility alter column student_visible set not null;
alter table public.cbt_subject_visibility alter column updated_at set not null;
create unique index if not exists cbt_subject_visibility_subject_key_uq on public.cbt_subject_visibility(subject_key);

create table if not exists public.cbt_test_series (
  id uuid primary key default gen_random_uuid(),
  subject_key text not null,
  subject_name text not null,
  topic_key text not null,
  topic_name text not null,
  difficulty text not null default 'normal' check (difficulty in ('easy','normal','tough','all')),
  question_count integer not null check (question_count in (10,20,30,40,50,60,70,80,90,100)),
  seconds_per_question integer not null default 17 check (seconds_per_question between 15 and 17),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cbt_test_series_lookup_idx on public.cbt_test_series(subject_key,topic_key,difficulty,question_count,is_active,created_at desc);

create table if not exists public.cbt_test_sets (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.cbt_test_series(id) on delete cascade,
  internal_set_no integer not null,
  question_payload jsonb not null check (jsonb_typeof(question_payload)='array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(series_id,internal_set_no)
);
create index if not exists cbt_test_sets_series_idx on public.cbt_test_sets(series_id,is_active);

create table if not exists public.cbt_test_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  series_id uuid not null references public.cbt_test_series(id) on delete cascade,
  set_id uuid not null references public.cbt_test_sets(id) on delete cascade,
  mode text not null default 'ranked' check (mode in ('ranked','practice_full','practice_wrong','weak_revision','bookmark_revision')),
  status text not null default 'started' check (status in ('started','submitted','expired','cancelled')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists cbt_assign_student_series_idx on public.cbt_test_assignments(student_id,series_id,started_at desc);
create index if not exists cbt_assign_set_idx on public.cbt_test_assignments(set_id,started_at desc);

create table if not exists public.cbt_test_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.cbt_test_assignments(id) on delete cascade,
  student_id uuid not null,
  student_name text not null default 'Student',
  series_id uuid not null references public.cbt_test_series(id) on delete cascade,
  set_id uuid not null references public.cbt_test_sets(id) on delete cascade,
  is_ranked boolean not null default false,
  total_questions integer not null,
  correct_answers integer not null,
  wrong_answers integer not null,
  skipped_questions integer not null,
  score numeric(10,2) not null,
  total_marks numeric(10,2) not null,
  percentage numeric(7,2) not null,
  time_taken_seconds integer not null,
  negative_marking boolean not null default false,
  answers jsonb not null default '[]'::jsonb,
  question_metrics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cbt_attempt_rank_idx on public.cbt_test_attempts(set_id,is_ranked,score desc,correct_answers desc,wrong_answers asc,time_taken_seconds asc,created_at asc);
create index if not exists cbt_attempt_student_idx on public.cbt_test_attempts(student_id,created_at desc);
create unique index if not exists cbt_one_ranked_attempt_per_student_set on public.cbt_test_attempts(student_id,set_id) where is_ranked=true;

create table if not exists public.cbt_practice_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  mode text not null default 'practice' check (mode in ('practice_random','practice_full','practice_wrong','weak_revision','bookmark_revision')),
  subject_name text not null default 'Practice',
  topic_name text not null default 'Practice',
  total_questions integer not null,
  correct_answers integer not null,
  wrong_answers integer not null,
  skipped_questions integer not null,
  score numeric(10,2) not null,
  total_marks numeric(10,2) not null,
  percentage numeric(7,2) not null,
  time_taken_seconds integer not null,
  created_at timestamptz not null default now()
);
create index if not exists cbt_practice_history_student_idx on public.cbt_practice_history(student_id,created_at desc);

create table if not exists public.cbt_student_weak_questions (
  student_id uuid not null,
  question_key text not null,
  question_payload jsonb not null,
  wrong_count integer not null default 0,
  skipped_count integer not null default 0,
  slow_count integer not null default 0,
  last_reason text,
  mastered boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key(student_id,question_key)
);

create table if not exists public.cbt_bookmarks (
  student_id uuid not null,
  question_key text not null,
  question_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(student_id,question_key)
);

create table if not exists public.cbt_question_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  question_key text not null,
  question_payload jsonb not null,
  report_text text not null default 'Question/answer check requested',
  status text not null default 'open' check (status in ('open','reviewed','fixed','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists cbt_question_reports_status_idx on public.cbt_question_reports(status,created_at desc);

create table if not exists public.haryana_youtube_classes (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null,
  topic_name text not null,
  class_title text not null,
  part_no integer not null default 1 check (part_no between 1 and 50),
  tagline text not null default '',
  youtube_url text not null,
  image_key text,
  student_visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safe if a partial/older Haryana-class table already exists.
alter table public.haryana_youtube_classes add column if not exists topic_key text;
alter table public.haryana_youtube_classes add column if not exists topic_name text;
alter table public.haryana_youtube_classes add column if not exists class_title text;
alter table public.haryana_youtube_classes add column if not exists part_no integer;
alter table public.haryana_youtube_classes add column if not exists tagline text;
alter table public.haryana_youtube_classes add column if not exists youtube_url text;
alter table public.haryana_youtube_classes add column if not exists image_key text;
alter table public.haryana_youtube_classes add column if not exists student_visible boolean;
alter table public.haryana_youtube_classes add column if not exists sort_order integer;
alter table public.haryana_youtube_classes add column if not exists created_by uuid;
alter table public.haryana_youtube_classes add column if not exists created_at timestamptz;
alter table public.haryana_youtube_classes add column if not exists updated_at timestamptz;

update public.haryana_youtube_classes set
  part_no=coalesce(part_no,1), tagline=coalesce(tagline,''),
  student_visible=coalesce(student_visible,true), sort_order=coalesce(sort_order,0),
  created_at=coalesce(created_at,now()), updated_at=coalesce(updated_at,created_at,now());

alter table public.haryana_youtube_classes alter column part_no set default 1;
alter table public.haryana_youtube_classes alter column tagline set default '';
alter table public.haryana_youtube_classes alter column student_visible set default true;
alter table public.haryana_youtube_classes alter column sort_order set default 0;
alter table public.haryana_youtube_classes alter column created_at set default now();
alter table public.haryana_youtube_classes alter column updated_at set default now();
create index if not exists haryana_youtube_classes_order_idx on public.haryana_youtube_classes(student_visible,sort_order,created_at desc);

-- Default subject visibility: Haryana GK ON, others OFF. Admin can change anytime.
insert into public.cbt_subject_visibility(subject_key,subject_name,student_visible) values
('haryana_gk','हरियाणा GK',true),
('indian_history','भारतीय इतिहास',false),
('indian_polity','भारतीय राजव्यवस्था',false),
('indian_geography','भारतीय भूगोल',false),
('science','विज्ञान',false),
('hindi','हिंदी',false),
('indian_static_gk','Static GK',false),
('current_affairs','करंट अफेयर',false)
on conflict(subject_key) do nothing;

-- Self-contained Admin check for V13 policies.
create or replace function public.cbt_v13_is_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid() and lower(coalesce(p.role::text,''))='admin'
  );
$$;

grant execute on function public.cbt_v13_is_admin() to authenticated;

alter table public.cbt_subject_visibility enable row level security;
alter table public.cbt_test_series enable row level security;
alter table public.cbt_test_sets enable row level security;
alter table public.cbt_test_assignments enable row level security;
alter table public.cbt_test_attempts enable row level security;
alter table public.cbt_practice_history enable row level security;
alter table public.cbt_student_weak_questions enable row level security;
alter table public.cbt_bookmarks enable row level security;
alter table public.cbt_question_reports enable row level security;
alter table public.haryana_youtube_classes enable row level security;

-- Drop/recreate named policies so this SQL is safe to rerun.
do $$
declare p record;
begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and policyname like 'cbt_v13_%' loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

create policy cbt_v13_subject_read on public.cbt_subject_visibility for select to authenticated using (student_visible or public.cbt_v13_is_admin());
create policy cbt_v13_subject_admin_all on public.cbt_subject_visibility for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());

create policy cbt_v13_series_student_read on public.cbt_test_series for select to authenticated using (
  is_active and exists(select 1 from public.cbt_subject_visibility v where v.subject_key=cbt_test_series.subject_key and v.student_visible)
);
create policy cbt_v13_series_admin_all on public.cbt_test_series for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());

create policy cbt_v13_sets_admin_all on public.cbt_test_sets for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());

create policy cbt_v13_assign_own_read on public.cbt_test_assignments for select to authenticated using (student_id=auth.uid());
create policy cbt_v13_assign_admin_read on public.cbt_test_assignments for select to authenticated using (public.cbt_v13_is_admin());

create policy cbt_v13_attempt_own_read on public.cbt_test_attempts for select to authenticated using (student_id=auth.uid());
create policy cbt_v13_attempt_admin_read on public.cbt_test_attempts for select to authenticated using (public.cbt_v13_is_admin());

create policy cbt_v13_practice_own_all on public.cbt_practice_history for all to authenticated using (student_id=auth.uid()) with check (student_id=auth.uid());
create policy cbt_v13_practice_admin_read on public.cbt_practice_history for select to authenticated using (public.cbt_v13_is_admin());

create policy cbt_v13_weak_own_all on public.cbt_student_weak_questions for all to authenticated using (student_id=auth.uid()) with check (student_id=auth.uid());
create policy cbt_v13_weak_admin_read on public.cbt_student_weak_questions for select to authenticated using (public.cbt_v13_is_admin());

create policy cbt_v13_bookmark_own_all on public.cbt_bookmarks for all to authenticated using (student_id=auth.uid()) with check (student_id=auth.uid());

create policy cbt_v13_report_own_insert on public.cbt_question_reports for insert to authenticated with check (student_id=auth.uid());
create policy cbt_v13_report_own_read on public.cbt_question_reports for select to authenticated using (student_id=auth.uid());
create policy cbt_v13_report_admin_all on public.cbt_question_reports for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());

create policy cbt_v13_yt_student_read on public.haryana_youtube_classes for select to authenticated using (student_visible or public.cbt_v13_is_admin());
create policy cbt_v13_yt_admin_all on public.haryana_youtube_classes for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());

-- Assign one fixed hidden set. Avoid repeats until all sets in that series have been used.
create or replace function public.assign_cbt_test_set(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_series public.cbt_test_series%rowtype;
  v_set public.cbt_test_sets%rowtype;
  v_assignment public.cbt_test_assignments%rowtype;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select * into v_series from public.cbt_test_series s
  where s.id=p_series_id and s.is_active
    and exists(select 1 from public.cbt_subject_visibility v where v.subject_key=s.subject_key and v.student_visible)
  limit 1;
  if v_series.id is null then raise exception 'Test series unavailable'; end if;

  -- First prefer a set this student has never received. Among those, keep
  -- global distribution balanced by choosing the least-assigned sets first;
  -- random() only breaks ties.
  select s.* into v_set
  from public.cbt_test_sets s
  left join lateral (
    select count(*)::integer as total_assignments
    from public.cbt_test_assignments g
    where g.series_id=v_series.id and g.set_id=s.id and g.mode='ranked'
  ) load on true
  where s.series_id=v_series.id and s.is_active
    and not exists(
      select 1 from public.cbt_test_assignments a
      where a.student_id=v_uid and a.series_id=v_series.id and a.set_id=s.id and a.mode='ranked'
    )
  order by coalesce(load.total_assignments,0) asc, random()
  limit 1;

  -- After this student has used every set once, recycle the least-recently
  -- used set for that student, again balancing global assignment counts.
  if v_set.id is null then
    select s.* into v_set
    from public.cbt_test_sets s
    left join lateral (
      select max(a.started_at) as last_used
      from public.cbt_test_assignments a
      where a.student_id=v_uid and a.series_id=v_series.id and a.set_id=s.id and a.mode='ranked'
    ) u on true
    left join lateral (
      select count(*)::integer as total_assignments
      from public.cbt_test_assignments g
      where g.series_id=v_series.id and g.set_id=s.id and g.mode='ranked'
    ) load on true
    where s.series_id=v_series.id and s.is_active
    order by u.last_used asc nulls first, coalesce(load.total_assignments,0) asc, random()
    limit 1;
  end if;

  if v_set.id is null then raise exception 'No fixed test set found'; end if;

  insert into public.cbt_test_assignments(student_id,series_id,set_id,mode,status)
  values(v_uid,v_series.id,v_set.id,'ranked','started') returning * into v_assignment;

  return jsonb_build_object(
    'assignment_id',v_assignment.id,
    'series_id',v_series.id,
    'set_id',v_set.id,
    'questions',v_set.question_payload,
    'seconds_per_question',v_series.seconds_per_question,
    'question_count',v_series.question_count,
    'subject_key',v_series.subject_key,
    'subject_name',v_series.subject_name,
    'topic_key',v_series.topic_key,
    'topic_name',v_series.topic_name,
    'difficulty',v_series.difficulty
  );
end;
$$;

-- Submit and score on the database side. Internal set number is never returned.
create or replace function public.submit_cbt_attempt(
  p_assignment_id uuid,
  p_answers jsonb,
  p_time_taken_seconds integer,
  p_question_metrics jsonb default '[]'::jsonb,
  p_negative_marking boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_assignment public.cbt_test_assignments%rowtype;
  v_series public.cbt_test_series%rowtype;
  v_questions jsonb;
  v_q jsonb;
  v_answer_json jsonb;
  v_metric jsonb;
  v_idx bigint;
  v_correct_idx integer;
  v_user_idx integer;
  v_correct integer:=0;
  v_wrong integer:=0;
  v_skipped integer:=0;
  v_score numeric(10,2):=0;
  v_total_marks numeric(10,2):=0;
  v_percentage numeric(7,2):=0;
  v_is_ranked boolean:=false;
  v_attempt public.cbt_test_attempts%rowtype;
  v_official public.cbt_test_attempts%rowtype;
  v_rank integer:=null;
  v_participants integer:=0;
  v_name text:='Student';
  v_key text;
  v_seconds integer:=0;
  v_reason text;
begin
  if v_uid is null then raise exception 'Login required'; end if;

  select * into v_assignment from public.cbt_test_assignments
  where id=p_assignment_id and student_id=v_uid limit 1;
  if v_assignment.id is null then raise exception 'Assignment not found'; end if;

  select * into v_series from public.cbt_test_series where id=v_assignment.series_id;
  select question_payload into v_questions from public.cbt_test_sets where id=v_assignment.set_id;

  select coalesce(p.full_name,'Student') into v_name from public.profiles p where p.id=v_uid;
  v_name:=coalesce(nullif(v_name,''),'Student');

  for v_q,v_idx in select value,ordinality from jsonb_array_elements(v_questions) with ordinality loop
    begin
      v_correct_idx:=coalesce(nullif(v_q->>'answerIndex','')::integer,nullif(v_q->>'answer_index','')::integer);
    exception when others then
      v_correct_idx:=-1;
    end;
    v_answer_json:=p_answers -> ((v_idx-1)::integer);
    if v_answer_json is null or v_answer_json='null'::jsonb then
      v_skipped:=v_skipped+1;
    else
      begin v_user_idx:=trim(both '"' from v_answer_json::text)::integer; exception when others then v_user_idx:=-999; end;
      if v_user_idx=v_correct_idx then v_correct:=v_correct+1; else v_wrong:=v_wrong+1; end if;
    end if;
  end loop;

  v_total_marks:=jsonb_array_length(v_questions)*2;
  v_score:=greatest(0,(v_correct*2) - (case when p_negative_marking then v_wrong*0.25 else 0 end));
  if v_total_marks>0 then v_percentage:=round((v_score/v_total_marks)*100,2); end if;

  v_is_ranked:=not exists(
    select 1 from public.cbt_test_attempts a where a.student_id=v_uid and a.set_id=v_assignment.set_id and a.is_ranked
  );

  insert into public.cbt_test_attempts(
    assignment_id,student_id,student_name,series_id,set_id,is_ranked,total_questions,correct_answers,wrong_answers,skipped_questions,
    score,total_marks,percentage,time_taken_seconds,negative_marking,answers,question_metrics
  ) values(
    v_assignment.id,v_uid,v_name,v_assignment.series_id,v_assignment.set_id,v_is_ranked,jsonb_array_length(v_questions),v_correct,v_wrong,v_skipped,
    v_score,v_total_marks,v_percentage,greatest(0,p_time_taken_seconds),p_negative_marking,coalesce(p_answers,'[]'::jsonb),coalesce(p_question_metrics,'[]'::jsonb)
  ) on conflict(assignment_id) do update set
    time_taken_seconds=excluded.time_taken_seconds,
    question_metrics=excluded.question_metrics
  returning * into v_attempt;

  update public.cbt_test_assignments set status='submitted',submitted_at=now() where id=v_assignment.id;

  -- Build weak-question list: wrong, skipped or slow. Correct later attempts can mark an item mastered.
  for v_q,v_idx in select value,ordinality from jsonb_array_elements(v_questions) with ordinality loop
    v_key:=coalesce(nullif(v_q->>'id',''),md5(coalesce(v_q->>'question',v_q->>'question_text','')));
    v_answer_json:=p_answers -> ((v_idx-1)::integer);
    begin
      v_correct_idx:=coalesce(nullif(v_q->>'answerIndex','')::integer,nullif(v_q->>'answer_index','')::integer);
    exception when others then v_correct_idx:=-1; end;
    begin v_user_idx:=trim(both '"' from v_answer_json::text)::integer; exception when others then v_user_idx:=-999; end;
    v_metric:=coalesce(p_question_metrics -> ((v_idx-1)::integer),'{}'::jsonb);
    begin v_seconds:=coalesce(nullif(v_metric->>'seconds','')::integer,0); exception when others then v_seconds:=0; end;
    v_reason:=null;
    if v_answer_json is null or v_answer_json='null'::jsonb then v_reason:='skipped';
    elsif v_user_idx<>v_correct_idx then v_reason:='wrong';
    elsif v_seconds>v_series.seconds_per_question then v_reason:='slow';
    end if;

    if v_reason is not null then
      insert into public.cbt_student_weak_questions(student_id,question_key,question_payload,wrong_count,skipped_count,slow_count,last_reason,mastered,last_seen_at)
      values(v_uid,v_key,v_q,case when v_reason='wrong' then 1 else 0 end,case when v_reason='skipped' then 1 else 0 end,case when v_reason='slow' then 1 else 0 end,v_reason,false,now())
      on conflict(student_id,question_key) do update set
        question_payload=excluded.question_payload,
        wrong_count=public.cbt_student_weak_questions.wrong_count+excluded.wrong_count,
        skipped_count=public.cbt_student_weak_questions.skipped_count+excluded.skipped_count,
        slow_count=public.cbt_student_weak_questions.slow_count+excluded.slow_count,
        last_reason=excluded.last_reason,
        mastered=false,
        last_seen_at=now();
    elsif v_user_idx=v_correct_idx then
      update public.cbt_student_weak_questions set mastered=true,last_seen_at=now() where student_id=v_uid and question_key=v_key;
    end if;
  end loop;

  select * into v_official from public.cbt_test_attempts
  where student_id=v_uid and set_id=v_assignment.set_id and is_ranked
  order by created_at asc limit 1;

  select count(*)::integer into v_participants from public.cbt_test_attempts where set_id=v_assignment.set_id and is_ranked;
  if v_official.id is not null then
    select 1+count(*)::integer into v_rank
    from public.cbt_test_attempts a
    where a.set_id=v_assignment.set_id and a.is_ranked and (
      a.score>v_official.score or
      (a.score=v_official.score and a.correct_answers>v_official.correct_answers) or
      (a.score=v_official.score and a.correct_answers=v_official.correct_answers and a.wrong_answers<v_official.wrong_answers) or
      (a.score=v_official.score and a.correct_answers=v_official.correct_answers and a.wrong_answers=v_official.wrong_answers and a.time_taken_seconds<v_official.time_taken_seconds) or
      (a.score=v_official.score and a.correct_answers=v_official.correct_answers and a.wrong_answers=v_official.wrong_answers and a.time_taken_seconds=v_official.time_taken_seconds and a.created_at<v_official.created_at)
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'is_ranked',v_is_ranked,
    'score',v_score,
    'total_marks',v_total_marks,
    'percentage',v_percentage,
    'correct',v_correct,
    'wrong',v_wrong,
    'skipped',v_skipped,
    'official_rank',v_rank,
    'participants',v_participants,
    'official_score',case when v_official.id is not null then v_official.score else null end,
    'official_percentage',case when v_official.id is not null then v_official.percentage else null end
  );
end;
$$;

create or replace function public.get_cbt_set_leaderboard(p_set_id uuid,p_limit integer default 50)
returns table(rank_no bigint,student_name text,score numeric,percentage numeric,time_taken_seconds integer)
language sql
security definer
set search_path=public
as $$
  select row_number() over(order by a.score desc,a.correct_answers desc,a.wrong_answers asc,a.time_taken_seconds asc,a.created_at asc) as rank_no,
         a.student_name,a.score,a.percentage,a.time_taken_seconds
  from public.cbt_test_attempts a
  where a.set_id=p_set_id and a.is_ranked
    and exists(select 1 from public.cbt_test_assignments x where x.student_id=auth.uid() and x.set_id=p_set_id)
  order by a.score desc,a.correct_answers desc,a.wrong_answers asc,a.time_taken_seconds asc,a.created_at asc
  limit greatest(1,least(coalesce(p_limit,50),100));
$$;

grant execute on function public.assign_cbt_test_set(uuid) to authenticated;
grant execute on function public.submit_cbt_attempt(uuid,jsonb,integer,jsonb,boolean) to authenticated;
grant execute on function public.get_cbt_set_leaderboard(uuid,integer) to authenticated;

grant select on public.cbt_subject_visibility,public.cbt_test_series,public.haryana_youtube_classes to authenticated;
grant select on public.cbt_test_assignments,public.cbt_test_attempts,public.cbt_practice_history,public.cbt_student_weak_questions,public.cbt_bookmarks,public.cbt_question_reports to authenticated;
grant insert on public.cbt_practice_history to authenticated;
grant insert,update,delete on public.cbt_student_weak_questions,public.cbt_bookmarks to authenticated;
grant insert on public.cbt_question_reports to authenticated;
grant all on public.cbt_subject_visibility,public.cbt_test_series,public.cbt_test_sets,public.haryana_youtube_classes to authenticated;

-- Keep table statistics fresh.
analyze public.cbt_test_series;
analyze public.cbt_test_sets;
analyze public.cbt_test_attempts;
analyze public.cbt_practice_history;

-- ============================================================
-- FINAL V14 ADDITIONS — POSTER + BOTTOM TAB NEW-CONTENT INDICATORS
-- ============================================================

create table if not exists public.app_posters (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  message text not null default '',
  image_key text not null,
  action_label text,
  action_url text,
  student_visible boolean not null default true,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- LEGACY POSTER COMPATIBILITY:
-- The old Target App already used app_posters with fields such as is_active/click_url.
-- Keep those old columns/data and add the V14 fields beside them.
alter table public.app_posters add column if not exists title text;
alter table public.app_posters add column if not exists message text;
alter table public.app_posters add column if not exists image_key text;
alter table public.app_posters add column if not exists action_label text;
alter table public.app_posters add column if not exists action_url text;
alter table public.app_posters add column if not exists student_visible boolean;
alter table public.app_posters add column if not exists pinned boolean;
alter table public.app_posters add column if not exists sort_order integer;
alter table public.app_posters add column if not exists created_by uuid;
alter table public.app_posters add column if not exists created_at timestamptz;
alter table public.app_posters add column if not exists updated_at timestamptz;

-- Copy visibility/link from legacy columns only when those columns exist.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_posters' and column_name='is_active') then
    execute 'update public.app_posters set student_visible=coalesce(student_visible,is_active) where student_visible is null';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_posters' and column_name='click_url') then
    execute 'update public.app_posters set action_url=coalesce(action_url,click_url) where action_url is null';
  end if;
  -- Old poster columns may still have NOT NULL constraints. Give them harmless
  -- defaults so the new V14 Admin can insert without sending legacy-only fields.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_posters' and column_name='is_active') then
    execute 'alter table public.app_posters alter column is_active set default true';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_posters' and column_name='poster_format') then
    execute 'alter table public.app_posters alter column poster_format set default ''ratio_16_9''';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_posters' and column_name='fit_mode') then
    execute 'alter table public.app_posters alter column fit_mode set default ''contain''';
  end if;
end $$;

update public.app_posters set
  title=coalesce(title,''), message=coalesce(message,''),
  student_visible=coalesce(student_visible,true), pinned=coalesce(pinned,false),
  sort_order=coalesce(sort_order,0), created_at=coalesce(created_at,now()),
  updated_at=coalesce(updated_at,created_at,now());

alter table public.app_posters alter column title set default '';
alter table public.app_posters alter column message set default '';
alter table public.app_posters alter column student_visible set default true;
alter table public.app_posters alter column pinned set default false;
alter table public.app_posters alter column sort_order set default 0;
alter table public.app_posters alter column created_at set default now();
alter table public.app_posters alter column updated_at set default now();
create index if not exists app_posters_student_order_idx on public.app_posters(student_visible,pinned desc,sort_order,created_at desc);

-- One version counter per Student bottom-tab channel.
create table if not exists public.app_content_channels (
  channel text primary key check (channel in ('classes','poster','cbt')),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.app_content_channels(channel,version) values
('classes',0),('poster',0),('cbt',0)
on conflict(channel) do nothing;

-- Per-student seen state is stored in Supabase, not only in browser/localStorage.
create table if not exists public.student_content_seen (
  student_id uuid not null,
  channel text not null check (channel in ('classes','poster','cbt')),
  seen_version bigint not null default 0,
  seen_at timestamptz not null default now(),
  primary key(student_id,channel)
);
create index if not exists student_content_seen_student_idx on public.student_content_seen(student_id,channel);

alter table public.app_posters enable row level security;
alter table public.app_content_channels enable row level security;
alter table public.student_content_seen enable row level security;

drop policy if exists cbt_v14_poster_student_read on public.app_posters;
drop policy if exists cbt_v14_poster_admin_all on public.app_posters;
drop policy if exists cbt_v14_channels_read on public.app_content_channels;
drop policy if exists cbt_v14_channels_admin_all on public.app_content_channels;
drop policy if exists cbt_v14_seen_own_all on public.student_content_seen;
drop policy if exists cbt_v14_seen_admin_read on public.student_content_seen;

create policy cbt_v14_poster_student_read on public.app_posters
for select to authenticated
using (student_visible or public.cbt_v13_is_admin());

create policy cbt_v14_poster_admin_all on public.app_posters
for all to authenticated
using (public.cbt_v13_is_admin())
with check (public.cbt_v13_is_admin());

create policy cbt_v14_channels_read on public.app_content_channels
for select to authenticated using (true);

create policy cbt_v14_channels_admin_all on public.app_content_channels
for all to authenticated
using (public.cbt_v13_is_admin())
with check (public.cbt_v13_is_admin());

create policy cbt_v14_seen_own_all on public.student_content_seen
for all to authenticated
using (student_id=auth.uid())
with check (student_id=auth.uid());

create policy cbt_v14_seen_admin_read on public.student_content_seen
for select to authenticated
using (public.cbt_v13_is_admin());

grant select on public.app_posters,public.app_content_channels to authenticated;
grant insert,update,delete on public.app_posters to authenticated;
grant select,insert,update on public.student_content_seen to authenticated;
grant all on public.app_content_channels to authenticated;

-- Admin-callable update marker. Used by CBT Question Bank publish actions that
-- live behind the existing Cloudflare Worker and therefore cannot use DB triggers directly.
create or replace function public.bump_content_channel(p_channel text)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare v bigint;
begin
  if p_channel not in ('classes','poster','cbt') then raise exception 'Invalid channel'; end if;
  if not public.cbt_v13_is_admin() then raise exception 'Admin only'; end if;
  insert into public.app_content_channels(channel,version,updated_at)
  values(p_channel,1,now())
  on conflict(channel) do update set version=public.app_content_channels.version+1,updated_at=now()
  returning version into v;
  return v;
end;
$$;
grant execute on function public.bump_content_channel(text) to authenticated;

-- Internal trigger helper: increments version without requiring a browser call.
create or replace function public.bump_content_channel_internal(p_channel text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.app_content_channels(channel,version,updated_at)
  values(p_channel,1,now())
  on conflict(channel) do update set version=public.app_content_channels.version+1,updated_at=now();
end;
$$;

create or replace function public.v14_classes_update_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.student_visible then perform public.bump_content_channel_internal('classes'); end if;
  return new;
end;$$;

drop trigger if exists trg_v14_classes_updates on public.haryana_youtube_classes;
create trigger trg_v14_classes_updates
after insert or update on public.haryana_youtube_classes
for each row execute function public.v14_classes_update_trigger();

create or replace function public.v14_poster_update_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.student_visible then perform public.bump_content_channel_internal('poster'); end if;
  return new;
end;$$;

drop trigger if exists trg_v14_poster_updates on public.app_posters;
create trigger trg_v14_poster_updates
after insert or update on public.app_posters
for each row execute function public.v14_poster_update_trigger();

create or replace function public.v14_cbt_series_update_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active then perform public.bump_content_channel_internal('cbt'); end if;
  return new;
end;$$;

drop trigger if exists trg_v14_cbt_series_updates on public.cbt_test_series;
create trigger trg_v14_cbt_series_updates
after insert or update on public.cbt_test_series
for each row execute function public.v14_cbt_series_update_trigger();

create or replace function public.v14_subject_visibility_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.student_visible then perform public.bump_content_channel_internal('cbt'); end if;
  return new;
end;$$;

drop trigger if exists trg_v14_subject_visibility_updates on public.cbt_subject_visibility;
create trigger trg_v14_subject_visibility_updates
after insert or update on public.cbt_subject_visibility
for each row execute function public.v14_subject_visibility_trigger();

-- Note: haryana_youtube_classes.image_key is intentionally kept for backward
-- database compatibility, but FINAL V14 Admin/Student UI does not use class thumbnails.



-- ============================================================
-- FINAL V15 ADDITIONS — Important Information + compatibility
-- Safe to run after V14.2; no old CBT/class/poster data is deleted.
-- ============================================================

create table if not exists public.app_important_information (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  message text not null default '',
  action_label text,
  action_url text,
  student_visible boolean not null default true,
  pinned boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_important_information_order_idx on public.app_important_information(student_visible,pinned desc,sort_order,created_at desc);
alter table public.app_important_information enable row level security;
drop policy if exists cbt_v15_info_student_read on public.app_important_information;
drop policy if exists cbt_v15_info_admin_all on public.app_important_information;
create policy cbt_v15_info_student_read on public.app_important_information for select to authenticated using (student_visible or public.cbt_v13_is_admin());
create policy cbt_v15_info_admin_all on public.app_important_information for all to authenticated using (public.cbt_v13_is_admin()) with check (public.cbt_v13_is_admin());
grant select on public.app_important_information to authenticated;
grant insert,update,delete on public.app_important_information to authenticated;

-- Expand content-channel constraints for future-safe Important Information notifications/state.
alter table public.app_content_channels drop constraint if exists app_content_channels_channel_check;
alter table public.app_content_channels add constraint app_content_channels_channel_check check (channel in ('classes','poster','cbt','info'));
alter table public.student_content_seen drop constraint if exists student_content_seen_channel_check;
alter table public.student_content_seen add constraint student_content_seen_channel_check check (channel in ('classes','poster','cbt','info'));
insert into public.app_content_channels(channel,version) values ('info',0) on conflict(channel) do nothing;

create or replace function public.bump_content_channel(p_channel text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v bigint;
begin
  if p_channel not in ('classes','poster','cbt','info') then raise exception 'Invalid channel'; end if;
  if not public.cbt_v13_is_admin() then raise exception 'Admin only'; end if;
  insert into public.app_content_channels(channel,version,updated_at) values(p_channel,1,now())
  on conflict(channel) do update set version=public.app_content_channels.version+1,updated_at=now()
  returning version into v;
  return v;
end;$$;
grant execute on function public.bump_content_channel(text) to authenticated;

create or replace function public.v15_info_update_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.student_visible then perform public.bump_content_channel_internal('info'); end if;
  return new;
end;$$;
drop trigger if exists trg_v15_info_updates on public.app_important_information;
create trigger trg_v15_info_updates after insert or update on public.app_important_information for each row execute function public.v15_info_update_trigger();

analyze public.app_important_information;


-- ================================================================
-- FINAL V16 — HARYANA GK CLASS GROUPING + MULTI-TOPIC SEARCH
-- Safe, additive, rerunnable migration. No old class/test data deleted.
-- ================================================================
alter table public.haryana_youtube_classes add column if not exists covered_topics jsonb;
alter table public.haryana_youtube_classes add column if not exists group_key text;
alter table public.haryana_youtube_classes add column if not exists group_name text;
alter table public.haryana_youtube_classes add column if not exists group_order integer;

update public.haryana_youtube_classes
set covered_topics = jsonb_build_array(jsonb_build_object('key',topic_key,'name',coalesce(topic_name,topic_key)))
where covered_topics is null
   or case when jsonb_typeof(covered_topics)='array' then jsonb_array_length(covered_topics)=0 else true end;

update public.haryana_youtube_classes
set group_key = case when coalesce(group_key,topic_key)='haryana_gk_003' then 'haryana_gk_002' else coalesce(group_key,topic_key) end,
    group_name = case
      when coalesce(group_key,topic_key) in ('haryana_gk_002','haryana_gk_003') then 'प्राचीन हरियाणा, पुरातात्विक स्थल एवं हड़प्पा सभ्यता'
      else coalesce(group_name,topic_name,'Haryana GK') end,
    group_order = coalesce(group_order,
      case
        when coalesce(group_key,topic_key) in ('haryana_gk_002','haryana_gk_003') then 2
        when coalesce(group_key,topic_key) ~ '^haryana_gk_[0-9]{3}$' then greatest(1,substring(coalesce(group_key,topic_key) from '([0-9]{3})$')::integer - case when substring(coalesce(group_key,topic_key) from '([0-9]{3})$')::integer >= 3 then 1 else 0 end)
        else 9999
      end),
    sort_order = coalesce(sort_order,0);

alter table public.haryana_youtube_classes alter column covered_topics set default '[]'::jsonb;
create index if not exists haryana_youtube_classes_group_idx on public.haryana_youtube_classes(student_visible,group_order,part_no,sort_order);

analyze public.haryana_youtube_classes;

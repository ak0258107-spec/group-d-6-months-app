begin;

alter table public.verification_questions
  add column if not exists explanation text;

create or replace function public.submit_target_verification(
  p_verification_question_id uuid,
  p_target_id uuid,
  p_answer text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_correct text;
  v_ok boolean:=false;
  v_total integer:=0;
  v_correct_count integer:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select vak.correct_answer into v_correct
  from public.verification_questions vq
  join public.verification_answer_keys vak on vak.verification_question_id=vq.id
  where vq.id=p_verification_question_id
    and vq.target_id=p_target_id
    and vq.is_active=true;

  if v_correct is null then raise exception 'Verification question not configured'; end if;
  v_ok:=lower(trim(coalesce(p_answer,'')))=lower(trim(v_correct));

  insert into public.verification_attempts(user_id,verification_question_id,submitted_answer,is_correct,submitted_at)
  values(v_user,p_verification_question_id,p_answer,v_ok,now())
  on conflict(user_id,verification_question_id)
  do update set submitted_answer=excluded.submitted_answer,is_correct=excluded.is_correct,submitted_at=now();

  if v_ok then
    select count(*) into v_total
    from public.verification_questions
    where target_id=p_target_id and is_active=true;

    select count(*) into v_correct_count
    from public.verification_questions vq
    join public.verification_attempts va
      on va.verification_question_id=vq.id
     and va.user_id=v_user
     and va.is_correct=true
    where vq.target_id=p_target_id and vq.is_active=true;

    if v_total>0 and v_correct_count>=v_total then
      insert into public.target_completions(user_id,target_id,is_completed,completion_source,completed_at)
      values(v_user,p_target_id,true,'verification',now())
      on conflict(user_id,target_id)
      do update set is_completed=true,completion_source='verification',completed_at=now();
    end if;
  end if;

  return v_ok;
end;
$$;

grant execute on function public.submit_target_verification(uuid,uuid,text) to authenticated;

commit;

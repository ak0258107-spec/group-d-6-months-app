
begin;
alter table public.verification_questions add column if not exists target_id uuid references public.daily_targets(id) on delete cascade;
create index if not exists idx_verification_questions_target_id on public.verification_questions(target_id);

create or replace function public.submit_target_verification(
  p_verification_question_id uuid,
  p_target_id uuid,
  p_answer text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_correct text;
  v_schedule_day_id uuid;
  v_is_correct boolean := false;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select vak.correct_answer::text, vq.schedule_day_id
    into v_correct, v_schedule_day_id
  from public.verification_questions vq
  join public.verification_answer_keys vak on vak.verification_question_id = vq.id
  where vq.id = p_verification_question_id
    and vq.target_id = p_target_id
    and vq.is_active = true;

  if v_correct is null then raise exception 'Verification question not configured for this target'; end if;

  v_is_correct := lower(trim(coalesce(p_answer,''))) = lower(trim(v_correct));

  insert into public.verification_attempts(user_id,verification_question_id,submitted_answer,is_correct,answered_at)
  values(v_user,p_verification_question_id,to_jsonb(p_answer),v_is_correct,now());

  if v_is_correct then
    insert into public.target_completions(user_id,target_id,is_completed,completion_source,completed_at)
    values(v_user,p_target_id,true,'verification',now())
    on conflict (user_id,target_id)
    do update set is_completed=true,completion_source='verification',completed_at=excluded.completed_at;
  end if;

  return v_is_correct;
end;
$$;

grant execute on function public.submit_target_verification(uuid,uuid,text) to authenticated;
commit;

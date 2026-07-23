

-- ============================================================
-- PDF READ FIX:
-- If no active class-verification question is configured for
-- the PDF's day, allow direct read.
-- If verification questions exist, only targets that actually
-- have active verification questions are required.
-- ============================================================
create or replace function public.can_read_material(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.study_materials;
  verification_count integer:=0;
  required_verification_targets integer:=0;
  completed_verification_targets integer:=0;
begin
  if auth.uid() is null then return false; end if;

  select * into m
  from public.study_materials
  where id=p_material_id and status='published';

  if m.id is null then return false; end if;

  if coalesce(m.requires_class_verification,false)=false then
    return true;
  end if;

  select count(*)
  into verification_count
  from public.verification_questions vq
  where vq.schedule_day_id=m.schedule_day_id
    and vq.verification_kind='class'
    and vq.is_active=true;

  -- Admin ने कोई verification question नहीं दिया:
  -- PDF सीधे पढ़ने दें।
  if verification_count=0 then
    return true;
  end if;

  select count(distinct vq.target_id)
  into required_verification_targets
  from public.verification_questions vq
  join public.daily_targets dt on dt.id=vq.target_id
  where vq.schedule_day_id=m.schedule_day_id
    and vq.verification_kind='class'
    and vq.is_active=true
    and dt.status='published'
    and dt.is_required=true;

  select count(distinct tc.target_id)
  into completed_verification_targets
  from public.target_completions tc
  join public.daily_targets dt on dt.id=tc.target_id
  where tc.user_id=auth.uid()
    and tc.is_completed=true
    and dt.schedule_day_id=m.schedule_day_id
    and dt.status='published'
    and dt.is_required=true
    and exists(
      select 1
      from public.verification_questions vq
      where vq.target_id=dt.id
        and vq.verification_kind='class'
        and vq.is_active=true
    );

  return required_verification_targets=0
      or completed_verification_targets>=required_verification_targets;
end;
$$;

grant execute on function public.can_read_material(uuid) to authenticated;

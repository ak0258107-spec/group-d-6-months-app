-- GK BY PURUSHOTAM SIR — FINAL V18
-- Safe additive migration: Student Class Completion only.
-- Existing CBT / Classes / Poster / Student data is not deleted.

create table if not exists public.student_class_completion (
  student_id uuid not null,
  class_id uuid not null references public.haryana_youtube_classes(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (student_id, class_id)
);

create index if not exists student_class_completion_student_idx
  on public.student_class_completion(student_id, completed_at desc);

alter table public.student_class_completion enable row level security;

drop policy if exists cbt_v18_class_completion_own_all on public.student_class_completion;
drop policy if exists cbt_v18_class_completion_admin_read on public.student_class_completion;

create policy cbt_v18_class_completion_own_all
on public.student_class_completion
for all to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy cbt_v18_class_completion_admin_read
on public.student_class_completion
for select to authenticated
using (public.cbt_v13_is_admin());

grant select,insert,update,delete on public.student_class_completion to authenticated;

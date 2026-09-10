-- Quizora schema — paste into Supabase SQL Editor and run once.
-- Works with the publishable (anon) key: admins use their login JWT,
-- students use the functions below so correct answers stay hidden.

create extension if not exists "pgcrypto";

-- Keep Connect's auth trigger from blocking Quizora signup.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  status text not null default 'offline',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.profiles') is not null then
    begin
      insert into public.profiles (id, display_name)
      values (
        new.id,
        coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'user'), '@', 1))
      )
      on conflict (id) do nothing;
    exception
      when others then
        null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  slug text not null unique,
  duration_minutes integer,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanation text default '',
  remark text default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  candidate_name text not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score integer default 0,
  total_questions integer default 0,
  time_taken_ms bigint default 0,
  ai_suggestions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_option text check (selected_option is null or selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean,
  time_spent_ms bigint not null default 0,
  answered_at timestamptz default now(),
  unique (attempt_id, question_id)
);

create index if not exists exams_slug_idx on public.exams (slug);
create index if not exists exams_created_by_idx on public.exams (created_by);
create index if not exists questions_exam_id_idx on public.questions (exam_id);
create index if not exists attempts_exam_id_idx on public.attempts (exam_id);
create index if not exists attempt_answers_attempt_id_idx on public.attempt_answers (attempt_id);

alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;

drop policy if exists exams_owner_all on public.exams;
create policy exams_owner_all on public.exams
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists questions_owner_all on public.questions;
create policy questions_owner_all on public.questions
  for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and e.created_by = auth.uid()))
  with check (exists (select 1 from public.exams e where e.id = exam_id and e.created_by = auth.uid()));

drop policy if exists attempts_owner_select on public.attempts;
create policy attempts_owner_select on public.attempts
  for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and e.created_by = auth.uid()));

drop policy if exists answers_owner_select on public.attempt_answers;
create policy answers_owner_select on public.attempt_answers
  for select to authenticated
  using (
    exists (
      select 1
      from public.attempts a
      join public.exams e on e.id = a.exam_id
      where a.id = attempt_id and e.created_by = auth.uid()
    )
  );

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exams_set_updated_at on public.exams;
create trigger exams_set_updated_at
before update on public.exams
for each row execute function public.set_updated_at();

create or replace function public.quiz_public_question(q public.questions)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', q.id,
    'question_text', q.question_text,
    'option_a', q.option_a,
    'option_b', q.option_b,
    'option_c', q.option_c,
    'option_d', q.option_d,
    'order_index', q.order_index
  );
$$;

create or replace function public.quiz_get_exam(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.exams;
  qcount int;
begin
  select * into e from public.exams where slug = p_slug and is_active = true;
  if not found then
    return jsonb_build_object('error', 'This exam is not available');
  end if;
  select count(*) into qcount from public.questions where exam_id = e.id;
  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'description', e.description,
      'slug', e.slug,
      'duration_minutes', e.duration_minutes,
      'is_active', e.is_active,
      'question_count', qcount
    )
  );
end;
$$;

create or replace function public.quiz_start_exam(p_slug text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.exams;
  att public.attempts;
  qs jsonb;
begin
  if length(trim(coalesce(p_name, ''))) < 2 then
    return jsonb_build_object('error', 'Please enter your name (at least 2 characters)');
  end if;
  select * into e from public.exams where slug = p_slug and is_active = true;
  if not found then
    return jsonb_build_object('error', 'This exam is not available');
  end if;
  select coalesce(jsonb_agg(public.quiz_public_question(q) order by q.order_index), '[]'::jsonb)
    into qs
  from public.questions q
  where q.exam_id = e.id;
  if qs = '[]'::jsonb then
    return jsonb_build_object('error', 'This exam has no questions yet');
  end if;
  insert into public.attempts (exam_id, candidate_name, total_questions)
  values (e.id, trim(p_name), jsonb_array_length(qs))
  returning * into att;
  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', att.id,
      'candidate_name', att.candidate_name,
      'started_at', att.started_at,
      'exam', jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'slug', e.slug,
        'duration_minutes', e.duration_minutes
      )
    ),
    'questions', qs,
    'answers', '{}'::jsonb
  );
end;
$$;

create or replace function public.quiz_get_attempt(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att public.attempts;
  e public.exams;
  qs jsonb;
  ans jsonb;
begin
  select * into att from public.attempts where id = p_id;
  if not found then
    return jsonb_build_object('error', 'Attempt not found');
  end if;
  if att.submitted_at is not null then
    return jsonb_build_object('submitted', true, 'attempt_id', att.id);
  end if;
  select * into e from public.exams where id = att.exam_id;
  select coalesce(jsonb_agg(public.quiz_public_question(q) order by q.order_index), '[]'::jsonb)
    into qs from public.questions q where q.exam_id = att.exam_id;
  select coalesce(jsonb_object_agg(a.question_id::text, jsonb_build_object(
      'selected_option', a.selected_option,
      'time_spent_ms', a.time_spent_ms
    )), '{}'::jsonb)
    into ans
  from public.attempt_answers a
  where a.attempt_id = att.id;
  return jsonb_build_object(
    'submitted', false,
    'attempt', jsonb_build_object(
      'id', att.id,
      'candidate_name', att.candidate_name,
      'started_at', att.started_at,
      'exam', jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'slug', e.slug,
        'duration_minutes', e.duration_minutes
      )
    ),
    'questions', qs,
    'answers', ans
  );
end;
$$;

create or replace function public.quiz_save_answer(p_attempt_id uuid, p_question_id uuid, p_selected text, p_time_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att public.attempts;
  letter text := upper(trim(p_selected));
begin
  select * into att from public.attempts where id = p_attempt_id;
  if not found or att.submitted_at is not null then
    return jsonb_build_object('error', 'This attempt is closed');
  end if;
  if letter not in ('A', 'B', 'C', 'D') then
    return jsonb_build_object('error', 'Pick option A, B, C, or D');
  end if;
  if not exists (select 1 from public.questions where id = p_question_id and exam_id = att.exam_id) then
    return jsonb_build_object('error', 'Invalid question');
  end if;
  insert into public.attempt_answers (attempt_id, question_id, selected_option, time_spent_ms, answered_at)
  values (p_attempt_id, p_question_id, letter, greatest(coalesce(p_time_ms, 0), 0), now())
  on conflict (attempt_id, question_id) do update
    set selected_option = excluded.selected_option,
        time_spent_ms = public.attempt_answers.time_spent_ms + excluded.time_spent_ms,
        answered_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.quiz_heartbeat(p_attempt_id uuid, p_question_id uuid, p_time_ms bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att public.attempts;
  spent bigint := greatest(coalesce(p_time_ms, 0), 0);
begin
  select * into att from public.attempts where id = p_attempt_id;
  if not found or att.submitted_at is not null or spent <= 0 or p_question_id is null then
    return jsonb_build_object('ok', true);
  end if;
  insert into public.attempt_answers (attempt_id, question_id, selected_option, time_spent_ms)
  values (p_attempt_id, p_question_id, null, spent)
  on conflict (attempt_id, question_id) do update
    set time_spent_ms = public.attempt_answers.time_spent_ms + excluded.time_spent_ms;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.quiz_submit_exam(p_attempt_id uuid, p_timings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att public.attempts;
  e public.exams;
  q record;
  ans public.attempt_answers;
  extra bigint;
  selected text;
  correct boolean;
  new_score int := 0;
  qcount int := 0;
  submitted timestamptz := now();
  review jsonb := '[]'::jsonb;
begin
  select * into att from public.attempts where id = p_attempt_id;
  if not found then
    return jsonb_build_object('error', 'Attempt not found');
  end if;
  if att.submitted_at is not null then
    return jsonb_build_object('attempt_id', att.id, 'already', true, 'score', att.score, 'total', att.total_questions);
  end if;
  select * into e from public.exams where id = att.exam_id;

  for q in select * from public.questions where exam_id = att.exam_id order by order_index
  loop
    qcount := qcount + 1;
    extra := greatest(coalesce((p_timings ->> q.id::text)::bigint, 0), 0);
    select * into ans from public.attempt_answers where attempt_id = att.id and question_id = q.id;
    selected := ans.selected_option;
    correct := selected = q.correct_answer;
    if correct then new_score := new_score + 1; end if;

    if ans.id is not null then
      update public.attempt_answers
        set selected_option = selected,
            is_correct = correct,
            time_spent_ms = coalesce(ans.time_spent_ms, 0) + extra
      where id = ans.id;
    else
      insert into public.attempt_answers (attempt_id, question_id, selected_option, is_correct, time_spent_ms)
      values (att.id, q.id, selected, correct, extra);
    end if;

    review := review || jsonb_build_array(jsonb_build_object(
      'question_text', q.question_text,
      'selected_label', case selected
        when 'A' then q.option_a when 'B' then q.option_b when 'C' then q.option_c when 'D' then q.option_d
        else 'Not answered' end,
      'correct_label', case q.correct_answer
        when 'A' then q.option_a when 'B' then q.option_b when 'C' then q.option_c else q.option_d end,
      'explanation', q.explanation,
      'is_correct', correct,
      'time_spent_ms', coalesce(ans.time_spent_ms, 0) + extra
    ));
  end loop;

  update public.attempts
    set submitted_at = submitted,
        score = new_score,
        total_questions = qcount,
        time_taken_ms = greatest(0, (extract(epoch from submitted - att.started_at) * 1000)::bigint)
  where id = att.id;

  return jsonb_build_object(
    'attempt_id', att.id,
    'score', new_score,
    'total', qcount,
    'name', att.candidate_name,
    'exam_title', e.title,
    'review', review
  );
end;
$$;

create or replace function public.quiz_save_ai(p_attempt_id uuid, p_suggestions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attempts set ai_suggestions = coalesce(p_suggestions, '[]'::jsonb) where id = p_attempt_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.quiz_get_result(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  att public.attempts;
  e public.exams;
  details jsonb;
begin
  select * into att from public.attempts where id = p_id;
  if not found or att.submitted_at is null then
    return jsonb_build_object('error', 'Result not ready');
  end if;
  select * into e from public.exams where id = att.exam_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'number', sub.n,
      'question_text', sub.question_text,
      'option_a', sub.option_a,
      'option_b', sub.option_b,
      'option_c', sub.option_c,
      'option_d', sub.option_d,
      'correct_answer', sub.correct_answer,
      'explanation', sub.explanation,
      'selected_option', sub.selected_option,
      'is_correct', coalesce(sub.is_correct, false),
      'time_spent_ms', coalesce(sub.time_spent_ms, 0)
    ) order by sub.n), '[]'::jsonb)
  into details
  from (
    select
      row_number() over (order by q.order_index) as n,
      q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
      q.correct_answer, q.explanation,
      a.selected_option, a.is_correct, a.time_spent_ms
    from public.questions q
    left join public.attempt_answers a on a.question_id = q.id and a.attempt_id = att.id
    where q.exam_id = att.exam_id
  ) sub;

  return jsonb_build_object(
    'exam', jsonb_build_object('title', e.title, 'description', e.description, 'slug', e.slug),
    'attempt', jsonb_build_object(
      'id', att.id,
      'candidate_name', att.candidate_name,
      'started_at', att.started_at,
      'submitted_at', att.submitted_at,
      'score', att.score,
      'total_questions', att.total_questions,
      'time_taken_ms', att.time_taken_ms,
      'ai_suggestions', coalesce(att.ai_suggestions, '[]'::jsonb)
    ),
    'details', details
  );
end;
$$;

grant execute on function public.quiz_get_exam(text) to anon, authenticated;
grant execute on function public.quiz_start_exam(text, text) to anon, authenticated;
grant execute on function public.quiz_get_attempt(uuid) to anon, authenticated;
grant execute on function public.quiz_save_answer(uuid, uuid, text, bigint) to anon, authenticated;
grant execute on function public.quiz_heartbeat(uuid, uuid, bigint) to anon, authenticated;
grant execute on function public.quiz_submit_exam(uuid, jsonb) to anon, authenticated;
grant execute on function public.quiz_save_ai(uuid, jsonb) to anon, authenticated;
grant execute on function public.quiz_get_result(uuid) to anon, authenticated;

grant select, insert, update, delete on public.exams to authenticated;
grant select, insert, update, delete on public.questions to authenticated;
grant select on public.attempts to authenticated;
grant select on public.attempt_answers to authenticated;
grant usage, select on all sequences in schema public to authenticated;

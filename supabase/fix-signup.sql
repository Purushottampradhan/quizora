-- Run this once in Supabase → SQL Editor if signup says
-- "Database error saving new user".
-- Cause: this project still has Connect's auth trigger; if profiles
-- insert fails, Supabase rolls back the whole signup.

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

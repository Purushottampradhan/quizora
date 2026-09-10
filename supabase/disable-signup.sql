-- Block new Auth users at the database. Existing admins can still sign in.
-- Run once in Supabase → SQL Editor.

create or replace function public.reject_new_signups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'New signups are disabled';
end;
$$;

drop trigger if exists reject_new_signups on auth.users;
create trigger reject_new_signups
  before insert on auth.users
  for each row execute function public.reject_new_signups();

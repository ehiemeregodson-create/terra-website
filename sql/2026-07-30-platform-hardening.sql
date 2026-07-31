-- Rate limiting: atomic sliding-window counter used by lib/rateLimit.js.
create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 1
);

create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
        when rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
          then 1
        else rate_limits.count + 1
      end,
      window_start = case
        when rate_limits.window_start < v_now - (p_window_seconds || ' seconds')::interval
          then v_now
        else rate_limits.window_start
      end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- If get_started.user_id doesn't exist yet, this adds it with cascade delete already correct.
-- If it exists from an earlier migration (without ON DELETE CASCADE), the two ALTERs below fix it:
-- deleting an account (Delete my account) would otherwise fail with a foreign key violation
-- because a case row still references it.
alter table get_started add column if not exists user_id uuid references auth.users(id);

alter table get_started drop constraint if exists get_started_user_id_fkey;
alter table get_started add constraint get_started_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

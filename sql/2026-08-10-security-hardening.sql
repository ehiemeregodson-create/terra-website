-- Row-Level Security: enable on every table with zero policies, so the anon/authenticated
-- Postgres roles are default-denied entirely. Only the backend's service_role key (used
-- exclusively server-side, never exposed to the browser) bypasses RLS. Safe to re-run.
alter table waitlist enable row level security;
alter table get_started enable row level security;
alter table discussion_posts enable row level security;
alter table rate_limits enable row level security;
alter table subscriptions enable row level security;

-- Progressive login lockout: 5 failed password attempts locks the account, with each
-- subsequent lockout lasting longer than the last (15 min -> 1 hour -> 1 day -> 3 days -> 7
-- days), matching how Microsoft/Google-style "smart lockout" systems behave. Keyed by email,
-- not IP, since the point is to protect the account regardless of where attempts come from
-- (a separate per-IP rate limit in lib/rateLimit.js already guards against spraying many
-- accounts from one source).
create table if not exists login_lockouts (
  email text primary key,
  failed_count int not null default 0,
  lockout_tier int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table login_lockouts enable row level security;

create or replace function record_login_failure(p_email text)
returns table(is_locked boolean, locked_until_at timestamptz, total_failed int)
language plpgsql
as $$
declare
  v_row login_lockouts%rowtype;
  v_now timestamptz := now();
  v_duration interval;
begin
  insert into login_lockouts (email, failed_count, updated_at)
  values (p_email, 1, v_now)
  on conflict (email) do update
    set failed_count = login_lockouts.failed_count + 1,
        updated_at = v_now
  returning * into v_row;

  if v_row.failed_count > 0 and v_row.failed_count % 5 = 0 then
    v_row.lockout_tier := v_row.lockout_tier + 1;
    v_duration := case
      when v_row.lockout_tier = 1 then interval '15 minutes'
      when v_row.lockout_tier = 2 then interval '1 hour'
      when v_row.lockout_tier = 3 then interval '1 day'
      when v_row.lockout_tier = 4 then interval '3 days'
      else interval '7 days'
    end;
    update login_lockouts
      set lockout_tier = v_row.lockout_tier,
          locked_until = v_now + v_duration
      where email = p_email
      returning * into v_row;
  end if;

  return query select
    (v_row.locked_until is not null and v_row.locked_until > v_now),
    v_row.locked_until,
    v_row.failed_count;
end;
$$;

create or replace function check_login_lockout(p_email text)
returns table(is_locked boolean, locked_until_at timestamptz)
language plpgsql
as $$
declare
  v_locked_until timestamptz;
begin
  select login_lockouts.locked_until into v_locked_until
    from login_lockouts where email = p_email;
  return query select (v_locked_until is not null and v_locked_until > now()), v_locked_until;
end;
$$;

create or replace function reset_login_lockout(p_email text)
returns void
language plpgsql
as $$
begin
  update login_lockouts
    set failed_count = 0, lockout_tier = 0, locked_until = null, updated_at = now()
    where email = p_email;
end;
$$;

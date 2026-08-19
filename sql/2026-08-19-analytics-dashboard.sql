-- Backs the tiered analytics dashboard (Free/Pro/Premium widgets on the homepage).
-- All RLS-enabled, no policies — service-role-only via lib/supabase.js, same pattern as
-- every other table in this project.

-- Free tier: team-curated policy alerts, matched to a case by category/destination country.
-- Global table (not per-user) — null category/country_to means "applies to everyone."
create table policy_alerts (
  id uuid primary key default gen_random_uuid(),
  category text,
  country_to text,
  title text not null,
  body text not null,
  severity text not null default 'info', -- 'info' | 'action_needed'
  published_at timestamptz not null default now()
);
alter table policy_alerts enable row level security;

-- Pro tier: case timeline/history. Auto-populated by lib/casesHandlers.js, not user-entered.
create table case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, -- 'created' | 'stage_change'
  title text not null,
  description text,
  occurred_at timestamptz not null default now()
);
alter table case_events enable row level security;

-- Pro tier: predictive timeline lookup. Deliberately left UNSEEDED — no real historical USCIS
-- processing-time data exists to base estimates on; fabricating numbers for a high-stakes legal
-- timeline isn't acceptable. The dashboard widget shows an honest "still gathering data" state
-- until real ranges are added here directly.
create table case_timeline_estimates (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  stage text not null,
  min_months numeric,
  max_months numeric,
  note text,
  updated_at timestamptz not null default now()
);
alter table case_timeline_estimates enable row level security;

-- Pro tier: interview/application prep checklist, seeded per-case from a static template on create.
create table prep_checklist_items (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  completed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table prep_checklist_items enable row level security;

-- Premium tier: tracks a real user action (requesting a call), not fabricated attorney data.
create table attorney_connections (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'not_requested', -- 'not_requested' | 'requested' | 'scheduled' | 'completed'
  requested_at timestamptz,
  scheduled_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table attorney_connections enable row level security;

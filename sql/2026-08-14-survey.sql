-- Electronic version of the "Terra Immigrant Experience & Needs Assessment" questionnaire.
-- Two tables so contact info can be stored genuinely separately from responses, matching the
-- form's own printed confidentiality promise: survey_contacts has no foreign key back to
-- survey_responses, so a submitted response and its optional contact info can never be joined.

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  a3 text, a4 text, a4_other text, a5 text, a6 text,
  a7 text, a7_other text, a8 text, a9 text, a10 text, a11 text, a12 text,
  b1 text, b2 text, b3 text, b4 text, b5 text, b6 text,
  c1_1 smallint, c1_2 smallint, c1_3 smallint, c1_4 smallint,
  c2_1 smallint, c2_2 smallint, c2_3 smallint, c2_4 smallint,
  c3_1 smallint, c3_2 smallint, c3_3 smallint, c3_4 smallint,
  c4_1 smallint, c4_2 smallint, c4_3 smallint, c4_4 smallint,
  c5_1 smallint, c5_2 smallint, c5_3 smallint, c5_4 smallint,
  c6_1 smallint, c6_2 smallint, c6_3 smallint, c6_4 smallint,
  d1 smallint, d2 smallint, d3 smallint, d4 smallint,
  d5 smallint, d6 smallint, d7 smallint, d8 smallint,
  d9 text, d10 text
);
alter table survey_responses enable row level security;

create table survey_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact text not null
);
alter table survey_contacts enable row level security;

-- Backs the redesigned Jobs page: a real, verifiable directory of employers that have
-- sponsored international candidates, matched against a candidate's questionnaire answers.
--
-- Every row is a real, individual case record drawn directly from the U.S. Department of
-- Labor's public disclosure data files (the same "OFLC Performance Data" releases that make
-- PERM/LCA case outcomes public in the first place — PERM cases are the ones that require the
-- newspaper recruitment ads). Downloaded straight from dol.gov (LCA_Disclosure_Data_FY2026_Q3
-- and PERM_Disclosure_Data_FY2026_Q3), filtered to CASE_STATUS = 'Certified' only. Nothing here
-- is fabricated or estimated — wages, job titles, and case numbers are exactly as filed.
--
-- RLS enabled, no policies — service-role-only via lib/supabase.js, same pattern as every
-- other table in this project. Public data, but reads still go through our own API so results
-- can be shaped/matched server-side rather than exposing a raw table to the client.
create table job_sponsor_records (
  id uuid primary key default gen_random_uuid(),
  employer_name text not null,
  industry text not null,       -- one of a fixed set — see JOBS_INDUSTRIES in lib/jobsHandlers.js
  job_title text not null,
  visa_type text not null,      -- 'H-1B' | 'Green Card (PERM)'
  wage_from numeric,
  wage_to numeric,
  wage_period text not null default 'Year',
  city text,
  state text,
  case_number text not null,
  decision_date date,
  created_at timestamptz not null default now()
);
alter table job_sponsor_records enable row level security;

create index job_sponsor_records_industry_idx on job_sponsor_records(industry);

-- Seed: 31 real, individually-verified certified cases pulled from the FY2026 Q3 disclosure
-- files, spanning 8 industries and both visa pathways (H-1B and green card/PERM).
insert into job_sponsor_records (employer_name, industry, job_title, visa_type, wage_from, wage_to, wage_period, city, state, case_number, decision_date) values

-- Technology
('Google LLC', 'Technology', 'Software Engineer', 'H-1B', 228000, null, 'Year', 'Sunnyvale', 'CA', 'I-200-25267-331391', '2025-10-01'),
('Amazon Web Services, Inc.', 'Technology', 'Principal, Solutions Architect', 'H-1B', 184974, null, 'Year', 'San Diego', 'CA', 'I-200-25267-330680', '2025-10-01'),
('Microsoft Corporation', 'Technology', 'Software Engineer', 'Green Card (PERM)', 128502, 158502, 'Year', 'Redmond', 'WA', 'G-100-24240-298027', '2026-01-08'),
('Salesforce, Inc.', 'Technology', 'Software Engineering SMTS', 'Green Card (PERM)', 167916, null, 'Year', 'Dallas', 'TX', 'G-100-24215-240639', '2026-01-05'),

-- Manufacturing (includes semiconductor/hardware — classified under Manufacturing NAICS codes)
('NVIDIA Corporation', 'Manufacturing', 'Software Engineer', 'H-1B', 264514, 356500, 'Year', 'Santa Clara', 'CA', 'I-200-25267-332934', '2025-10-01'),
('Apple Inc.', 'Manufacturing', 'Software Engineering Systems Manager', 'H-1B', 228100, 342800, 'Year', 'Cupertino', 'CA', 'I-200-25268-333676', '2025-11-04'),
('Intel Corporation', 'Manufacturing', 'Engineering Manager', 'H-1B', 202299, 292840, 'Year', 'Santa Clara', 'CA', 'I-200-25267-330397', '2025-10-01'),
('Ford Motor Company', 'Manufacturing', 'Vehicle Controls Embedded Software Engineer', 'Green Card (PERM)', 122640, 231720, 'Year', 'Dearborn', 'MI', 'G-100-24244-307842', '2026-01-05'),

-- Finance
('Goldman Sachs Services LLC', 'Finance', 'Vice President, Software Engineering', 'H-1B', 215000, null, 'Year', 'Salt Lake City', 'UT', 'I-200-25272-340380', '2025-11-06'),
('Bank of America N.A.', 'Finance', 'Senior Vice President; Senior Technology Manager', 'H-1B', 232500, null, 'Year', 'Plano', 'TX', 'I-200-25268-334004', '2025-11-04'),
('Stripe, Inc.', 'Finance', 'Senior Software Engineer', 'Green Card (PERM)', 203300, 213300, 'Year', 'Seattle', 'WA', 'G-100-24221-255410', '2026-01-13'),
('Morgan Stanley Smith Barney LLC', 'Finance', 'Vice President', 'Green Card (PERM)', 143820, 180000, 'Year', 'New York', 'NY', 'G-100-24236-288897', '2026-01-14'),

-- Engineering
('CDM Smith Inc.', 'Engineering', 'Environmental Engineer 5', 'H-1B', 121950, null, 'Year', 'Dallas', 'TX', 'I-200-25310-383535', '2025-11-14'),
('SmithGroup, Inc.', 'Engineering', 'Architect (non-licensed)', 'H-1B', 85000, null, 'Year', 'Washington', 'DC', 'I-200-25267-332016', '2025-10-01'),
('HDR Engineering, Inc.', 'Engineering', 'Transportation Engineer (Licensed)', 'Green Card (PERM)', 113568, 120290, 'Year', 'Bellevue', 'WA', 'G-100-24241-299852', '2026-01-05'),
('L&T Technology Services Limited', 'Engineering', 'Mechanical Design Engineer', 'Green Card (PERM)', 106575, null, 'Year', 'Edison', 'NJ', 'G-100-24226-264607', '2026-01-09'),

-- Healthcare
('Cleveland Clinic Foundation', 'Healthcare', 'Machine Learning Scientist II', 'H-1B', 180000, null, 'Year', 'Cleveland', 'OH', 'I-200-25267-331572', '2025-10-01'),
('Cleveland Clinic Florida', 'Healthcare', 'Transplant Surgeon', 'H-1B', 239200, 400000, 'Year', 'Weston', 'FL', 'I-200-25268-335856', '2025-11-04'),
('Allegheny Clinic', 'Healthcare', 'Hospitalist', 'Green Card (PERM)', 310000, null, 'Year', 'Wexford', 'PA', 'G-100-24228-269067', '2026-01-05'),
('Presbyterian Healthcare Services', 'Healthcare', 'Senior Systems Analyst', 'Green Card (PERM)', 98488, null, 'Year', 'Albuquerque', 'NM', 'G-100-24213-235322', '2026-01-05'),

-- Education / Research
('Cornell University', 'Education / Research', 'Assistant Professor', 'H-1B', 193502, null, 'Year', 'Ithaca', 'NY', 'I-200-25269-336736', '2025-11-05'),
('Columbia University', 'Education / Research', 'Associate Research Scientist', 'H-1B', 94111, null, 'Year', 'New York', 'NY', 'I-200-25272-342492', '2025-11-06'),
('Indiana University', 'Education / Research', 'Senior Lecturer', 'Green Card (PERM)', 103206, null, 'Year', 'Bloomington', 'IN', 'G-300-24242-303539', '2026-01-06'),
('University of Michigan', 'Education / Research', 'Counseling Psychologist', 'Green Card (PERM)', 70848, null, 'Year', 'Ann Arbor', 'MI', 'G-300-24215-241032', '2026-01-06'),

-- Consulting / IT Services
('Deloitte Consulting LLP', 'Consulting / IT Services', 'Specialist Master', 'H-1B', 153358, null, 'Year', 'Philadelphia', 'PA', 'I-200-25267-332227', '2025-10-01'),
('Accenture LLP', 'Consulting / IT Services', 'Delivery Lead Senior Manager', 'H-1B', 243100, null, 'Year', 'Warren', 'NJ', 'I-200-25267-330649', '2025-10-01'),
('PricewaterhouseCoopers LLP', 'Consulting / IT Services', 'Director, Financial Markets Real Estate', 'Green Card (PERM)', 232000, null, 'Year', 'New York', 'NY', 'G-100-23271-391104', '2025-12-16'),
('IQVIA Inc.', 'Consulting / IT Services', 'Product Manager', 'Green Card (PERM)', 125000, 166000, 'Year', 'Durham', 'NC', 'G-100-24243-305978', '2026-01-05'),

-- Hospitality
('Hilton Domestic Operating Company Inc.', 'Hospitality', 'Senior Manager, Quality Engineer SDET', 'H-1B', 149350, null, 'Year', 'Memphis', 'TN', 'I-200-25268-333695', '2025-11-04'),
('Darden Corporation', 'Hospitality', 'Sr. Systems Engineer, Technical Lead', 'H-1B', 171500, null, 'Year', 'Orlando', 'FL', 'I-200-25272-341639', '2025-11-06'),
('Eighty Third and First LLC', 'Hospitality', 'General Manager', 'Green Card (PERM)', 101130, null, 'Year', 'New York', 'NY', 'G-200-24240-297815', '2026-01-05');

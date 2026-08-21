-- Expands job_sponsor_records with more real, verified cases chosen specifically for job-title
-- keyword diversity (data scientist, product manager, product designer, nurse, professor,
-- quality engineer) — the original 31-row seed skewed toward "engineer" titles, which meant a
-- candidate's own job-type search rarely actually filtered anything, just reordered the same
-- fixed list. Same sourcing standard as the original seed: every row verified directly against
-- the FY2026 Q3 LCA/PERM disclosure files downloaded from dol.gov, CASE_STATUS = 'Certified' only.

insert into job_sponsor_records (employer_name, industry, job_title, visa_type, wage_from, wage_to, wage_period, city, state, case_number, decision_date) values

('Google LLC', 'Technology', 'Data Scientist', 'H-1B', 180000, null, 'Year', 'Mountain View', 'CA', 'I-200-25268-334966', '2025-11-04'),
('Google LLC', 'Technology', 'Group Product Manager', 'H-1B', 284000, null, 'Year', 'New York', 'NY', 'I-200-25267-332249', '2025-10-01'),
('Google LLC', 'Technology', 'Product Designer', 'H-1B', 178000, null, 'Year', 'Mountain View', 'CA', 'I-200-25268-335473', '2025-11-04'),
('Asana, Inc.', 'Technology', 'Product Designer', 'H-1B', 182000, 232000, 'Year', 'San Francisco', 'CA', 'I-200-25270-339708', '2025-11-05'),
('Intuit Inc.', 'Technology', 'Principal Product Manager', 'H-1B', 240370, 307500, 'Year', 'Mountain View', 'CA', 'I-200-25267-330398', '2025-10-01'),

('Trimble Inc.', 'Manufacturing', 'Quality Engineer', 'H-1B', 105678.4, null, 'Year', 'Dayton', 'OH', 'I-200-25267-332450', '2025-10-01'),
('Alkermes, Inc.', 'Manufacturing', 'Manager, Quality Systems', 'H-1B', 139000, 161000, 'Year', 'Waltham', 'MA', 'I-200-25268-335590', '2025-11-04'),

('Fitch Group Services, Inc.', 'Finance', 'Data Scientist', 'Green Card (PERM)', 176300, null, 'Year', 'New York', 'NY', 'G-100-24241-299162', '2026-01-05'),

('HDR Engineering, Inc.', 'Engineering', 'Transmission Line Project Manager', 'Green Card (PERM)', 140000, null, 'Year', 'Houston', 'TX', 'G-100-24226-263278', '2026-01-05'),

('Chase County Community Hospital', 'Healthcare', 'Registered Nurse (Medical/Surgical)', 'H-1B', 30.7, null, 'Hour', 'Imperial', 'NE', 'I-200-25268-335423', '2025-11-04'),

('Michigan State University', 'Education / Research', 'Assistant Professor', 'H-1B', 100000, null, 'Year', 'East Lansing', 'MI', 'I-200-25267-332087', '2025-10-01'),
('University of Washington', 'Education / Research', 'Acting Assistant Professor', 'H-1B', 361476, null, 'Year', 'Seattle', 'WA', 'I-200-25267-332993', '2025-10-01');

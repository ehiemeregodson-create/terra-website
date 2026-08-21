-- Adds a source citation to each policy alert, and seeds the table with real, current updates
-- from official U.S. government agencies (USCIS/DHS) so the dashboard's Policy Alerts widget
-- never has to show an empty state. Every row below was verified directly against the linked
-- government page before insertion — titles/bodies are Terra's own plain-language paraphrase,
-- not verbatim copies, but the facts and dates match the source.
--
-- category values match the exact option text from get-started.html's category select.
-- country_to is 'United States' on every row because USCIS/DHS only govern U.S. immigration —
-- see lib/dashboardHandlers.js for how a case with a different destination country is handled
-- (an honest "we don't cover this country yet" note, not fabricated foreign-agency content).

alter table policy_alerts add column if not exists source_url text;
alter table policy_alerts add column if not exists source_label text;

insert into policy_alerts (category, country_to, title, body, severity, source_url, source_label, published_at) values

('Employment / work visa', 'United States',
 'FY 2027 H-1B cap reached',
 'USCIS has received enough petitions to fill the H-1B regular cap (65,000) and the U.S. advanced-degree exemption (20,000) for fiscal year 2027. If your case depends on a new H-1B petition, it will need to wait for the next registration period.',
 'info',
 'https://www.uscis.gov/newsroom/alerts/uscis-reaches-fiscal-year-2027-h-1b-cap',
 'USCIS', '2026-07-17'),

('Study (student visa)', 'United States',
 'F-1 students move to a fixed admission period, not "duration of status"',
 'Starting Sept. 15, 2026, F-1 students will be admitted for a fixed period tied to their program length (up to 4 years) instead of an open-ended "duration of status." Extensions beyond that will require a formal application to USCIS. If you''re on an F-1 visa, review your program timeline now.',
 'action_needed',
 'https://studyinthestates.dhs.gov/2026/07/dhs-publishes-final-rule-establishing-a-fixed-time-period-of-admission-and-an-extension-of',
 'DHS / Study in the States', '2026-07-17'),

('Study (student visa)', 'United States',
 'New I-539 and I-765 editions required starting Sept. 15',
 'USCIS is issuing new editions of Form I-539 (extend/change nonimmigrant status) and Form I-765 (work authorization) tied to the new F-1 admission rule. Older editions will be rejected once submitted on or after Sept. 15, 2026 — make sure you''re using the current form if you''re filing around that date.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-to-publish-new-editions-of-form-i-539-and-form-i-765-older-editions-will-be-rejected-starting',
 'USCIS', '2026-08-14'),

('Asylum / refugee protection', 'United States',
 'USCIS can now refer asylum cases to immigration court without an interview first',
 'A new rule lets USCIS refer an affirmative asylum application directly to an immigration judge without first conducting an interview, aimed at reducing the asylum backlog. This can shorten the process, but also means you may not get an initial USCIS interview before your case goes to court.',
 'action_needed',
 'https://www.dhs.gov/news/2026/07/27/uscis-announces-rule-change-asylum-system-reduce-backlog',
 'DHS', '2026-07-27'),

('Permanent residency / settlement', 'United States',
 'New Form I-485 edition required starting Sept. 18',
 'USCIS will publish a revised edition of Form I-485 (Application to Register Permanent Residence or Adjust Status) dated 09/18/26. The current edition will be rejected once submitted on or after that date, so double-check you''re using the new version if you''re filing your green card application around then.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-to-publish-new-edition-of-form-i-485-older-editions-will-be-rejected-starting-sept-18',
 'USCIS', '2026-08-19'),

('Permanent residency / settlement', 'United States',
 'Updated "public charge" guidance takes effect Sept. 18',
 'USCIS has issued new guidance on how it decides whether a green card applicant is likely to become a "public charge." The updated rule takes effect Sept. 18, 2026, and applies to adjustment-of-status (green card) applications — worth understanding before you file if you''ve used, or plan to use, public benefits.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-issues-guidance-on-making-public-charge-inadmissibility-determination',
 'USCIS', '2026-08-18'),

('Family reunification', 'United States',
 'New Form I-485 edition required starting Sept. 18',
 'USCIS will publish a revised edition of Form I-485 (Application to Register Permanent Residence or Adjust Status) dated 09/18/26. The current edition will be rejected once submitted on or after that date, so double-check you''re using the new version if you''re filing a family-based green card application around then.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-to-publish-new-edition-of-form-i-485-older-editions-will-be-rejected-starting-sept-18',
 'USCIS', '2026-08-19'),

('Family reunification', 'United States',
 'Updated "public charge" guidance takes effect Sept. 18',
 'USCIS has issued new guidance on how it decides whether a green card applicant is likely to become a "public charge." The updated rule takes effect Sept. 18, 2026, and applies to family-based adjustment-of-status applications — worth understanding before you file if you''ve used, or plan to use, public benefits.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-issues-guidance-on-making-public-charge-inadmissibility-determination',
 'USCIS', '2026-08-18'),

(null, 'United States',
 'USCIS moving toward mandatory e-filing for immigration forms',
 'A new DHS rule allows USCIS to require online filing for any form that''s been available for e-filing for at least 180 days, with 60 days'' public notice before it becomes mandatory. If you''ve been filing on paper, it''s worth setting up your USCIS online account now.',
 'info',
 'https://www.uscis.gov/newsroom/alerts/uscis-to-require-electronic-filing-of-forms-strengthening-national-security',
 'USCIS', '2026-08-10'),

(null, 'United States',
 'USCIS can now deny incomplete applications without a chance to fix them',
 'USCIS has clarified that you must show you''re eligible and include all required evidence at the time you file. Missing key documents can now result in a denial instead of a request for more evidence — double-check your filing is complete before you submit.',
 'action_needed',
 'https://www.uscis.gov/newsroom/alerts/uscis-to-reduce-frivolous-immigration-benefits-requests-by-reinforcing-evidence-standards',
 'USCIS', '2026-08-05');

-- Renames get_started -> cases (metadata-only, no data loss, RLS carries over) and adds the
-- columns needed to support multiple cases per account (one row per applicant/family member).
alter table get_started rename to cases;

alter table cases add column if not exists case_name text;
alter table cases add column if not exists filing_for text not null default 'self';
alter table cases add column if not exists filing_for_detail text;
alter table cases add column if not exists updated_at timestamptz not null default now();

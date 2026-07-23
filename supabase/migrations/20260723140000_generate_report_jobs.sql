-- Generate-report jobs (2026-07-23, Carter): prose is decoupled from
-- enrichment. Enrich now only gathers + ranks facts; the narrative (prose)
-- is built by a kind='generate' job the user enqueues from the record page
-- AFTER reviewing suggested sources — so prose only ever reads approved
-- facts. The one-active-job-per-company index (20260722120000) already
-- spans both kinds, so an enrich and a generate can never run concurrently
-- for the same company.

alter table public.enrichment_jobs add column kind text not null default 'enrich'
  check (kind in ('enrich', 'generate'));

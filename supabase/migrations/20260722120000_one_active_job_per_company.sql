-- Codex adversarial review of the job lease (2026-07-22): the lease is per
-- job, and the web UI's "already queued?" check is check-then-insert — so two
-- processes could still claim two DIFFERENT queued jobs for the SAME company
-- and both pay for research. Enforce the invariant at the database instead:
-- at most one active (queued or running) enrichment job per company, across
-- every process and machine. The web UI's duplicate-enqueue race now loses
-- loudly (unique violation) instead of double-spending quietly.
create unique index if not exists enrichment_jobs_one_active_per_company
  on public.enrichment_jobs (company_id)
  where status in ('queued', 'running');

-- Consolidated migration for the 2026-07-17 PDF pivot + the job-lease fixes
-- Codex flagged as P1 on the on-demand runner. These are one migration on
-- purpose: four workstreams currently carry adapters written around this
-- schema's absence, and they all dissolve together.
--
-- Covers:
--   A. facts.section    — 8 legacy slugs -> 6 report slugs (BUILD.md §A)
--   B. facts.status     — suggested/approved/rejected -> included/removed (§E)
--   C. facts.stats      — per-topic structured stats (§C)
--   D. facts.importance — 0-10 rubric score, half of the ranking rule (§B)
--   E. jobs lease       — claimed_by + heartbeat_at (stops double-paid research)
--   F. jobs.queue_name  — test/prod isolation (stops paid runs during tests)
-- ============================================================================

begin;

-- ============ A. facts.section — 8 slugs -> 6 ============
-- Report sections are 7, but "Company Summary" is companies.tldr, not a fact
-- section, so facts carry 6. Mapping per BUILD.md §A:
--   money      -> financials
--   regulatory -> news          (Dad: FDA/reimbursement news surfaces as news)
--   segmentation / market_sizing -> dropped from the report
--
-- DECISION (flagged for review): legacy 'segmentation' and 'market_sizing' stay
-- ALLOWED by the constraint rather than being deleted or re-filed. Nothing is
-- ever deleted in this product — the History view (§E) shows every fact ever
-- found, and re-filing them under a surviving section would misattribute them.
-- The skill stops emitting them and the PDF has no home for them, so they
-- simply age out. Alternative if you'd rather they vanish entirely: delete the
-- rows here instead — but that breaks the "nothing is lost" guarantee.

alter table public.facts drop constraint if exists facts_section_check;

update public.facts set section = 'financials' where section = 'money';
update public.facts set section = 'news'       where section = 'regulatory';

alter table public.facts add constraint facts_section_check check (section in (
  -- current, emitted by the skill
  'leadership',
  'acquisitions_partnerships',
  'news',
  'financials',
  'growth_signals',
  'risk_flags',
  -- legacy, retained read-only for History; never emitted again
  'segmentation',
  'market_sizing'
));

-- ============ B. facts.status — auto-include by rule ============
-- §E: facts are included automatically (category + freshness window decide);
-- the only human action is the kebab menu's "Remove from report". So the
-- three-state suggested/approved/rejected collapses to two.
--   suggested -> included   (auto-included; there is no approval step now)
--   approved  -> included
--   rejected  -> removed    (excluded from PDF + Source, still in History)

alter table public.facts drop constraint if exists facts_status_check;
alter table public.facts alter column status drop default;

update public.facts set status = 'included' where status in ('suggested', 'approved');
update public.facts set status = 'removed'  where status = 'rejected';

alter table public.facts alter column status set default 'included';
alter table public.facts add constraint facts_status_check
  check (status in ('included', 'removed'));

-- ============ C. facts.stats — structured per-topic stats (§C) ============
-- Shape varies by section, so jsonb rather than a column per stat:
--   funding:      {lead_investors[], amount_raised, valuation, round, participants[], cumulative_raised}
--   acquisition:  {target, acquirer, deal_value, rationale}
--   partnership:  {partner, nature, rationale}
--   public_fin:   {quarter, revenue, yoy_growth_pct, headline_metric, guidance_note}
--   leadership:   {person, role, move_type, prior_company, first_90_days}
--   growth:       {open_roles, roles_by_function, change_vs_prior}
-- valuation is only ever set when an article states it outright — never derived.
alter table public.facts add column if not exists stats jsonb;

-- ============ D. facts.importance — ranking rubric (§B) ============
-- Rank = mean(recency_score, importance). Recency is derived from fact_date at
-- render time; importance is assigned during research from the fixed rubric:
--   9-10 acquisition/major funding/CEO change/layoffs/lawsuit
--   6-8  significant partnership, major launch, large contract win, exec hire
--   4-5  clinical/regulatory milestone, expansion, notable award
--   1-3  conference appearance, routine PR, minor personnel note
-- Nullable: existing rows predate the rubric and rank on recency alone.
alter table public.facts add column if not exists importance smallint
  check (importance is null or importance between 0 and 10);

-- Report queries read newest-first within a section.
create index if not exists facts_company_section_date_idx
  on public.facts (company_id, section, fact_date desc);

-- ============ E. enrichment_jobs — lease (Codex P1) ============
-- Problem: crash recovery inferred liveness from started_at age (~42 min at
-- default timeout). That is not proof in all interleavings — instances can run
-- different CLAUDE_TIMEOUT_MS, and a slow post-research DB write can push a
-- live job past the threshold, letting a second instance reclaim it and pay for
-- the same research twice. It also left a genuinely crashed job stuck for ~42
-- minutes, which violates the loud-failure requirement.
--
-- Fix: an explicit lease. The claimer stamps claimed_by, then renews
-- heartbeat_at (~every 30s) while working. Stale = heartbeat older than a few
-- intervals, so a crash is detected in seconds, not tens of minutes.
--
-- REQUIRED APP CHANGES (schema alone does not fix this):
--   1. Claim sets status/claimed_by/heartbeat_at atomically, conditional on
--      status = 'queued'.
--   2. Heartbeat updates guard on (id, status='running', claimed_by = me).
--   3. EVERY terminal write guards on claimed_by = me. Today they are only
--      .eq('id', job.id) — so a reclaimed worker can still overwrite the new
--      owner's result. That bug exists in main already, independent of this.
--   4. If a heartbeat renewal fails repeatedly or the row is no longer ours,
--      kill the local `claude` child and stop writing.
--   5. Compare against DB server time (now()), never the client clock.
alter table public.enrichment_jobs add column if not exists claimed_by text;
alter table public.enrichment_jobs add column if not exists heartbeat_at timestamptz;

-- Stale-lease sweep: running jobs whose heartbeat has gone quiet.
create index if not exists enrichment_jobs_heartbeat_idx
  on public.enrichment_jobs (heartbeat_at) where status = 'running';

-- ============ F. enrichment_jobs.queue_name — real-money guard (Codex P1) ============
-- With a launchd agent on a 60s tick, a test run inserting fixture jobs can be
-- claimed by the live runner using the REAL claude binary — real paid research,
-- triggered by running the test suite. Documentation is not a sufficient
-- boundary for a money-spending path.
--
-- Namespacing blocks it in BOTH directions: launchd runs RUNNER_QUEUE=prod and
-- cannot see fixtures; tests use RUNNER_QUEUE=test-<pid>-<ts> and cannot claim
-- production work.
--
-- REQUIRED APP CHANGE: every recovery, poll, and claim query must filter
-- queue_name = RUNNER_QUEUE. A missing filter silently re-opens the hazard, so
-- this deserves a test.
alter table public.enrichment_jobs add column if not exists queue_name text not null default 'prod';

-- Replace the queued index so the claim query stays index-only per queue.
drop index if exists public.enrichment_jobs_queued_idx;
create index if not exists enrichment_jobs_queue_pending_idx
  on public.enrichment_jobs (queue_name, created_at) where status = 'queued';

commit;

-- ============================================================================
-- Post-apply verification (run manually; expects zero surprises)
-- ============================================================================
-- select section, count(*) from public.facts group by 1 order by 1;
--   -> no 'money' or 'regulatory' rows remain
-- select status, count(*) from public.facts group by 1 order by 1;
--   -> only 'included' / 'removed'
-- select queue_name, status, count(*) from public.enrichment_jobs group by 1,2;
--   -> all existing rows 'prod'
--
-- ============================================================================
-- Code that must change alongside this migration (it WILL break main until done)
-- ============================================================================
-- ⚠️ web/app/(app)/companies/[id]/pdf/route.ts — SILENT BUG IF MISSED. It filters
--                           .neq("status", "rejected"). After this migration no
--                           row is ever 'rejected', so that filter matches
--                           everything and REMOVED FACTS START APPEARING IN THE
--                           PDF. Must become .neq("status", "removed").
--                           Nothing errors; the report just goes quietly wrong.
-- web/lib/pdf/report.ts   — delete DB_SECTION_TO_REPORT_SECTION entirely; read
--                           fact.section directly. Add acquisitions_partnerships.
-- web/app/(app)/companies/[id]/page.tsx — status 'rejected' -> 'removed'
--                           (History marks removed rows off this value; the
--                           Source/History split keys off the same string).
-- web/lib/supabase/database.types.ts — regenerate; FactSection changes.
-- web + tests             — approve/reject actions become remove-only (§E).
-- runner/index.mjs        — lease claim/heartbeat/owner-guarded terminal writes;
--                           queue_name filter on every recovery/poll/claim;
--                           drop the staleness-gate workaround it replaces.
-- company-preview/skill   — output schema section enum -> the 6 new slugs;
--                           emit stats + importance per the rubric.

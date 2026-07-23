-- Review gate (2026-07-23, Carter): report generation now depends on source
-- review. Facts from an enrichment arrive as "suggested sources"
-- (reviewed_at null); the PDF cannot be generated while any included fact is
-- unreviewed. Approve stamps reviewed_at; Deny removes the fact (and stamps).
-- Facts stay status='included' on insert so ranking/synthesis/dedup — which
-- all key off 'included' — are untouched; "suggested" is reviewed_at is null,
-- not a third status.
--
-- Enforced in web: pdf/route.ts returns 409 while any included fact has
-- reviewed_at null; the record page swaps the Download button/PDF pane for a
-- review prompt. The same dependency applies to the market-assessment deck
-- once its research pipeline exists (documented in market-assessment/).

alter table public.facts add column reviewed_at timestamptz;

-- Existing facts pre-date the gate: backfill as reviewed so no company's
-- report locks retroactively.
update public.facts set reviewed_at = now();

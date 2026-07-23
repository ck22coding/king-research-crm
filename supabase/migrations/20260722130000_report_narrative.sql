-- PDF redesign (Eric's 2026-07-22 feedback): report sections are synthesized
-- narrative paragraphs (each answering a fixed per-section question), not
-- per-article bullets. The runner's synthesis pass writes the narrative here
-- after each enrichment; the PDF renders it, falling back to plain fact
-- paragraphs when absent. Shape: { sections: { <slug>: [paragraph, ...] },
-- generated_at: iso-timestamp }.
alter table public.companies add column if not exists report_narrative jsonb;

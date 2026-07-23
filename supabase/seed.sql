-- Research CRM — seed data (BUILD.md Phase 1, cut over to the PDF pivot's
-- 6-section / included-removed schema by 20260720120000_pdf_pivot_and_job_leases).
-- Legacy segmentation/market_sizing rows are kept deliberately — they exercise
-- History's "(legacy)" cards. R1 RCM is left sparse to exercise the
-- "nothing found" state. All placeholder data — no real assessments yet.
-- Facts seed as 'included' (§E auto-include); the remove/restore UI flips
-- them at test time.

insert into public.companies (id, name, domain, newsroom_url, ownership, hq, status, tldr, updated_at) values
  ('c0000000-0000-4000-8000-000000000001', 'Waystar', 'waystar.com', 'https://www.waystar.com/newsroom/', 'Public — NASDAQ: WAY', 'Lehi, UT / Louisville, KY', 'ready',
   'Healthcare payments software company riding strong post-IPO momentum. Recent AI acquisition and expanding hospital contracts signal budget for adjacent tooling. Main watch item: integration workload from the Iodine deal.', '2026-07-12'),
  ('c0000000-0000-4000-8000-000000000002', 'R1 RCM', 'r1rcm.com', 'https://www.r1rcm.com/news/', 'Private — TowerBrook & CD&R (take-private 2024)', 'Murray, UT', 'in_progress',
   'Largest independent RCM services provider, now PE-owned and mid-restructuring. Cost pressure means new spend needs a hard ROI story; automation initiatives are the opening.', '2026-07-10'),
  ('c0000000-0000-4000-8000-000000000003', 'Availity', 'availity.com', null, 'Private — Novo Holdings majority (2021)', 'Jacksonville, FL', 'queued',
   'Largest real-time payer-provider network in the US; growing fast on the back of CMS prior-authorization mandates. Brief queued — sections below are partial.', '2026-07-08');

insert into public.facts (id, company_id, section, text, fact_date, status) values
  -- Waystar
  ('f0000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000001', 'news', 'Announced acquisition of Iodine Software to add clinical AI to its payments platform.', '2025-10-08', 'included'),
  ('f0000000-0000-4000-8000-000000000102', 'c0000000-0000-4000-8000-000000000001', 'news', 'Exhibited and presented at HIMSS26; demoed generative-AI denials workflow (AltitudeAI).', '2026-03-10', 'included'),
  ('f0000000-0000-4000-8000-000000000103', 'c0000000-0000-4000-8000-000000000001', 'news', 'Expanded partnership with a top-5 national health system for end-to-end claims management.', '2026-05-21', 'included'),
  ('f0000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000001', 'leadership', 'New Chief Product Officer hired from Epic — first 90 days (high-value contact window).', '2026-06-02', 'included'),
  ('f0000000-0000-4000-8000-000000000105', 'c0000000-0000-4000-8000-000000000001', 'financials', 'Q1 FY26 revenue $256M, +11% YoY; raised full-year guidance.', '2026-04-30', 'included'),
  ('f0000000-0000-4000-8000-000000000106', 'c0000000-0000-4000-8000-000000000001', 'financials', 'PE ownership (EQT/CPPIB) fully exited secondary offerings as of late 2025 — now widely held.', '2025-11-14', 'included'),
  ('f0000000-0000-4000-8000-000000000107', 'c0000000-0000-4000-8000-000000000001', 'growth_signals', '38 open roles in implementation & integration engineering — scaling delivery capacity.', '2026-07-01', 'included'),
  ('f0000000-0000-4000-8000-000000000108', 'c0000000-0000-4000-8000-000000000001', 'growth_signals', 'Won two new GPO contracts for claims tooling (per press coverage).', '2026-02-17', 'included'),
  ('f0000000-0000-4000-8000-000000000109', 'c0000000-0000-4000-8000-000000000001', 'risk_flags', 'Integration workload from Iodine acquisition may slow new-vendor onboarding decisions through H2 2026.', '2026-01-15', 'included'),
  ('f0000000-0000-4000-8000-00000000010a', 'c0000000-0000-4000-8000-000000000001', 'news', 'No direct FDA exposure (software, not a device). CMS prior-auth final rule (CMS-0057-F) reshapes the denials workflows Waystar sells into from 2027.', '2026-02-01', 'included'),
  ('f0000000-0000-4000-8000-00000000010b', 'c0000000-0000-4000-8000-000000000001', 'segmentation', 'Business is provider-side claims & payments software; hospitals and health systems are the dominant end user over physician groups.', '2026-04-30', 'included'),
  ('f0000000-0000-4000-8000-00000000010c', 'c0000000-0000-4000-8000-000000000001', 'market_sizing', 'SAM (labeled estimate): US provider RCM software slice of Grand View''s $147.5B global RCM market (2024) — method: TAM × US software share.', '2026-01-20', 'included'),
  -- R1 RCM (new sections left empty — "nothing found" is a valid result)
  ('f0000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000002', 'news', 'Completed $8.9B take-private by TowerBrook and CD&R; delisted from NASDAQ.', '2024-11-19', 'included'),
  ('f0000000-0000-4000-8000-000000000202', 'c0000000-0000-4000-8000-000000000002', 'news', 'Announced multi-year automation program to shift manual A/R follow-up to AI agents.', '2026-04-08', 'included'),
  ('f0000000-0000-4000-8000-000000000203', 'c0000000-0000-4000-8000-000000000002', 'leadership', 'New CFO appointed by PE sponsors — cost-discipline mandate reported.', '2025-08-20', 'included'),
  ('f0000000-0000-4000-8000-000000000204', 'c0000000-0000-4000-8000-000000000002', 'financials', 'Private since Nov 2024 — no public earnings. Third-party estimates put 2025 revenue near $2.6B (labeled estimate, not company-reported).', '2026-01-30', 'included'),
  ('f0000000-0000-4000-8000-000000000205', 'c0000000-0000-4000-8000-000000000002', 'growth_signals', 'Job postings shifted toward automation engineering and offshore delivery leads.', '2026-06-15', 'included'),
  ('f0000000-0000-4000-8000-000000000206', 'c0000000-0000-4000-8000-000000000002', 'risk_flags', 'Headcount down ~3% over 12 months; restructuring under PE ownership ongoing.', '2026-05-01', 'included'),
  ('f0000000-0000-4000-8000-000000000207', 'c0000000-0000-4000-8000-000000000002', 'risk_flags', 'Glassdoor rating trending down over the past year (~3.2) — employee sentiment soft.', '2026-06-20', 'included'),
  -- Availity (queued — partial brief)
  ('f0000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000003', 'news', 'Positioned as a leading intermediary for CMS-0057-F prior-auth API compliance; announced payer implementations ahead of the 2027 deadline.', '2026-03-25', 'included'),
  ('f0000000-0000-4000-8000-000000000302', 'c0000000-0000-4000-8000-000000000003', 'financials', 'Private; no public filings. Novo Holdings remains majority owner (labeled: ownership per 2021 announcement, unchanged in public record).', '2026-01-10', 'included'),
  ('f0000000-0000-4000-8000-000000000303', 'c0000000-0000-4000-8000-000000000003', 'growth_signals', 'Headcount up ~11% in 12 months; hiring across payer integration teams.', '2026-06-30', 'included'),
  ('f0000000-0000-4000-8000-000000000304', 'c0000000-0000-4000-8000-000000000003', 'news', 'CMS-0057-F requires payer prior-auth APIs by Jan 2027 — the compliance deadline driving the payer implementations Availity intermediates.', '2026-03-25', 'included');

-- Seeded facts count as already-reviewed (mirrors 20260723130000's backfill) —
-- reviewed_at null would gate every company's PDF behind the review flow.
update public.facts set reviewed_at = now();

insert into public.sources (fact_id, publisher, title, url, year) values
  -- Waystar
  ('f0000000-0000-4000-8000-000000000101', 'Waystar Newsroom', 'Waystar to acquire Iodine Software', 'https://www.waystar.com/newsroom/', 2025),
  ('f0000000-0000-4000-8000-000000000102', 'HIMSS', 'HIMSS26 exhibitor list', 'https://www.himss.org/', 2026),
  ('f0000000-0000-4000-8000-000000000103', 'Business Wire', 'Waystar expands health system partnership', 'https://www.businesswire.com/', 2026),
  ('f0000000-0000-4000-8000-000000000104', 'LinkedIn', 'Executive announcement', 'https://www.linkedin.com/company/waystar/', 2026),
  ('f0000000-0000-4000-8000-000000000105', 'Waystar IR', 'Q1 2026 earnings release', 'https://investors.waystar.com/', 2026),
  ('f0000000-0000-4000-8000-000000000106', 'Wikipedia', 'Waystar (company)', 'https://en.wikipedia.org/wiki/Waystar', 2025),
  ('f0000000-0000-4000-8000-000000000107', 'Waystar Careers', 'Open positions', 'https://www.waystar.com/about-us/careers/', 2026),
  ('f0000000-0000-4000-8000-000000000108', 'Fierce Healthcare', 'GPO contract coverage', 'https://www.fiercehealthcare.com/', 2026),
  ('f0000000-0000-4000-8000-000000000109', 'Waystar Newsroom', 'Acquisition close announcement', 'https://www.waystar.com/newsroom/', 2026),
  ('f0000000-0000-4000-8000-00000000010a', 'CMS', 'Interoperability and prior authorization final rule (CMS-0057-F)', 'https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f', 2024),
  ('f0000000-0000-4000-8000-00000000010b', 'Waystar IR', 'Q1 2026 earnings release', 'https://investors.waystar.com/', 2026),
  ('f0000000-0000-4000-8000-00000000010c', 'Grand View Research', 'Global RCM market sizing', 'https://www.grandviewresearch.com/industry-analysis/revenue-cycle-management-rcm-market', 2024),
  -- R1 RCM
  ('f0000000-0000-4000-8000-000000000201', 'Wikipedia', 'R1 RCM', 'https://en.wikipedia.org/wiki/R1_RCM', 2024),
  ('f0000000-0000-4000-8000-000000000202', 'R1 Newsroom', 'Automation program announcement', 'https://www.r1rcm.com/news/', 2026),
  ('f0000000-0000-4000-8000-000000000203', 'Modern Healthcare', 'R1 leadership coverage', 'https://www.modernhealthcare.com/', 2025),
  ('f0000000-0000-4000-8000-000000000204', 'PitchBook', 'R1 RCM company profile', 'https://pitchbook.com/', 2026),
  ('f0000000-0000-4000-8000-000000000205', 'LinkedIn Jobs', 'R1 RCM openings', 'https://www.linkedin.com/company/r1rcm/jobs/', 2026),
  ('f0000000-0000-4000-8000-000000000206', 'LinkedIn Insights', 'Headcount trend', 'https://www.linkedin.com/company/r1rcm/', 2026),
  ('f0000000-0000-4000-8000-000000000207', 'Glassdoor', 'R1 RCM reviews', 'https://www.glassdoor.com/', 2026),
  -- Availity
  ('f0000000-0000-4000-8000-000000000301', 'Availity Newsroom', 'Prior-auth compliance announcements', 'https://www.availity.com/', 2026),
  ('f0000000-0000-4000-8000-000000000302', 'Wikipedia', 'Availity', 'https://en.wikipedia.org/wiki/Availity', 2026),
  ('f0000000-0000-4000-8000-000000000303', 'LinkedIn Insights', 'Availity headcount', 'https://www.linkedin.com/company/availity/', 2026),
  ('f0000000-0000-4000-8000-000000000304', 'CMS', 'CMS-0057-F fact sheet', 'https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f', 2024);

// Copied verbatim from crm-ui/data.js's `markets` array, typed. BUILD.md:
// markets are not in Supabase in v1 — this data stays app-side only.
import type { CompanyStatus } from "./supabase/database.types";

export type MarketSource = { publisher: string; url: string; title?: string; year?: number };
export type MarketFact = { text: string; date?: string; sources: MarketSource[] };
export type TamEstimate = { value_usd_b: number; year: number; publisher: string; url: string; title: string };
export type SamEstimate = { value_usd_b: number; basis: string; publisher: string; url: string; year: number };
export type Cagr = { rate: number; window: string; publisher: string; url: string };
export type SegmentationDim = {
  dimension: string;
  source: { publisher: string; url: string; year: number };
  segments: { label: string; share: number }[];
};
export type Players = { leaders: string[]; challengers: string[]; entrants: string[] };
export type Dynamics = {
  maturity: "emerging" | "growth" | "mature" | "consolidating";
  pricing: string[];
  adoption: { text: string; source: { publisher: string; url: string; year: number } };
};

export type Market = {
  id: string;
  name: string;
  tags: string[];
  status: CompanyStatus;
  updated_at: string;
  definition: { includes: string; excludes: string };
  tam_estimates: TamEstimate[];
  sam: SamEstimate | null;
  cagr: Cagr;
  drivers: MarketFact[];
  restraints: MarketFact[];
  segmentation: SegmentationDim[];
  players: Players;
  deals: MarketFact[];
  dynamics: Dynamics;
  regulatory: MarketFact[];
  coverage_note: string | null;
};

export const markets: Market[] = [
  {
    id: "denials-management",
    name: "Denials Management",
    tags: ["RCM", "Payer–Provider"],
    status: "ready",
    updated_at: "2026-07-11",
    definition: {
      includes:
        "Software and services for preventing, working, and appealing denied claims — denial analytics, appeal automation, root-cause prevention. A sub-market of revenue cycle management.",
      excludes: "Full RCM outsourcing, eligibility verification, and prior authorization (covered as separate sub-markets).",
    },
    tam_estimates: [
      { value_usd_b: 4.6, year: 2024, publisher: "Grand View Research", url: "https://www.grandviewresearch.com/industry-analysis/revenue-cycle-management-rcm-market", title: "US denials management market sizing" },
      { value_usd_b: 5.0, year: 2024, publisher: "MarketsandMarkets", url: "https://www.marketsandmarkets.com/", title: "Denials management market report" },
      { value_usd_b: 3.6, year: 2022, publisher: "Fortune Business Insights", url: "https://www.fortunebusinessinsights.com/", title: "Claims denial market study" },
    ],
    sam: { value_usd_b: 1.3, basis: "US acute-care hospitals >200 beds (demo viewpoint)", publisher: "Definitive Healthcare", url: "https://www.definitivehc.com/", year: 2025 },
    cagr: { rate: 11.6, window: "2024–2030", publisher: "Grand View Research", url: "https://www.grandviewresearch.com/industry-analysis/revenue-cycle-management-rcm-market" },
    drivers: [
      { text: "Initial denial rates climbing past 11% of claims, driven by payer AI review.", sources: [{ publisher: "HFMA", title: "Denials benchmarking", url: "https://www.hfma.org/", year: 2025 }] },
      { text: "Hospital margin pressure making denied-dollar recovery a board-level topic.", sources: [{ publisher: "Kaufman Hall", title: "National hospital flash report", url: "https://www.kaufmanhall.com/", year: 2025 }] },
    ],
    restraints: [
      { text: "Health systems consolidating point solutions into platform vendors — standalone tools getting squeezed.", sources: [{ publisher: "KLAS Research", title: "RCM point solutions report", url: "https://klasresearch.com/", year: 2025 }] },
    ],
    segmentation: [
      { dimension: "By delivery model", source: { publisher: "Grand View Research", url: "https://www.grandviewresearch.com/", year: 2024 },
        segments: [{ label: "Software", share: 46 }, { label: "Outsourced services", share: 38 }, { label: "In-house tooling", share: 16 }] },
      { dimension: "By end user", source: { publisher: "MarketsandMarkets", url: "https://www.marketsandmarkets.com/", year: 2024 },
        segments: [{ label: "Hospitals", share: 52 }, { label: "Physician groups", share: 27 }, { label: "Payers", share: 13 }, { label: "Other", share: 8 }] },
    ],
    players: {
      leaders: ["Waystar", "FinThrive", "Experian Health"],
      challengers: ["AKASA", "MDaudit", "Availity"],
      entrants: ["Anomaly", "Adonis"],
    },
    deals: [
      { text: "Waystar acquired Iodine Software — clinical AI for denial prevention.", date: "2025-10-08", sources: [{ publisher: "Waystar Newsroom", title: "Acquisition announcement", url: "https://www.waystar.com/newsroom/", year: 2025 }] },
      { text: "Adonis raised Series B for AI denials automation.", date: "2024-06-12", sources: [{ publisher: "Fierce Healthcare", title: "Funding coverage", url: "https://www.fiercehealthcare.com/", year: 2024 }] },
    ],
    dynamics: {
      maturity: "growth",
      pricing: ["% of recovered dollars (contingency)", "Per-claim transaction fees", "SaaS subscription by facility size"],
      adoption: { text: "~60% of hospitals report using dedicated denials tooling or services (survey).", source: { publisher: "HFMA", url: "https://www.hfma.org/", year: 2025 } },
    },
    regulatory: [
      { text: "CMS prior-auth final rule (CMS-0057-F) expected to reduce some denial categories from 2027 — shifts value toward prevention analytics.", sources: [{ publisher: "CMS", title: "Interoperability and prior authorization final rule", url: "https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f", year: 2024 }] },
    ],
    coverage_note: null,
  },
  {
    id: "prior-authorization",
    name: "Prior Authorization Technology",
    tags: ["Payer–Provider", "Interoperability"],
    status: "in_progress",
    updated_at: "2026-07-09",
    definition: {
      includes: "Electronic prior authorization (ePA) platforms, payer-side decisioning, provider-side submission tooling, and clearinghouse intermediaries.",
      excludes: "Broader utilization management consulting; pharmacy ePA embedded in e-prescribing suites.",
    },
    tam_estimates: [
      { value_usd_b: 1.4, year: 2024, publisher: "Grand View Research", url: "https://www.grandviewresearch.com/", title: "ePA market sizing" },
      { value_usd_b: 1.1, year: 2022, publisher: "Verified Market Research", url: "https://www.verifiedmarketresearch.com/", title: "Prior authorization market" },
    ],
    sam: null,
    cagr: { rate: 14.2, window: "2024–2030", publisher: "Grand View Research", url: "https://www.grandviewresearch.com/" },
    drivers: [
      { text: "CMS-0057-F mandates payer prior-auth APIs by Jan 2027 — forced buying cycle for ~300 affected payers.", sources: [{ publisher: "CMS", title: "CMS-0057-F fact sheet", url: "https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f", year: 2024 }] },
      { text: "State-level gold-carding laws expanding, adding rules engines to payer roadmaps.", sources: [{ publisher: "AMA", title: "Prior authorization state law tracker", url: "https://www.ama-assn.org/", year: 2025 }] },
    ],
    restraints: [
      { text: "Provider skepticism after decades of manual processes; adoption lags mandate timelines.", sources: [{ publisher: "KFF", title: "Prior authorization research", url: "https://www.kff.org/", year: 2025 }] },
    ],
    segmentation: [
      { dimension: "By buyer side", source: { publisher: "Grand View Research", url: "https://www.grandviewresearch.com/", year: 2024 },
        segments: [{ label: "Payer platforms", share: 44 }, { label: "Provider tooling", share: 33 }, { label: "Intermediaries", share: 23 }] },
    ],
    players: {
      leaders: ["Availity", "Cohere Health", "Epic (Payer Platform)"],
      challengers: ["Rhyme", "Itiliti Health"],
      entrants: ["Develop Health"],
    },
    deals: [
      { text: "Cohere Health raised $90M growth round to expand payer decisioning.", date: "2025-02-20", sources: [{ publisher: "Fierce Healthcare", title: "Funding coverage", url: "https://www.fiercehealthcare.com/", year: 2025 }] },
    ],
    dynamics: {
      maturity: "emerging",
      pricing: ["Per-transaction fees", "PMPM (per member per month) for payer platforms", "Enterprise SaaS license"],
      adoption: { text: "Fully electronic prior auth still under 40% of transactions (index).", source: { publisher: "CAQH", url: "https://www.caqh.org/", year: 2025 } },
    },
    regulatory: [
      { text: "CMS-0057-F: payer APIs live Jan 2027; decision windows tighten to 72h expedited / 7d standard.", sources: [{ publisher: "CMS", title: "Final rule fact sheet", url: "https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-and-prior-authorization-final-rule-cms-0057-f", year: 2024 }] },
      { text: "Interoperability penalties fold prior-auth metrics into payer star ratings (pending guidance).", sources: [{ publisher: "CMS Newsroom", title: "Pending guidance", url: "https://www.cms.gov/newsroom", year: 2026 }] },
    ],
    coverage_note: "Market share figures have limited free coverage — no reliable public split by vendor.",
  },
  {
    id: "revenue-cycle-management",
    name: "Revenue Cycle Management",
    tags: ["RCM"],
    status: "ready",
    updated_at: "2026-07-05",
    definition: {
      includes: "End-to-end RCM: patient access, coding, claims, payments, denials, and full outsourcing. Parent market of denials management and adjacent sub-markets.",
      excludes: "Core EHR platforms (tracked separately even where vendors bundle RCM modules).",
    },
    tam_estimates: [
      { value_usd_b: 147.5, year: 2024, publisher: "Grand View Research", url: "https://www.grandviewresearch.com/industry-analysis/revenue-cycle-management-rcm-market", title: "Global RCM market" },
      { value_usd_b: 135.9, year: 2023, publisher: "MarketsandMarkets", url: "https://www.marketsandmarkets.com/", title: "RCM market global forecast" },
      { value_usd_b: 114.6, year: 2021, publisher: "Fortune Business Insights", url: "https://www.fortunebusinessinsights.com/", title: "RCM market analysis" },
    ],
    sam: null,
    cagr: { rate: 10.2, window: "2024–2030", publisher: "Grand View Research", url: "https://www.grandviewresearch.com/industry-analysis/revenue-cycle-management-rcm-market" },
    drivers: [
      { text: "Labor shortage in billing/coding pushing systems toward outsourcing and automation.", sources: [{ publisher: "AHA", title: "Workforce reports", url: "https://www.aha.org/", year: 2025 }] },
      { text: "Payer-provider friction (denials, prior auth) raising the cost of getting paid.", sources: [{ publisher: "HFMA", title: "Cost-to-collect benchmarks", url: "https://www.hfma.org/", year: 2025 }] },
    ],
    restraints: [
      { text: "Health system M&A pauses vendor decisions during integrations.", sources: [{ publisher: "Kaufman Hall", title: "M&A quarterly report", url: "https://www.kaufmanhall.com/", year: 2025 }] },
    ],
    segmentation: [
      { dimension: "By product/service", source: { publisher: "Grand View Research", url: "https://www.grandviewresearch.com/", year: 2024 },
        segments: [{ label: "Integrated suites", share: 40 }, { label: "Standalone software", share: 25 }, { label: "Outsourced services", share: 35 }] },
      { dimension: "By end user", source: { publisher: "MarketsandMarkets", url: "https://www.marketsandmarkets.com/", year: 2023 },
        segments: [{ label: "Hospitals", share: 54 }, { label: "Physician practices", share: 28 }, { label: "Ambulatory & diagnostics", share: 18 }] },
    ],
    players: {
      leaders: ["Optum", "R1 RCM", "Ensemble Health Partners"],
      challengers: ["Waystar", "FinThrive", "AGS Health"],
      entrants: ["CodaMetrix", "Candid Health"],
    },
    deals: [
      { text: "R1 RCM taken private by TowerBrook & CD&R ($8.9B).", date: "2024-11-19", sources: [{ publisher: "Wikipedia", title: "R1 RCM", url: "https://en.wikipedia.org/wiki/R1_RCM", year: 2024 }] },
    ],
    dynamics: {
      maturity: "consolidating",
      pricing: ["% of collections (full outsourcing)", "SaaS license + modules", "Per-encounter fees"],
      adoption: { text: "~40% of hospitals outsource some or all of RCM (survey).", source: { publisher: "HFMA", url: "https://www.hfma.org/", year: 2024 } },
    },
    regulatory: [
      { text: "Price transparency enforcement increasing documentation burden on billing teams.", sources: [{ publisher: "CMS Newsroom", title: "Hospital price transparency", url: "https://www.cms.gov/newsroom", year: 2025 }] },
    ],
    coverage_note: null,
  },
];

// Ported 1:1 from crm-ui/index.html's primaryTam(): highest year, then
// highest value as the tie-break.
export function primaryTam(m: Market): TamEstimate {
  return [...m.tam_estimates].sort((a, b) => b.year - a.year || b.value_usd_b - a.value_usd_b)[0];
}

// Ported 1:1 from crm-ui/index.html's collectSources().
export function collectSources(m: Market): MarketSource[] {
  const out: MarketSource[] = [];
  const seen = new Set<string>();
  const push = (s: MarketSource | null | undefined) => {
    if (s && s.url && !seen.has(s.url + (s.title || ""))) {
      seen.add(s.url + (s.title || ""));
      out.push(s);
    }
  };
  m.tam_estimates.forEach(push);
  push(m.sam);
  push({ publisher: m.cagr.publisher, url: m.cagr.url, title: "Growth rate (CAGR)" });
  [...m.drivers, ...m.restraints, ...m.deals, ...m.regulatory].forEach((it) => (it.sources || []).forEach(push));
  m.segmentation.forEach((d) => push({ ...d.source, title: d.dimension }));
  push(m.dynamics.adoption.source);
  return out;
}

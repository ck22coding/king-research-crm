// Report section config — order/titles/caps in one array so layout changes
// don't touch the renderer. See BUILD.md "PDF pivot" §A for the spec.
//
// facts.section carries these slugs directly since the
// 20260720120000_pdf_pivot_and_job_leases migration; legacy slugs
// (segmentation/market_sizing) have no report home and are skipped.

import { fmtDate } from "@/lib/format";
import type { FactSection } from "@/lib/supabase/database.types";
import type { PdfDoc } from "./pdf-writer";

export type ReportSectionSlug =
  | "company_summary"
  | "leadership"
  | "acquisitions_partnerships"
  | "news"
  | "financials"
  | "growth_signals"
  | "risk_flags";

// windowMonths is a HARD recency gate (per Eric, 2026-07-22): a fact renders
// in the PDF only if its fact_date falls inside its section's window. Facts
// with no date can't prove freshness and are excluded here (still visible in
// Source/History). financials is 12 because "most recent quarter / most
// recent round" stays the current picture until superseded — the skill
// already enforces the tighter semantic at research time. Keep this table in
// sync with SECTION_WINDOWS_MONTHS in runner/index.mjs (the ranking pass).
export const REPORT_SECTIONS: { slug: ReportSectionSlug; title: string; maxItems: number; windowMonths: number | null }[] = [
  { slug: "company_summary", title: "Company Summary", maxItems: 1, windowMonths: null },
  { slug: "leadership", title: "Leadership & People", maxItems: 4, windowMonths: 6 },
  { slug: "acquisitions_partnerships", title: "Acquisitions & Partnerships", maxItems: 4, windowMonths: 12 },
  { slug: "news", title: "News & Announcements", maxItems: 5, windowMonths: 6 },
  { slug: "financials", title: "Financials", maxItems: 4, windowMonths: 12 },
  { slug: "growth_signals", title: "Growth Signals", maxItems: 3, windowMonths: 3 },
  { slug: "risk_flags", title: "Risk Flags", maxItems: 3, windowMonths: 6 },
];

// The 6 fact-bearing report slugs (company_summary is companies.tldr).
const FACT_SECTION_SLUGS = new Set<string>(
  REPORT_SECTIONS.map((s) => s.slug).filter((s) => s !== "company_summary"),
);

export type ReportFact = {
  text: string;
  fact_date: string | null;
  sources: { publisher: string }[];
};

export type FactForReport = {
  section: FactSection;
  text: string;
  fact_date: string | null;
  importance: number | null;
  sources: { publisher: string }[];
};

// Per section: hard window gate on fact_date, then the Sonnet ranking order
// (importance DESC — the runner's ranking pass writes it after each enrich;
// unranked/legacy facts sink), date DESC as the tiebreak, capped to maxItems.
export function mapFactsToReportSections(facts: FactForReport[]): Record<ReportSectionSlug, ReportFact[]> {
  const bySlug: Partial<Record<ReportSectionSlug, FactForReport[]>> = {};
  for (const fact of facts) {
    if (!FACT_SECTION_SLUGS.has(fact.section)) continue; // legacy slug — no PDF home, don't crash
    (bySlug[fact.section as ReportSectionSlug] ??= []).push(fact);
  }
  const now = new Date();
  const result = {} as Record<ReportSectionSlug, ReportFact[]>;
  for (const section of REPORT_SECTIONS) {
    let pool = bySlug[section.slug] ?? [];
    if (section.windowMonths !== null) {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - section.windowMonths);
      const cutoffIso = cutoff.toISOString().slice(0, 10);
      pool = pool.filter((f) => f.fact_date !== null && f.fact_date >= cutoffIso);
    }
    result[section.slug] = pool
      .sort(
        (a, b) =>
          (b.importance ?? -1) - (a.importance ?? -1) ||
          (b.fact_date ?? "").localeCompare(a.fact_date ?? ""),
      )
      .slice(0, section.maxItems)
      .map((f) => ({ text: f.text, fact_date: f.fact_date, sources: f.sources }));
  }
  return result;
}

export type ReportData = {
  companyName: string;
  descriptor: string;
  tldr: string | null;
  sectionsData: Record<ReportSectionSlug, ReportFact[]>;
  // Synthesized narrative paragraphs per section (runner's synthesis pass;
  // companies.report_narrative.sections). Null/missing section = fall back
  // to rendering that section's fact texts as plain paragraphs.
  narrative?: Partial<Record<ReportSectionSlug, string[]>> | null;
};

export function renderCompanyReport(doc: PdfDoc, data: ReportData) {
  doc.text(data.companyName, { font: "Helvetica-Bold", size: 20 });
  if (data.descriptor) doc.text(data.descriptor, { size: 10 });
  doc.text(`Reflects activity through ${fmtDate(new Date().toISOString())}`, { size: 8 });
  doc.spacer(10);

  for (const section of REPORT_SECTIONS) {
    // Empty topic = no section at all (per Eric, 2026-07-22): a heading with
    // "Nothing found" wastes the reader's attention — leave the whole
    // section out. company_summary is exempt (always renders, from tldr).
    const items = data.sectionsData[section.slug] ?? [];
    if (section.slug !== "company_summary" && !items.length) continue;

    // Skip headings that would have nothing (that fits) beneath them.
    const headingOpts = { font: "Helvetica-Bold" as const, size: 12 };
    if (!doc.fitsWithContent(section.title, headingOpts)) continue;
    doc.text(section.title, headingOpts);

    if (section.slug === "company_summary") {
      doc.text(data.tldr || "No summary yet — enrich this company to generate one.", { size: 9 });
      doc.spacer(8);
      continue;
    }

    // Per Eric (2026-07-22): sections are plain prose paragraphs with a
    // blank line between them — never bullets/dashes. Preferred content is
    // the synthesized narrative (each paragraph answers a fixed question);
    // sections the narrative doesn't cover (older narrative, refiled facts,
    // synthesis failure) fall back to the facts themselves as paragraphs.
    // Stale-narrative guard (codex review): narrative only renders while
    // current in-window facts exist for the section — items comes through
    // the same window/status filter the synthesis input used, so zero items
    // means removed/aged-out facts and old prose must NOT outlive its data.
    const paragraphs = items.length
      ? (data.narrative?.[section.slug]?.filter((p) => typeof p === "string" && p.trim().length) ?? [])
      : [];
    let wroteNarrative = 0;
    for (const para of paragraphs) {
      // oversized skips just this paragraph; exhausted stops the section.
      const verdict = doc.fitVerdict(para, { size: 9 });
      if (verdict === "oversized") continue;
      if (verdict === "exhausted") break;
      doc.text(para, { size: 9 });
      doc.spacer(6);
      wroteNarrative += 1;
    }
    if (wroteNarrative === 0) {
      // No narrative for this section, or every paragraph was individually
      // oversized (codex review) — the facts themselves are the fallback.
      for (const item of items) {
        const date = item.fact_date ? ` (${fmtDate(item.fact_date)})` : "";
        const line = `${item.text}${date}`;
        // oversized skips just this item (older ones may still fit);
        // exhausted stops the section (BUILD.md §B: drop lowest-ranked first).
        const verdict = doc.fitVerdict(line, { size: 9 });
        if (verdict === "oversized") continue;
        if (verdict === "exhausted") break;
        doc.text(line, { size: 9 });
        doc.spacer(6);
      }
    }
    doc.spacer(4);
  }

  const publishers = [
    ...new Set(
      Object.values(data.sectionsData)
        .flat()
        .flatMap((f) => f.sources.map((s) => s.publisher)),
    ),
  ];
  if (publishers.length) {
    doc.text(`Sources: ${publishers.join(", ")}`, { size: 8 });
  }
}

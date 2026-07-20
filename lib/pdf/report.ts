// Report section config — order/titles/caps in one array so layout changes
// don't touch the renderer. See BUILD.md "PDF pivot" §A for the spec.
//
// `facts.section` in the DB is still the old 8-slug schema; the mapping
// below bridges it to the 7 report sections until that migration lands.

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

export const REPORT_SECTIONS: { slug: ReportSectionSlug; title: string; maxItems: number }[] = [
  { slug: "company_summary", title: "Company Summary", maxItems: 1 },
  { slug: "leadership", title: "Leadership & People", maxItems: 4 },
  { slug: "acquisitions_partnerships", title: "Acquisitions & Partnerships", maxItems: 4 },
  { slug: "news", title: "News & Announcements", maxItems: 5 },
  { slug: "financials", title: "Financials", maxItems: 4 },
  { slug: "growth_signals", title: "Growth Signals", maxItems: 3 },
  { slug: "risk_flags", title: "Risk Flags", maxItems: 3 },
];

// `regulatory` folds into News; `segmentation`/`market_sizing` have no
// entry — dropped from the PDF (still shown in the Source view).
export const DB_SECTION_TO_REPORT_SECTION: Partial<Record<FactSection, ReportSectionSlug>> = {
  leadership: "leadership",
  news: "news",
  regulatory: "news",
  money: "financials",
  growth_signals: "growth_signals",
  risk_flags: "risk_flags",
};

export type ReportFact = {
  text: string;
  fact_date: string | null;
  sources: { publisher: string }[];
};

export type FactForReport = {
  section: FactSection;
  text: string;
  fact_date: string | null;
  sources: { publisher: string }[];
};

// Newest-first, nulls last, capped to each section's maxItems.
export function mapFactsToReportSections(facts: FactForReport[]): Record<ReportSectionSlug, ReportFact[]> {
  const bySlug: Partial<Record<ReportSectionSlug, ReportFact[]>> = {};
  for (const fact of facts) {
    const target = DB_SECTION_TO_REPORT_SECTION[fact.section];
    if (!target) continue; // no PDF home for this slug — map what exists, don't crash
    (bySlug[target] ??= []).push({ text: fact.text, fact_date: fact.fact_date, sources: fact.sources });
  }
  const result = {} as Record<ReportSectionSlug, ReportFact[]>;
  for (const section of REPORT_SECTIONS) {
    result[section.slug] = (bySlug[section.slug] ?? [])
      .sort((a, b) => (b.fact_date ?? "").localeCompare(a.fact_date ?? ""))
      .slice(0, section.maxItems);
  }
  return result;
}

export type ReportData = {
  companyName: string;
  descriptor: string;
  tldr: string | null;
  sectionsData: Record<ReportSectionSlug, ReportFact[]>;
};

export function renderCompanyReport(doc: PdfDoc, data: ReportData) {
  doc.text(data.companyName, { font: "Helvetica-Bold", size: 20 });
  if (data.descriptor) doc.text(data.descriptor, { size: 10 });
  doc.text(`Reflects activity through ${fmtDate(new Date().toISOString())}`, { size: 8 });
  doc.spacer(10);

  for (const section of REPORT_SECTIONS) {
    // Skip headings that would have nothing (that fits) beneath them.
    const headingOpts = { font: "Helvetica-Bold" as const, size: 12 };
    if (!doc.fitsWithContent(section.title, headingOpts)) continue;
    doc.text(section.title, headingOpts);

    if (section.slug === "company_summary") {
      doc.text(data.tldr || "No summary yet — enrich this company to generate one.", { size: 9 });
      doc.spacer(8);
      continue;
    }

    const items = data.sectionsData[section.slug] ?? [];
    if (!items.length) {
      doc.text(`Nothing found for ${section.title.toLowerCase()}.`, { size: 9 });
    } else {
      for (const item of items) {
        const date = item.fact_date ? ` (${fmtDate(item.fact_date)})` : "";
        const line = `- ${item.text}${date}`;
        // oversized skips just this item (older ones may still fit);
        // exhausted stops the section (BUILD.md §B: drop lowest-ranked first).
        const verdict = doc.fitVerdict(line, { size: 9 });
        if (verdict === "oversized") continue;
        if (verdict === "exhausted") break;
        doc.text(line, { size: 9 });
      }
    }
    doc.spacer(8);
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

// Data-driven config for the 2-page PDF report — see
// company-preview/pdf-report-spec-DRAFT.md for the content spec (still
// pending Eric's final sign-off) and BUILD.md's "PDF pivot" §A for the
// approved 7-category refactor. Section order/titles/caps live in one array
// (REPORT_SECTIONS) so the layout can change without touching the renderer.
//
// Schema note: `facts.section` in the live DB is still the OLD 8-slug schema
// (see supabase/migrations/20260715120000_initial_schema.sql) — the 7-category
// migration described in BUILD.md hasn't landed yet. DB_SECTION_TO_REPORT_SECTION
// below is the tolerant bridge: it maps what already exists in the DB onto the
// new report sections, and simply omits anything the old schema has no home
// for (segmentation, market_sizing — dropped per BUILD.md; acquisitions &
// partnerships — new, no source data yet, renders honestly empty). Once the
// migration lands and `facts.section` speaks the 7 slugs directly, delete this
// mapping and read `fact.section` straight through.

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

// Old slug -> new report section. `regulatory` folds into News per BUILD.md
// §A ("drop, folds into News"). `segmentation`/`market_sizing` have no entry
// — dropped from the PDF entirely (they still show in the Source view).
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

// Newest-first, nulls last, capped to each section's maxItems — the spec's
// "chronological order, top items only".
export function mapFactsToReportSections(
  facts: { section: FactSection; text: string; fact_date: string | null; sources: { publisher: string }[] }[],
): Record<ReportSectionSlug, ReportFact[]> {
  const bySlug: Partial<Record<ReportSectionSlug, ReportFact[]>> = {};
  for (const fact of facts) {
    const target = DB_SECTION_TO_REPORT_SECTION[fact.section];
    if (!target) continue; // no PDF home for this slug — map what exists, don't crash
    (bySlug[target] ??= []).push({ text: fact.text, fact_date: fact.fact_date, sources: fact.sources });
  }
  const result = {} as Record<ReportSectionSlug, ReportFact[]>;
  for (const section of REPORT_SECTIONS) {
    const list = bySlug[section.slug] ?? [];
    list.sort((a, b) => (b.fact_date ?? "").localeCompare(a.fact_date ?? ""));
    result[section.slug] = list.slice(0, section.maxItems);
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
    doc.text(section.title, { font: "Helvetica-Bold", size: 12 });

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
        doc.text(`- ${item.text}${date}`, { size: 9 });
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

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PdfDoc } from "@/lib/pdf/pdf-writer";
import {
  renderCompanyReport,
  REPORT_SECTIONS,
  type ReportFact,
  type ReportSectionSlug,
} from "@/lib/pdf/report";

// Regression test for the pdf-lib swap's core invariant: no matter how much
// content the data throws at it, the report is NEVER more than 2 pages (the
// hard cap — BUILD.md §F). Feeds a stress case (a very long summary + far
// more long facts per section than any maxItems cap) through the real
// renderer and checks the page count two ways: pdf-lib's own count, and an
// independent read via poppler's `pdfinfo` so we're not just trusting our
// own measurement code to grade itself.
const longSentence =
  "This is a deliberately long, wordy sentence meant to force multi-line wrapping " +
  "and burn through the page budget quickly so the hard 2-page cap gets exercised " +
  "for real instead of trivially passing on short seed data.";

test.describe("PDF 2-page hard cap", () => {
  test("holds under a stress case: a very long summary and many long facts per section", async () => {
    const stressFacts = (n: number): ReportFact[] =>
      Array.from({ length: n }, (_, i) => ({
        text: `Fact #${i + 1}: ${longSentence}`,
        fact_date: `2026-01-${String((i % 27) + 1).padStart(2, "0")}`,
        sources: [{ publisher: `Outlet ${i + 1}` }],
      }));

    const sectionsData = Object.fromEntries(
      REPORT_SECTIONS.map((s) => [s.slug, s.slug === "company_summary" ? [] : stressFacts(20)]),
    ) as Record<ReportSectionSlug, ReportFact[]>;

    const doc = await PdfDoc.create();
    renderCompanyReport(doc, {
      companyName: "Stress Test Co",
      descriptor: "Synthetic stress-test fixture, not a real company",
      tldr: Array.from({ length: 40 }, () => longSentence).join(" "),
      sectionsData,
    });

    expect(doc.pageCount).toBeLessThanOrEqual(2);

    const bytes = await doc.toBytes();
    const path = join(tmpdir(), `pdf-cap-stress-${Date.now()}.pdf`);
    writeFileSync(path, bytes);
    try {
      const info = execFileSync("pdfinfo", [path], { encoding: "utf8" });
      const match = info.match(/^Pages:\s+(\d+)/m);
      expect(match, `pdfinfo output missing Pages: line:\n${info}`).toBeTruthy();
      expect(Number(match![1])).toBeLessThanOrEqual(2);

      // Also a basic content sanity check independent of our own renderer —
      // the company name and at least one stress fact actually made it onto
      // a page (nothing was silently dropped from the very first section).
      const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
      expect(text).toContain("Stress Test Co");
      expect(text).toContain("Fact #1");
    } finally {
      unlinkSync(path);
    }
  });

  // Regression for the P1 fix: `.fitVerdict()` must tell "this one item is
  // individually too big for any page" apart from "the page budget is
  // exhausted" — the render loop should skip only the former, not `break`
  // and drop everything ranked behind it.
  test("an individually oversized newest item is skipped without suppressing older items behind it", async () => {
    // A single bullet of ~40 repeats of `longSentence` wraps to far more
    // lines than fit on one full page — it can never be placed, no matter
    // how much budget remains. It's also the newest (first, per
    // mapFactsToReportSections' newest-first order) item in the section.
    const oversizedText = Array.from({ length: 40 }, () => longSentence).join(" ");

    const sectionsData = Object.fromEntries(
      REPORT_SECTIONS.map((s): [ReportSectionSlug, ReportFact[]] => [s.slug, []]),
    ) as Record<ReportSectionSlug, ReportFact[]>;
    sectionsData.news = [
      { text: oversizedText, fact_date: "2026-01-27", sources: [] },
      { text: "Older fact that fits fine", fact_date: "2026-01-01", sources: [] },
    ];

    const doc = await PdfDoc.create();
    renderCompanyReport(doc, {
      companyName: "Oversized Item Co",
      descriptor: "Synthetic fixture for the oversized-item regression",
      tldr: "Short summary.",
      sectionsData,
    });

    expect(doc.pageCount).toBeLessThanOrEqual(2);

    const bytes = await doc.toBytes();
    const path = join(tmpdir(), `pdf-cap-oversized-${Date.now()}.pdf`);
    writeFileSync(path, bytes);
    try {
      const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
      expect(text).toContain("News & Announcements");
      expect(text).toContain("Older fact that fits fine");
    } finally {
      unlinkSync(path);
    }
  });
});

import { createClient } from "@/lib/supabase/server";
import { PdfDoc } from "@/lib/pdf/pdf-writer";
import { mapFactsToReportSections, renderCompanyReport, REPORT_SECTIONS } from "@/lib/pdf/report";

// Node runtime (not Edge) — pdf-lib works in both, but this keeps parity
// with the rest of the app's server routes.
export const runtime = "nodejs";

// Same-origin route: the record page's <iframe> renders this inline, and the
// Download button is a plain `<a href=... download>` — both hit this GET.
// Auth is enforced by proxy.ts (redirects to /login before this ever runs).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company }, { data: facts }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("facts")
      .select("section, text, fact_date, importance, reviewed_at, sources(publisher)")
      .eq("company_id", id)
      // "removed" (not the pre-pivot "rejected") — with the two-state status,
      // filtering a value that no longer exists would silently match every
      // row and leak removed facts into the PDF.
      .neq("status", "removed"),
  ]);

  // "Not enriched" = no report — the same product invariant that disables
  // the record page's Download button (see page.tsx's `hasBeenEnriched`).
  // Direct navigation to this route shouldn't fabricate a placeholder PDF.
  if (!company?.tldr) {
    return new Response("Not found", { status: 404 });
  }

  // Review gate: generation is blocked while any included fact is an
  // unreviewed suggestion (reviewed_at null). The record page never links
  // here in that state (Download shows a popup, the report pane a prompt),
  // so this only fires on direct navigation — but the dependency must hold
  // server-side, not just in the UI. Only report-section facts count — a
  // legacy-slug fact never feeds the PDF, so it must not lock it (and the
  // page counts the same filtered set).
  const reportSlugs = new Set<string>(REPORT_SECTIONS.map((s) => s.slug));
  const pendingReview = (facts ?? []).filter((f) => reportSlugs.has(f.section) && !f.reviewed_at).length;
  if (pendingReview > 0) {
    return new Response(
      `Review pending: ${pendingReview} suggested source(s) must be approved or denied in the Source view before the PDF can be generated.`,
      { status: 409 },
    );
  }

  const doc = await PdfDoc.create();
  // report_narrative: { sections: {slug: [para...]}, generated_at } — written
  // by the runner's synthesis pass; absent for never-synthesized companies.
  const narrative =
    (company.report_narrative as { sections?: Record<string, string[]> } | null)?.sections ?? null;
  renderCompanyReport(doc, {
    companyName: company.name,
    descriptor: [company.ownership, company.hq].filter(Boolean).join(" · "),
    tldr: company.tldr,
    sectionsData: mapFactsToReportSections(facts ?? []),
    narrative,
  });

  const filename = company.name.replace(/[^\w.-]+/g, "_") || "report";
  // Response's BodyInit typing wants a plain Uint8Array<ArrayBuffer>; wrap
  // pdf-lib's Uint8Array<ArrayBufferLike> to copy it across that boundary.
  return new Response(new Uint8Array(await doc.toBytes()), {
    headers: {
      "Content-Type": "application/pdf",
      // "inline" (not "attachment") so the record page's iframe can render it
      // — the Download button forces a save itself via the anchor's
      // `download` attribute regardless of this header.
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
    },
  });
}

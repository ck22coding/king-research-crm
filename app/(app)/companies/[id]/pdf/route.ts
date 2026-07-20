import { createClient } from "@/lib/supabase/server";
import { PdfDoc } from "@/lib/pdf/pdf-writer";
import { mapFactsToReportSections, renderCompanyReport } from "@/lib/pdf/report";
import type { FactSection } from "@/lib/supabase/database.types";

// Node runtime (not Edge) — the writer uses Buffer for byte-exact /Length
// values and offsets.
export const runtime = "nodejs";

type FactForReport = {
  section: FactSection;
  text: string;
  fact_date: string | null;
  sources: { publisher: string }[];
};

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
      .select("section, text, fact_date, sources(publisher)")
      .eq("company_id", id)
      .neq("status", "rejected"),
  ]);

  if (!company) {
    return new Response("Not found", { status: 404 });
  }

  const doc = new PdfDoc();
  renderCompanyReport(doc, {
    companyName: company.name,
    descriptor: [company.ownership, company.hq].filter(Boolean).join(" · "),
    tldr: company.tldr,
    sectionsData: mapFactsToReportSections((facts ?? []) as FactForReport[]),
  });

  const filename = company.name.replace(/[^\w.-]+/g, "_") || "report";
  // Response's BodyInit typing wants a plain Uint8Array<ArrayBuffer>, not
  // Node's Buffer<ArrayBufferLike> — copy across the boundary.
  return new Response(new Uint8Array(doc.toBytes()), {
    headers: {
      "Content-Type": "application/pdf",
      // "inline" (not "attachment") so the record page's iframe can render it
      // — the Download button forces a save itself via the anchor's
      // `download` attribute regardless of this header.
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
    },
  });
}

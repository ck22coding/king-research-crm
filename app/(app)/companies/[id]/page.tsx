import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar, CompanyStatusPill, STATUS_LABEL, effectiveStatus, fmtDate, Attr, SrcChip, EmptyState } from "@/lib/format";
import { setFactStatus, approveFact, denyFact, enrichCompany, generateReport } from "./actions";
import RealtimeRefresh from "@/lib/realtime";
import type { FactSection, FactStatus } from "@/lib/supabase/database.types";
import { REPORT_SECTIONS, lastFactEvent, narrativeIsFresh, type ReportSectionSlug } from "@/lib/pdf/report";

// Ports crm-ui/index.html's companyPage()/sectionCard()/itemRow()/srcChip()
// 1:1 as server-rendered markup. Reading-pane clicks are wired up by
// ShellEvents' document-level click delegation (app/(app)/shell-events.tsx)
// — the `.src` buttons below just need the right `data-url`, no per-chip
// client code.

// Source/History use the PDF pivot's 7-section set (BUILD.md §PDF pivot),
// sharing REPORT_SECTIONS + DB_SECTION_TO_REPORT_SECTION from lib/pdf/report
// so the views can never drift from the PDF. company_summary is the TL;DR
// card, not a fact section, so it's skipped here. `whatIfEmpty` mirrors the
// prototype's per-section emptyState() copy.
const WHAT_IF_EMPTY: Record<ReportSectionSlug, string> = {
  company_summary: "", // rendered as the TL;DR card, never a section card
  leadership: "senior management changes",
  acquisitions_partnerships: "acquisitions & partnerships",
  news: "recent company news",
  financials: "financial performance, funding & M&A",
  growth_signals: "hiring, contracts & customer wins",
  risk_flags: "risk flags",
};
const SECTIONS = REPORT_SECTIONS.filter((s) => s.slug !== "company_summary").map((s) => ({
  slug: s.slug,
  title: s.title,
  whatIfEmpty: WHAT_IF_EMPTY[s.slug],
}));

// Dropped from the report (and Source view) by the PDF pivot, but History
// promises "every fact ever found", so any existing facts under these legacy
// slugs still get a card there.
const LEGACY_SECTIONS: { slug: FactSection; title: string }[] = [
  { slug: "segmentation", title: "Segmentation (legacy)" },
  { slug: "market_sizing", title: "Market sizing (legacy)" },
];

type SourceRow = { publisher: string; title: string | null; url: string; year: number | null };
type FactRow = {
  id: string;
  section: FactSection;
  text: string;
  fact_date: string | null;
  status: FactStatus;
  reviewed_at: string | null;
  created_at: string;
  sources: SourceRow[];
};

// View switcher (PDF report / Source / History) — see BUILD.md §E.
type View = "pdf" | "source" | "history";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: viewParam } = await searchParams;
  const view: View = viewParam === "source" || viewParam === "history" ? viewParam : "pdf";
  const supabase = await createClient();

  const [{ data: company }, { data: facts }, { data: jobs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    // Unfiltered by status — History (below) needs every fact ever found,
    // including removed ones. Source's bySection map filters rejected back
    // out in memory rather than re-querying.
    supabase
      .from("facts")
      .select("id, section, text, fact_date, status, reviewed_at, created_at, sources(publisher, title, url, year)")
      .eq("company_id", id)
      .order("created_at"),
    // Latest job (any status): drives the pill — spinner while active, red
    // Failed with the error on hover, matching the companies list.
    supabase
      .from("enrichment_jobs")
      .select("status, error")
      .eq("company_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!company) notFound();

  const latestJob = (jobs ?? [])[0] ?? null;
  // Same derivation CompanyStatusPill uses — this copy feeds the rail Attr.
  const briefStatus =
    latestJob?.status === "failed"
      ? ("failed" as const)
      : effectiveStatus(company.status, latestJob?.status === "queued" || latestJob?.status === "running");

  // Both views share one query; bySection filters removed facts out in memory.
  // facts.section carries report slugs directly (post-migration); legacy slugs
  // with no report home (segmentation, market_sizing) surface in History only.
  const factSectionSlugs = new Set<string>(SECTIONS.map((s) => s.slug));
  // Review gate: suggested sources (reviewed_at null, still included) block
  // PDF generation until each is approved or denied. Counted here once and
  // shared by the Download button (popup) and the report pane (prompt).
  let pendingReview = 0;
  const bySection = new Map<ReportSectionSlug, FactRow[]>();
  const historyBySection = new Map<ReportSectionSlug, FactRow[]>();
  const legacyBySection = new Map<FactSection, FactRow[]>();
  for (const fact of (facts ?? []) as unknown as FactRow[]) {
    if (!factSectionSlugs.has(fact.section)) {
      const list = legacyBySection.get(fact.section) ?? [];
      list.push(fact);
      legacyBySection.set(fact.section, list);
      continue;
    }
    const target = fact.section as ReportSectionSlug;
    const list = historyBySection.get(target) ?? [];
    list.push(fact);
    historyBySection.set(target, list);
    if (fact.status !== "removed") {
      if (!fact.reviewed_at) pendingReview += 1;
      const included = bySection.get(target) ?? [];
      included.push(fact);
      bySection.set(target, included);
    }
  }

  // The runner only sets tldr on a company's first successful enrichment
  // (see runner/ "on success: ... save newsroom_url and tldr") — a company
  // added but never enriched has tldr null, which is the signal both the
  // Download button and the PDF view key off of.
  const hasBeenEnriched = Boolean(company.tldr);
  // Prose freshness (shared gate — see lib/pdf/report + pdf/route.ts).
  // historyBySection holds exactly the report-section facts (any status),
  // which is the event set the watermark is defined over.
  const reportFacts = [...historyBySection.values()].flat();
  const generatedAt = (company.report_narrative as { generated_at?: string } | null)?.generated_at;
  const narrativeFresh = narrativeIsFresh(generatedAt, lastFactEvent(reportFacts));
  const jobActive = latestJob?.status === "queued" || latestJob?.status === "running";

  return (
    <>
      <RealtimeRefresh companyId={company.id} />
      <div className="toolbar">
        <span className="crumbs">
          <button data-href="/companies">Companies</button> <span>/</span>{" "}
          <span style={{ color: "var(--ink)" }}>{company.name}</span>
        </span>
        <span className="spacer"></span>
        <form>
          {/* Still clickable once enriched (re-runs to pull fresher data) — just secondary so Download reads as primary. */}
          <button
            type="submit"
            className={hasBeenEnriched ? "btn" : "btn primary"}
            formAction={enrichCompany.bind(null, company.id)}
          >
            Enrich
          </button>
        </form>
        {!hasBeenEnriched ? (
          <button type="button" className="btn" disabled aria-disabled="true" title="Enrich this company first">
            Download PDF
          </button>
        ) : pendingReview === 0 && narrativeFresh ? (
          <a className="btn primary" href={`/companies/${company.id}/pdf`} download={`${company.name}.pdf`}>
            Download PDF
          </a>
        ) : pendingReview === 0 ? (
          // Reviewed but no current prose: the report is a generated
          // artifact — Generate enqueues a kind='generate' job the local
          // runner answers with ranking + synthesis over approved sources.
          <>
            <form>
              <button
                type="submit"
                className="btn primary"
                formAction={generateReport.bind(null, company.id)}
                disabled={jobActive}
              >
                {jobActive ? "Working…" : "Generate report"}
              </button>
            </form>
            <button type="button" className="btn" disabled aria-disabled="true" title="Generate the report first">
              Download PDF
            </button>
          </>
        ) : (
          // Review gate popup — native Popover API, no client JS. Mirrors
          // pdf/route.ts, which refuses generation (409) in this state.
          <>
            <button type="button" className="btn primary" popoverTarget="review-gate-pop">
              Download PDF
            </button>
            <div popover="auto" id="review-gate-pop" className="gate-dialog">
              <h3>Review suggested sources first</h3>
              <p>
                Research found {pendingReview} suggested source{pendingReview === 1 ? "" : "s"} that{" "}
                {pendingReview === 1 ? "hasn't" : "haven't"} been reviewed yet. Approve or deny each one in
                the Source view, then generate the report — the prose only uses sources you approve.
              </p>
              <div className="gate-actions">
                <button type="button" className="btn" popoverTarget="review-gate-pop" popoverTargetAction="hide">
                  Close
                </button>
                <a className="btn primary" href={`/companies/${company.id}?view=source`}>
                  Review sources
                </a>
              </div>
            </div>
          </>
        )}
        <CompanyStatusPill status={company.status} job={latestJob} />
      </div>
      <div className="scroll">
        <div className="rec-head">
          <Avatar name={company.name} id={company.id} />
          <div>
            <h1>{company.name}</h1>
            <div className="sub">
              <button
                className="link-chip"
                data-url={`https://${company.domain}`}
                data-tip="Open in reading pane"
              >
                {company.domain} ↗
              </button>
              <span>·</span>
              <span>{company.hq}</span>
            </div>
          </div>
          <ViewTabs companyId={company.id} view={view} />
        </div>
        <div className="rec-body">
          <div className="rail">
            <h4>Record details</h4>
            <Attr k="Domain" v={company.domain} />
            <Attr k="Ownership" v={company.ownership} />
            <Attr k="Headquarters" v={company.hq} />
            <Attr k="Brief status" v={STATUS_LABEL[briefStatus]} />
            <Attr k="Last updated" v={fmtDate(company.updated_at)} />
          </div>
          <div className="content">
            {view === "pdf" && (
              <PdfReportPane
                companyId={company.id}
                hasBeenEnriched={hasBeenEnriched}
                pendingReview={pendingReview}
                narrativeFresh={narrativeFresh}
                jobActive={jobActive}
              />
            )}
            {(view === "history" || view === "source") && (
              <>
                {view === "history" && (
                  <div className="note">
                    Every fact ever found for this company — nothing is deleted. Items removed
                    from the report are still shown here, marked below.
                  </div>
                )}
                {view === "source" && (
                  <div className="card">
                    <h3>TL;DR</h3>
                    <div className="tldr">{company.tldr}</div>
                  </div>
                )}
                {SECTIONS.map((section) => (
                  <SectionCard
                    key={section.slug}
                    title={section.title}
                    items={(view === "history" ? historyBySection : bySection).get(section.slug) ?? []}
                    whatIfEmpty={section.whatIfEmpty}
                  />
                ))}
                {view === "history" &&
                  LEGACY_SECTIONS.map(({ slug, title }) => {
                    const items = legacyBySection.get(slug) ?? [];
                    return items.length ? (
                      <SectionCard key={slug} title={title} items={items} whatIfEmpty="" />
                    ) : null;
                  })}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// PDF report / Source / History switcher. Plain server-rendered buttons on
// the shared data-href contract (ShellEvents' click delegation) — same
// pattern as the crumbs/nav-item, no client component needed for a nav.
function ViewTabs({ companyId, view }: { companyId: string; view: View }) {
  return (
    <div className="tag-row">
      <button className={`tag ${view === "pdf" ? "on" : ""}`} data-href={`/companies/${companyId}`}>
        PDF report
      </button>
      <button className={`tag ${view === "source" ? "on" : ""}`} data-href={`/companies/${companyId}?view=source`}>
        Source
      </button>
      <button className={`tag ${view === "history" ? "on" : ""}`} data-href={`/companies/${companyId}?view=history`}>
        History
      </button>
    </div>
  );
}

function PdfReportPane({
  companyId,
  hasBeenEnriched,
  pendingReview,
  narrativeFresh,
  jobActive,
}: {
  companyId: string;
  hasBeenEnriched: boolean;
  pendingReview: number;
  narrativeFresh: boolean;
  jobActive: boolean;
}) {
  if (!hasBeenEnriched) {
    return <div className="empty">No PDF yet — click Enrich to gather this company&rsquo;s research.</div>;
  }
  // Review gate: don't point the iframe at a route that would 409 — show the
  // same instruction the Download popup gives.
  if (pendingReview > 0) {
    return (
      <div className="empty">
        {pendingReview} suggested source{pendingReview === 1 ? "" : "s"} to review — approve or deny each in
        the <button className="tag" data-href={`/companies/${companyId}?view=source`}>Source</button> view,
        then generate the report.
      </div>
    );
  }
  if (!narrativeFresh) {
    return (
      <div className="empty">
        {jobActive ? (
          <>Generating the report — it will appear here when the runner finishes.</>
        ) : (
          <>
            Sources reviewed — generate the report to build the prose from your approved sources.{" "}
            <form style={{ display: "inline-flex" }}>
              <button type="submit" className="btn primary" formAction={generateReport.bind(null, companyId)}>
                Generate report
              </button>
            </form>
          </>
        )}
      </div>
    );
  }
  return <iframe className="pdf-frame" src={`/companies/${companyId}/pdf`} title="PDF report" />;
}

function SectionCard({
  title,
  items,
  whatIfEmpty,
}: {
  title: string;
  items: FactRow[];
  whatIfEmpty: string;
}) {
  return (
    <div className="card">
      <h3>
        {title} <span className="count">{items.length || ""}</span>
      </h3>
      {items.length ? (
        items.map((item) => <ItemRow key={item.id} item={item} />)
      ) : (
        <EmptyState what={whatIfEmpty} />
      )}
    </div>
  );
}

function ItemRow({ item }: { item: FactRow }) {
  // Only ever true in History — Source's bySection map filters removed
  // facts back out in memory, so this branch never renders there.
  const removed = item.status === "removed";
  return (
    <div className={`item${removed ? " removed" : ""}`}>
      <div className="row">
        <div className="txt">{item.text}</div>
        {item.fact_date && <div className="date">{fmtDate(item.fact_date)}</div>}
      </div>
      {item.sources.length > 0 && (
        <div className="srcs">
          {item.sources.map((source, i) => (
            <SrcChip key={i} source={source} />
          ))}
        </div>
      )}
      {removed ? (
        <div className="fact-actions">
          <span className="removed-badge">Removed from report</span>
          <FactStatusButton factId={item.id} to="included" from="removed" label="Restore" />
        </div>
      ) : !item.reviewed_at ? (
        // Suggested source (review gate): fresh from the runner, not yet
        // reviewed. Approve stamps it reviewed; Deny removes it. The PDF
        // stays locked until none of these remain.
        <div className="fact-actions">
          <span className="suggested-badge">Suggested</span>
          <form>
            <button type="submit" className="btn approve" formAction={approveFact.bind(null, item.id)}>
              Approve
            </button>
          </form>
          <form>
            <button type="submit" className="btn reject" formAction={denyFact.bind(null, item.id)}>
              Deny
            </button>
          </form>
        </div>
      ) : (
        // Auto-include by rule (§E): once reviewed, the only curation
        // action is remove. Excluded from the PDF + Source, still visible
        // (marked) in History.
        <div className="fact-actions">
          <FactStatusButton factId={item.id} to="removed" from="included" label="Remove from report" />
        </div>
      )}
    </div>
  );
}

// One form-per-button, shared by every fact transition. `from` pins the
// transition to the state this button was rendered against (see actions.ts).
function FactStatusButton({
  factId,
  to,
  from,
  label,
}: {
  factId: string;
  to: "included" | "removed";
  from: "included" | "removed";
  label: string;
}) {
  return (
    <form>
      <button
        type="submit"
        className={`btn ${to === "included" ? "approve" : "reject"}`}
        formAction={setFactStatus.bind(null, factId, to, from)}
      >
        {label}
      </button>
    </form>
  );
}
